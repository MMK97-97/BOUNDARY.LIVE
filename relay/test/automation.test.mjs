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
});
