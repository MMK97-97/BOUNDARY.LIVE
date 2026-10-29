import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeScore, scoreLines, clean, ScoreService } from '../lib/score.mjs';
const ids = { clubId: '123', matchId: '986' };
const first = { view: 1, isSecondInningsStarted: false, values: { matchId: '986', t1Name: 'TEAM A', t2Name: 'TEAM B',
  t1Total: '142', t1Wickets: '3', t1Overs: '16.2', t1RR: '8.69', t2Total: '0', t2Wickets: '0', t2Overs: '0', isMatchEnded: '0' }, balls: ['1', '4', 'W'] };
test('normalizes first innings without leaking extra player fields', () => {
  const s = normalizeScore({ ...first, privateEmail: 'do-not-return@example.test' }, ids);
  assert.equal(s.batting, 'TEAM A'); assert.equal(s.runs, '142'); assert.equal(s.overs, '16.2');
  assert.equal(s.privateEmail, undefined); assert.equal(s.status, 'live');
});
test('normalizes second innings and string booleans', () => {
  const s = normalizeScore({ ...first, isSecondInningsStarted: 'true', values: { ...first.values, t2Total: '143', t2Overs: '17.1', t2Wickets: '2', isMatchEnded: '1', result: 'TEAM B won' } }, ids);
  assert.equal(s.batting, 'TEAM B'); assert.equal(s.runs, '143'); assert.equal(s.status, 'complete');
});
test('supports zero scores and does not assume missing values are zero', () => {
  assert.equal(normalizeScore({ ...first, values: { ...first.values, t1Total: '0' } }, ids).runs, '0');
  assert.throws(() => normalizeScore({ values: { t1Name: 'TEAM A' } }, ids));
});
test('super over selection uses explicit super-over innings flag', () => {
  const s = normalizeScore({ ...first, isSuperOver: true, isSuperOverSecondInningsStarted: true }, ids);
  assert.equal(s.batting, 'TEAM B'); assert.equal(s.superOver, true);
});
test('rejects wrong match ID, malformed payload and bad wicket values', () => {
  assert.throws(() => normalizeScore({ ...first, values: { ...first.values, matchId: '987' } }, ids));
  assert.throws(() => normalizeScore({}, ids));
  assert.throws(() => normalizeScore({ ...first, values: { ...first.values, t1Wickets: '21' } }, ids));
});
test('strips HTML and control characters before showing text', () => {
  assert.equal(clean('<b>Team</b>\nA\u0000 &amp; B'), 'Team A & B');
  const s = normalizeScore({ ...first, values: { ...first.values, t1Name: '<script>bad()</script>TEAM A' } }, ids);
  assert.equal(s.batting.includes('<'), false);
});
test('stale and complete score lines are clearly labelled', () => {
  const s = normalizeScore(first, ids, 1000);
  assert.match(scoreLines(s, 2000)[1], /LIVE SCORE/);
  assert.match(scoreLines(s, 32000)[1], /SCORE DELAYED/);
  assert.match(scoreLines({ ...s, status: 'complete' }, 2000)[1], /MATCH COMPLETE/);
});
test('canonical approved feed is supported', () => {
  const s = normalizeScore({ schema: 'boundary.score.v1', batting: 'TEAM C', bowling: 'TEAM D', runs: 0, wickets: 0, overs: '0.0', status: 'scheduled' }, ids);
  assert.equal(s.runs, '0'); assert.equal(s.source, 'Approved score feed');
});
test('polls are deduplicated, cached and old score is marked stale on failure', async () => {
  let calls = 0, fail = false;
  const service = new ScoreService({ fetchFn: async () => { calls++; if (fail) throw new Error('offline'); return new Response(JSON.stringify(first)); } });
  service.select(ids.clubId, ids.matchId);
  const [a, b] = await Promise.all([service.refresh(), service.refresh()]);
  assert.equal(a.score.runs, '142'); assert.equal(b.score.runs, '142'); assert.equal(calls, 1);
  await service.refresh(); assert.equal(calls, 1);
  service.lastAttempt = 0; fail = true;
  const failed = await service.refresh(); assert.equal(failed.score.stale, true); assert.equal(failed.error, 'offline');
});
test('an in-flight old match cannot overwrite a newly selected match', async () => {
  let release; const waiting = new Promise(r => { release = r; });
  const service = new ScoreService({ fetchFn: async () => { await waiting; return new Response(JSON.stringify(first)); } });
  service.select('123', '986'); const old = service.refresh(); service.select('123', '987'); release(); await old;
  assert.equal(service.snapshot().score, null); assert.equal(service.snapshot().ids.matchId, '987');
});
test('rejects HTTP custom feeds, HTML responses and oversized data', async () => {
  for (const config of [
    { template: 'http://example.test/{matchId}' },
    { fetchFn: async () => new Response('<html>not JSON</html>') },
    { fetchFn: async () => new Response('x'.repeat(2_000_001)) }
  ]) {
    const s = new ScoreService(config); s.select('123', '986'); const r = await s.refresh();
    assert.equal(r.score, null); assert.ok(r.error);
  }
});
