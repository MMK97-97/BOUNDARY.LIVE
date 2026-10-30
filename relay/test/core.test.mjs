import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMatch, relayOrigin, clampZoom, is1080Landscape, duration, chooseMime, preflight } from '../../web/core.mjs';
test('match 986 accepts league ID and extracts IDs from a complete CricClubs URL', () => {
  assert.deepEqual(parseMatch('986', '300'), { clubId: '300', matchId: '986' });
  assert.deepEqual(parseMatch('https://cricclubs.com/FWCWL/viewScorecard.do?matchId=986&clubId=300'), { clubId: '300', matchId: '986', league: 'FWCWL' });
});
for (const [name, value, club] of [
  ['missing club', '986', ''], ['negative match', '-1', '123'], ['nonnumeric match', '986;rm', '123'],
  ['zero match', '0', '123'], ['zero club', '986', '0'], ['oversized ID', '1234567890123', '123'],
  ['untrusted host', 'https://evil.example/?matchId=986&clubId=123', ''],
  ['host suffix spoof', 'https://cricclubs.com.evil.example/?matchId=986&clubId=123', ''],
  ['HTTP score URL', 'http://cricclubs.com/?matchId=986&clubId=123', ''],
  ['URL credentials', 'https://user:pass@cricclubs.com/?matchId=986&clubId=123', '']
]) test(`match rejects ${name}`, () => assert.throws(() => parseMatch(value, club)));
for (const value of ['https://relay.example.com', 'https://relay.example.com/', 'http://localhost:8787/', 'http://127.0.0.1:8787']) {
  test(`relay accepts ${value}`, () => assert.ok(relayOrigin(value)));
}
for (const value of ['http://relay.example.com', 'https://relay.example.com/path', 'https://me:pass@relay.example.com',
  'javascript:alert(1)', 'https://relay.example.com/?token=secret', 'https://relay.example.com/#key']) {
  test(`relay rejects ${value}`, () => assert.throws(() => relayOrigin(value)));
}
test('zoom clamps and snaps to the device step', () => {
  const z = { min: 1, max: 3, step: .1 };
  assert.equal(clampZoom(50, z), 3); assert.equal(clampZoom(-2, z), 1); assert.equal(clampZoom(1.56, z), 1.6);
});
test('1080p validation rejects portrait and lower resolution', () => {
  assert.equal(is1080Landscape({ width: 1920, height: 1080 }), true);
  assert.equal(is1080Landscape({ width: 1080, height: 1920 }), false);
  assert.equal(is1080Landscape({ width: 1280, height: 720 }), false);
});
test('duration formatting supports long innings', () => {
  assert.equal(duration(0), '00:00:00'); assert.equal(duration(7325), '02:02:05'); assert.equal(duration(-1), '00:00:00');
});
test('codec negotiation prefers supported AVC and has a VP8 fallback', () => {
  assert.match(chooseMime({ isTypeSupported: m => m.includes('avc1') }), /avc1/);
  assert.equal(chooseMime({ isTypeSupported: m => m === 'video/webm;codecs=vp8,opus' }), 'video/webm;codecs=vp8,opus');
  assert.throws(() => chooseMime({ isTypeSupported: () => false })); assert.throws(() => chooseMime(undefined));
});
const valid = { connected: true, encoderReady: true, camera: { width: 1920, height: 1080 }, destinations: ['youtube'], overlay: true, score: {} };
test('preflight requires every dependency without silently lowering quality', () => {
  assert.equal(preflight(valid), null);
  for (const change of [{ connected: false }, { encoderReady: false }, { camera: null }, { destinations: [] }, { score: null }, { camera: { width: 1280, height: 720 } }]) {
    assert.equal(typeof preflight({ ...valid, ...change }), 'string');
  }
  assert.equal(preflight({ ...valid, overlay: false, score: null }), null);
});
