import test from 'node:test';
import assert from 'node:assert/strict';
import { CricketEvents, legalBalls, automationOptions } from '../lib/events.mjs';
import { ReplayRing, JpegFrames, AUDIO_BYTES_PER_FRAME } from '../lib/replay-ring.mjs';
import { graphicSvg, GraphicRenderer } from '../lib/graphics.mjs';
import { findFont } from '../lib/encoder.mjs';
const score = (extra = {}) => ({ clubId: '300', matchId: '1000', innings: '1', batting: 'ICAT', bowling: 'RBCC',
  runs: '98', wickets: '1', overs: '7.5', fetchedAt: Date.now(), status: 'live',
  batters: [{ id: 'a', name: 'Batter A', runs: '49', balls: '40', fours: '3', sixes: '0' }], bowler: { id: 'b', name: 'Bowler B', overs: '1.5', maidens: '0', runs: '8', wickets: '1' }, balls: ['.'], ...extra });
test('loading a score or completed match never triggers historic events', () => {
  const e = new CricketEvents(); assert.deepEqual(e.update(score({ runs: '200', status: 'complete' })), []);
  assert.deepEqual(e.update(score({ runs: '204', status: 'complete' })), []);
});
test('one six crossing team/player milestones at the end of an over is detected once', () => {
  const e = new CricketEvents(); e.update(score());
  const next = score({ runs: '104', overs: '8', balls: ['6'], batters: [{ id: 'a', name: 'Batter A', runs: '55', balls: '41', fours: '3', sixes: '1' }] });
  const events = e.update(next);
  assert.deepEqual(events.map(v => v.type), ['boundary', 'team', 'player', 'over']);
  assert.equal(events[0].runs, 6); assert.equal(events[1].milestone, 100); assert.equal(events[2].milestone, 50); assert.equal(events[3].over, 8);
  assert.deepEqual(e.update(next), []);
});
test('byes and wides reaching four are not bat boundaries', () => {
  const e = new CricketEvents(); e.update(score());
  assert.equal(e.update(score({ runs: '102', overs: '8.0', balls: ['4b'] })).some(e => e.type === 'boundary'), false);
});
test('multiple boundaries missed between polls do not guess a particular ball', () => {
  const e = new CricketEvents(); e.update(score());
  const events = e.update(score({ runs: '106', overs: '8.1', batters: [{ id: 'a', name: 'Batter A', runs: '57', fours: '5', sixes: '0' }] }));
  assert.equal(events.some(e => e.type === 'boundary'), false);
});
test('provider delivery history at connection is not replayed, new IDs are deduplicated', () => {
  const now = Date.now(), e = new CricketEvents();
  const old = { id: 'old', batRuns: 4, occurredAt: now - 2000, batterName: 'A' };
  e.update(score({ fetchedAt: now, deliveries: [old] }));
  assert.deepEqual(e.update(score({ fetchedAt: now + 5000, deliveries: [old] })), []);
  const next = score({ fetchedAt: now + 10000, deliveries: [old, { id: 'new', batRuns: 6, occurredAt: now + 6000, batterName: 'B' }] });
  assert.equal(e.update(next).find(v => v.type === 'boundary').deliveryId, 'new'); assert.deepEqual(e.update(next), []);
});
test('no-ball plus bat four is a confirmed boundary', () => {
  const e = new CricketEvents(); e.update(score());
  const events = e.update(score({ runs: '103', overs: '7.5', batters: [{ id: 'a', name: 'Batter A', runs: '53', fours: '4', sixes: '0' }] }));
  assert.equal(events.find(e => e.type === 'boundary').runs, 4);
});
test('team milestones include 350, player milestones stop at 200', () => {
  const e = new CricketEvents(); e.update(score({ runs: '349', batters: [{ id: 'a', name: 'A', runs: '199' }] }));
  const events = e.update(score({ runs: '351', batters: [{ id: 'a', name: 'A', runs: '201' }] }));
  assert.equal(events.find(v => v.type === 'team').milestone, 350); assert.equal(events.find(v => v.type === 'player').milestone, 200);
});
test('missing counters cannot confirm a boundary or invent a player milestone', () => {
  const e = new CricketEvents(); e.update(score({ batters: [{ id: 'a', name: 'A', runs: '', fours: '', sixes: '' }] }));
  const events = e.update(score({ runs: '102', overs: '8', batters: [{ id: 'a', name: 'A', runs: '50', fours: '1', sixes: '0' }] }));
  assert.equal(events.some(e => e.type === 'boundary' || e.type === 'player'), false);
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
test('automation settings bound memory/delay and keep popups/cards exactly 60 frames', () => {
  const o = automationOptions({ scorerDelay: 500 }, { REPLAY_MEMORY_MB: '999999', REPLAY_BUFFER_SECONDS: '999' });
  assert.equal(o.popupFrames, 60); assert.equal(o.cardFrames, 60); assert.equal(o.scorerDelay, 30); assert.equal(o.bufferSeconds, 45); assert.equal(o.memoryBytes, 512 * 1048576);
});
test('JPEG parser handles arbitrary transport chunk boundaries', () => {
  const output = [], p = new JpegFrames(b => output.push(b)); const jpeg = Buffer.from([255,216,1,2,3,255,217]);
  const data = Buffer.concat([jpeg, jpeg]); for (const b of data) p.push(Buffer.from([b])); assert.equal(output.length, 2); assert.deepEqual(output[0], jpeg);
});
test('replay memory is bounded and audio stays associated with original video frames', () => {
  const r = new ReplayRing({ seconds: 30, maxBytes: 20 });
  for (let i = 0; i < 5; i++) { r.video(Buffer.alloc(8, i)); r.pcm(Buffer.alloc(AUDIO_BYTES_PER_FRAME, i)); }
  assert.ok(r.bytes <= 20); assert.equal(r.first, 3); assert.equal(r.get(4).audio[0], 4); assert.equal(r.get(4).jpeg[0], 4);
  assert.equal(r.window(0, 2), null); assert.equal(r.window(3, 2).length, 2);
});
test('graphics escape score/player markup and cache across consecutive event frames', () => {
  const event = { type: 'team', title: '<image href="https://evil.test"/>', milestone: 150, position: 0 };
  const svg = graphicSvg(score(), event); assert.equal(svg.includes('<image '), false); assert.ok(svg.includes('&lt;image'));
  const render = new GraphicRenderer(findFont()), a = render.frame(score({ fetchedAt: 0 }), event, false, true);
  const b = render.frame(score({ fetchedAt: 0 }), { ...event, position: 1 }, false, true); assert.equal(a, b);
});
