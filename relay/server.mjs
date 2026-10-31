import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { WebSocketServer, WebSocket } from 'ws';
import { ScoreService, scoreLines, validateIds, startScorePolling } from './lib/score.mjs';
import { ScoreStream } from './lib/score-stream.mjs';
import { CricClubsScraper } from './lib/cricclubs.mjs';
import { DESTINATIONS, destinationConfig, findFont, probeEncoder, outputArgs } from './lib/encoder.mjs';
import { constantTimeEquals, SessionStore } from './lib/security.mjs';
import { automationOptions } from './lib/events.mjs';
import { LiveProgram } from './lib/program.mjs';
import { YouTubeService } from './lib/youtube.mjs';
import { cloudConfig } from './lib/cloud.mjs';
import { SessionDestinations } from './lib/destinations.mjs';
import { configuredVault, storageError } from './lib/vault.mjs';
import { TrustedDevices, STUDIO_OWNER } from './lib/trusted-devices.mjs';
import { validatePreferences } from './lib/preferences.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../web');
const port = Number(process.env.PORT || 8787), host = process.env.HOST || '127.0.0.1';
const token = process.env.RELAY_TOKEN || '';
if (token.length < 32 || token.includes('REPLACE_WITH')) {
  console.error('Run npm run setup first, or set a random RELAY_TOKEN of at least 32 characters in relay/.env.');
  process.exit(1);
}
const { origins, publicOrigin } = cloudConfig(process.env);
const auth = value => constantTimeEquals(value, token);
const sessions = new SessionStore();
let saved = { vault: null, configured: false, backend: null, message: 'Saved studio storage is not configured. See docs/SAVED_STUDIO.md.' };
try { saved = await configuredVault(process.env); } catch (e) { saved.message = e.message; }
const devices = saved.vault ? new TrustedDevices({ vault: saved.vault, secure: Boolean(publicOrigin) }) : null;
const ownerOf = identity => identity.owner || identity.id;
const isSavedOwner = owner => Boolean(devices && owner === STUDIO_OWNER);
const validOwner = (owner, origin) => isSavedOwner(owner) ? Boolean(saved.vault.state && origins.has(origin)) : Boolean(sessions.get(owner, origin));
// Same-origin browser GETs can omit Origin. The explicit client-origin header
// keeps their bearer session bound to the same allowed origin as the POST that
// created it. A browser-supplied Origin always takes precedence and must agree.
const originOf = req => req.headers.origin || req.headers['x-mk97-origin'] || 'non-browser';
const allowedOrigin = req => (!req.headers.origin || origins.has(req.headers.origin)) &&
  (!req.headers['x-mk97-origin'] || origins.has(req.headers['x-mk97-origin'])) &&
  (!req.headers.origin || !req.headers['x-mk97-origin'] || req.headers.origin === req.headers['x-mk97-origin']);
const destinations = destinationConfig(process.env);
const youtube = new YouTubeService({ env: process.env, validSession: validOwner,
  validFlow: (id, origin) => { const session = sessions.get(id, origin); return Boolean(session && (!session.deviceId || devices?.valid(session.deviceId))); },
  saveConnection: async (owner, value, guard) => { if (isSavedOwner(owner)) await saved.vault.mutate(state => {
    if (guard && !guard()) throw Object.assign(new Error('Device sign-in ended before the connection could be saved.'), {status:401});
    state.profile.youtube = value;
  }); } });
const manualDestinations = new SessionDestinations({ validSession: validOwner });
const destinationFor = owner => {
  const configured = { ...destinations, ...manualDestinations.get(owner) };
  return { ...configured, youtube: youtube.destination(owner) || configured.youtube };
};
const font = findFont(process.env.FONT_FILE), binary = process.env.FFMPEG_PATH || 'ffmpeg';
const encoder = probeEncoder(binary, font);
const scores = new ScoreService({ template: process.env.SCORE_URL_TEMPLATE, headerName: process.env.SCORE_HEADER_NAME,
  headerValue: process.env.SCORE_HEADER_VALUE, pollSeconds: process.env.SCORE_POLL_SECONDS,
  scorecardScraper: process.env.CRICCLUBS_SCORECARD_ENABLED === 'false' ? null : new CricClubsScraper(),
  scorecardClubId: process.env.CRICCLUBS_CLUB_ID || '300', scorecardLeague: process.env.CRICCLUBS_LEAGUE || 'FWCWL' });
let active = null;
const scoreStream = new ScoreStream({ snapshot: () => scores.snapshot(), validSession: (id, origin) => {
  const session = sessions.get(id, origin); return Boolean(session && (!session.deviceId || devices?.valid(session.deviceId)));
} });
scores.subscribe(snapshot => { scoreStream.publish(snapshot); updateOverlay(); });
let sharedLoaded = false, sharedLoading = null, savedWarning = null;
async function hydrateSavedStudio(origin) {
  if (sharedLoaded) return;
  if (!sharedLoading) sharedLoading = (async () => {
    await saved.vault.ready(); const profile = saved.vault.snapshot().profile;
    try { manualDestinations.restorePrivate(STUDIO_OWNER, origin, profile.destinations); }
    catch { savedWarning = 'A saved destination needs to be entered again. Its stored configuration was not accepted.'; }
    try {
      if (youtube.restorePrivate(STUDIO_OWNER, profile.youtube)) { try { await youtube.refresh(STUDIO_OWNER, true); } catch {} }
      else if (profile.youtube) savedWarning = 'The saved YouTube connection needs reconnecting because its Google client or website origin changed.';
    } catch { savedWarning = 'The saved YouTube setup needs to be reconnected. Review its existing event in YouTube Studio.'; }
    if (!scores.ids && profile.preferences?.match) { const match = profile.preferences.match; try { scores.select(match.clubId, match.matchId, match.league); } catch {} }
    sharedLoaded = true;
  })().finally(() => { sharedLoading = null; });
  await sharedLoading;
}
function savedOriginAllowed(req) {
  const origin = originOf(req);
  return publicOrigin ? origin === publicOrigin : ['127.0.0.1', 'localhost'].includes(host) &&
    [`http://localhost:${server.address()?.port}`, `http://127.0.0.1:${server.address()?.port}`].includes(origin);
}
async function requireSaved(req) {
  if (!devices) throw storageError(saved.message);
  if (!savedOriginAllowed(req)) throw Object.assign(new Error('Open the hosted MK97 app directly to use remembered devices. Its cookies stay on that website.'), { status: 403 });
  await saved.vault.ready();
}
async function savePreferences(owner, values) {
  if (!isSavedOwner(owner)) return;
  const next = validatePreferences(values);
  await saved.vault.mutate(state => { state.profile.preferences = { ...state.profile.preferences, ...next }; });
}
function revokeDeviceSessions(id) {
  for (const sessionId of sessions.revokeDevice(id)) {
    scoreStream.closeSession(sessionId); youtube.forgetBinding(sessionId);
    if (active?.sessionId === sessionId) finish(active, false);
  }
}
const attempts = new Map();
const failures = new Map();
function failedAuth(req) {
  const key = req.socket.remoteAddress || 'local', now = Date.now(), old = failures.get(key);
  if (failures.size > 1000) failures.clear();
  const bucket = old && now - old.start < 60000 ? old : { start: now, count: 0 };
  bucket.count++; failures.set(key, bucket); return bucket.count > 8;
}
function rateLimited(req) {
  const key = req.socket.remoteAddress || 'local', now = Date.now();
  if (attempts.size > 1000) attempts.clear();
  const old = attempts.get(key);
  const bucket = old && now - old.start < 60000 ? old : { start: now, count: 0 };
  bucket.count++; attempts.set(key, bucket);
  return bucket.count > 180;
}
const contentTypes = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.md': 'text/plain' };
async function body(req, limit = 4096) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > limit) throw new Error('Request too large.'); chunks.push(c); }
  return JSON.parse(Buffer.concat(chunks).toString() || '{}');
}
function json(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload));
}
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self' https: wss: http://localhost:8787 http://127.0.0.1:8787 ws://localhost:8787 ws://127.0.0.1:8787; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  if (!allowedOrigin(req)) return json(res, 403, { error: 'Origin not allowed. Add this website’s exact origin to ALLOWED_ORIGINS or configure PUBLIC_URL.' });
  if (req.headers.origin) { res.setHeader('Access-Control-Allow-Origin', req.headers.origin); res.setHeader('Vary', 'Origin'); }
  if (req.headers.origin && req.headers['access-control-request-private-network'] === 'true') res.setHeader('Access-Control-Allow-Private-Network', 'true');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-MK97-Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch { return json(res, 400, { error: 'Invalid URL.' }); }
  // Google redirects here without a relay bearer token. The one-use state, PKCE
  // verifier and live owner session are checked by YouTubeService. The popup
  // receives only a fixed result; the original tab reads its private status.
  if (req.method === 'GET' && url.pathname === '/youtube-callback.html' && youtube.config.callbackMode === 'server' &&
    (url.searchParams.has('state') || url.searchParams.has('code') || url.searchParams.has('error'))) {
    let result = 'failed';
    try {
      if (rateLimited(req)) throw new Error('Callback rate limited.');
      const state = url.searchParams.get('state'), code = url.searchParams.get('code'), denied = url.searchParams.get('error');
      if (url.searchParams.getAll('state').length !== 1 || !/^[A-Za-z0-9_-]{43}$/.test(state || '') ||
        url.searchParams.getAll('code').length > 1 || url.searchParams.getAll('error').length > 1 ||
        Boolean(code) === Boolean(denied) || code && code.length > 4096) throw new Error('Invalid callback.');
      await youtube.callback({ state, ...(denied ? { error: 'denied' } : { code }) }); result = 'connected';
    } catch { /* No provider errors, credentials or codes are rendered or redirected. */ }
    res.writeHead(303, { Location: '/youtube-callback.html?result=' + result, 'Cache-Control': 'no-store' });
    return res.end();
  }
  if (url.pathname === '/health') return json(res, 200, { ok: true, name: 'MK97 relay' });
  if (req.method === 'GET' && url.pathname === '/api/public-config') return json(res, 200, {
    product: 'mk97', version: '1.7.1', sameOrigin: Boolean(publicOrigin), studioUrl: publicOrigin, mode: publicOrigin ? 'cloud' : 'self-hosted',
    savedStudio: { configured: saved.configured, backend: saved.backend, message: saved.message, rememberDays: 30 }
  });
  if (url.pathname.startsWith('/api/')) {
    if (rateLimited(req)) return json(res, 429, { error: 'Too many requests. Try again in a minute.' });
    const bearer = req.headers.authorization?.replace(/^Bearer /, '');
    if (req.method === 'POST' && ['/api/device/restore', '/api/device/link'].includes(url.pathname)) {
      try {
        await requireSaved(req);
        const key = req.socket.remoteAddress || 'local', bucket = failures.get(key);
        if (bucket && Date.now() - bucket.start < 60000 && bucket.count > 8) return json(res, 429, { error: 'Device sign-in temporarily limited. Wait one minute.' });
        const value = await body(req);
        const device = url.pathname.endsWith('/link') ? await devices.link(value.code, value.deviceName) : await devices.authenticate(req.headers.cookie);
        if (!device) { res.setHeader('Set-Cookie', devices.clearCookie()); return json(res, 200, { remembered: false }); }
        const session = sessions.create(originOf(req), device); await hydrateSavedStudio(originOf(req));
        if (device.cookie) res.setHeader('Set-Cookie', device.cookie);
        return json(res, 200, { sessionToken: session.id, expiresAt: session.expires, remembered: true, deviceExpiresAt: device.expires });
      } catch (e) { if (e.status === 401) failedAuth(req); return json(res, e.status || 400, { error: e.message }); }
    }
    if (req.method === 'POST' && url.pathname === '/api/session') {
      const key = req.socket.remoteAddress || 'local', bucket = failures.get(key);
      if (bucket && Date.now() - bucket.start < 60000 && bucket.count > 8) return json(res, 429, { error: 'Authentication temporarily limited. Wait one minute.' });
      if (!auth(bearer)) return json(res, failedAuth(req) ? 429 : 401, { error: 'Relay token is incorrect.' });
      try {
        const value = await body(req);
        let device = null;
        if (value.remember === true) { await requireSaved(req); device = await devices.remember(value.deviceName, req.headers.cookie); }
        const session = sessions.create(originOf(req), device || {});
        if (device) { await hydrateSavedStudio(originOf(req)); if (device.cookie) res.setHeader('Set-Cookie', device.cookie); }
        return json(res, 201, { sessionToken: session.id, expiresAt: session.expires, remembered: Boolean(device), ...(device ? { deviceExpiresAt: device.expires } : {}) });
      } catch (e) { return json(res, e.status || 400, { error: e.message }); }
    }
    const authenticated = sessions.get(bearer, originOf(req));
    if (!authenticated || authenticated.deviceId && !devices?.valid(authenticated.deviceId)) return json(res, 401, { code: 'SESSION_REQUIRED', error: 'Session expired or device was signed out. Reconnect the studio.' });
    try {
      const owner = ownerOf(authenticated);
      if (req.method === 'GET' && url.pathname === '/api/devices') {
        if (!isSavedOwner(owner)) return json(res, 200, { remembered: false, devices: [] });
        return json(res, 200, devices.status(authenticated.deviceId));
      }
      if (req.method === 'POST' && url.pathname === '/api/devices/pair') {
        await requireSaved(req); if (!isSavedOwner(owner)) throw Object.assign(new Error('Connect with Remember this device enabled first.'), { status: 409 });
        return json(res, 201, await devices.pairing(authenticated.deviceId));
      }
      if (req.method === 'POST' && url.pathname === '/api/devices/revoke') {
        await requireSaved(req); if (!isSavedOwner(owner)) throw Object.assign(new Error('A remembered device is required.'), { status: 403 });
        const value = await body(req); await devices.remove(value.deviceId); revokeDeviceSessions(value.deviceId);
        if (value.deviceId === authenticated.deviceId) res.setHeader('Set-Cookie', devices.clearCookie());
        return json(res, 200, { ok: true });
      }
      if (req.method === 'POST' && url.pathname === '/api/preferences') {
        if (!isSavedOwner(owner)) throw Object.assign(new Error('Connect a saved studio to sync preferences.'), { status: 409 });
        await savePreferences(owner, await body(req)); return json(res, 200, { ok: true });
      }
      if (req.method === 'GET' && url.pathname === '/api/info') return json(res, 200, {
        name: 'MK97 relay', version: '1.7.1', encoder, busy: Boolean(active), ownUpload: active?.sessionId === authenticated.id, mode: publicOrigin ? 'cloud' : 'self-hosted', youtube: youtube.status(owner),
        savedStudio: { configured: saved.configured, remembered: isSavedOwner(owner), message: saved.message, warning: savedWarning,
          ...(isSavedOwner(owner) ? { device: devices.status(authenticated.deviceId), preferences: saved.vault.snapshot().profile.preferences } : {}) },
        destinations: DESTINATIONS.map(id => ({ id, configured: destinationFor(owner)[id].configured, error: destinationFor(owner)[id].error,
          mode: id === 'youtube' && youtube.connections.has(owner) ? 'account' : manualDestinations.get(owner)[id] ? isSavedOwner(owner) ? 'saved' : 'session' : 'manual',
          resolution: id === 'instagram' ? (Number(process.env.INSTAGRAM_HEIGHT) === 1920 ? '1080 × 1920' : '720 × 1280') : '1920 × 1080' })),
        pollSeconds: scores.pollMs / 1000, scoreSource: process.env.SCORE_URL_TEMPLATE ? 'configured-feed' : 'cricclubs'
      });
      if (req.method === 'POST' && ['/api/destination', '/api/destination/clear'].includes(url.pathname)) {
        if (active?.owner === owner) return json(res, 409, { error: 'Stop this studio’s camera upload before changing destinations.' });
        const value = await body(req, 8192);
        if (value?.id === 'youtube' && youtube.destination(owner)) return json(res, 409, { error: 'Disconnect the YouTube account or cancel sign-in before changing a manual YouTube key.' });
        let result;
        if (isSavedOwner(owner)) {
          const candidate = new SessionDestinations({validSession:()=>true});
          result = url.pathname.endsWith('/clear') ? candidate.clear(owner, value?.id) : candidate.set(owner, originOf(req), value);
          const record = candidate.exportPrivate(owner)[value.id];
          await saved.vault.mutate(state => { if(record) state.profile.destinations[value.id] = record; else delete state.profile.destinations[value.id]; });
          manualDestinations.forget(owner); manualDestinations.restorePrivate(owner, originOf(req), saved.vault.snapshot().profile.destinations);
        } else result = url.pathname.endsWith('/clear') ? manualDestinations.clear(owner, value?.id) : manualDestinations.set(owner, originOf(req), value);
        return json(res, 200, result);
      }
      if (url.pathname.startsWith('/api/youtube/')) {
        const stopEditing = () => { if (active?.owner === owner) throw Object.assign(new Error('Stop camera upload before changing the connected YouTube account or setup.'), { status: 409 }); };
        if (req.method === 'GET' && url.pathname === '/api/youtube/status') return json(res, 200, await youtube.refresh(owner, url.searchParams.get('refresh') === '1'));
        if (req.method === 'POST' && url.pathname === '/api/youtube/auth/start') { stopEditing(); return json(res, 201, youtube.start(owner, originOf(req), authenticated.id)); }
        if (req.method === 'POST' && url.pathname === '/api/youtube/auth/cancel') { stopEditing(); return json(res, 200, youtube.cancelAuth(owner)); }
        if (req.method === 'POST' && url.pathname === '/api/youtube/auth/complete') { stopEditing(); return json(res, 200, await youtube.complete(owner, originOf(req), await body(req, 8192))); }
        if (req.method === 'POST' && url.pathname === '/api/youtube/setup') { stopEditing(); return json(res, 201, await youtube.prepare(owner, await body(req, 16384))); }
        if (req.method === 'POST' && url.pathname === '/api/youtube/reset') { stopEditing(); await youtube.refresh(owner, true); const result = youtube.resetSetup(owner); await youtube.persist(owner); return json(res, 200, result); }
        if (req.method === 'POST' && url.pathname === '/api/youtube/disconnect') { stopEditing(); return json(res, 200, await youtube.disconnect(owner)); }
        if (req.method === 'POST' && url.pathname === '/api/youtube/transition') {
          const value = await body(req), result = await youtube.transition(owner, value.state);
          if (value.state === 'complete' && active?.owner === owner) {
            const out = active.outputs.get('youtube');
            if (out) { out.failed = true; out.process.stdin.end(); const closeOutput = setTimeout(() => { if (out.process.exitCode === null) out.process.kill(); }, 2000); closeOutput.unref(); send(active.ws, { type: 'destination', id: 'youtube', state: 'ended', message: 'YouTube broadcast ended.' }); }
            if ([...active.outputs.values()].every(o => o.failed)) finish(active, true);
          }
          return json(res, 200, result);
        }
        return json(res, 404, { error: 'Unknown YouTube endpoint.' });
      }
      if (req.method === 'GET' && url.pathname === '/api/score') return json(res, 200, scores.snapshot());
      if (req.method === 'GET' && url.pathname === '/api/score/stream') {
        if (url.searchParams.getAll('clubId').length !== 1 || url.searchParams.getAll('matchId').length !== 1) throw new Error('Provide one Club ID and Match ID.');
        scoreStream.open(req, res, authenticated.id, originOf(req), { clubId: url.searchParams.get('clubId'), matchId: url.searchParams.get('matchId') });
        return;
      }
      if (req.method === 'GET' && url.pathname === '/api/graphics') return json(res, 200, active?.sessionId === authenticated.id && active.program ? active.program.snapshot() : { cards: null, current: null });
      if (req.method === 'POST' && url.pathname === '/api/ticket') return json(res, 201, { ticket: sessions.ticket(authenticated.id, originOf(req)) });
      if (req.method === 'POST' && url.pathname === '/api/logout') {
        if (authenticated.deviceId) { await devices.remove(authenticated.deviceId); res.setHeader('Set-Cookie', devices.clearCookie()); revokeDeviceSessions(authenticated.deviceId); }
        else { youtube.forget(owner); manualDestinations.forget(owner); }
        youtube.forgetBinding(authenticated.id);
        sessions.revoke(authenticated.id);
        scoreStream.closeSession(authenticated.id);
        if (active?.sessionId === authenticated.id) finish(active, false);
        return json(res, 200, { ok: true });
      }
      if (req.method === 'POST' && url.pathname === '/api/match') {
        if (active && active.owner !== owner) return json(res, 409, { error: 'Another studio owns the active stream.' });
        const data = await body(req);
        if (active && (String(data.clubId) !== scores.ids?.clubId || String(data.matchId) !== scores.ids?.matchId || data.league != null && data.league !== scores.league)) return json(res, 409, { error: 'Stop the active camera upload before changing matches or leagues.' });
        scores.select(data.clubId, data.matchId, data.league);
        await savePreferences(owner, { match: { ...scores.ids, ...(scores.league ? {league:scores.league} : {}) } });
        const result = await scores.refresh(); updateOverlay();
        return json(res, result.score ? 200 : 502, result);
      }
      return json(res, 404, { error: 'Unknown endpoint.' });
    } catch (e) { return json(res, Number.isInteger(e.status) && e.status >= 400 && e.status <= 599 ? e.status : 400, { error: e.message.slice(0, 240) }); }
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Method not allowed.' });
  try {
    const pathname = decodeURIComponent(url.pathname);
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep) || !fs.statSync(file).isFile()) return json(res, 404, { error: 'Not found.' });
    res.writeHead(200, { 'Content-Type': `${contentTypes[path.extname(file)] || 'application/octet-stream'}; charset=utf-8`,
      'Cache-Control': url.pathname === '/youtube-callback.html' ? 'no-store' : 'no-cache' });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  } catch { json(res, 404, { error: 'Not found.' }); }
});
const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 * 1024, perMessageDeflate: false });
server.headersTimeout = 10000; server.requestTimeout = 15000; server.maxHeadersCount = 32; server.maxConnections = 32;
server.on('upgrade', (req, socket, head) => {
  if (req.url !== '/ingest' || !allowedOrigin(req) || rateLimited(req) || wss.clients.size >= 8) { socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return; }
  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
});
function send(ws, message) { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message)); }
function writeText(dir, name, text) {
  // Same-directory rename keeps FFmpeg reloads atomic, including on Windows.
  const next = path.join(dir, name + '.next'); fs.writeFileSync(next, text, 'utf8'); fs.renameSync(next, path.join(dir, name));
}
function updateOverlay() {
  if (!active || active.ending || !fs.existsSync(active.dir)) return false;
  const selected = active.match, current = scores.snapshot();
  const score = selected && selected.clubId === current.ids?.clubId && selected.matchId === current.ids?.matchId ? current.score : null;
  if (active.program) { active.program.setScore(score); return true; }
  const [main, detail] = scoreLines(score);
  try {
    writeText(active.dir, 'score-main.txt', main); writeText(active.dir, 'score-detail.txt', detail);
    if (active.overlayWarning) send(active.ws, { type: 'warning', message: 'Score overlay updates recovered.' });
    active.overlayWarning = false; return true;
  } catch {
    if (!active.overlayWarning) send(active.ws, { type: 'warning', message: 'Score overlay text could not be updated on the server. Last video overlay may be delayed; check server storage.' });
    active.overlayWarning = true; return false;
  }
}
function friendlyFailure(stderr) {
  if (/401|403|Unauthorized|Server error|Authentication/i.test(stderr)) return 'Platform rejected the connection. Check the current server URL, key and live eligibility.';
  if (/Connection refused|Connection timed out|Network|resolve|timed out/i.test(stderr)) return 'Could not reach the platform. Check server connectivity and the platform address.';
  return 'Output stopped. Check the platform preview, current stream key and relay setup.';
}
function run(ws, message, identity) {
  if (active) throw new Error('Relay is already streaming. Stop the other session first.');
  if (!encoder.ready) throw new Error(encoder.error);
  if (!Array.isArray(message.destinations) || !message.destinations.length || message.destinations.length > 3) throw new Error('Select at least one destination.');
  const chosen = [...new Set(message.destinations)];
  const owner = ownerOf(identity), resolved = destinationFor(owner);
  if (chosen.some(id => !DESTINATIONS.includes(id) || !resolved[id].configured)) throw new Error('A selected destination has no valid live setup or stream key on the relay.');
  if (!/^video\/(webm|mp4)(;|$)/i.test(message.mimeType || '')) throw new Error('Unsupported browser recording container.');
  const width = Number(message.width), height = Number(message.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 854 || height < 480 || width < height || width > 4096 || height > 2160) throw new Error('Use a landscape camera providing the selected resolution (1920 × 1080 for 1080p). Rotate the phone and reopen the camera.');
  const required = { '1080': [1920, 1080], '720': [1280, 720], '480': [854, 480], auto: [854, 480] }[message.resolution || '1080'];
  if (!required || width < required[0] || height < required[1]) throw new Error(`The selected capture profile requires a landscape camera providing at least ${required?.join(' × ') || 'a supported resolution'}.`);
  const selected = message.match ? validateIds(message.match.clubId, message.match.matchId) : null;
  if (selected) {
    if (selected.clubId !== scores.ids?.clubId || selected.matchId !== scores.ids?.matchId) throw new Error('The selected Match ID changed on the relay. Reload your match before streaming.');
  }
  if (message.overlay !== false && !selected) throw new Error('Reload your selected Match ID before starting the score overlay.');
  if (message.overlay !== false && !scores.snapshot().score) throw new Error('Connect a valid score feed, or turn off the score overlay before streaming.');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'boundary-live-'));
  const session = { ws, dir, match: selected, sessionId: identity.id, owner, deviceId: identity.deviceId, main: null, outputs: new Map(), ending: false, bytes: 0, windowBytes: 0, windowAt: Date.now(), lastInput: Date.now(), started: Date.now(), frames: 0, timer: null };
  active = session;
  if (!updateOverlay()) {
    active = null; fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }, () => {});
    throw new Error('Could not prepare score overlay files. Check server temporary-folder access.');
  }
  const bitrate = chosen.includes('facebook') ? 6000 : Math.max(4000, Math.min(14000, Number(process.env.LANDSCAPE_VIDEO_KBPS) || 10000));
  const preset = process.env.ENCODER_PRESET;
  let mainError = '';
  const options = automationOptions(message.automation, process.env), outputHeight = height >= 1080 && width >= 1920 ? 1080 : height >= 720 && width >= 1280 ? 720 : 480;
  let main;
  session.program = new LiveProgram({ binary, font, dir, mimeType: message.mimeType, options,
    bitrateKbps: outputHeight === 1080 ? bitrate : outputHeight === 720 ? 4500 : 2000,
    width: outputHeight === 1080 ? 1920 : outputHeight === 720 ? 1280 : 854, height: outputHeight,
    score: selected ? scores.snapshot().score : null, overlay: message.overlay !== false, preset });
  main = session.program.encoder; session.main = main;
  session.program.on('failure', message => { send(ws, { type: 'error', message }); finish(session, false); });
  session.program.on('graphic', graphic => send(ws, { type: 'graphic', graphic }));
  main.stdin.on('error', () => {});
  const failOutput = (id, message) => {
    const out = session.outputs.get(id); if (!out || out.failed || session.ending) return;
    out.failed = true; out.process.kill();
    send(ws, { type: 'destination', id, state: 'failed', message });
    if ([...session.outputs.values()].every(o => o.failed)) {
      send(ws, { type: 'error', message: 'All destinations stopped. Check the platform settings and start a new session.' });
      finish(session, false);
    }
  };
  for (const id of chosen) {
    const proc = spawn(binary, outputArgs(resolved[id], process.env), { cwd: dir, windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
    const out = { process: proc, failed: false, sending: false, error: '' };
    session.outputs.set(id, out);
    proc.stdin.on('error', () => {});
    proc.stderr.on('data', c => {
      out.error = (out.error + c.toString()).slice(-3000);
      // Stream-copy writers can omit frame=. Positive output media time also
      // confirms progress, without falsely reporting a healthy copy as idle.
      if (!out.sending && /(?:frame=\s*[1-9]|out_time_(?:us|ms)=[1-9]\d*)/.test(out.error)) { out.sending = true; send(ws, { type: 'destination', id, state: 'sending', message: 'Packets sent; confirm publication in the platform preview.' }); }
    });
    proc.on('error', () => failOutput(id, 'Unable to start the platform relay process.'));
    proc.on('close', () => { if (!session.ending) failOutput(id, friendlyFailure(out.error)); });
    send(ws, { type: 'destination', id, state: 'connecting', message: 'Connecting to platform…' });
  }
  // Encode the live landscape camera once. Independent writers isolate output failures.
  main.stdout.on('data', data => {
    for (const [id, out] of session.outputs) {
      if (out.failed || out.process.stdin.destroyed) continue;
      if (out.process.stdin.writableLength > 8 * 1024 * 1024) { failOutput(id, 'Platform is too slow; its output was stopped to protect the other streams.'); continue; }
      out.process.stdin.write(data);
    }
  });
  main.stdout.on('end', () => { for (const out of session.outputs.values()) if (!out.process.stdin.destroyed) out.process.stdin.end(); });
  main.stderr.on('data', c => {
    mainError = (mainError + c.toString()).slice(-3000);
    const frames = [...c.toString().matchAll(/frame=(\d+)/g)].at(-1);
    if (frames) session.frames = Number(frames[1]);
  });
  main.on('error', () => { send(ws, { type: 'error', message: 'Could not launch FFmpeg.' }); finish(session, false); });
  main.on('close', code => {
    if (!session.ending) {
      send(ws, { type: 'error', message: code ? 'Camera media could not be processed. Try another browser or reopen the camera. See docs/TROUBLESHOOTING.md.' : 'Encoder ended unexpectedly. Start a new session.' });
      finish(session, false);
    }
  });
  session.timer = setInterval(() => {
    if (Date.now() - session.lastInput > 15000) { send(ws, { type: 'error', message: 'No camera data for 15 seconds. Keep the page in the foreground and the phone unlocked.' }); finish(session, false); return; }
    if (!sessions.sessions.has(session.sessionId) || session.deviceId && !devices?.valid(session.deviceId) || Date.now() - session.started > 8 * 3600_000) { send(ws, { type: 'error', message: 'Session expired. Reconnect the relay.' }); finish(session, false); return; }
    send(ws, { type: 'stats', bytes: session.bytes, frames: session.frames, elapsed: Math.floor((Date.now() - session.started) / 1000), graphics: session.program?.snapshot() });
  }, 2000);
  send(ws, { type: 'ready', bitrateKbps: bitrate, program: Boolean(session.program), message: 'Relay is ready for camera data.' });
  return session;
}
function finish(session, graceful) {
  if (!session || session.ending) return;
  session.ending = true; clearInterval(session.timer);
  if (session.program) session.program.stop(graceful);
  else if (graceful) session.main?.stdin.end();
  else session.main?.kill();
  if (!graceful) for (const out of session.outputs.values()) out.process.kill();
  let done = false;
  const clean = () => {
    if (done) return; done = true;
    if (session.program) session.program.stop(false); else session.main?.kill();
    for (const out of session.outputs.values()) out.process.kill();
    if (active === session) active = null;
    fs.rm(session.dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }, () => {});
    send(session.ws, { type: 'stopped' });
    if (session.ws.readyState === WebSocket.OPEN) session.ws.close(1000, 'Session stopped');
  };
  if (graceful) {
    const children = [session.main, ...[...session.outputs.values()].map(o => o.process)];
    let remaining = children.filter(p => p && p.exitCode === null && p.signalCode === null).length;
    for (const p of children) if (p && p.exitCode === null && p.signalCode === null) p.once('close', () => { if (--remaining <= 0) clean(); });
    if (!remaining) clean();
    const timeout = setTimeout(clean, 8000); timeout.unref();
  } else setTimeout(clean, 250).unref();
}
wss.on('connection', (ws, req) => {
  let session = null, authorized = false;
  const timeout = setTimeout(() => ws.close(1008, 'Authentication required'), 5000);
  ws.on('error', () => {});
  ws.on('message', (data, isBinary) => {
    try {
      if (!authorized) {
        if (isBinary || data.length > 4096) throw new Error('Authentication required.');
        const message = JSON.parse(data.toString());
        const identity = sessions.consume(message.ticket, originOf(req));
        if (message.type !== 'start' || !identity || identity.deviceId && !devices?.valid(identity.deviceId)) throw new Error('Streaming ticket expired or invalid. Reconnect and try again.');
        clearTimeout(timeout); authorized = true;
        session = run(ws, message, identity); return;
      }
      if (isBinary) {
        if (!session || session.ending) return;
        if (Date.now() - session.windowAt > 10000) { session.windowAt = Date.now(); session.windowBytes = 0; }
        session.windowBytes += data.length;
        if (session.windowBytes > 48 * 1024 * 1024) throw new Error('Camera upload exceeded the allowed data rate.');
        session.lastInput = Date.now(); session.bytes += data.length;
        session.program?.startFrames();
        if (!session.main.stdin.destroyed && !session.main.stdin.write(data)) {
          ws.pause(); session.main.stdin.once('drain', () => { if (ws.readyState === WebSocket.OPEN) ws.resume(); });
        }
      } else {
        if (data.length > 4096) throw new Error('Control message too large.');
        const message = JSON.parse(data.toString());
        if (message.type === 'stop') finish(session, true);
        else if (message.type === 'ping') send(ws, { type: 'pong', at: message.at });
        else if (session && !session.ending && session.program) {
          try {
            if (message.type === 'card') session.program.cards(message.kind);
            else if (message.type === 'overlay' && typeof message.enabled === 'boolean') session.program.showOverlay = message.enabled;
            else throw new Error('Unknown broadcast control.');
          } catch (e) { send(ws, { type: 'warning', message: e.message.slice(0, 180) }); }
        }
      }
    } catch (e) { send(ws, { type: 'error', message: e.message.slice(0, 200) }); ws.close(1008, 'Request rejected'); }
  });
  ws.on('close', () => { clearTimeout(timeout); if (session && !session.ending) finish(session, false); });
});
const scoreTimer = setInterval(async () => {
  sessions.prune();
  youtube.prune();
  manualDestinations.prune();
  if (!active && !sessions.sessions.size) return;
  if (!scores.ids) return;
  updateOverlay();
}, 2000);
scoreTimer.unref();
const stopScorePolling = startScorePolling(scores, { enabled: () => Boolean(active || sessions.sessions.size) });
const heartbeat = setInterval(() => {
  scoreStream.heartbeat();
  for (const ws of wss.clients) {
    if (ws.alive === false) { ws.terminate(); continue; }
    ws.alive = false; ws.ping();
  }
}, 10000);
heartbeat.unref();
wss.on('connection', ws => { ws.alive = true; ws.on('pong', () => { ws.alive = true; }); });
server.listen(port, host, () => {
  console.log(`MK97 relay: http://${host}:${server.address().port}`);
  console.log(`Encoder: ${encoder.ready ? 'ready' : encoder.error}`);
  console.log(`Configured outputs: ${DESTINATIONS.filter(id => destinations[id].configured).join(', ') || 'none — edit relay/.env'}`);
});
function shutdown() {
  clearInterval(scoreTimer); clearInterval(heartbeat);
  stopScorePolling(); scoreStream.closeAll();
  manualDestinations.owners.clear();
  saved.vault?.close().catch(() => {});
  if (active) finish(active, false);
  for (const ws of wss.clients) ws.close(1001, 'Relay shutting down');
  server.close(); setTimeout(() => process.exit(0), 1000).unref();
}
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
