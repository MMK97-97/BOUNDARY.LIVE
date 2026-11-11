import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverLeagueSchedule, parseLeagueScheduleInput, sortScheduleMatches, clearScheduleCache } from '../../web/cricclubs-schedule.mjs';
import { normalizeScore, scheduledScore, scoreLines } from '../../web/score-data.mjs';
import { graphicSvg } from '../../web/score-graphic.mjs';
import { ScoreService } from '../lib/score.mjs';

test('discoverLeagueSchedule discovers live, scheduled, and completed matches from frontier and sorts live first', async () => {
  clearScheduleCache();
  const db = {
    '1005': { view: 1, values: { clubId: '300', matchId: '1005', t1Name: 'Super Kings', t2Name: 'Chargers', t1Total: '0', t1Wickets: '0', t1Overs: '0.0', t2Total: '0', t2Wickets: '0', t2Overs: '0', isMatchEnded: '0', matchDate: 'Nov 12 · 09:00 AM', seriesName: 'FWCWL' } },
    '1004': { view: 1, values: { clubId: '300', matchId: '1004', t1Name: 'ICAT', t2Name: 'RBCC', t1Total: '98', t1Wickets: '2', t1Overs: '11.3', t2Total: '0', t2Wickets: '0', t2Overs: '0', isMatchEnded: '0', batsman1Name: 'Opener' } },
    '1003': { view: 1, values: { clubId: '300', matchId: '1003', t1Name: 'Panthers', t2Name: 'Titans', t1Total: '140', t1Wickets: '6', t1Overs: '20', t2Total: '141', t2Wickets: '3', t2Overs: '18.2', isMatchEnded: '1', shortResult: 'Titans won by 7 wkts' } }
  };
  const fetchFn = async url => {
    const id = new URL(url).searchParams.get('matchId');
    return new Response(JSON.stringify(db[id] || {}), { status: 200 });
  };
  const result = await discoverLeagueSchedule({ clubId: '300', league: 'FWCWL', seedMatchId: 1003, fetchFn, limit: 10 });
  assert.equal(result.clubId, '300');
  assert.equal(result.frontier, 1005);
  assert.deepEqual(result.matches.map(m => [m.matchId, m.status]), [
    ['1004', 'live'],
    ['1005', 'scheduled'],
    ['1003', 'complete']
  ]);
  assert.equal(result.matches[1].date, 'Nov 12 · 09:00 AM');
});

test('discoverLeagueSchedule throws BLOCKED_BY_UPSTREAM on HTTP 403 or HTML challenge without bypassing', async () => {
  clearScheduleCache();
  await assert.rejects(
    discoverLeagueSchedule({
      clubId: '300',
      seedMatchId: 990,
      fetchFn: async () => new Response('<html>Just a moment</html>', { status: 403 })
    }),
    err => err.code === 'BLOCKED_BY_UPSTREAM' && /403/.test(err.message)
  );
  await assert.rejects(
    discoverLeagueSchedule({
      clubId: '300',
      seedMatchId: 990,
      fetchFn: async () => new Response('<html>Cloudflare</html>', { status: 200 })
    }),
    err => err.code === 'BLOCKED_BY_UPSTREAM'
  );
});

test('parseLeagueScheduleInput extracts fixtures from URLs and copied schedule text', () => {
  const pasted = `
    Sunday Fixture - Match 1012: Orlando Royals vs Tampa United | Nov 15 9:00 AM
    https://cricclubs.com/TampaCricket/viewScorecard.do?matchId=3910&clubId=1507 Royal Strikers vs Bay XI
  `;
  const parsed = parseLeagueScheduleInput(pasted, { clubId: '300', league: 'FWCWL' });
  assert.equal(parsed.length, 2);
  const byId = new Map(parsed.map(m => [m.matchId, m]));
  assert.equal(byId.get('1012').clubId, '300');
  assert.equal(byId.get('1012').team1, 'Orlando Royals');
  assert.equal(byId.get('1012').team2, 'Tampa United');
  assert.equal(byId.get('3910').clubId, '1507');
  assert.equal(byId.get('3910').league, 'TampaCricket');
  assert.throws(() => parseLeagueScheduleInput('hello world without ids', { clubId: '300' }), /Could not find/);
});

test('scheduled score normalization, SVG rendering and automatic scheduled->live transition work seamlessly', async () => {
  const preMatchPayload = {
    view: 1,
    values: {
      clubId: '300',
      matchId: '1008',
      t1Name: 'Super Kings',
      t2Name: 'Chargers',
      t1Total: '0',
      t1Wickets: '0',
      t1Overs: '0.0',
      t2Total: '0',
      t2Wickets: '0',
      t2Overs: '0',
      isMatchEnded: '0',
      matchDate: 'Nov 12 · 09:00 AM',
      groundName: 'Central Park',
      seriesName: 'FWCWL'
    }
  };
  const preNormalized = normalizeScore(preMatchPayload, { clubId: '300', matchId: '1008' });
  assert.equal(preNormalized.status, 'scheduled');

  const fallback = scheduledScore({ clubId: '300', matchId: '1009' }, { team1: 'Alpha XI', team2: 'Beta XI', date: '10:00 AM' });
  assert.equal(fallback.status, 'scheduled');
  assert.match(scoreLines(fallback)[1], /MATCH SCHEDULED/);

  for (const theme of ['gold', 'shield', 'dual', 'cyan', 'classic']) {
    const landscape = graphicSvg(fallback, null, true, '', { width: 1920, height: 1080 }, theme);
    assert.ok(landscape.includes('MATCH SCHEDULED'), `Missing MATCH SCHEDULED in ${theme}`);
    assert.ok(landscape.toUpperCase().includes('ALPHA'), `Missing team1 in ${theme}`);
    const portrait = graphicSvg(fallback, null, true, '', { width: 1080, height: 1920 }, theme);
    assert.ok(portrait.includes('MATCH SCHEDULED'), `Missing MATCH SCHEDULED in portrait ${theme}`);
  }

  let liveStarted = false;
  let enrichedCalls = 0;
  const service = new ScoreService({
    fetchFn: async () => {
      if (!liveStarted) return new Response(JSON.stringify({}));
      return new Response(JSON.stringify({
        view: 1,
        values: { clubId: '300', matchId: '1009', t1Name: 'Alpha XI', t2Name: 'Beta XI', t1Total: '4', t1Wickets: '0', t1Overs: '0.1', isMatchEnded: '0' },
        balls: ['4']
      }));
    },
    scorecardScraper: {
      scrape: async ref => {
        enrichedCalls++;
        return { schema: 'mk97.cricclubs.scorecard.v1', clubId: ref.clubId, matchId: ref.matchId, league: 'FWCWL', inningsCards: [], commentary: [], fetchedAt: Date.now() };
      }
    }
  });

  service.select('300', '1009', 'FWCWL', { allowScheduled: true, scheduleHint: { team1: 'Alpha XI', team2: 'Beta XI', date: '10:00 AM' } });
  const snap1 = await service.refresh();
  assert.equal(snap1.score.status, 'scheduled');
  assert.equal(snap1.pollSeconds, 3);
  assert.equal(enrichedCalls, 0);

  liveStarted = true;
  service.lastAttempt = 0;
  const snap2 = await service.refresh();
  assert.equal(snap2.score.status, 'live');
  assert.equal(snap2.score.runs, '4');
  assert.equal(snap2.pollSeconds, 5);
  await service.scorecardTask;
  assert.equal(enrichedCalls, 1);
});

test('sortScheduleMatches ranks live before scheduled before complete', () => {
  const sorted = sortScheduleMatches([
    { matchId: '10', status: 'complete' },
    { matchId: '12', status: 'scheduled' },
    { matchId: '11', status: 'live' },
    { matchId: '14', status: 'scheduled' }
  ]);
  assert.deepEqual(sorted.map(m => m.matchId), ['11', '14', '12', '10']);
});
