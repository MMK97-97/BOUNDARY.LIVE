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
test('removed replay endpoints cannot allocate or export camera history', async () => {
  const status=await fetch(base+'/api/graphics',{headers:headers(session)}); assert.equal(status.status,200);
  assert.deepEqual(await status.json(), {cards:null,current:null});
  for (const route of ['/api/clip/select','/api/clips/0000000000000000.mp4','/api/automation']) {
    const r=await fetch(base+route,{method:route.endsWith('select')?'POST':'GET',headers:headers(session),body:route.endsWith('select')?'{}':undefined});
    assert.equal(r.status,404);
  }
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
test('live score subscription requires a session, never puts tokens in URLs, and closes on a match change', async () => {
  const route = '/api/score/stream?clubId=300&matchId=987';
  assert.equal((await fetch(base + route, { headers: { Origin: origin } })).status, 401);
  assert.equal((await fetch(base + route, { headers: headers(secret) })).status, 401);
  const response = await fetch(base + route, { headers: headers(session) });
  assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /text\/event-stream/);
  assert.equal(response.headers.get('x-accel-buffering'), 'no');
  const reader = response.body.getReader(), decoder = new TextDecoder();
  try {
    const first = decoder.decode((await reader.read()).value);
    assert.match(first, /event: score/); assert.match(first, /"matchId":"987"/);
    assert.equal(first.includes(secret), false); assert.equal(first.includes(session), false);
    await fetch(base + '/api/match', { method: 'POST', headers: headers(session), body: JSON.stringify({ clubId: '300', matchId: '988' }) });
    const next = decoder.decode((await reader.read()).value);
    assert.match(next, /MATCH_CHANGED/);
  } finally { await reader.cancel(); }
});
test('session logout revokes further access', async () => {
  const r = await fetch(base + '/api/session', { method: 'POST', headers: headers(secret), body: '{}' }); const s = (await r.json()).sessionToken;
  const logout = await fetch(base + '/api/logout', { method: 'POST', headers: headers(s), body: '{}' }); assert.equal(logout.status, 200);
  assert.equal((await fetch(base + '/api/info', { headers: headers(s) })).status, 401);
});

test('public cloud discovery exposes no secrets and does not grant an authenticated session', async () => {
  const response = await fetch(base + '/api/public-config'); assert.equal(response.status, 200);
  const value = await response.json(); assert.equal(value.product, 'mk97'); assert.equal(value.sameOrigin, false);
  assert.equal(JSON.stringify(value).includes(secret), false); assert.equal(value.sessionToken, undefined);
});
test('in-app destination setup needs a session and returns no stream credentials', async () => {
  const payload = { id: 'facebook', server: 'rtmps://live-api-s.facebook.com:443/rtmp/', key: 'fixture-session-key-do-not-return' };
  assert.equal((await fetch(base+'/api/destination', {method:'POST', headers:headers(secret), body:JSON.stringify(payload)})).status, 401);
  const response = await fetch(base+'/api/destination', {method:'POST', headers:headers(session), body:JSON.stringify(payload)});
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), {ok:true,id:'facebook'});
  const info = await (await fetch(base+'/api/info', {headers:headers(session)})).json();
  assert.equal(info.destinations.find(d=>d.id==='facebook').configured,true);
  assert.equal(info.destinations.find(d=>d.id==='facebook').mode,'session');
  assert.equal(JSON.stringify(info).includes(payload.key),false); assert.equal(JSON.stringify(info).includes(payload.server),false);
});
test('a second authenticated session cannot read or clear another operator’s key', async () => {
  const owner = await (await fetch(base+'/api/session', {method:'POST',headers:headers(secret),body:'{}'})).json();
  const info = await (await fetch(base+'/api/info',{headers:headers(owner.sessionToken)})).json();
  assert.equal(info.destinations.find(d=>d.id==='facebook').configured,false);
  await fetch(base+'/api/destination/clear', {method:'POST',headers:headers(owner.sessionToken),body:JSON.stringify({id:'facebook'})});
  const original = await (await fetch(base+'/api/info',{headers:headers(session)})).json();
  assert.equal(original.destinations.find(d=>d.id==='facebook').configured,true);
  await fetch(base+'/api/logout',{method:'POST',headers:headers(owner.sessionToken),body:'{}'});
});
test('HTTP destination setup rejects arbitrary network destinations and clears only session keys', async () => {
  for (const value of [
    { id:'youtube',server:'rtmps://169.254.169.254/live',key:'fixture' },
    { id:'facebook',server:'rtmps://live.facebook.com:9000/live',key:'fixture' },
    { id:'instagram',server:'https://live.instagram.com/live',key:'fixture' },
    { id:'facebook',server:'rtmps://live.facebook.com/live',key:'a'.repeat(2049) }
  ]) assert.equal((await fetch(base+'/api/destination',{method:'POST',headers:headers(session),body:JSON.stringify(value)})).status,400);
  const removed=await fetch(base+'/api/destination/clear',{method:'POST',headers:headers(session),body:JSON.stringify({id:'facebook'})}); assert.equal(removed.status,200);
  const info=await (await fetch(base+'/api/info',{headers:headers(session)})).json();
  assert.equal(info.destinations.find(d=>d.id==='facebook').configured,false);
  assert.equal(info.destinations.find(d=>d.id==='youtube').configured,true); // Existing environment fallback is preserved.
});
test('forged capture profile cannot label 720p as native 1080p or choose an unknown profile', async()=>{
  for(const resolution of ['1080','unknown']){
    const response=await fetch(base+'/api/ticket',{method:'POST',headers:headers(session),body:'{}'});const{ticket}=await response.json();
    assert.match(await wsError({type:'start',ticket,destinations:['youtube'],mimeType:'video/mp4',width:1280,height:720,resolution,overlay:false}),/capture profile requires/);
  }
  const info=await(await fetch(base+'/api/info',{headers:headers(session)})).json();assert.equal(info.busy,false);
});
test('match selection resolves TampaCricket and TCL independently of the FWCWL environment',async()=>{
  for(const ref of [{clubId:'1507',matchId:'3866',league:'TampaCricket'},{clubId:'157',matchId:'6098',league:'TCL'}]){
    const response=await fetch(base+'/api/match',{method:'POST',headers:headers(session),body:JSON.stringify(ref)});
    // This HTTP fixture deliberately has an unavailable upstream. Routing must
    // still select the new identifiers/path and never retain the previous score.
    assert.equal(response.status,502);const value=await response.json();assert.deepEqual(value.ids,{clubId:ref.clubId,matchId:ref.matchId});assert.equal(value.league,ref.league);assert.equal(value.score,null);
  }
  const bad=await fetch(base+'/api/match',{method:'POST',headers:headers(session),body:JSON.stringify({clubId:'157',matchId:'6099',league:'../TCL'})});assert.equal(bad.status,400);
  const unchanged=await(await fetch(base+'/api/score',{headers:headers(session)})).json();assert.equal(unchanged.ids.matchId,'6098');assert.equal(unchanged.league,'TCL');
});
