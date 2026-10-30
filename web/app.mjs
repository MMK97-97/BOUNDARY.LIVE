import { PROFILES, SIZES, captureReady, parseMatch, relayOrigin, chooseMime, clampZoom, duration, is1080Landscape, preflight } from './core.mjs';
import { installStudio } from './studio.mjs';
import { installYouTube } from './youtube.mjs';
import { createFeed } from './feed.mjs';
import { subscribeRelayScores } from './score-live.mjs';
import { installHome } from './home.mjs';
import { installStreamSetup } from './stream-setup.mjs';
let ui = null;
let youtubeUI = null;
let homeUI = null;
let setupUI = null;
const $ = id => document.getElementById(id);
const DESTS = ['youtube', 'facebook', 'instagram'];
const state = { stream: null, camera: null, zoom: null, recorder: null, socket: null, session: null,
  relay: '', info: null, score: null, pollTimer: null, polling: false, live: false, starting: false, stopping: false,
  cameraBusy: false, connecting: false, micMuted: false, previewOff: false, startedAt: 0, uploaded: 0, lastBytes: 0,
  lastStat: 0, lastServerMessage: 0, heartbeat: null, wake: null, sessionExpiry: 0, closedByUser: false,
  captureResolution: '1080', graphics: { cards: null, current: null } };
// Remove the obsolete build's browser-stored platform key; new credentials stay in relay memory.
try { localStorage.removeItem('boundary.ytKey'); } catch {}
const saved = key => { try { return localStorage.getItem(`mk97.${key}`) || ''; } catch { return ''; } };
const save = (key, value) => { try { localStorage.setItem(`mk97.${key}`, value); } catch {} };
$('relayUrl').value = saved('relay'); $('clubInput').value = saved('club') || '300';
if (saved('match')) $('matchInput').value = saved('match');
function notice(message, type = 'info') { $('notice').textContent = message; $('notice').className = `notice ${type}`; $('notice').hidden = !message; $('dismissNotice').hidden = !message; }
function health(id, text, kind = '') { $(id + 'Health').textContent = text; $(id + 'Dot').className = 'health-dot ' + kind; }
function currentDestinations() { return DESTS.filter(id => $('dest-' + id).checked && state.info?.destinations.find(d => d.id === id)?.configured); }
function issue() {
  if (state.session && $('overlayToggle').checked && state.score && state.scoreTransport !== 'relay') return 'Load this match on the relay, or turn off the score overlay.';
  return preflight({ connected: Boolean(state.session), encoderReady: state.info?.encoder.ready,
    camera: state.camera, destinations: currentDestinations(), overlay: $('overlayToggle').checked, score: state.score, resolution: state.captureResolution });
}
function updateControls() {
  const locked = state.live || state.starting || state.stopping;
  $('goLive').disabled = locked || state.cameraBusy || state.scoreLoading || state.connecting || Boolean(state.destinationBusy);
  $('goLive').setAttribute('aria-label', issue() ? 'Set up stream before starting' : 'Start camera upload');
  $('goLive').hidden = state.live || state.stopping;
  $('stopLive').hidden = !(state.live || state.stopping);
  $('stopLive').disabled = state.stopping;
  $('stopLive').textContent = state.stopping ? 'Stopping…' : '■ Stop stream';
  for (const id of ['qualitySelect', 'overlayToggle', 'relayUrl', 'relayToken', 'connectRelay', 'disconnectRelay', 'matchInput', 'clubInput', 'loadMatch']) $(id).disabled = locked || Boolean(state.destinationBusy);
  $('connectRelay').disabled = locked || state.connecting || Boolean(state.destinationBusy);
  $('overlayToggle').disabled = locked && (!state.live || !state.programEnabled);
  for (const id of ['autoMilestones', 'autoCards']) $(id).disabled = locked;
  $('loadMatch').disabled = locked || Boolean(state.scoreLoading);
  $('cameraSelect').disabled = locked || !state.stream || state.cameraBusy;
  $('openCamera').disabled = state.cameraBusy || locked;
  $('closeCamera').disabled = !state.stream || locked || state.cameraBusy;
  $('micToggle').disabled = !state.stream?.getAudioTracks().length;
  $('previewToggle').disabled = !state.stream;
  $('dimScreen').disabled = !state.live;
  for (const id of DESTS) $('dest-' + id).disabled = locked || !state.info?.destinations.find(d => d.id === id)?.configured;
  $('startHint').textContent = state.live ? 'Camera upload active. Confirm Go Live in each platform’s control room. Keep this page in the foreground.'
    : state.stopping ? 'Finishing the current stream…' : state.starting ? 'Connecting and preparing the encoder…' : issue() || 'Ready. Check your platform previews after starting.';
  $('streamState').replaceChildren();
  const dot = document.createElement('i'); $('streamState').append(dot, document.createTextNode(state.live ? ' SENDING' : state.starting ? ' CONNECTING' : state.stopping ? ' STOPPING' : ' STANDBY'));
  $('streamState').classList.toggle('sending', state.live);
  $('broadcastLabel').textContent = state.live ? 'CAMERA UPLOAD ACTIVE' : 'READY WHEN YOU ARE';
  ui?.update();
  youtubeUI?.update();
  homeUI?.update();
  setupUI?.update();
}
async function api(path, options = {}, authToken = state.session) {
  if (!state.relay || !authToken) throw new Error('Connect the relay first.');
  let response;
  const { timeoutMs = 12000, ...requestOptions } = options;
  try {
    response = await fetch(state.relay + path, { ...requestOptions, cache: 'no-store', credentials: 'omit',
      redirect: 'error', signal: AbortSignal.timeout(Math.max(1000, Math.min(60000, timeoutMs))),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}`, 'X-MK97-Origin': location.origin, ...(options.headers || {}) } });
  } catch { throw new Error('Relay unreachable. Check its HTTPS address, internet connection and ALLOWED_ORIGINS setting.'); }
  let data; try { data = await response.json(); } catch { throw new Error('The address did not return a MK97 relay response.'); }
  if (!response.ok) {
    const error = new Error(data.error || 'Relay request failed.'); error.payload = data; error.status = response.status; throw error;
  }
  return data;
}
function renderRelay() {
  youtubeUI?.accept(state.info?.youtube || null);
  const connected = Boolean(state.session);
  $('relayForm').hidden = connected; $('relayConnected').hidden = !connected;
  $('connectionBadge').replaceChildren(); const i = document.createElement('i');
  $('connectionBadge').append(i, document.createTextNode(connected ? ' Secure relay connected' : ' Relay disconnected'));
  $('connectionBadge').classList.toggle('connected', connected);
  $('relayState').textContent = connected ? 'Connected' : 'Offline'; $('relayState').classList.toggle('good', connected);
  for (const id of DESTS) {
    const d = state.info?.destinations.find(x => x.id === id);
    if (!state.live) $(id + 'Status').textContent = d?.configured ? d.mode === 'account' ? 'YouTube account setup ready' : d.mode === 'session' ? 'Session key saved · ready' : 'Server key configured · ready' : d?.error || 'Add a stream key or connect an account';
    $(id + 'Status').className = 'destination-status' + (d?.configured ? ' good' : '');
    $(id + 'Resolution').textContent = id === 'instagram' ? (d?.resolution?.startsWith('1080') ? '1080p · portrait (check acceptance)' : '720p · portrait compatibility') : '1080p · landscape';
    if (!d?.configured) $('dest-' + id).checked = false;
  }
  updateControls();
}
$('relayForm').addEventListener('submit', async event => {
  event.preventDefault(); if (state.live || state.starting || state.connecting) return;
  state.connecting = true; updateControls();
  let master = $('relayToken').value.trim();
  try {
    state.relay = relayOrigin($('relayUrl').value.trim());
    const identity = await api('/api/session', { method: 'POST', body: '{}' }, master);
    state.session = identity.sessionToken; state.sessionExpiry = identity.expiresAt;
    state.info = await api('/api/info');
    if (state.info.name !== 'MK97 relay' || !Array.isArray(state.info.destinations)) throw new Error('Incompatible relay response.');
    save('relay', state.relay); $('relayExpiry').textContent = 'Session expires ' + new Date(identity.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const available = state.info.destinations.filter(d => d.configured); if (available[0]) $('dest-' + available[0].id).checked = true;
    notice(state.info.encoder.ready ? 'Relay connected. Load your CricClubs scorecard and open the camera.' : state.info.encoder.error, state.info.encoder.ready ? 'success' : 'error');
    await feed.changeSource();
  } catch (error) {
    try { if (state.session) await api('/api/logout', { method: 'POST', body: '{}' }); } catch {}
    state.session = null; state.info = null; notice(error.message, 'error');
  }
  finally { state.connecting = false; master = ''; $('relayToken').value = ''; renderRelay(); }
});
async function disconnect() {
  if (state.live || state.starting) return;
  try { if (state.session) await api('/api/logout', { method: 'POST', body: '{}' }); } catch {}
  state.session = null; state.info = null; state.score = null; renderScore(null); renderRelay(); await feed.changeSource();
}
$('disconnectRelay').addEventListener('click', disconnect);
function renderScore(result) {
  const s = result?.score || null; state.score = s; state.scoreTransport = result?.transport || state.scoreTransport || '';
  $('scoreOverlay').hidden = !s || !$('overlayToggle').checked;
  if (!s) {
    ui?.score(null);
    $('seriesTitle').textContent = 'MK97 · Cricket studio';
    $('groundTitle').textContent = result?.ids ? `Match ${result.ids.matchId} · Club ${result.ids.clubId} · awaiting source` : 'Load your CricClubs match';
    $('matchTitle').textContent = 'Waiting for your scorecard';
    $('matchStatus').textContent = result?.error || 'Paste your scorecard URL or load the Match ID.';
    health('score', result?.error ? 'Score feed unavailable' : 'Score not connected', result?.error ? 'bad' : '');
    updateControls(); return;
  }
  const delayed = s.stale || Date.now() - s.fetchedAt > 30000;
  $('overlayTeam').textContent = s.batting; $('overlayRuns').textContent = `${s.runs}/${s.wickets}`;
  $('overlayOvers').textContent = `${s.overs} ov`; $('overlayRate').textContent = s.runRate ? `CRR ${s.runRate}` : '';
  $('overlayStatus').textContent = delayed ? 'SCORE DELAYED' : s.status === 'complete' ? 'MATCH COMPLETE' : s.superOver ? 'SUPER OVER' : 'LIVE SCORE';
  const players = s.batters?.map(p => `${p.name.slice(0, 18)} ${p.runs}(${p.balls})`).join(' · ');
  $('overlayDetail').textContent = s.result || players || s.detail || `v ${s.bowling} · ${s.source}`;
  $('scoreOverlay').classList.toggle('delayed', delayed);
  $('matchTitle').textContent = `${s.batting} ${s.runs}/${s.wickets} · ${s.overs} ov`;
  const teams = s.teams?.map(t => `${t.code} ${t.runs}/${t.wickets} (${t.overs})`).join(' · ');
  $('matchStatus').textContent = result?.error || teams || `${s.source} · Match ${s.matchId} · ${s.status === 'complete' ? 'Completed' : 'Feed connected'}`;
  $('scoreFreshness').textContent = `${delayed ? 'Last successful fetch' : 'Fetched'} ${new Date(s.fetchedAt).toLocaleTimeString()} · ${result.delivery === 'push' ? 'live relay link · source checks' : 'refresh'} every ${result.pollSeconds || 5}s${s.partialView ? ' · limited CricClubs view' : ''}`;
  $('dimScore').textContent = `${s.batting} ${s.runs}/${s.wickets} (${s.overs})${delayed ? ' · delayed' : ''}`;
  ui?.score(s);
  health('score', delayed ? 'Score delayed' : s.status === 'complete' ? 'Match complete' : 'Score connected', delayed ? 'warning' : 'good');
  updateControls();
}
const feed = createFeed({
  onUpdate: result => { renderScore(result); if (result?.status === 401) notice('Relay session expired. Disconnect and reconnect in Settings.', 'error'); },
  getRelay: () => state.session ? { session: state.session, request: api,
    subscribe: (ids, callbacks) => subscribeRelayScores({ relay: state.relay, session: state.session, origin: location.origin, ids, ...callbacks }) } : null,
  visible: () => document.visibilityState === 'visible' || state.live
});
async function pollScore() { return feed.refresh(); }
async function loadSelectedMatch(input, club) {
  if (state.live || state.starting || state.stopping || state.scoreLoading) throw new Error('Stop the current upload before changing matches.');
  const ids = parseMatch(input, club);
  state.scoreLoading = true; state.graphics.cards = null;
  $('matchInput').value = ids.matchId; $('clubInput').value = ids.clubId;
  $('leagueDetails').querySelector('summary').textContent = ids.clubId === '300' ? 'FWCWL · Club 300' : `CricClubs · Club ${ids.clubId}`;
  $('clubHelp').textContent = 'Match IDs belong to a club. Change the Club ID for another league, or paste its full scorecard URL.';
  save('club', ids.clubId); save('match', ids.matchId); updateControls();
  try {
    const result = await feed.select(ids);
    if (!result?.score) throw new Error(result?.error || 'No score data was returned.');
    notice(''); return result;
  } finally { state.scoreLoading = false; updateControls(); }
}
$('matchForm').addEventListener('submit', async event => {
  event.preventDefault();
  try { await loadSelectedMatch($('matchInput').value, $('clubInput').value); }
  catch (error) { $('leagueDetails').open = true; notice(error.message, 'error'); }
});
$('overlayToggle').addEventListener('change', () => { $('scoreOverlay').hidden = !state.score || !$('overlayToggle').checked; if (state.live) sendControl({ type: 'overlay', enabled: $('overlayToggle').checked }); updateControls(); });
function sendControl(message) { if (!state.live || state.socket?.readyState !== WebSocket.OPEN) { notice('Start streaming to use on-air controls.'); return false; } state.socket.send(JSON.stringify(message)); return true; }

async function openCamera(deviceId = '') {
  if (state.cameraBusy || state.live || state.starting) return;
  state.cameraBusy = true; updateControls(); closeCamera(false);
  try {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('Camera access needs HTTPS. Open your hosted MK97 app in a current browser.');
    chooseMime(window.MediaRecorder);
    const candidates = state.captureResolution === 'auto' ? ['1080', '720', '480'] : [state.captureResolution];
    let lastError;
    for (const size of candidates) {
      const s = SIZES[size], video = { width: { exact: s.width }, height: { exact: s.height }, frameRate: { ideal: 30, max: 30 }, aspectRatio: { ideal: 16 / 9 }, ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } }) };
      if (navigator.mediaDevices.getSupportedConstraints().resizeMode) video.resizeMode = 'none';
      try { state.stream = await navigator.mediaDevices.getUserMedia({ video, audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }); break; }
      catch (e) { lastError = e; if (e.name !== 'OverconstrainedError') throw e; }
    }
    if (!state.stream) throw lastError;
    state.camera = state.stream.getVideoTracks()[0].getSettings();
    if (!captureReady(state.camera, state.captureResolution)) throw new Error('This camera did not provide the selected landscape resolution. Rotate the phone and reopen, or select another camera.');
    const track = state.stream.getVideoTracks()[0];
    track.addEventListener('ended', () => { if (state.live || state.starting) abortStream('Camera was disconnected. Reopen it and start a new stream.'); closeCamera(); });
    ui?.resetMonitor(); $('cameraVideo').removeAttribute('src'); $('cameraVideo').srcObject = state.stream; $('cameraVideo').hidden = false; await $('cameraVideo').play();
    state.previewOff = false; $('previewHidden').hidden = true; $('previewToggle').setAttribute('aria-pressed', 'false');
    $('previewToggle').textContent = '◐ Hide preview'; $('cameraPlaceholder').hidden = true;
    for (const audio of state.stream.getAudioTracks()) audio.enabled = !state.micMuted;
    $('cameraSpec').textContent = `${state.camera.width} × ${state.camera.height} · ${Math.round(state.camera.frameRate || 30)} fps`;
    health('video', `${state.camera.height}p camera ready`, 'good'); setupZoom(track);
    await listCameras();
    notice('Camera ready. Use a tripod behind the bowler’s arm and keep the full pitch in frame.', 'success');
  } catch (error) {
    closeCamera(false);
    const messages = { NotAllowedError: 'Camera or microphone permission was denied. Allow both in your browser settings, then try again.',
      NotFoundError: 'No camera or microphone was found.', NotReadableError: 'Camera is in use by another app. Close that app and try again.',
      OverconstrainedError: 'This camera cannot supply the selected native resolution. Rotate the phone, try another rear camera, or choose Auto before streaming.' };
    notice(messages[error.name] || error.message, 'error');
  } finally { state.cameraBusy = false; updateControls(); }
}
function closeCamera(update = true) {
  if (state.live || state.starting) return;
  if (state.stream) for (const track of state.stream.getTracks()) track.stop();
  state.stream = null; state.camera = null; state.zoom = null;
  ui?.resetMonitor();
  $('cameraVideo').srcObject = null; $('cameraVideo').hidden = true; $('cameraPlaceholder').hidden = false; $('previewHidden').hidden = true;
  $('cameraSpec').textContent = `${state.captureResolution === 'auto' ? 'Auto' : state.captureResolution + 'p'} target · 30 fps`; health('video', 'Camera off');
  setupZoom(null); if (update) updateControls();
}
async function listCameras() {
  const devices = await navigator.mediaDevices.enumerateDevices(); $('cameraSelect').replaceChildren();
  devices.filter(d => d.kind === 'videoinput').forEach((d, i) => {
    const option = document.createElement('option'); option.value = d.deviceId; option.textContent = d.label || `Camera ${i + 1}`;
    option.selected = d.deviceId === state.camera?.deviceId; $('cameraSelect').append(option);
  });
}
function setupZoom(track) {
  const z = track?.getCapabilities?.().zoom;
  state.zoom = z && Number.isFinite(z.max) && z.max > z.min ? z : null;
  const available = Boolean(state.zoom);
  for (const id of ['zoomSlider', 'zoomMinus', 'zoomPlus']) $(id).disabled = !available;
  for (const button of $('zoomPresets').querySelectorAll('button')) {
    const n = Number(button.dataset.zoom); button.disabled = !available || n < z.min || n > z.max;
  }
  if (available) {
    $('zoomSlider').min = z.min; $('zoomSlider').max = z.max; $('zoomSlider').step = z.step || .1;
    displayZoom(track.getSettings().zoom ?? z.min);
    $('zoomHelp').textContent = 'Uses the camera’s native zoom control. Some phones still apply digital zoom internally; 1080p output cannot guarantee lossless magnification. For best detail, select an optical telephoto lens before streaming.';
    $('zoomType').textContent = 'Native camera zoom';
  } else {
    displayZoom(1); $('zoomType').textContent = 'Zoom unavailable';
    $('zoomHelp').textContent = track ? 'This browser does not expose camera zoom. Choose a rear telephoto camera from the camera menu if available. No software crop is applied.'
      : 'Open the camera to check zoom support. Optical quality depends on your phone; no software crop or upscaling is applied.';
  }
}
function displayZoom(value) {
  $('zoomSlider').value = value; $('zoomValue').textContent = `${Number(value).toFixed(1)}×`;
  for (const button of $('zoomPresets').querySelectorAll('button')) button.classList.toggle('active', Math.abs(Number(button.dataset.zoom) - value) < .06);
}
let pendingZoom = null, zoomApplying = false;
async function zoom(value) {
  if (!state.zoom || !state.stream) return;
  pendingZoom = clampZoom(value, state.zoom);
  if (zoomApplying) return; zoomApplying = true;
  try {
    while (pendingZoom !== null && state.zoom && state.stream) {
      const next = pendingZoom; pendingZoom = null;
      const track = state.stream.getVideoTracks()[0];
      await track.applyConstraints({ advanced: [{ zoom: next }] });
      state.camera = track.getSettings(); displayZoom(state.camera.zoom ?? next);
      if (!captureReady(state.camera, state.captureResolution)) { if (state.live) abortStream('Camera resolution changed below the selected quality. Restart with a supported camera.'); throw new Error('Zoom changed capture resolution. Reopen the camera.'); }
    }
  } catch (error) { pendingZoom = null; notice('Zoom could not be applied: ' + error.message, 'error'); }
  finally { zoomApplying = false; updateControls(); }
}
$('openCamera').addEventListener('click', () => openCamera());
$('closeCamera').addEventListener('click', () => closeCamera());
$('cameraSelect').addEventListener('change', event => openCamera(event.target.value));
$('zoomPresets').addEventListener('click', event => { const button = event.target.closest('button[data-zoom]'); if (button && !button.disabled) zoom(button.dataset.zoom); });
$('zoomSlider').addEventListener('input', event => zoom(event.target.value));
$('zoomMinus').addEventListener('click', () => zoom(Number($('zoomSlider').value) - Math.max(.1, state.zoom?.step || .1)));
$('zoomPlus').addEventListener('click', () => zoom(Number($('zoomSlider').value) + Math.max(.1, state.zoom?.step || .1)));
const pinch = new Map(); let pinchBase = null;
$('viewfinder').addEventListener('pointerdown', e => { if (e.pointerType === 'touch' && state.zoom && state.stream) { pinch.set(e.pointerId, [e.clientX, e.clientY]); if (pinch.size === 2) { const [a, b] = [...pinch.values()]; pinchBase = { distance: Math.hypot(a[0] - b[0], a[1] - b[1]), zoom: Number($('zoomSlider').value) }; } } });
$('viewfinder').addEventListener('pointermove', e => { if (!pinch.has(e.pointerId)) return; pinch.set(e.pointerId, [e.clientX, e.clientY]); if (pinch.size === 2 && pinchBase?.distance) { e.preventDefault(); const [a, b] = [...pinch.values()]; zoom(pinchBase.zoom * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinchBase.distance); } });
for (const event of ['pointerup', 'pointercancel', 'pointerleave']) $('viewfinder').addEventListener(event, e => { pinch.delete(e.pointerId); if (pinch.size < 2) pinchBase = null; });
$('micToggle').addEventListener('click', () => {
  state.micMuted = !state.micMuted; for (const track of state.stream?.getAudioTracks() || []) track.enabled = !state.micMuted;
  $('micToggle').setAttribute('aria-pressed', String(state.micMuted)); $('micToggle').textContent = state.micMuted ? '◖× Mic muted' : '◖)) Mic on';
});
$('gridToggle').addEventListener('click', () => { $('framingGuide').hidden = !$('framingGuide').hidden; $('gridToggle').setAttribute('aria-pressed', String(!$('framingGuide').hidden)); });
function togglePreview(off) {
  state.previewOff = off; $('previewHidden').hidden = !off; $('previewToggle').setAttribute('aria-pressed', String(off));
  $('previewToggle').textContent = off ? '◉ Show preview' : '◐ Hide preview';
  if (off) $('cameraVideo').pause(); else if (state.stream) $('cameraVideo').play().catch(() => notice('Tap Show preview again to resume the preview.'));
  ui?.update();
}
$('previewToggle').addEventListener('click', () => togglePreview(!state.previewOff)); $('showPreview').addEventListener('click', () => togglePreview(false));
for (const id of DESTS) $('dest-' + id).addEventListener('change', updateControls);
$('qualitySelect').addEventListener('change', updateControls);
async function wakeLock() {
  if (!navigator.wakeLock || document.visibilityState !== 'visible') return;
  try { if (!state.wake) { state.wake = await navigator.wakeLock.request('screen'); state.wake.addEventListener('release', () => { state.wake = null; }); } }
  catch { notice('Screen wake lock is unavailable. Keep the phone unlocked and this page visible.'); }
}
function cleanupStream() {
  ui?.graphic(null); state.graphics = { cards: null, current: null }; ui?.graphics(state.graphics);
  clearInterval(state.heartbeat); state.heartbeat = null;
  if (state.recorder && state.recorder.state !== 'inactive') { state.recorder.ondataavailable = null; try { state.recorder.stop(); } catch {} }
  state.recorder = null; state.live = false; state.starting = false; state.stopping = false;
  if (state.socket) { const ws = state.socket; state.socket = null; if (ws.readyState < WebSocket.CLOSING) ws.close(1000, 'Camera upload ended'); }
  if (state.wake) { state.wake.release().catch(() => {}); state.wake = null; }
  exitBattery(); $('stopConfirm').hidden = true; health('upload', 'Upload idle'); updateControls();
}
function abortStream(message) { cleanupStream(); notice(message, 'error'); }
async function startStream() {
  if (state.stream) state.camera = state.stream.getVideoTracks()[0]?.getSettings();
  const problem = issue(); if (problem) { ui?.panel('settings'); $('startHint').textContent = problem; return; }
  if (state.starting || state.live || state.stopping || state.destinationBusy) return;
  state.starting = true; state.closedByUser = false; updateControls();
  let ws;
  try {
    const mimeType = chooseMime(window.MediaRecorder);
    const profile = PROFILES[$('qualitySelect').value];
    // Construct before claiming a relay session; unsupported codec options fail early.
    const qualityScale = state.camera.height >= 1080 ? 1 : state.camera.height >= 720 ? .56 : .25;
    const recorder = new MediaRecorder(state.stream, { mimeType, videoBitsPerSecond: Math.round(profile.bitrate * qualityScale), audioBitsPerSecond: 128_000 });
    state.recorder = recorder;
    const { ticket } = await api('/api/ticket', { method: 'POST', body: '{}' });
    if (!state.starting) return;
    const address = new URL('/ingest', state.relay); address.protocol = address.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(address); state.socket = ws; ws.binaryType = 'arraybuffer';
    let ready = false;
    const readyTimer = setTimeout(() => { if (state.socket === ws && !ready) abortStream('Relay did not become ready within 12 seconds. Check its connection and try again.'); }, 12000);
    ws.onopen = () => {
      if (state.socket !== ws) return;
      ws.send(JSON.stringify({ type: 'start', ticket, destinations: currentDestinations(), mimeType: recorder.mimeType,
        width: state.camera.width, height: state.camera.height, resolution: state.captureResolution, overlay: $('overlayToggle').checked,
        match: state.score ? { clubId: state.score.clubId, matchId: state.score.matchId } : null,
        automation: { milestones: $('autoMilestones').checked, cards: $('autoCards').checked } }));
    };
    recorder.ondataavailable = event => {
      if (!event.data.size || state.socket !== ws) return;
      if (ws.readyState !== WebSocket.OPEN) return abortStream('Upload connection was lost. Start a new stream after reconnecting.');
      if (ws.bufferedAmount + event.data.size > 8 * 1024 * 1024) return abortStream('Upload cannot keep up with the selected quality. Improve your connection or choose Balanced, then restart.');
      ws.send(event.data); state.uploaded += event.data.size;
    };
    recorder.onerror = () => abortStream('Camera encoding failed. Reopen the camera or try another current browser.');
    recorder.onstop = () => {
      if (state.stopping && state.socket === ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'stop' }));
      else if (state.live && state.socket === ws) abortStream('Camera encoding ended unexpectedly. Reopen the camera and start again.');
    };
    ws.onmessage = event => {
      if (state.socket !== ws) return;
      let message; try { message = JSON.parse(event.data); } catch { return abortStream('Relay sent an invalid control message.'); }
      state.lastServerMessage = Date.now();
      if (message.type === 'ready') {
        state.programEnabled = message.program;
        if (ready) return; ready = true; clearTimeout(readyTimer);
        try { recorder.start(1000); } catch { return abortStream('This browser could not start live encoding. Try another camera or browser.'); }
        state.startedAt = Date.now(); state.uploaded = 0; state.lastBytes = 0; state.lastStat = Date.now(); state.live = true; state.starting = false;
        wakeLock(); updateControls(); ui?.closeDrawer(); notice('Camera upload started. Confirm Go Live in your platform’s preview.', 'success');
        state.heartbeat = setInterval(() => {
          if (state.socket !== ws || ws.readyState !== WebSocket.OPEN) return;
          if (Date.now() - state.lastServerMessage > 16000) return abortStream('Relay stopped responding. Check your network and start a new session.');
          if (state.stream?.getVideoTracks()[0]?.readyState !== 'live') return abortStream('Camera capture stopped. Reopen the camera.');
          ws.send(JSON.stringify({ type: 'ping', at: Date.now() }));
        }, 4000);
      } else if (message.type === 'error') abortStream(message.message);
      else if (message.type === 'warning') notice(message.message);
      else if (message.type === 'graphic') ui?.graphic(message.graphic);
      else if (message.type === 'stopped') { cleanupStream(); notice('Stream ended. Check that the broadcast has ended on each platform.'); }
      else if (message.type === 'destination' && DESTS.includes(message.id)) {
        $(message.id + 'Status').textContent = message.message;
        $(message.id + 'Status').className = `destination-status ${message.state === 'failed' ? 'bad' : message.state === 'sending' ? 'good' : ''}`;
        if (message.state === 'failed') notice(`${message.id}: ${message.message}`, 'error');
      } else if (message.type === 'stats') {
        if (message.graphics) { state.graphics = message.graphics; ui?.graphics(state.graphics); }
        const now = Date.now(), elapsed = (now - state.lastStat) / 1000;
        const mbps = elapsed > 0 ? Math.max(0, (message.bytes - state.lastBytes) * 8 / elapsed / 1e6) : 0;
        state.lastBytes = message.bytes; state.lastStat = now;
        health('upload', `${mbps.toFixed(1)} Mbps${message.frames > 0 ? ' · encoding' : ' · buffering'}`, message.frames > 0 ? 'good' : 'warning');
      }
    };
    ws.onerror = () => { if (state.socket === ws) abortStream('Secure upload connection failed. Check the relay address and allowed origin.'); };
    ws.onclose = () => {
      clearTimeout(readyTimer);
      if (state.socket === ws) {
        const expected = state.stopping; cleanupStream();
        notice(expected ? 'Camera upload stopped. Confirm the broadcast ended on each platform.' : 'Upload disconnected. Check the network and start a new stream.', expected ? 'info' : 'error');
      }
    };
  } catch (error) { if (!ws || state.socket === ws) abortStream(error.message); }
}
function stopStream() {
  if (!state.live || state.stopping) return;
  state.stopping = true; state.live = false; $('stopConfirm').hidden = true; updateControls();
  try {
    if (state.recorder?.state !== 'inactive') state.recorder.stop();
    else state.socket?.send(JSON.stringify({ type: 'stop' }));
  } catch { cleanupStream(); }
  const ws = state.socket;
  setTimeout(() => { if (state.socket === ws && state.stopping) { cleanupStream(); notice('Upload stopped. Confirm broadcast status in each platform.'); } }, 10000);
}
$('goLive').addEventListener('click', startStream);
$('stopLive').addEventListener('click', () => { $('stopConfirm').hidden = false; $('confirmStop').focus(); });
$('confirmStop').addEventListener('click', stopStream); $('cancelStop').addEventListener('click', () => { $('stopConfirm').hidden = true; $('stopLive').focus(); });
function exitBattery() {
  const wasOpen = !$('batteryScreen').hidden; $('batteryScreen').hidden = true; document.querySelector('main').inert = false; document.querySelector('header').inert = false;
  if (wasOpen && state.stream) { togglePreview(false); $('dimScreen').focus(); }
}
$('dimScreen').addEventListener('click', () => {
  if (!state.live) return;
  ui?.closeDrawer();
  togglePreview(true); $('batteryScreen').hidden = false; document.querySelector('main').inert = true; document.querySelector('header').inert = true;
  $('exitBattery').focus(); wakeLock();
});
$('exitBattery').addEventListener('click', exitBattery);
$('batteryScreen').addEventListener('keydown', e => { if (e.key === 'Tab') { e.preventDefault(); $('exitBattery').focus(); } if (e.key === 'Escape') exitBattery(); });
setInterval(() => {
  if (!state.live && !state.stopping) return;
  const time = duration((Date.now() - state.startedAt) / 1000); $('timer').textContent = time; $('dimTimer').textContent = time;
  if (state.score && !state.score.stale && Date.now() - state.score.fetchedAt > 30000) renderScore({ score: { ...state.score, stale: true }, error: 'Score feed delayed.' });
}, 1000);
document.addEventListener('visibilitychange', () => {
  feed.visibilityChanged();
  if (document.visibilityState === 'visible') { if (state.live) wakeLock(); }
  else if (state.live) notice('Keep this page visible. Mobile browsers can pause the camera when you switch apps or lock the phone.');
});
window.addEventListener('offline', () => { if (state.live || state.starting) abortStream('Internet connection lost. Reconnect and start a new stream.'); });
window.addEventListener('beforeunload', event => { if (state.live || state.starting || state.stopping) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('pagehide', event => { if (event.persisted) feed.pause(); else feed.stop(); if (state.live || state.starting) cleanupStream(); if (!state.live && !state.starting) closeCamera(); });
window.addEventListener('pageshow', event => { if (event.persisted && feed.ids) feed.visibilityChanged(); });
function toggleGuide(show) { $('guide').hidden = !show; $('guideToggle').setAttribute('aria-expanded', String(show)); if (show) $('guide').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
$('guideToggle').addEventListener('click', () => toggleGuide($('guide').hidden)); $('closeGuide').addEventListener('click', () => toggleGuide(false));
ui = installStudio({ state, api, notice, sendControl, openCamera, updateControls, togglePreview });
youtubeUI = installYouTube({ state, api, notice, refreshInfo: async () => { state.info = await api('/api/info'); renderRelay(); } });
homeUI = installHome({ state, ui, loadMatch: loadSelectedMatch, notice, openCamera });
setupUI = installStreamSetup({ state, api, ui, updateControls, openCamera, refreshInfo: async () => { state.info = await api('/api/info'); renderRelay(); } });
renderRelay(); updateControls();
document.documentElement.dataset.ready = 'true';
