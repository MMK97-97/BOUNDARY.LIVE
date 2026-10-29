import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionStore, constantTimeEquals } from '../lib/security.mjs';
import { destinationConfig, outputArgs, ingestArgs, findFont } from '../lib/encoder.mjs';
test('constant-time secret verification rejects wrong and different length values', () => {
  assert.equal(constantTimeEquals('correct', 'correct'), true);
  assert.equal(constantTimeEquals('wrong', 'correct'), false);
  assert.equal(constantTimeEquals(null, 'correct'), false);
});
test('sessions are origin bound and expire', () => {
  let now = 1000; const store = new SessionStore({ now: () => now, sessionMs: 1000 });
  const session = store.create('https://site.example');
  assert.equal(store.get(session.id, 'https://site.example'), session);
  assert.equal(store.get(session.id, 'https://evil.example'), null);
  now = 2000; assert.equal(store.get(session.id, 'https://site.example'), null);
});
test('streaming tickets are one use, short lived and origin bound', () => {
  let now = 0; const store = new SessionStore({ now: () => now, ticketMs: 30 });
  const s = store.create('https://site.example'), t = store.ticket(s.id, s.origin);
  assert.equal(store.consume(t, s.origin), s); assert.equal(store.consume(t, s.origin), null);
  const wrongOrigin = store.ticket(s.id, s.origin);
  assert.equal(store.consume(wrongOrigin, 'https://evil.example'), null);
  assert.equal(store.consume(wrongOrigin, s.origin), null);
  const expired = store.ticket(s.id, s.origin); now = 31; assert.equal(store.consume(expired, s.origin), null);
});
test('revoking a session invalidates pending tickets', () => {
  const store = new SessionStore(), s = store.create('x'), ticket = store.ticket(s.id, 'x');
  store.revoke(s.id); assert.equal(store.consume(ticket, 'x'), null);
});
test('session and ticket counts are bounded', () => {
  const store = new SessionStore(); let s;
  for (let i = 0; i < 8; i++) s = store.create('x');
  assert.throws(() => store.create('x'));
  for (let i = 0; i < 24; i++) store.ticket(s.id, 'x');
  assert.throws(() => store.ticket(s.id, 'x'));
});
for (const [name, url] of [
  ['unencrypted RTMP', 'rtmp://a.rtmp.youtube.com/live2'],
  ['file output', 'file:///tmp/leak'], ['private address', 'rtmps://127.0.0.1/live'],
  ['untrusted host', 'rtmps://evil.example/live'], ['domain spoof', 'rtmps://youtube.com.evil.example/live'],
  ['credentials', 'rtmps://user:pass@a.rtmps.youtube.com/live2'],
  ['query parameters on server', 'rtmps://a.rtmps.youtube.com/live2?key=foo'],
  ['tee injection', 'rtmps://a.rtmps.youtube.com/live2|file:/tmp/leak']
]) test(`platform config rejects ${name}`, () => assert.equal(destinationConfig({ YOUTUBE_SERVER: url, YOUTUBE_KEY: 'secret' }).youtube.configured, false));
test('known platform hosts with RTMPS are accepted without exposing keys in status', () => {
  const d = destinationConfig({ YOUTUBE_SERVER: 'rtmps://a.rtmps.youtube.com/live2', YOUTUBE_KEY: 'test-key',
    FACEBOOK_SERVER: 'rtmps://live-api-s.facebook.com:443/rtmp/', FACEBOOK_KEY: 'fb-key',
    INSTAGRAM_SERVER: 'rtmps://live-upload.instagram.com:443/rtmp/', INSTAGRAM_KEY: 'ig-key' });
  assert.ok(d.youtube.configured && d.facebook.configured && d.instagram.configured);
});
test('encoder verifies outbound TLS and restricts inbound media protocols', () => {
  const a = outputArgs({ id: 'youtube', url: 'rtmps://a.rtmps.youtube.com/live2/test' });
  assert.equal(a[a.indexOf('-tls_verify') + 1], '1');
  const b = ingestArgs({ font: findFont() || '/tmp/font.ttf', mimeType: 'video/webm;codecs=vp8,opus' });
  assert.equal(b[b.indexOf('-protocol_whitelist') + 1], 'pipe');
  assert.equal(b[b.indexOf('-f') + 1], 'matroska');
});
