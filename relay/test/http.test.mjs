import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
let relay, base, session;
const origin = 'https://example.github.io', secret = 'test-only-token-that-is-longer-than-thirty-two-characters';
const headers = bearer => ({ Origin: origin, Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' });
before(async () => {
  relay = spawn(process.execPath, [fileURLToPath(new URL('../server.mjs', import.meta.url))], {
    env: { ...process.env, PORT: '0', HOST: '127.0.0.1', RELAY_TOKEN: secret, ALLOWED_ORIGINS: origin,
      YOUTUBE_SERVER: 'rtmps://a.rtmps.youtube.com/live2', YOUTUBE_KEY: 'test-only-no-broadcast',
      SCORE_URL_TEMPLATE: 'http://invalid.test/{matchId}',
      FACEBOOK_SERVER: '', FACEBOOK_KEY: '', INSTAGRAM_SERVER: '', INSTAGRAM_KEY: '' }, stdio: ['ignore', 'pipe', 'pipe']
  });
  base = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Relay startup timeout')), 12000);
    relay.stdout.on('data', c => { const m = c.toString().match(/MK97 relay: (http:\/\/[^\s]+)/); if (m) { clearTimeout(timer); resolve(m[1]); } });
    relay.once('exit', code => { clearTimeout(timer); reject(new Error(`Relay exited ${code}`)); });
  });
  const response = await fetch(base + '/api/session', { method: 'POST', headers: headers(secret), body: '{}' });
  session = (await response.json()).sessionToken; assert.ok(session);
});
after(async () => {
  if (relay && relay.exitCode === null) { relay.kill(); await new Promise(resolve => relay.once('exit', resolve)); }
});
test('relay rejects unauthenticated requests', async () => {
  const r = await fetch(base + '/api/info', { headers: { Origin: origin } }); assert.equal(r.status, 401);
});
test('master token is accepted only for creating sessions', async () => {
  const r = await fetch(base + '/api/info', { headers: headers(secret) }); assert.equal(r.status, 401);
});
test('authenticated info has security headers and never exposes stream keys', async () => {
  const r = await fetch(base + '/api/info', { headers: headers(session) }); const text = await r.text();
  assert.equal(r.status, 200); assert.ok(r.headers.get('content-security-policy').includes("frame-ancestors 'none'"));
  assert.equal(r.headers.get('cache-control'), 'no-store'); assert.equal(r.headers.get('access-control-allow-origin'), origin);
  assert.equal(text.includes('test-only-no-broadcast'), false); assert.equal(text.includes(secret), false);
});
test('unknown origins are rejected even with a valid session', async () => {
  const r = await fetch(base + '/api/info', { headers: { ...headers(session), Origin: 'https://evil.example' } }); assert.equal(r.status, 403);
});
test('same-origin GETs use the explicit allowed client origin without losing their session', async () => {
  const r = await fetch(base + '/api/info', { headers: { Authorization: `Bearer ${session}`, 'X-MK97-Origin': origin } });
  assert.equal(r.status, 200); assert.equal((await r.json()).name, 'MK97 relay');
});
test('the client origin cannot override or contradict a browser Origin', async () => {
  for (const extra of [
    { Origin: 'https://evil.example', 'X-MK97-Origin': origin },
    { Origin: origin, 'X-MK97-Origin': 'https://evil.example' },
    { 'X-MK97-Origin': 'https://evil.example' }
  ]) assert.equal((await fetch(base + '/api/info', { headers: { Authorization: `Bearer ${session}`, ...extra } })).status, 403);
});
test('YouTube routes require relay authorization and cannot inject arbitrary OAuth state', async () => {
  for (const route of ['/api/youtube/status', '/api/youtube/auth/start', '/api/youtube/setup']) {
    const r = await fetch(base + route, { method: route.endsWith('status') ? 'GET' : 'POST', headers: { Origin: origin }, body: route.endsWith('status') ? undefined : '{}' }); assert.equal(r.status, 401);
  }
  const configured = await fetch(base + '/api/youtube/status', { headers: headers(session) }); const state = await configured.json(); assert.equal(state.connected, false);
  const bad = await fetch(base + '/api/youtube/auth/complete', { method: 'POST', headers: headers(session), body: JSON.stringify({ state: 'attacker', code: 'stolen' }) }); assert.equal(bad.status, 401);
  const callback = await fetch(base + '/youtube-callback.html'); assert.equal(callback.status, 200); assert.equal(callback.headers.get('referrer-policy'), 'no-referrer');
});
test('clip APIs require an authenticated active broadcast and reject arbitrary file paths', async () => {
  for (const route of ['/api/automation', '/api/clips/0000000000000000.mp4']) {
    assert.equal((await fetch(base + route, { headers: { Origin: origin } })).status, 401);
  }
  const status = await fetch(base + '/api/automation', { headers: headers(session) }); assert.deepEqual((await status.json()).clips, []);
  assert.equal((await fetch(base + '/api/clip/select', { method: 'POST', headers: headers(session), body: '{"behind":0}' })).status, 409);
  assert.equal((await fetch(base + '/api/clips/0000000000000000.mp4', { headers: headers(session) })).status, 409);
  assert.equal((await fetch(base + '/api/clips/../../relay/.env', { headers: headers(session) })).status, 404);
});
test('preflight only allows the configured origin', async () => {
  const r = await fetch(base + '/api/ticket', { method: 'OPTIONS', headers: { Origin: origin } });
  assert.equal(r.status, 204); assert.equal(r.headers.get('access-control-allow-origin'), origin);
});
test('only web assets are served; environment and source files are private', async () => {
  for (const p of ['/relay/.env', '/.env', '/relay/server.mjs', '/package.json', '/%2e%2e%2frelay%2f.env']) {
    assert.equal((await fetch(base + p)).status, 404, p);
  }
  assert.equal((await fetch(base + '/')).status, 200);
});
test('large and malformed API bodies fail safely', async () => {
  const malformed = await fetch(base + '/api/match', { method: 'POST', headers: headers(session), body: '{' }); assert.equal(malformed.status, 400);
  const oversized = await fetch(base + '/api/match', { method: 'POST', headers: headers(session), body: JSON.stringify({ value: 'x'.repeat(5000) }) }); assert.equal(oversized.status, 400);
});
async function wsError(payload) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(base.replace('http:', 'ws:') + '/ingest', { origin });
    const timer = setTimeout(() => { ws.terminate(); reject(new Error('WebSocket timeout')); }, 5000);
    ws.on('open', () => ws.send(JSON.stringify(payload)));
    ws.on('message', c => { const m = JSON.parse(c); if (m.type === 'error') { clearTimeout(timer); ws.close(); resolve(m.message); } });
    ws.on('error', reject);
  });
}
test('WebSocket authentication rejects invalid tickets without starting FFmpeg', async () => {
  assert.match(await wsError({ type: 'start', ticket: 'bad' }), /ticket/);
});
test('stream tickets are consumed once even when camera validation fails', async () => {
  const r = await fetch(base + '/api/ticket', { method: 'POST', headers: headers(session), body: '{}' }); const { ticket } = await r.json();
  const message = { type: 'start', ticket, destinations: ['youtube'], mimeType: 'video/mp4', width: 1280, height: 720, overlay: false };
  assert.match(await wsError(message), /1920/); assert.match(await wsError(message), /ticket/);
});
test('new match IDs replace the selected relay IDs even when source access fails', async () => {
  for (const matchId of ['986', '987']) {
    const response = await fetch(base + '/api/match', { method: 'POST', headers: headers(session), body: JSON.stringify({ clubId: '300', matchId }) });
    assert.equal(response.status, 502); const value = await response.json(); assert.equal(value.ids.matchId, matchId); assert.equal(value.score, null);
  }
  const latest = await (await fetch(base + '/api/score', { headers: headers(session) })).json();
  assert.deepEqual(latest.ids, { clubId: '300', matchId: '987' });
});
test('stream startup rejects a score overlay for a different selected match', async () => {
  const r = await fetch(base + '/api/ticket', { method: 'POST', headers: headers(session), body: '{}' }); const { ticket } = await r.json();
  const message = { type: 'start', ticket, destinations: ['youtube'], mimeType: 'video/mp4', width: 1920, height: 1080, overlay: true, match: { clubId: '300', matchId: '986' } };
  assert.match(await wsError(message), /selected Match ID changed/);
  const info = await (await fetch(base + '/api/info', { headers: headers(session) })).json(); assert.equal(info.busy, false);
});
test('session logout revokes further access', async () => {
  const r = await fetch(base + '/api/session', { method: 'POST', headers: headers(secret), body: '{}' }); const s = (await r.json()).sessionToken;
  const logout = await fetch(base + '/api/logout', { method: 'POST', headers: headers(s), body: '{}' }); assert.equal(logout.status, 200);
  assert.equal((await fetch(base + '/api/info', { headers: headers(s) })).status, 401);
});
