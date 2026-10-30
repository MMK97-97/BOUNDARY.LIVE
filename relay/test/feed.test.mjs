import test from 'node:test';
import assert from 'node:assert/strict';
import { createFeed, fetchPublicScore, overlayUrl } from '../../web/feed.mjs';
import { normalizeScore, sourceLogo } from '../../web/score-data.mjs';

const ids = { clubId: '300', matchId: '986' };
const raw = (matchId = '986', runs = '208') => ({ view: 1, isSecondInningsStarted: true, comments: '', values: {
  clubId: '300', matchId, t1Name: 'Royal Bulls CC', t1Code: 'RBCC', t1Total: '207', t1Wickets: '9', t1Overs: '35',
  t2Name: 'ICAT', t2Code: 'ICAT', t2Total: runs, t2Wickets: '5', t2Overs: '30.5', isMatchEnded: '1', shortResult: 'ICAT won by 5 Wickets',
  currentPartnershipMap: { partnershipTotalRuns: '88', partnershipTotalBalls: '73', partnershipBatsman1ContributionRuns: '53', partnershipBatsman2ContributionRuns: '25' }
} });
const response = value => new Response(JSON.stringify(value));

test('public score preview fetches only the selected read endpoint and preserves actual opponents', async () => {
  let request;
  const result = await fetchPublicScore(ids, { fetchFn: async (url, options) => { request = { url, options }; return response(raw()); } });
  assert.equal(request.url, 'https://cricclubs.com/liveScoreOverlayData.do?clubId=300&matchId=986');
  assert.equal(request.options.credentials, 'omit'); assert.equal(request.options.redirect, 'error');
  assert.deepEqual(result.score.teams.map(t => t.name), ['Royal Bulls CC', 'ICAT']);
  assert.equal(result.score.stats.partnership.runs, '88'); assert.equal(result.score.stats.partnership.batters[0].runs, '53');
  assert.deepEqual(result.score.commentary, []); assert.equal(result.score.cards.complete, false);
});

test('invalid public identifiers are rejected before any network request', async () => {
  let calls = 0;
  await assert.rejects(fetchPublicScore({ clubId: '../300', matchId: '986' }, { fetchFn: () => { calls++; } }));
  assert.equal(calls, 0); assert.throws(() => overlayUrl({ clubId: '300', matchId: '0' }));
});

test('HTML, denied and oversized responses fail without invented source data', async () => {
  for (const r of [new Response('<html>Verification required</html>'), new Response('{}', { status: 403 }), new Response('x'.repeat(2_000_001))]) {
    await assert.rejects(fetchPublicScore(ids, { fetchFn: async () => r }));
  }
});

test('a late previous-match response cannot replace the newly selected match', async () => {
  let release;
  const updates = [];
  const feed = createFeed({ auto: false, onUpdate: r => updates.push(r), fetchFn: async url => {
    if (url.endsWith('=986')) { await new Promise(r => { release = r; }); return response(raw()); }
    return response(raw('987', '150'));
  } });
  const old = feed.select(ids); const current = await feed.select({ clubId: '300', matchId: '987' });
  release(); await old;
  assert.equal(current.score.matchId, '987'); assert.equal(feed.snapshot.score.runs, '150');
  assert.equal(updates.filter(r => r.score).length, 1); feed.stop();
});

test('connecting the relay stops direct polling and binds the selected match once', async () => {
  let calls = 0, relay = null; const requests = [];
  const feed = createFeed({ auto: false, getRelay: () => relay, fetchFn: async () => { calls++; return response(raw()); } });
  await feed.select(ids);
  relay = { session: 'test-memory-session', request: async (route, options) => {
    requests.push({ route, options }); return { score: normalizeScore(raw(), ids), pollSeconds: 5 };
  } };
  await feed.changeSource(); await feed.refresh();
  assert.equal(calls, 1); assert.deepEqual(requests.map(r => r.route), ['/api/match', '/api/score']);
  assert.deepEqual(JSON.parse(requests[0].options.body), ids); assert.equal(feed.snapshot.transport, 'relay');
  relay = null; await feed.changeSource(); assert.equal(calls, 2); feed.stop();
});

test('a late direct response cannot overwrite the encoder relay snapshot', async () => {
  let release, relay = null;
  const feed = createFeed({ auto: false, getRelay: () => relay, fetchFn: async () => { await new Promise(r => { release = r; }); return response(raw('986', '100')); } });
  const pending = feed.select(ids);
  relay = { session: 'test-session', request: async () => ({ score: normalizeScore(raw(), ids) }) };
  await feed.changeSource(); release(); await pending;
  assert.equal(feed.snapshot.score.runs, '208'); assert.equal(feed.snapshot.transport, 'relay'); feed.stop();
});

test('source outages retain and label only the last successful score', async () => {
  let offline = false;
  const feed = createFeed({ auto: false, fetchFn: async () => { if (offline) throw new TypeError('offline'); return response(raw()); } });
  await feed.select(ids); offline = true; const failed = await feed.refresh();
  assert.equal(failed.score.runs, '208'); assert.equal(failed.score.stale, true); assert.match(failed.error, /Connect the cloud studio/);
  await feed.select({ clubId: '300', matchId: '987' }); assert.equal(feed.snapshot.score, null); feed.stop();
});

test('concurrent refreshes share one upstream request', async () => {
  let release, calls = 0;
  const feed = createFeed({ auto: false, fetchFn: async () => { calls++; await new Promise(r => { release = r; }); return response(raw()); } });
  const first = feed.select(ids); const second = feed.refresh(); release();
  const [a, b] = await Promise.all([first, second]); assert.equal(calls, 1); assert.deepEqual(a.score, b.score); feed.stop();
});

test('a relay response for another club or match is rejected', async () => {
  const feed = createFeed({ auto: false, getRelay: () => ({ session: 'test-session', request: async () => ({ score: normalizeScore(raw('987'), { ...ids, matchId: '987' }) }) }) });
  const result = await feed.select(ids); assert.equal(result.score, null); assert.match(result.error, /different match/); feed.stop();
});

test('all supplied innings cards and commentary are whitelisted, with no false complete-card claim', () => {
  const input = raw(); input.comments = [{ id: 'ball185', over: '30.5', text: 'ICAT win.', email: 'private@example.test' }];
  Object.assign(input.values, { firstLogo: '/documentsRep/royal.png', lastOutName: 'Source dismissed batter', lastOutRuns: 0, lastOutBalls: 1, lastOutString: 'b Source bowler', t1Batting: [null, { playerID: '7', firstName: 'Actual', lastName: 'Batter', runsScored: 50, ballsFaced: 40, fours: 0, sixers: 0, email: 'private@example.test' }],
    t2Bowling: [{ playerID: '8', firstName: 'Actual', lastName: 'Bowler', balls: 13, maidens: 0, runs: 20, wickets: 1, email: 'private@example.test' }] });
  const result = normalizeScore(input, ids);
  assert.equal(result.inningsCards[0].batting[0].name, 'Actual Batter'); assert.equal(result.inningsCards[0].batting[0].fours, '0');
  assert.equal(result.inningsCards[0].bowlers[0].overs, '2.1'); assert.equal(result.inningsCards[0].complete, false);
  assert.equal(result.teams[0].logo, 'https://cricclubs.com/documentsRep/royal.png');
  assert.equal(result.lastOut.runs, '0'); assert.equal(result.lastOut.status, 'b Source bowler'); assert.deepEqual(result.batters, []);
  assert.equal(result.commentary[0].text, 'ICAT win.'); assert.equal(JSON.stringify(result).includes('private@example.test'), false);
});

test('MK97 authorized full-data schema preserves explicit completeness and source figures', () => {
  const r = normalizeScore({ schema: 'mk97.score.v1', ...ids, batting: 'ICAT', bowling: 'RBCC', runs: 208, wickets: 5, overs: '30.5',
    teams: [{ name: 'Royal Bulls CC', code: 'RBCC', runs: 207, wickets: 9, overs: '35' }],
    inningsCards: [{ id: '1', team: 'Royal Bulls CC', runs: 207, wickets: 9, overs: '35', complete: true, batting: [{ name: 'Source batter', runs: 100, email: 'private' }], bowlers: [] }],
    commentary: [{ id: 'source-ball', over: '30.5', text: 'The source commentary.' }] }, ids);
  assert.equal(r.inningsCards[0].complete, true); assert.equal(r.inningsCards[0].batting[0].runs, '100');
  assert.equal(r.commentary[0].text, 'The source commentary.'); assert.equal(JSON.stringify(r).includes('private'), false);
});

test('club mismatches and external or credential-bearing logos are rejected', () => {
  const input = raw(); input.values.clubId = '301'; assert.throws(() => normalizeScore(input, ids), /Club ID/);
  for (const url of ['https://evil.example/logo.png', 'https://cricclubs.com.evil.example/logo', 'http://cricclubs.com/logo', 'https://secret@cricclubs.com/logo']) assert.equal(sourceLogo(url), '');
});
