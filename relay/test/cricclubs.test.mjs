import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CricClubsScraper, cricclubsReference, parseCricClubsScorecard, enrichCricClubsScore } from '../lib/cricclubs.mjs';
import { normalizeScore, ScoreService } from '../lib/score.mjs';

const html = fs.readFileSync(new URL('./fixtures/scorecard-layout.html', import.meta.url), 'utf8');
const ids = { league: 'TestLeague', clubId: '123', matchId: '456' };
const errorCode = code => error => error.code === code;
const htmlResponse = (body = html) => new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8' } });
const robotsResponse = (text = 'User-agent: *\nAllow: /\n') => new Response(text, { headers: { 'content-type': 'text/plain' } });
const fixture = () => ({ ...parseCricClubsScorecard(html, ids), fetchedAt: 1000 });
function ticker() {
  return normalizeScore({ schema: 'mk97.score.v1', ...ids, batting: 'Beta CC', bowling: 'Alpha CC', innings: '2', runs: 151, wickets: 2, overs: '19.2',
    inningsCards: [{ id: '1', team: 'Alpha CC', bowling: 'Beta CC', runs: 150, wickets: 3, overs: '20', batting: [], bowlers: [] },
      { id: '2', team: 'Beta CC', bowling: 'Alpha CC', runs: 151, wickets: 2, overs: '19.2', batting: [], bowlers: [] }] }, ids);
}

test('scorecard references accept dynamic IDs and reject arbitrary hosts, routes and duplicate IDs', () => {
  assert.equal(cricclubsReference('https://cricclubs.com/FWCWL/viewScorecard.do?matchId=986&clubId=300').matchId, '986');
  assert.equal(cricclubsReference({ clubId: '300', matchId: '985', league: 'FWCWL' }).url, 'https://cricclubs.com/FWCWL/viewScorecard.do?matchId=985&clubId=300');
  for (const input of [
    'http://cricclubs.com/FWCWL/viewScorecard.do?matchId=986&clubId=300',
    'https://cricclubs.com.evil.test/FWCWL/viewScorecard.do?matchId=986&clubId=300',
    'https://127.0.0.1/FWCWL/viewScorecard.do?matchId=986&clubId=300',
    'https://cricclubs.com/club/../matchOverlayConfig.do?matchId=986&clubId=300',
    'https://name:secret@cricclubs.com/FWCWL/viewScorecard.do?matchId=986&clubId=300',
    'https://cricclubs.com/FWCWL/viewScorecard.do?matchId=986&clubId=300&matchId=985',
    'https://cricclubs.com/FWCWL/viewScorecard.do?matchId=986&clubId=300&redirect=https://evil.test',
    { clubId: '300', matchId: '../986', league: 'FWCWL' }, { clubId: '300', matchId: '986', league: '../FWCWL' }
  ]) assert.throws(() => cricclubsReference(input));
});

test('extracts both innings, every player row, source extras, dismissals, FOW and commentary', () => {
  const result = fixture();
  assert.equal(result.inningsCards.length, 2); assert.equal(result.coverage.reconciledInnings, 2);
  const [a, b] = result.inningsCards;
  assert.equal(a.batting.length, 4); assert.equal(a.bowlers.length, 2); assert.equal(b.batting.length, 3); assert.equal(b.bowlers.length, 3);
  assert.equal(a.batting[0].id, '1'); assert.equal(a.batting[1].status, 'b Bowler One'); assert.equal(b.batting[1].name, 'Other Two');
  assert.equal(a.extras.total, '15'); assert.equal(a.extras.legByes, '1'); assert.equal(a.extras.wides, '10');
  assert.match(a.fallOfWickets[0], /40-1/); assert.deepEqual(a.didNotBat, ['Player Five', 'Player Six']);
  assert.equal(a.batting[0].strikeRate, '123.08'); assert.equal(b.bowlers[2].overs, '7.2');
  assert.equal(result.commentary[0].text, 'Source commentary & punctuation preserved.');
  assert.equal(result.metadata.playerOfMatch, 'Other One'); assert.equal(result.metadata.toss, 'Alpha CC elected to bat');
  assert.equal(JSON.stringify(result).includes('private@example.test'), false); assert.equal(globalThis.__scraperScriptExecuted, undefined);
});

test('missing players and wrong bowler overs cannot be labelled a complete innings', () => {
  const missing = html.replace(/<tr><td>Player Four<\/td>.*?<\/tr>/, '');
  const first = parseCricClubsScorecard(missing, ids).inningsCards[0];
  assert.equal(first.complete, false); assert.match(first.issues.join(' '), /Batting runs/);
  const shortBowling = parseCricClubsScorecard(html.replace('<td>10</td><td>0</td><td>70</td>', '<td>2.5</td><td>0</td><td>70</td>'), ids).inningsCards[0];
  assert.equal(shortBowling.complete, false); assert.match(shortBowling.issues.join(' '), /Bowler overs/);
});

test('missing economy/strike rate stay empty; malformed figures make the innings incomplete', () => {
  const missingRate = parseCricClubsScorecard(html.replace('<td>123.08</td>', '<td>—</td>').replace('<td>7.70</td>', '<td>—</td>'), ids);
  assert.equal(missingRate.inningsCards[0].batting[0].strikeRate, ''); assert.equal(missingRate.inningsCards[0].bowlers[1].economy, '');
  const invalid = parseCricClubsScorecard(html.replace('<td>7.2</td>', '<td>7.6</td>'), ids).inningsCards[1];
  assert.equal(invalid.complete, false); assert.equal(invalid.bowlers.length, 2);
});

test('verification/login pages, wrong match identities, empty layouts and oversized input are rejected', () => {
  for (const body of ['<title>Just a moment...</title><script src="/cdn-cgi/challenge-platform/test"></script>', '<form><input type="password"></form>']) {
    assert.throws(() => parseCricClubsScorecard(body, ids), errorCode('ACCESS_BLOCKED'));
  }
  assert.throws(() => parseCricClubsScorecard(html.replace('name="matchId" value="456"', 'name="matchId" value="457"'), ids), errorCode('WRONG_MATCH'));
  assert.throws(() => parseCricClubsScorecard(html.replace('matchId=456&amp;clubId=123', 'matchId=457&amp;clubId=123'), ids), errorCode('WRONG_MATCH'));
  assert.throws(() => parseCricClubsScorecard('<h1>Scorecard will load with JavaScript</h1>', ids), errorCode('UNSUPPORTED_LAYOUT'));
  assert.throws(() => parseCricClubsScorecard('x'.repeat(2000001), ids), errorCode('TOO_LARGE'));
});

test('a form wrapping a real scorecard does not remove its tables', () => {
  const wrapped = html.replace('<h1>', '<form><h1>').replace('</body>', '</form></body>');
  assert.equal(parseCricClubsScorecard(wrapped, ids).coverage.reconciledInnings, 2);
});

test('long commentary is bounded explicitly without rejecting valid innings tables', () => {
  const comments = '<table><tr><th>Over</th><th>Commentary</th></tr>' + Array.from({ length: 200 }, (_, i) => `<tr><td>${i}</td><td>Source entry ${i}</td></tr>`).join('') + '</table>';
  const result = parseCricClubsScorecard(html.replace('</body>', comments + '</body>'), ids);
  assert.equal(result.coverage.reconciledInnings, 2); assert.equal(result.commentary.length, 120);
  assert.equal(result.coverage.commentaryTruncated, true); assert.equal(result.coverage.commentaryRowsPresent, 202);
  assert.equal(result.commentary.at(-1).text, 'Source entry 199');
});

test('merges full cards only with matching teams and up-to-date ticker totals', () => {
  const complete = enrichCricClubsScore(ticker(), fixture());
  assert.equal(complete.cards.complete, true); assert.equal(complete.cards.batting.length, 3); assert.equal(complete.inningsCards[0].batting.length, 4);
  assert.equal(complete.scorecard.state, 'complete'); assert.equal(complete.commentary.length, 2);
  const mismatch = ticker(); mismatch.inningsCards[1].runs = '152';
  const result = enrichCricClubsScore(mismatch, fixture());
  assert.equal(result.cards.complete, false); assert.equal(result.cards.batting.length, 0); assert.equal(result.scorecard.state, 'partial');
  assert.match(result.scorecard.message, /totals differ/);
  assert.throws(() => enrichCricClubsScore(ticker(), { ...fixture(), matchId: '457' }), errorCode('WRONG_MATCH'));
});

test('client obeys robots, deduplicates concurrent requests, caches per match and returns isolated copies', async () => {
  let now = 1000, calls = [];
  const scraper = new CricClubsScraper({ now: () => now, fetchFn: async (url, opts) => {
    calls.push(String(url)); assert.equal(opts.method, 'GET'); assert.equal(opts.redirect, 'manual'); assert.equal(opts.credentials, 'omit');
    return String(url).endsWith('robots.txt') ? robotsResponse() : htmlResponse(String(url).includes('matchId=457') ? html.replaceAll('456', '457') : html);
  } });
  const [a, b] = await Promise.all([scraper.scrape(ids), scraper.scrape(ids)]);
  assert.equal(calls.length, 2); a.inningsCards[0].batting.length = 0; assert.equal(b.inningsCards[0].batting.length, 4);
  assert.equal((await scraper.scrape(ids)).inningsCards[0].batting.length, 4); assert.equal(calls.length, 2);
  now += 16000; const next = await scraper.scrape({ ...ids, matchId: '457' });
  assert.equal(next.matchId, '457'); assert.equal(calls.length, 3);
});

test('robots denial, unavailable policy, redirects and rate limiting stop requests', async () => {
  let calls = 0;
  const denied = new CricClubsScraper({ fetchFn: async () => { calls++; return robotsResponse('User-agent: *\nDisallow: /TestLeague/'); } });
  await assert.rejects(denied.scrape(ids), errorCode('ROBOTS_DENIED')); assert.equal(calls, 1);
  const unavailable = new CricClubsScraper({ fetchFn: async () => htmlResponse('<title>Just a moment</title>') });
  await assert.rejects(unavailable.scrape(ids), errorCode('ROBOTS_UNAVAILABLE'));
  for (const [status, code] of [[302, 'REDIRECT_REFUSED'], [403, 'ACCESS_BLOCKED'], [429, 'RATE_LIMITED']]) {
    let count = 0;
    const scraper = new CricClubsScraper({ fetchFn: async url => { count++; return String(url).endsWith('robots.txt') ? robotsResponse() : new Response('', { status, headers: { location: 'https://evil.test', 'retry-after': '600' } }); } });
    await assert.rejects(scraper.scrape(ids), errorCode(code));
    await assert.rejects(scraper.scrape(ids)); assert.equal(count, 2);
  }
});

test('verification HTML stops requests for the session and never follows a bypass route', async () => {
  let now = 1000, requests = [];
  const scraper = new CricClubsScraper({ now: () => now, fetchFn: async url => {
    requests.push(String(url)); return String(url).endsWith('robots.txt') ? robotsResponse() : htmlResponse('<title>Just a moment</title>');
  } });
  await assert.rejects(scraper.scrape(ids), errorCode('ACCESS_BLOCKED')); now += 60000;
  await assert.rejects(scraper.scrape({ ...ids, matchId: '457' }), errorCode('ACCESS_BLOCKED')); assert.equal(requests.length, 2);
  now += 86400000; await assert.rejects(scraper.scrape(ids), errorCode('ACCESS_BLOCKED')); assert.equal(requests.length, 2);
});

test('rate limits honor Retry-After without an internal retry loop', async () => {
  let now = 1000, pageCalls = 0;
  const scraper = new CricClubsScraper({ now: () => now, fetchFn: async url => {
    if (String(url).endsWith('robots.txt')) return robotsResponse();
    pageCalls++;
    return pageCalls === 1 ? new Response('', { status: 429, headers: { 'retry-after': '600' } }) : htmlResponse();
  } });
  await assert.rejects(scraper.scrape(ids), errorCode('RATE_LIMITED')); now += 599000;
  await assert.rejects(scraper.scrape(ids), errorCode('RATE_LIMITED')); assert.equal(pageCalls, 1);
  now += 1000; assert.equal((await scraper.scrape(ids)).coverage.reconciledInnings, 2); assert.equal(pageCalls, 2);
});

test('response byte limits, MIME types and provider crawl delay are enforced', async () => {
  for (const response of [new Response('x'.repeat(2000001), { headers: { 'content-type': 'text/html' } }), new Response('{}', { headers: { 'content-type': 'application/json' } })]) {
    const scraper = new CricClubsScraper({ fetchFn: async url => String(url).endsWith('robots.txt') ? robotsResponse() : response });
    await assert.rejects(scraper.scrape(ids));
  }
  let now = 1000;
  const scraper = new CricClubsScraper({ now: () => now, fetchFn: async url => String(url).endsWith('robots.txt') ? robotsResponse('User-agent: *\nCrawl-delay: 60\nAllow: /') : htmlResponse() });
  await scraper.scrape(ids); now += 16000;
  await assert.rejects(scraper.scrape({ ...ids, matchId: '457' }), errorCode('COOLDOWN'));
});

test('slow full-card enrichment never holds up the live ticker or changes its fresh status', async () => {
  let release; const waiting = new Promise(resolve => { release = resolve; });
  const raw = { values: { matchId: '456', t1Name: 'Alpha CC', t2Name: 'Beta CC', t1Total: '150', t1Wickets: '3', t1Overs: '20',
    t2Total: '151', t2Wickets: '2', t2Overs: '19.2' }, isSecondInningsStarted: true };
  const service = new ScoreService({ fetchFn: async () => new Response(JSON.stringify(raw)), scorecardClubId: '123', scorecardLeague: 'TestLeague',
    scorecardScraper: { scrape: async () => { await waiting; return { ...fixture(), fetchedAt: Date.now() }; } } });
  service.select('123', '456'); const result = await service.refresh();
  assert.equal(result.score.runs, '151'); assert.equal(result.score.scorecard.state, 'loading'); assert.equal(result.score.stale, false);
  release(); await service.scorecardTask;
  assert.equal(service.snapshot().score.cards.complete, true); assert.equal(service.snapshot().score.cards.batting.length, 3);
});

test('a blocked scorecard does not mark ticker totals stale or fabricate missing player rows', async () => {
  const service = new ScoreService({ fetchFn: async () => new Response(JSON.stringify({ values: { matchId: '456', t1Name: 'Alpha', t2Name: 'Beta',
    t1Total: '1', t1Wickets: '0', t1Overs: '0.1', t2Total: '0', t2Wickets: '0', t2Overs: '0' } })), scorecardClubId: '123',
    scorecardScraper: { scrape: async () => { const e = new Error('Verification page'); e.code = 'ACCESS_BLOCKED'; throw e; } } });
  service.select('123', '456'); await service.refresh(); await service.scorecardTask;
  const { score, error } = service.snapshot();
  assert.equal(error, null); assert.equal(score.runs, '1'); assert.equal(score.stale, false); assert.equal(score.scorecard.state, 'blocked'); assert.equal(score.cards.batting.length, 0);
});

test('a previous match scorecard cannot enrich a new selection, even when it arrives later', async () => {
  let release; const waiting = new Promise(resolve => { release = resolve; });
  const service = new ScoreService({ fetchFn: async () => new Response(JSON.stringify({ values: { matchId: '456', t1Name: 'Alpha', t2Name: 'Beta',
    t1Total: '1', t1Wickets: '0', t1Overs: '0.1', t2Total: '0', t2Wickets: '0', t2Overs: '0' } })), scorecardClubId: '123',
    scorecardScraper: { scrape: async () => { await waiting; return fixture(); } } });
  service.select('123', '456'); await service.refresh(); const old = service.scorecardTask;
  service.select('123', '457'); release(); await old;
  assert.equal(service.snapshot().score, null); assert.equal(service.scorecardDocument, null); assert.equal(service.snapshot().ids.matchId, '457');
});

test('custom approved feeds and other unconfigured leagues never invoke the HTML scraper', async () => {
  let calls = 0;
  for (const config of [{ template: 'https://approved.test/{matchId}' }, { scorecardClubId: '300' }]) {
    const service = new ScoreService({ ...config, scorecardScraper: { scrape: async () => { calls++; } }, fetchFn: async () => new Response(JSON.stringify({
      schema: 'mk97.score.v1', batting: 'Alpha', bowling: 'Beta', runs: 1, wickets: 0, overs: '0.1'
    })) });
    service.select('123', '456'); await service.refresh();
  }
  assert.equal(calls, 0);
});
