import { captureProfile } from '../../web/capture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const source = fs.readFileSync(new URL('../../web/youtube.mjs', import.meta.url), 'utf8').replace(/^import[^\n]*\n/, '').replace('export function installYouTube', 'function installYouTube');
const origin = 'https://mk97-fixture.onrender.com';
const blank = () => ({ configured: true, connected: false, authorizing: false, busy: false, redirectUri: origin + '/youtube-callback.html', callbackMode: 'server', authorization: null, setup: null, broadcast: null });
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)); };
function harness(initial = blank(), overrides = {}) {
  const elements = new Map(), intervals = new Map(), listeners = new Map(), calls = [], notices = [], stored = [];
  let serial = 0, server = structuredClone(initial), controller, clock = Date.parse('2026-10-30T18:00:00Z'), closed = 0;
  function element(id) {
    if (!elements.has(id)) elements.set(id, { value: '', textContent: '', disabled: false, hidden: false, checked: false, required: false,
      handlers: new Map(), addEventListener(type, handler) { this.handlers.set(type, handler); }, focus() {}, select() {},
      emit(type, extra = {}) { return this.handlers.get(type)?.({ preventDefault() {}, ...extra }); } });
    return elements.get(id);
  }
  element('ytPrivacy').value = 'unlisted'; element('ytStartMode').value = 'now'; element('ytAudience').value = 'false';
  element('ytTitle').value = 'A vs B'; element('ytDescription').value = 'Cricket';
  const state = { session: 'fixture-owner', captureResolution: '1080', live: false, starting: false, stopping: false, score: null };
  const context = { captureProfile, URL, Intl, crypto: webcrypto, Date: class extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } },
    document: { baseURI: origin + '/', hidden: false, getElementById: element, addEventListener(type, fn) { listeners.set(type, fn); } }, location: { origin },
    localStorage: { setItem: (...args) => stored.push(args) }, navigator: { clipboard: { async writeText(value) { stored.push(['clipboard', value]); } } },
    window: { open() { return { location: { replace(value) { calls.push({ path: 'open-google', value }); } }, close() { closed++; } }; }, addEventListener(type, fn) { listeners.set(type, fn); } },
    setInterval(fn, ms) { const id = ++serial; intervals.set(id, { fn, ms }); return id; }, clearInterval(id) { intervals.delete(id); },
    setTimeout(fn) { return ++serial; }, clearTimeout() {}
  };
  const api = async (path, options = {}) => {
    const value = options.body ? JSON.parse(options.body) : null; calls.push({ path, value });
    if (overrides.api) { const result = await overrides.api(path, value, { get server() { return server; }, setServer(v) { server = v; } }); if (result !== undefined) return result; }
    if (path === '/api/youtube/auth/start') {
      server = { ...server, authorizing: true, authorization: { state: 's'.repeat(43), status: 'pending' } };
      return { authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?synthetic=1', state: 's'.repeat(43), callbackMode: server.callbackMode };
    }
    if (path === '/api/youtube/auth/cancel') { server = { ...server, authorizing: false, authorization: null }; return structuredClone(server); }
    if (path.startsWith('/api/youtube/status')) return structuredClone(server);
    if (path === '/api/youtube/setup') {
      server = { ...server, connected: true, setup: { stage: 'ready', requestId: value.requestId, details: { ...value } }, broadcast: {
        title: value.title, privacy: value.privacy, keyReady: true, state: 'ready', streamStatus: 'ready', health: 'noData', watchUrl: 'https://www.youtube.com/watch?v=fixture', studioUrl: 'https://studio.youtube.com/video/fixture/livestreaming' } };
      return structuredClone(server);
    }
    if (path === '/api/youtube/transition') { server.broadcast.state = value.state; return structuredClone(server); }
    return structuredClone(server);
  };
  context.fixture = { state, api, notice: (...args) => notices.push(args), refreshInfo: async () => controller.accept(structuredClone(server)), updateControls() {}, closePanel() { calls.push({ path: 'close-panel' }); } };
  vm.runInNewContext(source + '\n;globalThis.controller = installYouTube(fixture);', context);
  controller = context.controller; controller.accept(structuredClone(server));
  return { controller, state, element, calls, notices, stored, listeners, context, get closed() { return closed; },
    setServer(value) { server = structuredClone(value); }, getServer() { return server; }, advance(ms) { clock += ms; },
    async tick(ms) { for (const timer of intervals.values()) if (timer.ms === ms) await timer.fn(); await flush(); } };
}
test('YouTube shows the exact Render callback and diagnoses a Pages origin mismatch', async () => {
  const h = harness(); assert.equal(h.element('ytCallback').value, origin + '/youtube-callback.html'); assert.equal(h.element('ytConnect').disabled, false);
  await h.element('ytCopyCallback').emit('click'); assert.equal(h.stored.at(-1)[1], origin + '/youtube-callback.html');
  h.controller.accept({ ...blank(), redirectUri: 'https://example.github.io/BOUNDARY.LIVE/youtube-callback.html' });
  assert.equal(h.element('ytConnect').disabled, true); assert.match(h.element('ytCallbackHelp').textContent, /Callback mismatch/); assert.match(h.element('ytCallbackHelp').textContent, /onrender/);
  assert.equal(h.element('ytCallback').value, origin + '/youtube-callback.html');
  h.controller.destroy();
});
test('mobile Google sign-in finishes from server status with no popup message or opener', async () => {
  const h = harness(); await h.element('ytConnect').emit('click'); assert.equal(h.state.youtubeBusy, true); assert.equal(h.element('ytCancelAuth').hidden, false);
  h.setServer({ ...blank(), connected: true, channel: { title: 'Fixture cricket' }, authorization: { state: 's'.repeat(43), status: 'connected' } });
  await h.tick(2000); assert.equal(h.element('ytChannel').textContent, 'Fixture cricket'); assert.equal(h.element('ytCancelAuth').hidden, true); assert.equal(h.state.youtubeBusy, false);
  assert.equal(h.calls.some(x => x.path === '/api/youtube/auth/complete'), false); assert.ok(h.closed > 0);
  assert.match(h.notices.at(-1)[0], /YouTube connected/); h.controller.destroy();
});
test('a denied mobile sign-in displays its safe error and unlocks reconnect', async () => {
  const h = harness(); await h.element('ytConnect').emit('click');
  h.setServer({ ...blank(), authorization: { state: 's'.repeat(43), status: 'failed', error: 'The required YouTube permission was not granted.' } });
  await h.tick(2000); assert.equal(h.state.youtubeBusy, false); assert.equal(h.element('ytConnect').disabled, false);
  assert.match(h.notices.at(-1)[0], /permission/); h.controller.destroy();
});
test('Start now uses the current time after an idle page and selects the ready YouTube destination', async () => {
  const h = harness({ ...blank(), connected: true }); h.advance(3600000);
  h.element('ytBroadcastForm').emit('submit'); await flush();
  const request = h.calls.find(c => c.path === '/api/youtube/setup'); assert.equal(request.value.scheduledStartTime, '2026-10-30T19:00:00.000Z');
  assert.equal(request.value.madeForKids, false); assert.equal(h.element('dest-youtube').checked, true); assert.equal(h.state.youtubeBusy, false);
  h.element('ytUseSetup').emit('click'); assert.equal(h.calls.at(-1).path, 'close-panel');
  assert.equal(h.stored.some(([key]) => /token|secret|key/i.test(key)), false); h.controller.destroy();
});
test('validation failures permit corrected details while confirmed partial retries reuse the same request', async () => {
  let attempt = 0;
  const h = harness({ ...blank(), connected: true }, { api(path, value, transport) {
    if (path !== '/api/youtube/setup') return;
    if (attempt++ === 0) throw new Error('Enter a title.');
    if (attempt === 2) { transport.setServer({ ...blank(), connected: true, setup: { requestId: value.requestId, stage: 'broadcast', details: value } }); throw new Error('Retry permitted.'); }
  } });
  h.element('ytTitle').value = ''; h.element('ytBroadcastForm').emit('submit'); await flush();
  h.element('ytTitle').value = 'Corrected'; h.element('ytTitle').emit('input'); h.element('ytBroadcastForm').emit('submit'); await flush();
  h.advance(120000); h.element('ytBroadcastForm').emit('submit'); await flush();
  const requests = h.calls.filter(c => c.path === '/api/youtube/setup'); assert.equal(requests.length, 3); assert.equal(requests[1].value.title, 'Corrected');
  assert.deepEqual(requests[1].value, requests[2].value); assert.equal(h.element('dest-youtube').checked, true); h.controller.destroy();
});
test('late status cannot overwrite a newer setup and transitions remain usable during camera upload', async () => {
  let release, hold = true;
  const waiting = new Promise(resolve => { release = resolve; });
  const h = harness({ ...blank(), connected: true }, { async api(path) {
    if (path === '/api/youtube/status' && hold) { await waiting; return { ...blank(), connected: true }; }
  } });
  const polling = h.tick(15000); await flush(); h.element('ytBroadcastForm').emit('submit'); await flush();
  hold = false; release(); await polling;
  assert.equal(h.element('ytEvent').hidden, false); assert.equal(h.element('ytEventTitle').textContent, 'A vs B');
  const ready = h.getServer(); ready.broadcast.streamStatus = 'active'; h.setServer(ready); h.controller.accept(ready);
  h.state.live = true; h.controller.update(); assert.equal(h.element('ytGoLive').disabled, false); assert.equal(h.element('ytNew').disabled, true);
  h.element('ytGoLive').emit('click'); await flush(); assert.equal(h.element('ytEventState').textContent, 'live'); assert.equal(h.element('ytEnd').disabled, false);
  h.controller.destroy();
});
test('logging out ignores a delayed authorization response and clears pending sign-in UI', async () => {
  let release; const waiting = new Promise(resolve => { release = resolve; });
  const h = harness(blank(), { async api(path) { if (path === '/api/youtube/status') { await waiting; return { ...blank(), connected: true, authorization: { state: 's'.repeat(43), status: 'connected' } }; } } });
  await h.element('ytConnect').emit('click'); const polling = h.tick(2000); await flush();
  h.state.session = null; h.controller.accept(null); release(); await polling;
  assert.equal(h.element('ytAccountState').textContent, 'Connect cloud studio first'); assert.equal(h.state.youtubeBusy, false); assert.equal(h.element('ytCancelAuth').hidden, true); h.controller.destroy();
});
test('a failed cancellation keeps its error visible instead of claiming sign-in was cancelled', async () => {
  const h = harness(blank(), { api(path) { if (path === '/api/youtube/auth/cancel') throw new Error('Cloud studio unavailable.'); } });
  await h.element('ytConnect').emit('click'); await h.element('ytCancelAuth').emit('click');
  assert.equal(h.state.youtubeBusy, false); assert.match(h.notices.at(-1)[0], /unavailable/); h.controller.destroy();
});
test('a late account disconnect cannot clear a newer session’s pending sign-in', async () => {
  let release; const waiting = new Promise(resolve => { release = resolve; });
  const h = harness({ ...blank(), connected: true }, { async api(path) { if (path === '/api/youtube/disconnect') { await waiting; return { revoked: true }; } } });
  const disconnecting = h.element('ytDisconnect').emit('click'); await flush();
  h.state.session = 'new-fixture-owner'; h.setServer(blank()); h.controller.accept(blank()); await h.element('ytConnect').emit('click');
  release(); await disconnecting; await flush();
  assert.equal(h.element('ytCancelAuth').hidden, false); assert.equal(h.state.youtubeBusy, true); h.controller.destroy();
});

test('YouTube capture summary reports the native quality for portrait and larger sensor modes',()=>{
 const h=harness();
 for(const [width,height,profile]of [[1080,1920,'1080'],[720,1280,'720'],[1920,1440,'1080']]){
  h.state.camera={width,height};h.controller.update();assert.match(h.element('ytCapture').textContent,new RegExp('Capture: '+profile+'p'));
 }
});
