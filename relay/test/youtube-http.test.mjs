import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
const origin = 'https://mk97-fixture.onrender.com', secret = 'synthetic-relay-token-for-local-http-test-only';
const headers = bearer => ({ Origin: origin, 'X-MK97-Origin': origin, Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' });
let relay, base, owner, directory;
async function call(route, value, bearer = owner) {
  const r = await fetch(base + route, { method: value === undefined ? 'GET' : 'POST', headers: headers(bearer), ...(value === undefined ? {} : { body: JSON.stringify(value) }) });
  const data = await r.json(); assert.ok(r.ok, data.error); return data;
}
before(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mk97-youtube-http-'));
  const mock = path.join(directory, 'provider.mjs');
  fs.writeFileSync(mock, `import { youtubeProvider } from ${JSON.stringify(new URL('../support/youtube-provider.mjs', import.meta.url).href)};\nconst mock = youtubeProvider(); globalThis.fetch = mock.fetchFn;\n`);
  relay = spawn(process.execPath, ['--import', pathToFileURL(mock).href, fileURLToPath(new URL('../server.mjs', import.meta.url))], {
    env: { ...process.env, PORT: '0', HOST: '127.0.0.1', RELAY_TOKEN: secret, RENDER_EXTERNAL_URL: origin, PUBLIC_URL: '', ALLOWED_ORIGINS: '',
      GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'test-client-secret-not-real', YOUTUBE_REDIRECT_URI: '',
      YOUTUBE_SERVER: '', YOUTUBE_KEY: '', FACEBOOK_SERVER: '', FACEBOOK_KEY: '', INSTAGRAM_SERVER: '', INSTAGRAM_KEY: '', CRICCLUBS_SCORECARD_ENABLED: 'false' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  base = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Relay startup timeout')), 12000);
    relay.stdout.on('data', bytes => { const match = bytes.toString().match(/MK97 relay: (http:\/\/[^\s]+)/); if (match) { clearTimeout(timer); resolve(match[1]); } });
    relay.once('exit', code => { clearTimeout(timer); reject(new Error('Relay exited ' + code)); });
  });
  owner = (await call('/api/session', {}, secret)).sessionToken;
});
after(async () => {
  if (relay && relay.exitCode === null) { relay.kill(); await new Promise(resolve => relay.once('exit', resolve)); }
  if (directory) fs.rmSync(directory, { recursive: true, force: true });
});
test('real cloud callback authenticates only its pending owner, strips the URL and exposes no token', async () => {
  const initial = await call('/api/youtube/status'); assert.equal(initial.redirectUri, origin + '/youtube-callback.html'); assert.equal(initial.callbackMode, 'server');
  const flow = await call('/api/youtube/auth/start', {}); assert.equal(new URL(flow.authorizationUrl).searchParams.get('redirect_uri'), initial.redirectUri);
  const response = await fetch(base + '/youtube-callback.html?state=' + flow.state + '&code=synthetic-once-code', { redirect: 'manual' });
  assert.equal(response.status, 303); assert.equal(response.headers.get('location'), '/youtube-callback.html?result=connected');
  assert.equal(response.headers.get('cache-control'), 'no-store'); assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  const status = await call('/api/youtube/status'); assert.equal(status.connected, true); assert.equal(status.authorization.status, 'connected'); assert.equal(status.authorizing, false);
  const second = (await call('/api/session', {}, secret)).sessionToken;
  const other = await call('/api/youtube/status', undefined, second); assert.equal(other.connected, false); assert.equal(other.authorization, null);
  const page = await fetch(base + response.headers.get('location')); assert.equal(page.headers.get('cache-control'), 'no-store');
  for (const text of [await page.text(), JSON.stringify(status)]) for (const privateValue of [secret, 'private-access-token', 'private-refresh-token', 'test-client-secret-not-real', 'synthetic-once-code']) assert.equal(text.includes(privateValue), false);
  const replay = await fetch(base + '/youtube-callback.html?state=' + flow.state + '&code=synthetic-once-code', { redirect: 'manual' });
  assert.equal(replay.headers.get('location'), '/youtube-callback.html?result=failed');
});
test('the authenticated cloud setup provisions its account destination without returning a stream key', async () => {
  const setup = await call('/api/youtube/setup', { requestId: 'http-youtube-setup-fixture', title: 'Fixture cricket', description: '', privacy: 'unlisted', madeForKids: false, scheduledStartTime: new Date().toISOString() });
  assert.equal(setup.broadcast.keyReady, true); assert.equal(setup.setup.stage, 'ready');
  const info = await call('/api/info'); assert.equal(info.destinations.find(d => d.id === 'youtube').configured, true); assert.equal(info.destinations.find(d => d.id === 'youtube').mode, 'account');
  assert.equal(JSON.stringify(info).includes('private-api-stream-key'), false);
  await call('/api/youtube/transition', { state: 'testing' }); await call('/api/youtube/transition', { state: 'live' });
  const ended = await call('/api/youtube/transition', { state: 'complete' }); assert.equal(ended.broadcast.keyReady, false);
});
test('invalid callback parameters never consume a valid flow, and denied authorization stays visible to its owner', async () => {
  const flow = await call('/api/youtube/auth/start', {});
  for (const suffix of ['&state=' + flow.state + '&code=fixture', '&code=fixture&error=denied', '&code=a&code=b']) {
    const r = await fetch(base + '/youtube-callback.html?state=' + flow.state + suffix, { redirect: 'manual' });
    assert.equal(r.headers.get('location'), '/youtube-callback.html?result=failed');
  }
  assert.equal((await call('/api/youtube/status')).authorizing, true);
  const denied = await fetch(base + '/youtube-callback.html?state=' + flow.state + '&error=untrusted-provider-secret', { redirect: 'manual' });
  assert.equal(denied.headers.get('location'), '/youtube-callback.html?result=failed');
  const status = await call('/api/youtube/status'); assert.equal(status.authorization.status, 'failed'); assert.match(status.error, /cancelled/);
  assert.equal(JSON.stringify(status).includes('untrusted-provider-secret'), false);
  await call('/api/youtube/auth/cancel', {}); assert.equal((await call('/api/youtube/status')).authorization, null);
});
test('expired operator sessions cannot be resurrected through a callback', async () => {
  const second = (await call('/api/session', {}, secret)).sessionToken;
  const flow = await call('/api/youtube/auth/start', {}, second); await call('/api/logout', {}, second);
  const r = await fetch(base + '/youtube-callback.html?state=' + flow.state + '&code=synthetic-late', { redirect: 'manual' });
  assert.equal(r.headers.get('location'), '/youtube-callback.html?result=failed');
  assert.equal((await fetch(base + '/api/youtube/status', { headers: headers(second) })).status, 401);
});
