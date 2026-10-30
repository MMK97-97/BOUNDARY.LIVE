import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseSnapshot, applySnapshot, emptyModel, mergeModels, parseBall, oversToBalls, inningsStats, describe, youtubeId, SCHEMA } from '../../web/match-model.mjs';

const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/fwcwl-986.json', import.meta.url)));
const ids = { clubId: '300', matchId: '986' };

function live({ runs, wickets, overs, balls, b1, b2, bowler, lastOut, comments = '', partnership }) {
  return { view: 1, isSecondInningsStarted: false, balls, comments, values: {
    matchId: '986', t1Name: 'ICAT', t2Name: 'Tampa Thunderbolts', t1Code: 'ICAT', t2Code: 'TT', t1Total: String(runs), t1Wickets: String(wickets), t1Overs: overs,
    t1RR: '8.15', isMatchEnded: '0', seriesName: 'FWCWL 2026-27 Season', groundName: 'Tampa Bay', totalOvers: 20,
    batsman1ID: 1, batsman1Name: b1[0], batsman1Runs: String(b1[1]), batsman1Balls: String(b1[2]), batsman1Fours: String(b1[3] || 0), batsman1Sixers: String(b1[4] || 0), batsman1IsOut: '0',
    batsman2ID: b2[5] || 2, batsman2Name: b2[0], batsman2Runs: String(b2[1]), batsman2Balls: String(b2[2]), batsman2Fours: '0', batsman2Sixers: '0', batsman2IsOut: '0',
    bowlerID: bowler[0].length * 7, bowlerName: bowler[0], bowlerOvers: bowler[1], bowlerRuns: String(bowler[2]), bowlerWickets: String(bowler[3]), bowlerMaidens: '0',
    ...(lastOut ? { lastOutID: lastOut[3], lastOutName: lastOut[0], lastOutRuns: String(lastOut[1]), lastOutBalls: String(lastOut[2]), lastOutString: '<span>c Khan b </span><span class="outname">Ali</span>' } : {}),
    ...(partnership ? { currentPartnershipMap: { partnershipTotalRuns: String(partnership[0]), partnershipTotalBalls: String(partnership[1]) } } : {})
  } };
}

test('completed match 986 parses the exact chase and result', () => {
  const s = parseSnapshot(fixture, ids, 1000);
  assert.equal(s.innings, '2'); assert.equal(s.runs, 208); assert.equal(s.wickets, 5); assert.equal(s.overs, '30.5');
  assert.equal(s.status, 'complete'); assert.equal(s.result, 'ICAT won by 5 Wickets');
  assert.equal(s.batters.length, 2); assert.equal(s.bowler.name, 'Kaushal T');
  const m = applySnapshot(emptyModel(ids), s);
  assert.deepEqual(m.order, ['1', '2']);
  assert.equal(m.innings['1'].runs, 207); assert.equal(m.innings['1'].wickets, 9);
  assert.equal(m.innings['2'].batting.length, 2);
});

test('empty or mismatched CricClubs responses are rejected', () => {
  assert.throws(() => parseSnapshot({}, ids));
  assert.throws(() => parseSnapshot({ values: { matchId: '1', t1Total: '1' } }, ids));
});

test('ball codes distinguish bat runs, extras and wickets', () => {
  assert.deepEqual([parseBall('4').kind, parseBall('6').kind, parseBall('.').kind, parseBall('W').kind, parseBall('1wd').kind], ['four', 'six', 'dot', 'wicket', 'extra']);
  assert.equal(parseBall('1wd').legal, false); assert.equal(parseBall('5nb').batRuns, 4); assert.equal(parseBall('5nb').kind, 'four');
  assert.equal(parseBall('4lb').kind, 'extra'); assert.equal(parseBall('4lb').batRuns, 0);
  assert.equal(oversToBalls('15.2'), 92); assert.equal(oversToBalls('15.7'), null);
});

test('consecutive polls build commentary, fall of wickets, per-over runs and a batting card', () => {
  const m = emptyModel(ids);
  const seq = [
    live({ runs: 120, wickets: 2, overs: '14.4', balls: ['1', '.', '4', '1'], b1: ['R. Sharma', 40, 26, 4, 1], b2: ['K. Verma', 15, 10], bowler: ['M. Khan', '2.4', 14, 1] }),
    live({ runs: 121, wickets: 2, overs: '14.5', balls: ['1', '.', '4', '1', '1'], b1: ['R. Sharma', 40, 26, 4, 1], b2: ['K. Verma', 16, 11], bowler: ['M. Khan', '2.5', 15, 1] }),
    live({ runs: 121, wickets: 3, overs: '15.0', balls: ['1', '.', '4', '1', '1', 'W'], b1: ['R. Sharma', 40, 26, 4, 1], b2: ['S. Khan', 0, 0, 0, 0, 4], bowler: ['M. Khan', '3.0', 15, 2], lastOut: ['K. Verma', 16, 12, 2], partnership: [0, 0] }),
    live({ runs: 125, wickets: 3, overs: '15.1', balls: ['4'], b1: ['R. Sharma', 44, 27, 5, 1], b2: ['S. Khan', 0, 0, 0, 0, 4], bowler: ['A. Rahman', '0.1', 4, 0], comments: 'Lovely cover drive!' })
  ];
  for (const [i, raw] of seq.entries()) applySnapshot(m, parseSnapshot(raw, ids, 1000 + i));
  const inn = m.innings['1'];
  assert.equal(inn.fow.length, 1); assert.equal(inn.fow[0].name, 'K. Verma'); assert.equal(inn.fow[0].runs, 121);
  assert.ok(inn.batting.find(p => p.name === 'K. Verma').out);
  assert.equal(inn.batting.length, 3);
  assert.equal(inn.bowling.length, 2);
  assert.equal(inn.overs_[14].runs, 7); assert.equal(inn.overs_[14].wickets, 1); assert.equal(inn.overs_[15].runs, 4);
  const derived = inn.commentary.filter(c => c.source === 'derived');
  assert.equal(derived.at(-1).kind, 'four'); assert.equal(derived.at(-1).batter, 'R. Sharma'); assert.equal(derived.at(-1).bowler, 'A. Rahman');
  assert.equal(derived.find(c => c.kind === 'wicket').outName, 'K. Verma');
  assert.ok(inn.commentary.some(c => c.source === 'cricclubs' && c.text === 'Lovely cover drive!'));
  assert.match(describe(derived.at(-1)), /A\. Rahman to R\. Sharma, FOUR!/);
  assert.match(describe(derived.at(-1), 'hi'), /चौका/);
  const st = inningsStats(inn); assert.equal(st.fours, 5 + 0 + 0); assert.equal(st.sixes, 1);
  // A scorer correction rewrites the over instead of duplicating balls.
  applySnapshot(m, parseSnapshot(live({ runs: 122, wickets: 3, overs: '15.1', balls: ['1lb'], b1: ['R. Sharma', 40, 27, 4, 1], b2: ['S. Khan', 0, 0, 0, 0, 4], bowler: ['A. Rahman', '0.1', 0, 0] }), ids, 2000));
  assert.equal(inn.commentary.filter(c => c.id === '1:15.0').length, 1);
  assert.equal(inn.commentary.find(c => c.id === '1:15.0').code, '1lb');
});

test('local history and GitHub Actions archive merge without duplicates', () => {
  const a = emptyModel(ids), b = emptyModel(ids);
  applySnapshot(a, parseSnapshot(live({ runs: 10, wickets: 0, overs: '1.2', balls: ['4', '6'], b1: ['A', 10, 2, 1, 1], b2: ['B', 0, 0], bowler: ['X', '1.2', 10, 0] }), ids, 1));
  applySnapshot(b, parseSnapshot(live({ runs: 10, wickets: 0, overs: '1.2', balls: ['4', '6'], b1: ['A', 10, 2, 1, 1], b2: ['B', 0, 0], bowler: ['X', '1.2', 10, 0] }), ids, 2));
  applySnapshot(b, parseSnapshot(live({ runs: 11, wickets: 0, overs: '1.3', balls: ['4', '6', '1'], b1: ['A', 10, 2, 1, 1], b2: ['B', 1, 1], bowler: ['X', '1.3', 11, 0] }), ids, 3));
  const m = mergeModels(a, b);
  assert.equal(m.schema, SCHEMA); assert.equal(m.innings['1'].commentary.length, 3); assert.equal(m.innings['1'].runs, 11);
  assert.equal(mergeModels(a, { ...b, matchId: '1' }), a);
});

test('YouTube IDs are extracted from CricClubs embed links only', () => {
  assert.equal(youtubeId('//www.youtube.com/embed/iVZJiaFZrQM?rel=0&autoplay=1'), 'iVZJiaFZrQM');
  assert.equal(youtubeId('https://evil.example/embed/iVZJiaFZrQM'), '');
});
