import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { ScoreStream } from '../lib/score-stream.mjs';
import { ScoreService, startScorePolling } from '../lib/score.mjs';
const ids = { clubId: '300', matchId: '9001' };
const value = (runs = 100, revision = 1) => ({ ids, revision, pollSeconds: 5, error: null,
  score: { ...ids, batting: 'QA XI', bowling: 'Other QA', runs: String(runs), wickets: '2', overs: '10.2', fetchedAt: 1000 + revision, stale: false } });
class Response extends EventEmitter {
  constructor() { super(); this.chunks = []; this.writableLength = 0; this.destroyed = false; }
  writeHead(status, headers) { this.status = status; this.headers = headers; }
  flushHeaders() {}
  write(chunk) { this.chunks.push(chunk); }
  end() { this.ended = true; this.emit('close'); }
}
const events = response => response.chunks.filter(s => s.startsWith('event:')).map(s => ({ type: s.split('\n')[0].slice(7), data: JSON.parse(s.split('\ndata: ')[1]) }));

test('score updates push immediately; unchanged source data sends a small freshness event', () => {
  const stream = new ScoreStream({ snapshot: () => value(), validSession: () => true }), response = new Response();
  stream.open({}, response, 'session', 'https://studio.test', ids);
  stream.publish(value(104, 2)); stream.publish(value(110, 3)); stream.publish(value(110, 4));
  const sent = events(response);
  assert.equal(response.headers['Content-Type'], 'text/event-stream; charset=utf-8');
  assert.deepEqual(sent.map(e => e.type), ['score', 'score', 'score', 'freshness']);
  assert.deepEqual(sent.slice(0, 3).map(e => e.data.score.runs), ['100', '104', '110']);
  assert.equal(sent[3].data.fetchedAt, 1004); assert.equal(sent[3].data.score, undefined);
  stream.closeAll(); assert.equal(stream.clients.size, 0);
});

test('expired sessions and changed match IDs close the stream without sending another match', () => {
  let valid = true;
  const stream = new ScoreStream({ snapshot: () => value(), validSession: () => valid });
  const a = new Response(); stream.open({}, a, 'one', 'https://studio.test', ids);
  valid = false; stream.publish(value(104, 2));
  assert.equal(events(a).at(-1).data.code, 'AUTH_EXPIRED'); assert.equal(a.ended, true);
  valid = true; const b = new Response(); stream.open({}, b, 'two', 'https://studio.test', ids);
  stream.publish({ ...value(150, 3), ids: { ...ids, matchId: '9002' } });
  assert.equal(events(b).at(-1).data.code, 'MATCH_CHANGED'); assert.equal(b.chunks.join('').includes('150'), false); assert.equal(b.ended, true);
});

test('connection limits, duplicate sessions, wrong match IDs and slow clients are bounded', () => {
  const stream = new ScoreStream({ snapshot: () => value(), validSession: () => true, maxClients: 1 }), a = new Response();
  assert.throws(() => stream.open({}, a, 'one', 'origin', { ...ids, matchId: '9002' }));
  stream.open({}, a, 'one', 'origin', ids);
  assert.throws(() => stream.open({}, new Response(), 'one', 'origin', ids));
  a.writableLength = 1048577; stream.heartbeat(); assert.equal(a.ended, true); assert.equal(stream.clients.size, 0);
  const huge = new Response(); stream.open({}, huge, 'two', 'origin', ids);
  stream.publish({ ...value(), score: { ...value().score, detail: 'x'.repeat(524288) } }); assert.equal(huge.ended, true);
});

test('source changes notify listeners in order and outages immediately flag the last score', async () => {
  let runs = 100, offline = false; const updates = [];
  const service = new ScoreService({ fetchFn: async () => {
    if (offline) throw new Error('offline');
    return new globalThis.Response(JSON.stringify({ schema: 'mk97.score.v1', ...ids, batting: 'QA XI', bowling: 'Other QA', runs, wickets: 2, overs: '10.2', status: 'live' }));
  } });
  const unsubscribe = service.subscribe(s => updates.push(s));
  service.select(ids.clubId, ids.matchId);
  for (const total of [100, 104, 110]) { runs = total; service.lastAttempt = 0; await service.refresh(); }
  offline = true; service.lastAttempt = 0; await service.refresh();
  assert.deepEqual(updates.filter(s => s.score).map(s => s.score.runs), ['100', '104', '110', '110']);
  assert.equal(updates.at(-1).score.stale, true); assert.equal(updates.at(-1).error, 'offline');
  assert.ok(updates.every((v, i) => i === 0 || v.revision > updates[i - 1].revision));
  unsubscribe(); assert.equal(service.listeners.size, 0);
});

test('source polling uses the actual five-second deadline without a second interval jitter', async () => {
  let now = 10000, queued, calls = 0, stopped = false;
  const service = { ids, nextAttemptAt: 10000, async refresh() { calls++; this.nextAttemptAt = now + 5000; now += 1200; } };
  const stop = startScorePolling(service, { now: () => now, setTimer: (fn, ms) => { queued = { fn, ms }; return 1; }, clearTimer: () => { stopped = true; } });
  await Promise.resolve(); assert.equal(calls, 1); assert.equal(queued.ms, 3800);
  now += queued.ms; await queued.fn(); assert.equal(calls, 2); assert.equal(queued.ms, 3800);
  stop(); assert.equal(stopped, true);
});

test('rate-limited source polling respects Retry-After', async () => {
  let calls = 0;
  const service = new ScoreService({ fetchFn: async () => { calls++; return new globalThis.Response('', { status: 429, headers: { 'retry-after': '60' } }); } });
  service.select(ids.clubId, ids.matchId); await service.refresh(); service.lastAttempt = 0; await service.refresh();
  assert.equal(calls, 1); assert.ok(service.nextAttemptAt > Date.now() + 55000);
});
