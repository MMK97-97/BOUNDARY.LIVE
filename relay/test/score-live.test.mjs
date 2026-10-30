import test from 'node:test';
import assert from 'node:assert/strict';
import { subscribeRelayScores } from '../../web/score-live.mjs';
import { createFeed } from '../../web/feed.mjs';
const ids = { clubId: '300', matchId: '9001' };
const snapshot = (runs = 100, revision = 1, selected = ids) => ({ ids: selected, revision, error: null, pollSeconds: 5,
  score: { ...selected, runs: String(runs), wickets: '2', overs: '10.2', fetchedAt: Date.now(), batting: 'QA XI', bowling: 'Other QA' } });
const packet = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const streamResponse = text => new Response(new ReadableStream({ start(controller) { const b = new TextEncoder().encode(text), size = b.length > 10000 ? 4096 : 7; for (let i = 0; i < b.length; i += size) controller.enqueue(b.slice(i, i + size)); controller.close(); } }), { headers: { 'content-type': 'text/event-stream' } });

test('authenticated score stream decodes split chunks and Unicode without exposing a token in its URL', async () => {
  const received = [], freshness = []; let request;
  const score = snapshot(); score.score.batting = '東京 QA';
  const connection = subscribeRelayScores({ relay: 'https://relay.test', session: 'test-only-bearer', ids, origin: 'https://studio.test',
    onSnapshot: v => received.push(v), onFreshness: v => freshness.push(v),
    fetchFn: async (url, options) => { request = { url, options }; return streamResponse(packet('score', score) + ': heartbeat\n\n' + packet('freshness', { ids, revision: 2, fetchedAt: 1234, pollSeconds: 5 })); } });
  await connection.done;
  assert.equal(received[0].score.batting, '東京 QA'); assert.equal(freshness[0].revision, 2);
  assert.equal(request.options.headers.Authorization, 'Bearer test-only-bearer'); assert.equal(request.options.credentials, 'omit'); assert.equal(request.options.redirect, 'error');
  assert.equal(request.url.includes('test-only-bearer'), false); assert.equal(request.url.includes('matchId=9001'), true);
});

test('wrong matches, invalid event data, oversized messages and session expiry are rejected', async () => {
  const bodies = [packet('score', snapshot(110, 2, { ...ids, matchId: '9002' })), 'event: score\ndata: {bad json}\n\n',
    'data: ' + 'x'.repeat(524289), packet('end', { code: 'AUTH_EXPIRED', error: 'Session expired.' })];
  for (const body of bodies) {
    let error, accepted = 0;
    const c = subscribeRelayScores({ relay: 'https://relay.test', session: 'fixture', ids, origin: 'https://studio.test', onSnapshot: () => accepted++, onEnd: e => { error = e; }, fetchFn: async () => streamResponse(body) });
    await c.done; assert.equal(accepted, 0); assert.ok(error);
  }
});

test('closing a live subscription cancels the reader without reporting an error', async () => {
  let cancelled = false, errors = 0, received = 0;
  const c = subscribeRelayScores({ relay: 'https://relay.test', session: 'fixture', ids, origin: 'https://studio.test', onSnapshot: () => received++, onEnd: () => errors++,
    fetchFn: async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(packet('score', snapshot()))); }, cancel() { cancelled = true; } }), { headers: { 'content-type': 'text/event-stream' } }) });
  for (let i = 0; i < 10 && received === 0; i++) await Promise.resolve();
  c.close(); await c.done; assert.equal(cancelled, true); assert.equal(errors, 0);
});

test('push updates change the preview without another poll, and a late poll cannot replace a newer score', async () => {
  let callbacks, requests = 0, release;
  const relay = { session: 'fixture', subscribe: (_, c) => { callbacks = c; return { close() {} }; }, request: async () => {
    requests++; if (requests === 1) return snapshot(); return new Promise(resolve => { release = () => resolve(snapshot(108, 3)); });
  } };
  const feed = createFeed({ auto: false, getRelay: () => relay }); await feed.select(ids);
  callbacks.onSnapshot(snapshot(104, 2)); assert.equal(feed.snapshot.score.runs, '104'); assert.equal(requests, 1);
  const late = feed.refresh(); callbacks.onSnapshot(snapshot(110, 4)); release(); await late;
  assert.equal(feed.snapshot.score.runs, '110'); assert.equal(feed.snapshot.delivery, 'push'); feed.stop();
});

test('match switching closes the old stream and ignores its late data', async () => {
  const callbacks = []; let closed = 0;
  const relay = { session: 'fixture', request: async (_, options) => snapshot(100, 1, options?.body ? JSON.parse(options.body) : ids),
    subscribe: (_, c) => { callbacks.push(c); return { close() { closed++; } }; } };
  const feed = createFeed({ auto: false, getRelay: () => relay }); await feed.select(ids); await feed.select({ ...ids, matchId: '9002' });
  callbacks[0].onSnapshot(snapshot(999, 90)); assert.equal(feed.snapshot.score.matchId, '9002'); assert.equal(feed.snapshot.score.runs, '100'); assert.equal(closed, 1); feed.stop();
});

test('idle hidden pages close their push stream and resume with a fresh read', async () => {
  let visible = true, closed = 0, subscribed = 0;
  const relay = { session: 'fixture', request: async () => snapshot(), subscribe: (_, callbacks) => { subscribed++; callbacks.onSnapshot(snapshot()); return { close() { closed++; } }; } };
  const feed = createFeed({ auto: false, visible: () => visible, getRelay: () => relay }); await feed.select(ids);
  visible = false; await feed.visibilityChanged(); assert.equal(closed, 1);
  visible = true; await feed.visibilityChanged(); assert.equal(subscribed, 2); feed.stop();
});

test('an unavailable live link keeps authenticated polling available', async () => {
  let requests = 0, subscribed = 0;
  const relay = { session: 'fixture', request: async () => snapshot(100 + requests++, requests), subscribe: (_, callbacks) => { subscribed++; callbacks.onEnd(new Error('connection lost')); return { close() {} }; } };
  const feed = createFeed({ auto: false, getRelay: () => relay }); await feed.select(ids); await feed.refresh();
  assert.equal(requests, 2); assert.equal(subscribed, 1); assert.equal(feed.snapshot.delivery, 'poll'); assert.equal(feed.snapshot.score.runs, '101'); feed.stop();
});
