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
      FACEBOOK_SERVER: '', FACEBOOK_KEY: '', INSTAGRAM_SERVER: '', INSTAGRAM_KEY: '' }, stdio: ['ignore', 'pipe', 'pipe']
  });
  base = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Relay startup timeout')), 12000);
    relay.stdout.on('data', c => { const m = c.toString().match(/Boundary relay: (http:\/\/[^\s]+)/); if (m) { clearTimeout(timer); resolve(m[1]); } });
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
  assert.match(await wsError(message), /1920|FFmpeg not found/); assert.match(await wsError(message), /ticket/);
});
test('session logout revokes further access', async () => {
  const r = await fetch(base + '/api/session', { method: 'POST', headers: headers(secret), body: '{}' }); const s = (await r.json()).sessionToken;
  const logout = await fetch(base + '/api/logout', { method: 'POST', headers: headers(s), body: '{}' }); assert.equal(logout.status, 200);
  assert.equal((await fetch(base + '/api/info', { headers: headers(s) })).status, 401);
});
