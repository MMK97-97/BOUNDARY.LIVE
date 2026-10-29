import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { WebSocketServer, WebSocket } from 'ws';
import { ScoreService, scoreLines } from './lib/score.mjs';
import { DESTINATIONS, destinationConfig, findFont, probeEncoder, ingestArgs, outputArgs } from './lib/encoder.mjs';
import { constantTimeEquals, SessionStore } from './lib/security.mjs';
import { automationOptions } from './lib/events.mjs';
import { BroadcastProgram } from './lib/program.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../web');
const port = Number(process.env.PORT || 8787), host = process.env.HOST || '127.0.0.1';
const token = process.env.RELAY_TOKEN || '';
if (token.length < 32 || token.includes('REPLACE_WITH')) {
  console.error('Run npm run setup first, or set a random RELAY_TOKEN of at least 32 characters in relay/.env.');
  process.exit(1);
}
const origins = new Set((process.env.ALLOWED_ORIGINS || `http://localhost:${port},http://127.0.0.1:${port}`)
  .split(',').map(s => s.trim()).filter(Boolean));
const auth = value => constantTimeEquals(value, token);
const sessions = new SessionStore();
const originOf = req => req.headers.origin || 'non-browser';
const allowedOrigin = req => !req.headers.origin || origins.has(req.headers.origin);
const destinations = destinationConfig(process.env);
const font = findFont(process.env.FONT_FILE), binary = process.env.FFMPEG_PATH || 'ffmpeg';
const encoder = probeEncoder(binary, font);
const scores = new ScoreService({ template: process.env.SCORE_URL_TEMPLATE, headerName: process.env.SCORE_HEADER_NAME,
  headerValue: process.env.SCORE_HEADER_VALUE, pollSeconds: process.env.SCORE_POLL_SECONDS });
let active = null;
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
  '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.md': 'text/plain' };
async function body(req) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > 4096) throw new Error('Request too large.'); chunks.push(c); }
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
  if (!allowedOrigin(req)) return json(res, 403, { error: 'Origin not allowed. Add your GitHub Pages origin to ALLOWED_ORIGINS.' });
  if (req.headers.origin) { res.setHeader('Access-Control-Allow-Origin', req.headers.origin); res.setHeader('Vary', 'Origin'); }
  if (req.headers.origin && req.headers['access-control-request-private-network'] === 'true') res.setHeader('Access-Control-Allow-Private-Network', 'true');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch { return json(res, 400, { error: 'Invalid URL.' }); }
  if (url.pathname === '/health') return json(res, 200, { ok: true, name: 'Boundary relay' });
  if (url.pathname.startsWith('/api/')) {
    if (rateLimited(req)) return json(res, 429, { error: 'Too many requests. Try again in a minute.' });
    const bearer = req.headers.authorization?.replace(/^Bearer /, '');
    if (req.method === 'POST' && url.pathname === '/api/session') {
      const key = req.socket.remoteAddress || 'local', bucket = failures.get(key);
      if (bucket && Date.now() - bucket.start < 60000 && bucket.count > 8) return json(res, 429, { error: 'Authentication temporarily limited. Wait one minute.' });
      if (!auth(bearer)) return json(res, failedAuth(req) ? 429 : 401, { error: 'Relay token is incorrect.' });
      try {
        const session = sessions.create(originOf(req));
        return json(res, 201, { sessionToken: session.id, expiresAt: session.expires });
      } catch (e) { return json(res, 429, { error: e.message }); }
    }
    const authenticated = sessions.get(bearer, originOf(req));
    if (!authenticated) return json(res, 401, { error: 'Session expired or invalid. Reconnect the relay.' });
    try {
      if (req.method === 'GET' && url.pathname === '/api/info') return json(res, 200, {
        name: 'Boundary relay', version: '1.1.0', encoder, busy: Boolean(active),
        destinations: DESTINATIONS.map(id => ({ id, configured: destinations[id].configured, error: destinations[id].error,
          resolution: id === 'instagram' ? (Number(process.env.INSTAGRAM_HEIGHT) === 1920 ? '1080 × 1920' : '720 × 1280') : '1920 × 1080' })),
        pollSeconds: scores.pollMs / 1000
      });
      if (req.method === 'GET' && url.pathname === '/api/score') return json(res, 200, scores.snapshot());
      if (req.method === 'GET' && url.pathname === '/api/automation') return json(res, 200, active?.sessionId === authenticated.id && active.program ? active.program.snapshot() : { bufferSeconds: 0, clips: [], cards: null, current: null });
      if (req.method === 'POST' && url.pathname === '/api/clip/select') {
        if (!active || active.sessionId !== authenticated.id || !active.program) return json(res, 409, { error: 'Start the broadcast with replay processing enabled first.' });
        const value = await body(req), clip = active.program.selectClip(Number(value.behind ?? 0));
        return json(res, 201, { id: clip.id, duration: clip.frames.length / 30 });
      }
      const clipRoute = url.pathname.match(/^\/api\/clips\/([a-f0-9]{16})\.mp4$/);
      if (req.method === 'GET' && clipRoute) {
        if (!active || active.sessionId !== authenticated.id || !active.program) return json(res, 409, { error: 'The clip buffer is not active.' });
        if (active.exporting) return json(res, 429, { error: 'One clip is already being prepared. Try again shortly.' });
        const owner = active, { child, feed } = owner.program.exportClip(clipRoute[1]); owner.exporting = true; owner.exportChild = child;
        res.writeHead(200, { 'Content-Type': 'video/mp4', 'Cache-Control': 'no-store', 'Content-Disposition': 'inline; filename="boundary-replay.mp4"' });
        const timer = setTimeout(() => child.kill('SIGKILL'), 30000);
        child.on('error', () => res.destroy()); child.on('close', () => { clearTimeout(timer); owner.exporting = false; owner.exportChild = null; if (!res.writableEnded) res.end(); });
        res.on('close', () => { if (child.exitCode === null) child.kill(); }); child.stdout.pipe(res); feed().catch(() => child.kill()); return;
      }
      if (req.method === 'POST' && url.pathname === '/api/ticket') return json(res, 201, { ticket: sessions.ticket(authenticated.id, originOf(req)) });
      if (req.method === 'POST' && url.pathname === '/api/logout') {
        sessions.revoke(authenticated.id);
        if (active?.sessionId === authenticated.id) finish(active, false);
        return json(res, 200, { ok: true });
      }
      if (req.method === 'POST' && url.pathname === '/api/match') {
        if (active && active.sessionId !== authenticated.id) return json(res, 409, { error: 'Another device owns the active stream.' });
        const data = await body(req);
        scores.select(data.clubId, data.matchId);
        const result = await scores.refresh(); updateOverlay();
        return json(res, result.score ? 200 : 502, result);
      }
      return json(res, 404, { error: 'Unknown endpoint.' });
    } catch (e) { return json(res, 400, { error: e.message.slice(0, 180) }); }
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Method not allowed.' });
  try {
    const pathname = decodeURIComponent(url.pathname);
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep) || !fs.statSync(file).isFile()) return json(res, 404, { error: 'Not found.' });
    res.writeHead(200, { 'Content-Type': `${contentTypes[path.extname(file)] || 'application/octet-stream'}; charset=utf-8`,
      'Cache-Control': 'no-cache' });
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
  if (active.program) { active.program.setScore(scores.snapshot().score); return true; }
  const [main, detail] = scoreLines(scores.snapshot().score);
  try {
    writeText(active.dir, 'score-main.txt', main); writeText(active.dir, 'score-detail.txt', detail);
    if (active.overlayWarning) send(active.ws, { type: 'warning', message: 'Score overlay updates recovered.' });
    active.overlayWarning = false; return true;
  } catch {
    if (!active.overlayWarning) send(active.ws, { type: 'warning', message: 'Score overlay text could not be updated on the laptop. Last video overlay may be delayed; check disk access.' });
    active.overlayWarning = true; return false;
  }
}
function friendlyFailure(stderr) {
  if (/401|403|Unauthorized|Server error|Authentication/i.test(stderr)) return 'Platform rejected the connection. Check the current server URL, key and live eligibility.';
  if (/Connection refused|Connection timed out|Network|resolve|timed out/i.test(stderr)) return 'Could not reach the platform. Check the laptop internet connection and server URL.';
  return 'Output stopped. Check the platform preview, current stream key and relay setup.';
}
function run(ws, message, identity) {
  if (active) throw new Error('Relay is already streaming. Stop the other session first.');
  if (!encoder.ready) throw new Error(encoder.error);
  if (!Array.isArray(message.destinations) || !message.destinations.length || message.destinations.length > 3) throw new Error('Select at least one destination.');
  const chosen = [...new Set(message.destinations)];
  if (chosen.some(id => !DESTINATIONS.includes(id) || !destinations[id].configured)) throw new Error('A selected destination has no valid stream key on the relay.');
  if (!/^video\/(webm|mp4)(;|$)/i.test(message.mimeType || '')) throw new Error('Unsupported browser recording container.');
  const width = Number(message.width), height = Number(message.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 854 || height < 480 || width < height || width > 4096 || height > 2160) throw new Error('Use a landscape camera providing the selected resolution (1920 × 1080 for 1080p). Rotate the phone and reopen the camera.');
  if (!message.resolution && (width < 1920 || height < 1080)) throw new Error('Use a landscape camera providing at least 1920 × 1080.');
  if (message.overlay !== false && !scores.snapshot().score) throw new Error('Connect a valid score feed, or turn off the score overlay before streaming.');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'boundary-live-'));
  const session = { ws, dir, sessionId: identity.id, main: null, outputs: new Map(), ending: false, bytes: 0, windowBytes: 0, windowAt: Date.now(), lastInput: Date.now(), started: Date.now(), frames: 0, timer: null };
  active = session;
  if (!updateOverlay()) {
    active = null; fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }, () => {});
    throw new Error('Could not prepare score overlay files. Check laptop temporary-folder access.');
  }
  const bitrate = chosen.includes('facebook') ? 6000 : Math.max(4000, Math.min(14000, Number(process.env.LANDSCAPE_VIDEO_KBPS) || 10000));
  const args = ingestArgs({ font, overlay: message.overlay !== false, bitrateKbps: bitrate, mimeType: message.mimeType });
  const preset = process.env.ENCODER_PRESET;
  if (['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium'].includes(preset)) args[args.indexOf('-preset') + 1] = preset;
  let mainError = '';
  const options = automationOptions(message.automation, process.env), outputHeight = height >= 1080 && width >= 1920 ? 1080 : height >= 720 && width >= 1280 ? 720 : 480;
  let main;
  if (options.replay || options.milestones || options.cards || outputHeight < 1080) {
    session.program = new BroadcastProgram({ binary, font, dir, mimeType: message.mimeType, options,
      bitrateKbps: outputHeight === 1080 ? bitrate : outputHeight === 720 ? 4500 : 2000, width: outputHeight === 1080 ? 1920 : outputHeight === 720 ? 1280 : 854, height: outputHeight,
      score: scores.snapshot().score, overlay: message.overlay !== false, preset });
    main = session.program.encoder; session.main = session.program.camera;
    session.program.on('failure', message => { send(ws, { type: 'error', message }); finish(session, false); });
    session.program.on('warning', message => send(ws, { type: 'warning', message }));
    session.program.on('graphic', graphic => send(ws, { type: 'graphic', graphic }));
    session.program.on('clips', automation => send(ws, { type: 'automation', automation }));
  } else { main = spawn(binary, args, { cwd: dir, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }); session.main = main; }
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
    const proc = spawn(binary, outputArgs(destinations[id], process.env), { cwd: dir, windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
    const out = { process: proc, failed: false, sending: false, error: '' };
    session.outputs.set(id, out);
    proc.stdin.on('error', () => {});
    proc.stderr.on('data', c => {
      out.error = (out.error + c.toString()).slice(-3000);
      if (!out.sending && /frame=\s*[1-9]/.test(out.error)) { out.sending = true; send(ws, { type: 'destination', id, state: 'sending', message: 'Packets sent; confirm Go Live in the platform.' }); }
    });
    proc.on('error', () => failOutput(id, 'Unable to start the platform relay process.'));
    proc.on('close', () => { if (!session.ending) failOutput(id, friendlyFailure(out.error)); });
    send(ws, { type: 'destination', id, state: 'connecting', message: 'Connecting to platform…' });
  }
  // Decode/composite/encode landscape once. Independent writers isolate output failures.
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
    if (!sessions.sessions.has(session.sessionId) || Date.now() - session.started > 8 * 3600_000) { send(ws, { type: 'error', message: 'Session expired. Reconnect the relay.' }); finish(session, false); return; }
    send(ws, { type: 'stats', bytes: session.bytes, frames: session.frames, elapsed: Math.floor((Date.now() - session.started) / 1000), automation: session.program?.snapshot() });
  }, 2000);
  send(ws, { type: 'ready', bitrateKbps: bitrate, program: Boolean(session.program), message: 'Relay is ready for camera data.' });
  return session;
}
function finish(session, graceful) {
  if (!session || session.ending) return;
  session.ending = true; clearInterval(session.timer);
  session.exportChild?.kill();
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
    const children = [session.main, ...(session.program ? [session.program.encoder] : []), ...[...session.outputs.values()].map(o => o.process)];
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
        if (message.type !== 'start' || !identity) throw new Error('Streaming ticket expired or invalid. Reconnect and try again.');
        clearTimeout(timeout); authorized = true;
        session = run(ws, message, identity); return;
      }
      if (isBinary) {
        if (!session || session.ending) return;
        if (Date.now() - session.windowAt > 10000) { session.windowAt = Date.now(); session.windowBytes = 0; }
        session.windowBytes += data.length;
        if (session.windowBytes > 48 * 1024 * 1024) throw new Error('Camera upload exceeded the allowed data rate.');
        session.lastInput = Date.now(); session.bytes += data.length;
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
            if (message.type === 'mark-ball') { session.program.markBall(); send(ws, { type: 'warning', message: 'Ball marked. The next detected scoring delivery will use this mark for replay alignment.' }); }
            else if (message.type === 'card') session.program.cards(message.kind);
            else if (message.type === 'replay') session.program.replay(String(message.clipId || ''));
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
  if (!active && !sessions.sessions.size) return;
  if (!scores.ids) return;
  await scores.refresh(); updateOverlay();
}, 2000);
scoreTimer.unref();
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.alive === false) { ws.terminate(); continue; }
    ws.alive = false; ws.ping();
  }
}, 10000);
heartbeat.unref();
wss.on('connection', ws => { ws.alive = true; ws.on('pong', () => { ws.alive = true; }); });
server.listen(port, host, () => {
  console.log(`Boundary relay: http://${host}:${server.address().port}`);
  console.log(`Encoder: ${encoder.ready ? 'ready' : encoder.error}`);
  console.log(`Configured outputs: ${DESTINATIONS.filter(id => destinations[id].configured).join(', ') || 'none — edit relay/.env'}`);
});
function shutdown() {
  clearInterval(scoreTimer); clearInterval(heartbeat);
  if (active) finish(active, false);
  for (const ws of wss.clients) ws.close(1001, 'Relay shutting down');
  server.close(); setTimeout(() => process.exit(0), 1000).unref();
}
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
