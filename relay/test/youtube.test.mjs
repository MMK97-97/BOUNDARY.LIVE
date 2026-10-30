import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { YouTubeService, broadcastDetails, youtubeConfig } from '../lib/youtube.mjs';
import { youtubeProvider, testGoogleEnv } from '../support/youtube-provider.mjs';
const origin = 'https://example.github.io', owner = 'owner', now = Date.parse('2026-10-29T19:00:00Z');
const details = { requestId: 'a-valid-request-id-123', title: 'Cricket test', description: 'Test fixture', privacy: 'unlisted', scheduledStartTime: '2026-10-29T20:00:00Z', madeForKids: false };
async function connected(extra = {}) {
  const mock = youtubeProvider(), service = new YouTubeService({ env: testGoogleEnv, now: () => now, fetchFn: mock.fetchFn, ...extra });
  const flow = service.start(owner, origin); await service.complete(owner, origin, { state: flow.state, code: 'one-use-code' }); return { service, ...mock };
}
test('OAuth config accepts a static HTTPS callback, rejects unsafe or incomplete credentials', () => {
  assert.equal(youtubeConfig(testGoogleEnv).configured, true); assert.equal(youtubeConfig({}).configured, false);
  for (const redirect of ['http://example.com/youtube-callback.html', 'https://u:p@example.com/youtube-callback.html', 'https://example.com/youtube-callback.html?return=evil', 'javascript:alert(1)']) assert.equal(youtubeConfig({ ...testGoogleEnv, YOUTUBE_REDIRECT_URI: redirect }).configured, false);
});
test('OAuth uses a one-use, expiring, session/origin-bound state and S256 PKCE', async () => {
  let clock = now; const m = youtubeProvider(), s = new YouTubeService({ env: testGoogleEnv, now: () => clock, fetchFn: m.fetchFn });
  assert.throws(() => s.start(owner, 'https://evil.test'), /origin/);
  const f = s.start(owner, origin), u = new URL(f.authorizationUrl); assert.equal(u.origin, 'https://accounts.google.com'); assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  const privateFlow = s.flows.get(f.state); assert.equal(u.searchParams.get('code_challenge'), createHash('sha256').update(privateFlow.verifier).digest('base64url')); assert.equal(JSON.stringify(f).includes(privateFlow.verifier), false);
  await assert.rejects(s.complete('other', origin, { state: f.state, code: 'code' }), /session/);
  await s.complete(owner, origin, { state: f.state, code: 'code' }); await assert.rejects(s.complete(owner, origin, { state: f.state, code: 'code' }), /state/);
  const expired = s.start(owner, origin); clock += 300001; await assert.rejects(s.complete(owner, origin, { state: expired.state, code: 'code' }), /expired/);
});
test('denied permissions consume state without calling token endpoint', async () => {
  const m = youtubeProvider(), s = new YouTubeService({ env: testGoogleEnv, fetchFn: m.fetchFn }), f = s.start(owner, origin);
  await assert.rejects(s.complete(owner, origin, { state: f.state, error: 'access_denied' }), /cancelled/); assert.equal(m.log.length, 0); assert.equal(s.flows.size, 0);
});
test('the required permission must be granted and no access token is exposed', async () => {
  const s = new YouTubeService({ env: testGoogleEnv, fetchFn: async () => new Response(JSON.stringify({ access_token: 'secret', scope: 'openid' })) }); const f = s.start(owner, origin);
  await assert.rejects(s.complete(owner, origin, { state: f.state, code: 'code' }), /permission/); assert.equal(s.status(owner).connected, false);
});
test('create-stream, create-broadcast and bind are idempotent and keep all secrets server side', async () => {
  const { service: s, log } = await connected(); const result = await s.prepare(owner, details), count = log.length;
  assert.equal(result.broadcast.keyReady, true); assert.equal(result.channel.title, 'Test cricket channel');
  assert.equal(result.busy, false); assert.equal(result.authorizing, false);
  for (const secret of ['private-api-stream-key', 'private-access-token', 'private-refresh-token', testGoogleEnv.GOOGLE_CLIENT_SECRET]) assert.equal(JSON.stringify(result).includes(secret), false);
  assert.match(s.destination(owner).url, /private-api-stream-key$/); assert.equal(s.destination('other'), null); assert.equal(s.status('other').broadcast, null);
  await s.prepare(owner, details); assert.equal(log.length, count);
  const request = log.find(x => x.url.includes('/liveBroadcasts?') && x.method === 'POST'), b = JSON.parse(request.body);
  assert.equal(b.status.selfDeclaredMadeForKids, false); assert.equal(b.contentDetails.enableAutoStart, false); assert.equal(b.contentDetails.enableAutoStop, false);
  const stream = JSON.parse(log.find(x => x.url.includes('/liveStreams?') && x.method === 'POST').body); assert.equal(stream.cdn.resolution, 'variable'); assert.equal(stream.cdn.frameRate, 'variable');
});
test('pending account authorization blocks a previous ingestion destination until cancellation', async () => {
  const { service: s } = await connected(); await s.prepare(owner, details); const previous = s.destination(owner).url;
  const f = s.start(owner, origin); assert.equal(s.status(owner).authorizing, true); assert.equal(s.destination(owner).configured, false);
  s.cancelAuth(owner); assert.equal(s.status(owner).authorizing, false); assert.equal(s.destination(owner).url, previous);
  await assert.rejects(s.complete(owner, origin, { state: f.state, code: 'late' }), /state/);
});
test('setup validates title, privacy, audience and schedule before making remote writes', () => {
  for (const v of [{ title: '' }, { title: '<bad>' }, { privacy: 'unknown' }, { madeForKids: undefined }, { scheduledStartTime: '2020-01-01' }, { description: 'a'.repeat(2001) }]) assert.throws(() => broadcastDetails({ ...details, ...v }, now));
});
test('definite partial setup failures retain progress and retry without duplicate stream creation', async () => {
  const { service: s, control, log } = await connected(); control.failResource = 'liveBroadcasts'; await assert.rejects(s.prepare(owner, details), /Enable live streaming/);
  assert.equal(s.status(owner).setup.stage, 'broadcast'); assert.equal(s.status(owner).setup.uncertain, false);
  control.failResource = ''; await s.prepare(owner, details);
  assert.equal(log.filter(x => x.url.includes('/liveStreams?') && x.method === 'POST').length, 1);
});
test('an ambiguous write is not retried automatically and provider error text cannot leak secrets', async () => {
  const { service: s, control, log } = await connected(); control.timeoutResource = 'liveBroadcasts'; await assert.rejects(s.prepare(owner, details), /could not be confirmed/);
  const count = log.length; await assert.rejects(s.prepare(owner, details), /previous Google write/); assert.equal(log.length, count); assert.equal(s.status(owner).setup.uncertain, true);
  assert.equal(JSON.stringify(s.status(owner)).includes('SECRET MUST NOT'), false);
});
test('preview/live require an active ingestion stream, and completion disables further upload', async () => {
  const { service: s, control } = await connected(); await s.prepare(owner, details); control.streamStatus = 'inactive'; await assert.rejects(s.transition(owner, 'live'), /active video stream/);
  control.streamStatus = 'active'; assert.equal((await s.transition(owner, 'testing')).broadcast.state, 'testing');
  assert.equal((await s.transition(owner, 'live')).broadcast.state, 'live'); assert.throws(() => s.resetSetup(owner), /End/);
  assert.equal((await s.transition(owner, 'complete')).broadcast.state, 'complete'); assert.equal(s.destination(owner).configured, false); assert.equal(s.status(owner).broadcast.keyReady, false);
});
test('refresh-token exchange is deduplicated and uses only the trusted token endpoint', async () => {
  const { service: s, control } = await connected(); const c = s.connections.get(owner); c.expires = 0; await Promise.all([s.access(c), s.access(c), s.access(c)]); assert.equal(control.refreshes, 1);
});
test('external binding changes invalidate the ingestion destination', async () => {
  const { service: s, control } = await connected(); await s.prepare(owner, details); control.binding = 'different_stream'; await assert.rejects(s.refresh(owner, true), /binding changed/); assert.equal(s.destination(owner).configured, false);
});
test('disconnect during an OAuth exchange cannot resurrect an account connection', async () => {
  const mock = youtubeProvider(); let release; const wait = new Promise(resolve => { release = resolve; });
  const s = new YouTubeService({ env: testGoogleEnv, fetchFn: async (...args) => { await wait; return mock.fetchFn(...args); } });
  const f = s.start(owner, origin), pending = s.complete(owner, origin, { state: f.state, code: 'code' }); s.forget(owner); release();
  await assert.rejects(pending, /cancelled/); assert.equal(s.status(owner).connected, false);
});
test('logout/session expiry forgets private grants, and explicit disconnect revokes Google permission', async () => {
  let valid = true; const { service: s, log } = await connected({ validSession: () => valid });
  assert.equal((await s.disconnect(owner)).revoked, true); assert.equal(s.status(owner).connected, false); assert.ok(log.some(x => x.url.endsWith('/revoke')));
  const m = await connected({ validSession: () => valid }); valid = false; m.service.prune(); assert.equal(m.service.status(owner).connected, false);
});
