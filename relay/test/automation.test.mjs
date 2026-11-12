import test from 'node:test';
import assert from 'node:assert/strict';
import { CricketEvents, legalBalls, automationOptions } from '../lib/events.mjs';
import { graphicSvg, GraphicRenderer } from '../lib/graphics.mjs';
import { findFont } from '../lib/encoder.mjs';
const score = (extra = {}) => ({ clubId: '300', matchId: '1000', innings: '1', batting: 'ICAT', bowling: 'RBCC',
  runs: '98', wickets: '1', overs: '7.5', fetchedAt: Date.now(), status: 'live',
  batters: [{ id: 'a', name: 'Batter A', runs: '49', balls: '40', fours: '3', sixes: '0' }], bowler: { id: 'b', name: 'Bowler B', overs: '1.5', maidens: '0', runs: '8', wickets: '1' }, balls: ['.'], ...extra });
test('loading a score or completed match never triggers historic events', () => {
  const e = new CricketEvents(); assert.deepEqual(e.update(score({ runs: '200', status: 'complete' })), []);
  assert.deepEqual(e.update(score({ runs: '204', status: 'complete' })), []);
});
test('live scoring triggers team/player milestones and the over once, without a video switch', () => {
  const e = new CricketEvents(); e.update(score());
  const next = score({ runs: '104', overs: '8', balls: ['6'], batters: [{ id: 'a', name: 'Batter A', runs: '55', balls: '41', fours: '3', sixes: '1' }] });
  const events = e.update(next); assert.deepEqual(events.map(v=>v.type), ['team','player','over']);
  assert.equal(events[0].milestone,100); assert.equal(events[1].milestone,50); assert.equal(events[2].over,8);
  assert.deepEqual(e.update(next), []);
});
test('team milestones include 350, player milestones stop at 200', () => {
  const e = new CricketEvents(); e.update(score({ runs: '349', batters: [{ id: 'a', name: 'A', runs: '199' }] }));
  const events = e.update(score({ runs: '351', batters: [{ id: 'a', name: 'A', runs: '201' }] }));
  assert.equal(events.find(v => v.type === 'team').milestone, 350); assert.equal(events.find(v => v.type === 'player').milestone, 200);
});
test('missing batter runs cannot invent a player milestone', () => {
  const e = new CricketEvents(); e.update(score({ batters: [{ id: 'a', name: 'A', runs: '', fours: '', sixes: '' }] }));
  const events = e.update(score({ runs: '102', overs: '8', batters: [{ id: 'a', name: 'A', runs: '50', fours: '1', sixes: '0' }] }));
  assert.equal(events.some(e => e.type === 'player'), false);
});
test('a score correction cannot reannounce milestones or overs preceding connection', () => {
  const e = new CricketEvents(); e.update(score({ runs: '101', overs: '8' })); e.update(score({ runs: '49', overs: '6.5' }));
  const events = e.update(score({ runs: '51', overs: '7' })); assert.equal(events.some(e => e.type === 'team' || e.type === 'over'), false);
});
test('corrections, innings changes, stale polls and changed display names are safe', () => {
  const e = new CricketEvents(); e.update(score()); const milestone = score({ runs: '101', batters: [{ id: 'a', name: 'Renamed A', runs: '52' }] });
  assert.equal(e.update({ ...milestone, stale: true }).length, 0);
  assert.ok(e.update(milestone).some(v => v.type === 'player'));
  e.update(score({ runs: '96' })); assert.equal(e.update(milestone).some(v => v.type === 'team'), false);
  assert.deepEqual(e.update({ ...milestone, innings: '2' }), []);
});
test('over crossings use cricket balls rather than decimal arithmetic', () => {
  assert.equal(legalBalls('7.5'), 47); assert.equal(legalBalls('8.0'), 48); assert.equal(legalBalls('7.6'), null);
  const e = new CricketEvents(); e.update(score()); assert.ok(e.update(score({ overs: '8.1' })).some(v => v.type === 'over'));
});
test('player cards accumulate available batters and bowlers without claiming completeness', () => {
  const e = new CricketEvents(); const s = score(); e.update(s); e.update(score({ batters: [{ id: 'c', name: 'Batter C', runs: '3' }], bowler: { id: 'd', name: 'Bowler D', overs: '1', runs: '3', wickets: '0' } }));
  const cards = e.cards(s); assert.equal(cards.batting.length, 2); assert.equal(cards.bowling.length, 2); assert.equal(cards.complete, false);
});
test('live graphic settings keep each popup/card at 60 frames', () => {
  const o = automationOptions(); assert.equal(o.popupFrames,60); assert.equal(o.cardFrames,60);
  assert.deepEqual(Object.keys(o).sort(), ['cardFrames','cards','milestones','popupFrames']);
});
test('malformed optional graphic settings cannot break stream initialization', () => {
  for (const v of [null,false,'invalid',[]]) assert.equal(automationOptions(v).milestones,true);
});
test('graphics escape score/player markup and cache across consecutive event frames', () => {
  const event = { type: 'team', title: '<image href="https://evil.test"/>', milestone: 150, position: 0 };
  const svg = graphicSvg(score(), event); assert.equal(svg.includes('<image href="https://evil.test"'), false); assert.ok(svg.includes('&lt;image'));
  assert.equal((svg.match(/<image /g) || []).length, 1); assert.ok(svg.includes('data:image/png;base64,'));
  const render = new GraphicRenderer(findFont()), a = render.frame(score({ fetchedAt: 0 }), event, true);
  const b = render.frame(score({ fetchedAt: 0 }), { ...event, position: 1 }, true); assert.equal(a, b);
  const firstInnings = score({ innings: '1', target: '0', requiredRate: '--.--', runRate: '8.50', teams: [{ name: 'ICAT', code: 'ICAT', runs: '98', wickets: '1', overs: '7.5' }, { name: 'RBCC', code: 'RBCC', runs: '0', wickets: '0', overs: '0.0' }] });
  const chasing = score({ innings: '2', batting: 'RBCC', bowling: 'ICAT', runs: '110', wickets: '3', overs: '14.0', totalOvers: '20', runRate: '7.86', requiredRate: '9.00', teams: [{ name: 'ICAT', code: 'ICAT', runs: '163', wickets: '6', overs: '20.0' }, { name: 'RBCC', code: 'RBCC', runs: '110', wickets: '3', overs: '14.0' }] });
  for (const theme of ['gold', 'shield', 'dual', 'cyan', 'classic']) {
    const svg1 = graphicSvg(firstInnings, null, true, { width: 1920, height: 1080 }, theme);
    const svg2 = graphicSvg(chasing, null, true, { width: 1920, height: 1080 }, theme);
    assert.equal(svg1.includes('NEED 1 '), false, `1st innings should not fabricate a 1-run chase in ${theme}`);
    assert.ok(svg1.includes('PROJECTED') || svg1.includes('PROJ'), `1st innings should show projected score in ${theme}`);
    assert.ok(svg2.includes('54') && (svg2.includes('36') || svg2.includes('164')), `2nd innings chase should show runs needed and balls/target in ${theme}`);
  }
  assert.ok(graphicSvg(firstInnings, null, true, { width: 1920, height: 1080 }, 'dual').includes('YET TO BAT'));
  assert.ok(graphicSvg(chasing, null, true, { width: 1920, height: 1080 }, 'dual').includes('163-6'));
});

test('CricketEvents detects live four, six, and wicket stingers without repeating corrections', () => {
  const e = new CricketEvents();
  assert.deepEqual(e.update(score()), []);
  assert.deepEqual(e.lastMoments, []);

  // Boundary Four (batter fours + 1, ball appended '4')
  const fourScore = score({ runs: '102', overs: '8.0', balls: ['.', '4'], batters: [{ id: 'a', name: 'Batter A', runs: '53', balls: '41', fours: '4', sixes: '0' }] });
  e.update(fourScore);
  assert.deepEqual(e.lastMoments.map(m => m.type), ['four']);
  assert.equal(e.lastMoments[0].title, 'Batter A');

  // Identical repeat poll emits nothing
  e.update(fourScore);
  assert.deepEqual(e.lastMoments, []);

  // Maximum Six
  const sixScore = score({ runs: '108', overs: '8.1', balls: ['.', '4', '6'], batters: [{ id: 'a', name: 'Batter A', runs: '59', balls: '42', fours: '4', sixes: '1' }] });
  e.update(sixScore);
  assert.deepEqual(e.lastMoments.map(m => m.type), ['six']);

  // Wicket Dismissal
  const wktScore = score({ runs: '108', wickets: '2', overs: '8.2', balls: ['.', '4', '6', 'W'], lastOut: { name: 'Batter A', runs: '59', balls: '43', status: 'b Bowler B' } });
  e.update(wktScore);
  assert.deepEqual(e.lastMoments.map(m => m.type), ['wicket']);
  assert.match(e.lastMoments[0].subtitle, /Batter A 59\(43\)/);
});

test('graphicSvg renders bounded stingers, match summary card, and XML-escaped custom broadcast ticker', () => {
  const s = score({ series: 'FWCWL Finals', ground: 'Rodney Park', teams: [{ code: 'ICAT', name: 'ICAT', runs: '98', wickets: '1', overs: '7.5', runRate: '12.5' }, { code: 'RBCC', name: 'RBCC', runs: '0', wickets: '0', overs: '0.0' }] });
  const fourSvg = graphicSvg(s, { type: 'four', title: 'Batter A', subtitle: '49 (40)', milestone: 4 }, true, { width: 1920, height: 1080 }, 'gold', '<script>FWCWL FINALS</script>');
  assert.ok(fourSvg.includes('BOUNDARY FOUR!'));
  assert.equal(fourSvg.includes('<script>FWCWL FINALS</script>'), false);
  assert.ok(fourSvg.includes('&lt;SCRIPT&gt;FWCWL FINALS&lt;/SCRIPT&gt;') || fourSvg.includes('&lt;script&gt;'));

  const sixSvg = graphicSvg(s, { type: 'six', title: 'Batter A', subtitle: '55 (41)', milestone: 6 });
  assert.ok(sixSvg.includes('MAXIMUM SIX!'));

  const wktSvg = graphicSvg(s, { type: 'wicket', title: 'Batter A', subtitle: 'b Bowler B', milestone: 2 });
  assert.ok(wktSvg.includes('WICKET #2') && wktSvg.includes('OUT'));

  const sumSvg = graphicSvg(s, { type: 'summary', cards: { batting: s.batters, bowling: [s.bowler] } });
  assert.ok(sumSvg.includes('MATCH SUMMARY') && sumSvg.includes('KEY PERFORMERS'));

  const render = new GraphicRenderer(findFont());
  const p1 = render.frame(score({ fetchedAt: 0 }), null, true, 'gold', 'SPONSOR A');
  const p2 = render.frame(score({ fetchedAt: 0 }), null, true, 'gold', 'SPONSOR B');
  assert.notEqual(Buffer.compare(p1, p2), 0);
});