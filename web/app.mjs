import { PROFILES, SIZES, captureReady, parseMatch, relayOrigin, chooseMime, clampZoom, duration, preflight } from './core.mjs';
import { createFeed, archiveBase } from './feed.mjs';
import { installStudio } from './studio.mjs';

let ui = null;
const $ = id => document.getElementById(id);
const DESTS = ['youtube', 'facebook', 'instagram'];

const state = {
  stream: null, camera: null, zoom: null, recorder: null, socket: null, session: null,
  relay: '', info: null, pollTimer: null, live: false, starting: false, stopping: false,
  cameraBusy: false, connecting: false, previewOff: false, startedAt: 0, uploaded: 0,
  lastBytes: 0, lastStat: 0, lastServerMessage: 0, heartbeat: null, wake: null,
  sessionExpiry: 0, captureResolution: '1080', programEnabled: false,
  automation: { bufferSeconds: 0, clips: [], cards: null }, monitorClip: false
};

const saved = key => { try { return localStorage.getItem(`boundary.${key}`) || ''; } catch { return ''; } };
const save = (key, value) => { try { localStorage.setItem(`boundary.${key}`, value); } catch {} };

// Initialize settings from localStorage
if ($('relayUrl')) $('relayUrl').value = saved('relay');
if ($('clubInput')) $('clubInput').value = saved('club') || '300';
if ($('matchInput') && saved('match')) $('matchInput').value = saved('match');
if ($('leagueInput') && saved('league')) $('leagueInput').value = saved('league');
if ($('archiveUrl')) $('archiveUrl').value = saved('archive') || '';
if ($('ytKey')) $('ytKey').value = saved('ytKey') || '';
if ($('prefLang') && saved('lang')) $('prefLang').value = saved('lang');

function notice(message, type = 'info') {
  const n = $('notice');
  if (!n) return;
  n.textContent = message;
  n.className = `notice ${type}`;
  n.hidden = !message;
  $('dismissNotice').hidden = !message;
}

function health(id, text, kind = '') {
  const h = $(id + 'Health');
  const d = $(id + 'Dot');
  if (h) h.textContent = text;
  if (d) d.className = 'health-dot ' + kind;
}

function currentDestinations() {
  return DESTS.filter(id => $('dest-' + id)?.checked && state.info?.destinations.find(d => d.id === id)?.configured);
}

function issue() {
  const snap = feed.model?.latest;
  return preflight({
    connected: Boolean(state.session),
    encoderReady: state.info?.encoder.ready,
    camera: state.camera,
    destinations: currentDestinations(),
    overlay: $('overlayToggle').checked,
    score: snap,
    resolution: state.captureResolution
  });
}

function updateControls() {
  const locked = state.live || state.starting || state.stopping;
  $('goLive').disabled = Boolean(issue()) || locked || state.cameraBusy;
  $('goLive').hidden = state.live || state.stopping;
  $('stopLive').hidden = !(state.live || state.stopping);
  $('stopLive').disabled = state.stopping;
  $('stopLive').textContent = state.stopping ? 'STOPPING…' : 'LIVE';

  for (const id of ['qualitySelect', 'overlayToggle', 'relayUrl', 'relayToken', 'connectRelay', 'disconnectRelay', 'matchInput', 'clubInput', 'leagueInput', 'loadMatch']) {
    const el = $(id);
    if (el) el.disabled = locked;
  }
  $('connectRelay').disabled = locked || state.connecting;
  $('openCamera').disabled = state.cameraBusy || locked;
  $('closeCamera').disabled = !state.stream || locked || state.cameraBusy;
  $('cameraSelect').disabled = locked || !state.stream || state.cameraBusy;
  $('previewToggle').disabled = !state.stream;
  $('dimScreen').disabled = !state.live;

  for (const id of ['autoReplay', 'autoMilestones', 'autoCards', 'scorerDelay']) {
    const el = $(id);
    if (el) el.disabled = locked;
  }
  for (const id of DESTS) {
    const el = $('dest-' + id);
    if (el) el.disabled = locked || !state.info?.destinations.find(d => d.id === id)?.configured;
  }

  $('startHint').textContent = state.live
    ? 'Camera upload active. Confirm Go Live in each platform’s control room.'
    : state.stopping ? 'Finishing current broadcast…'
    : state.starting ? 'Connecting to relay encoder…'
    : issue() || 'Ready. Check your platform preview after starting.';

  const dot = document.createElement('i');
  $('streamState').replaceChildren(dot, document.createTextNode(state.live ? ' LIVE' : state.starting ? ' CONNECTING' : state.stopping ? ' STOPPING' : ' STANDBY'));
  $('streamState').classList.toggle('live', state.live);
  $('broadcastLabel').textContent = state.live ? 'CAMERA UPLOAD ACTIVE' : 'READY WHEN YOU ARE';

  ui?.update();
}

async function api(path, options = {}, authToken = state.session) {
  if (!state.relay || !authToken) throw new Error('Connect the relay first.');
  let response;
  try {
    response = await fetch(state.relay + path, {
      ...options, cache: 'no-store', credentials: 'omit', redirect: 'error',
      signal: AbortSignal.timeout(12000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}`, ...(options.headers || {}) }
    });
  } catch {
    throw new Error('Relay unreachable. Check its HTTPS address and Tailscale / network connection.');
  }
  let data;
  try { data = await response.json(); } catch { throw new Error('The address did not return a valid relay response.'); }
  if (!response.ok) {
    const error = new Error(data.error || 'Relay request failed.');
    error.payload = data;
    error.status = response.status;
    throw error;
  }
  return data;
}

function renderRelay() {
  const connected = Boolean(state.session);
  $('relayForm').hidden = connected;
  $('relayConnected').hidden = !connected;
  $('connectionBadge').replaceChildren();
  const i = document.createElement('i');
  $('connectionBadge').append(i, document.createTextNode(connected ? ' Secure relay connected' : ' Relay disconnected'));
  $('connectionBadge').classList.toggle('connected', connected);
  $('relayState').textContent = connected ? 'Connected' : 'Offline';
  $('relayState').classList.toggle('good', connected);

  for (const id of DESTS) {
    const d = state.info?.destinations.find(x => x.id === id);
    const statusEl = $(id + 'Status');
    if (statusEl) {
      statusEl.textContent = d?.configured ? 'Key configured · ready' : d?.error || 'Configure key on relay';
      statusEl.className = 'destination-status' + (d?.configured ? ' good' : '');
    }
    const resEl = $(id + 'Resolution');
    if (resEl) {
      resEl.textContent = id === 'instagram' ? '720p · portrait compatibility' : '1080p · landscape';
    }
    if (!d?.configured && $('dest-' + id)) $('dest-' + id).checked = false;
  }
  updateControls();
}

$('relayForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (state.live || state.starting || state.connecting) return;
  state.connecting = true;
  updateControls();
  let master = $('relayToken').value.trim();
  try {
    state.relay = relayOrigin($('relayUrl').value.trim());
    const identity = await api('/api/session', { method: 'POST', body: '{}' }, master);
    state.session = identity.sessionToken;
    state.sessionExpiry = identity.expiresAt;
    state.info = await api('/api/info');
    if (state.info.name !== 'Boundary relay' || !Array.isArray(state.info.destinations)) {
      throw new Error('Incompatible relay response.');
    }
    save('relay', state.relay);
    $('relayExpiry').textContent = 'Session expires ' + new Date(identity.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const available = state.info.destinations.filter(d => d.configured);
    if (available[0] && $('dest-' + available[0].id)) $('dest-' + available[0].id).checked = true;
    notice(state.info.encoder.ready ? 'Relay connected. Live stream is ready.' : state.info.encoder.error, state.info.encoder.ready ? 'success' : 'error');
  } catch (error) {
    try { if (state.session) await api('/api/logout', { method: 'POST', body: '{}' }); } catch {}
    state.session = null;
    state.info = null;
    notice(error.message, 'error');
  } finally {
    state.connecting = false;
    master = '';
    $('relayToken').value = '';
    renderRelay();
  }
});

async function disconnect() {
  if (state.live || state.starting) return;
  try { if (state.session) await api('/api/logout', { method: 'POST', body: '{}' }); } catch {}
  state.session = null;
  state.info = null;
  renderRelay();
}
$('disconnectRelay').addEventListener('click', disconnect);

// CricClubs Feed Setup (Direct Scraping + GitHub Actions archive merging)
const feed = createFeed({
  onUpdate(model, snap) {
    if (snap) {
      ui?.renderScoreOverlay(snap);
      $('scoreOverlay').hidden = !$('overlayToggle').checked;
      $('matchTitle').textContent = `${snap.batting} ${snap.runs}/${snap.wickets} (${snap.overs} ov)`;
      $('matchStatus').textContent = snap.result || `${snap.series || 'Match ' + snap.matchId} · ${snap.status.toUpperCase()}`;
      $('scoreFreshness').textContent = `Live score refreshed at ${new Date(snap.at).toLocaleTimeString()}`;
      $('dimScore').textContent = `${snap.batting} ${snap.runs}/${snap.wickets} (${snap.overs})`;
      health('score', snap.status === 'complete' ? 'Match completed' : 'CricClubs live connected', 'good');
    }
    ui?.renderScoreDrawer();
    ui?.renderStatsDrawer();
    ui?.renderClipsDrawer();
    updateControls();
  },
  onStatus(st) {
    if (!st.ok && st.error) {
      health('score', 'Score delayed: ' + st.error, 'warning');
      $('scoreFreshness').textContent = `Feed warning: ${st.error}`;
    }
  }
});

// Match loading form
$('matchForm').addEventListener('submit', async event => {
  event.preventDefault();
  const input = $('matchInput').value.trim();
  const club = $('clubInput').value.trim() || '300';
  const league = $('leagueInput').value.trim() || 'FWCWL';
  try {
    const ids = parseMatch(input, club);
    ids.league = league;
    save('club', ids.clubId);
    save('match', ids.matchId);
    save('league', league);

    const arch = $('archiveUrl').value.trim() || archiveBase();
    feed.start(ids, { archive: arch });
    notice(`CricClubs match ${ids.matchId} (Club ${ids.clubId}) loaded.`, 'success');
  } catch (err) {
    notice(err.message, 'error');
  }
});

$('overlayToggle').addEventListener('change', () => {
  $('scoreOverlay').hidden = !$('overlayToggle').checked;
  if (state.live) sendControl({ type: 'overlay', enabled: $('overlayToggle').checked });
});

function sendControl(message) {
  if (!state.live || state.socket?.readyState !== WebSocket.OPEN) {
    notice('Start live stream to send on-air commands to relay.', 'info');
    return false;
  }
  state.socket.send(JSON.stringify(message));
  return true;
}

// Camera Controls
async function openCamera(deviceId = '') {
  if (state.cameraBusy || state.live || state.starting) return;
  state.cameraBusy = true;
  updateControls();
  closeCamera(false);
  try {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('Camera access requires HTTPS.');
    }
    chooseMime(window.MediaRecorder);
    const candidates = state.captureResolution === 'auto' ? ['1080', '720', '480'] : [state.captureResolution];
    let lastError;
    for (const size of candidates) {
      const s = SIZES[size];
      const video = {
        width: { exact: s.width }, height: { exact: s.height },
        frameRate: { ideal: 30, max: 30 }, aspectRatio: { ideal: 16 / 9 },
        ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } })
      };
      if (navigator.mediaDevices.getSupportedConstraints().resizeMode) video.resizeMode = 'none';
      try {
        state.stream = await navigator.mediaDevices.getUserMedia({
          video,
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
        });
        break;
      } catch (e) {
        lastError = e;
        if (e.name !== 'OverconstrainedError') throw e;
      }
    }
    if (!state.stream) throw lastError;

    state.camera = state.stream.getVideoTracks()[0].getSettings();
    if (!captureReady(state.camera, state.captureResolution)) {
      throw new Error('Camera resolution does not match landscape. Rotate phone and reopen.');
    }
    const track = state.stream.getVideoTracks()[0];
    track.addEventListener('ended', () => {
      if (state.live || state.starting) abortStream('Camera disconnected.');
      closeCamera();
    });

    ui?.resetMonitor();
    $('cameraVideo').removeAttribute('src');
    $('cameraVideo').srcObject = state.stream;
    $('cameraVideo').hidden = false;
    await $('cameraVideo').play();

    state.previewOff = false;
    $('previewHidden').hidden = true;
    $('cameraPlaceholder').hidden = true;

    // Apply audio mute preference
    const mutePref = $('prefMute')?.checked;
    for (const a of state.stream.getAudioTracks()) a.enabled = !mutePref;

    $('cameraSpec').textContent = `${state.camera.width} × ${state.camera.height} · ${Math.round(state.camera.frameRate || 30)} fps`;
    health('video', `${state.camera.height}p camera ready`, 'good');
    setupZoom(track);
    await listCameras();
    notice('Camera ready. Keep pitch in frame on a steady tripod.', 'success');
  } catch (error) {
    closeCamera(false);
    notice(error.message, 'error');
  } finally {
    state.cameraBusy = false;
    updateControls();
  }
}

function closeCamera(update = true) {
  if (state.live || state.starting) return;
  if (state.stream) {
    for (const t of state.stream.getTracks()) t.stop();
  }
  state.stream = null;
  state.camera = null;
  state.zoom = null;
  ui?.resetMonitor();
  $('cameraVideo').srcObject = null;
  $('cameraVideo').hidden = true;
  $('cameraPlaceholder').hidden = false;
  $('previewHidden').hidden = true;
  $('cameraSpec').textContent = `${state.captureResolution === 'auto' ? 'Auto' : state.captureResolution + 'p'} target · 30 fps`;
  health('video', 'Camera off');
  setupZoom(null);
  if (update) updateControls();
}

async function listCameras() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const sel = $('cameraSelect');
  sel.replaceChildren();
  devices.filter(d => d.kind === 'videoinput').forEach((d, i) => {
    const opt = document.createElement('option');
    opt.value = d.deviceId;
    opt.textContent = d.label || `Camera ${i + 1}`;
    opt.selected = d.deviceId === state.camera?.deviceId;
    sel.append(opt);
  });
}

function setupZoom(track) {
  const z = track?.getCapabilities?.().zoom;
  state.zoom = z && Number.isFinite(z.max) && z.max > z.min ? z : null;
  const available = Boolean(state.zoom);
  for (const id of ['zoomSlider', 'zoomMinus', 'zoomPlus']) $(id).disabled = !available;
  for (const button of $('zoomPresets').querySelectorAll('button')) {
    const n = Number(button.dataset.zoom);
    button.disabled = !available || n < z.min || n > z.max;
  }
  if (available) {
    $('zoomSlider').min = z.min;
    $('zoomSlider').max = z.max;
    $('zoomSlider').step = z.step || 0.1;
    displayZoom(track.getSettings().zoom ?? z.min);
    $('zoomHelp').textContent = 'Native camera zoom. Optical magnification provides maximum detail.';
    $('zoomType').textContent = 'Native optical zoom';
  } else {
    displayZoom(1);
    $('zoomType').textContent = 'Zoom unavailable';
    $('zoomHelp').textContent = track ? 'This browser does not expose camera zoom.' : 'Open camera to check zoom support.';
  }
}

function displayZoom(value) {
  $('zoomSlider').value = value;
  $('zoomValue').textContent = `${Number(value).toFixed(1)}x`;
  for (const b of $('zoomPresets').querySelectorAll('button')) {
    b.classList.toggle('active', Math.abs(Number(b.dataset.zoom) - value) < 0.06);
  }
}

let pendingZoom = null, zoomApplying = false;
async function zoom(value) {
  if (!state.zoom || !state.stream) return;
  pendingZoom = clampZoom(value, state.zoom);
  if (zoomApplying) return;
  zoomApplying = true;
  try {
    while (pendingZoom !== null && state.zoom && state.stream) {
      const next = pendingZoom;
      pendingZoom = null;
      const track = state.stream.getVideoTracks()[0];
      await track.applyConstraints({ advanced: [{ zoom: next }] });
      state.camera = track.getSettings();
      displayZoom(state.camera.zoom ?? next);
    }
  } catch (e) {
    notice('Zoom error: ' + e.message, 'error');
  } finally {
    zoomApplying = false;
    updateControls();
  }
}

$('openCamera').addEventListener('click', () => openCamera());
$('closeCamera').addEventListener('click', () => closeCamera());
$('cameraSelect').addEventListener('change', e => openCamera(e.target.value));
$('zoomPresets').addEventListener('click', e => {
  const b = e.target.closest('button[data-zoom]');
  if (b && !b.disabled) zoom(b.dataset.zoom);
});
$('zoomSlider').addEventListener('input', e => zoom(e.target.value));
$('zoomMinus').addEventListener('click', () => zoom(Number($('zoomSlider').value) - 0.1));
$('zoomPlus').addEventListener('click', () => zoom(Number($('zoomSlider').value) + 0.1));
$('gridToggle').addEventListener('click', () => {
  $('framingGuide').hidden = !$('framingGuide').hidden;
  $('gridToggle').setAttribute('aria-pressed', String(!$('framingGuide').hidden));
});

function togglePreview(off) {
  state.previewOff = off;
  $('previewHidden').hidden = !off;
  $('previewToggle').setAttribute('aria-pressed', String(off));
  if (off) $('cameraVideo').pause();
  else if (state.stream) $('cameraVideo').play().catch(() => {});
  ui?.update();
}
$('previewToggle').addEventListener('click', () => togglePreview(!state.previewOff));
$('showPreview').addEventListener('click', () => togglePreview(false));

// Settings preferences
$('prefMute').addEventListener('change', () => {
  const muted = $('prefMute').checked;
  for (const track of state.stream?.getAudioTracks() || []) track.enabled = !muted;
  notice(muted ? 'Microphone muted' : 'Microphone unmuted', 'info');
});
$('prefLowLatency').addEventListener('change', () => {
  feed.setSeconds($('prefLowLatency').checked ? 5 : 10);
});
$('prefCaptions').addEventListener('change', () => {
  if (feed.model?.latest) ui?.renderScoreOverlay(feed.model.latest);
});
$('prefLang').addEventListener('change', () => {
  save('lang', $('prefLang').value);
  if (feed.model?.latest) ui?.renderScoreOverlay(feed.model.latest);
  ui?.renderScoreDrawer();
});
$('clearHistory').addEventListener('click', () => {
  feed.clear();
  notice('Local match ball history cleared.', 'success');
});

// Battery saver mode
function exitBattery() {
  $('batteryScreen').hidden = true;
  document.querySelector('main').inert = false;
  if (state.stream) togglePreview(false);
}
$('dimScreen').addEventListener('click', () => {
  if (!state.live) return;
  ui?.closeDrawer();
  togglePreview(true);
  $('batteryScreen').hidden = false;
  document.querySelector('main').inert = true;
  $('exitBattery').focus();
});
$('exitBattery').addEventListener('click', exitBattery);

// Streaming to Relay (FFmpeg / Ingest)
async function wakeLock() {
  if (!navigator.wakeLock || document.visibilityState !== 'visible') return;
  try {
    if (!state.wake) {
      state.wake = await navigator.wakeLock.request('screen');
      state.wake.addEventListener('release', () => { state.wake = null; });
    }
  } catch {}
}

function cleanupStream() {
  ui?.renderGraphic(null);
  state.automation = { bufferSeconds: 0, clips: [], cards: null };
  ui?.renderAutomation(state.automation);
  clearInterval(state.heartbeat);
  state.heartbeat = null;
  if (state.recorder && state.recorder.state !== 'inactive') {
    state.recorder.ondataavailable = null;
    try { state.recorder.stop(); } catch {}
  }
  state.recorder = null;
  state.live = false;
  state.starting = false;
  state.stopping = false;
  if (state.socket) {
    const ws = state.socket;
    state.socket = null;
    if (ws.readyState < WebSocket.CLOSING) ws.close(1000, 'Stream ended');
  }
  if (state.wake) { state.wake.release().catch(() => {}); state.wake = null; }
  exitBattery();
  $('stopConfirm').hidden = true;
  health('upload', 'Upload idle');
  updateControls();
}

function abortStream(message) {
  cleanupStream();
  notice(message, 'error');
}

async function startStream() {
  if (state.stream) state.camera = state.stream.getVideoTracks()[0]?.getSettings();
  const problem = issue();
  if (problem) return notice(problem, 'error');
  if (state.starting || state.live || state.stopping) return;
  state.starting = true;
  updateControls();
  let ws;
  try {
    const mimeType = chooseMime(window.MediaRecorder);
    const profile = PROFILES[$('qualitySelect').value] || PROFILES.balanced;
    const qualityScale = state.camera.height >= 1080 ? 1 : state.camera.height >= 720 ? 0.56 : 0.25;
    const recorder = new MediaRecorder(state.stream, {
      mimeType,
      videoBitsPerSecond: Math.round(profile.bitrate * qualityScale),
      audioBitsPerSecond: 128_000
    });
    state.recorder = recorder;
    const { ticket } = await api('/api/ticket', { method: 'POST', body: '{}' });
    const address = new URL('/ingest', state.relay);
    address.protocol = address.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(address);
    state.socket = ws;
    ws.binaryType = 'arraybuffer';

    let ready = false;
    const readyTimer = setTimeout(() => {
      if (state.socket === ws && !ready) abortStream('Relay encoder timeout.');
    }, 12000);

    ws.onopen = () => {
      if (state.socket !== ws) return;
      ws.send(JSON.stringify({
        type: 'start', ticket, destinations: currentDestinations(), mimeType: recorder.mimeType,
        width: state.camera.width, height: state.camera.height, resolution: state.captureResolution,
        overlay: $('overlayToggle').checked,
        automation: {
          replay: $('autoReplay').checked, milestones: $('autoMilestones').checked,
          cards: $('autoCards').checked, scorerDelay: Number($('scorerDelay').value)
        }
      }));
    };

    recorder.ondataavailable = ev => {
      if (!ev.data.size || state.socket !== ws) return;
      if (ws.readyState !== WebSocket.OPEN) return abortStream('Upload disconnected.');
      ws.send(ev.data);
      state.uploaded += ev.data.size;
    };

    recorder.onerror = () => abortStream('Recorder encoding error.');
    recorder.onstop = () => {
      if (state.stopping && state.socket === ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'stop' }));
      }
    };

    ws.onmessage = ev => {
      if (state.socket !== ws) return;
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      state.lastServerMessage = Date.now();

      if (msg.type === 'ready') {
        state.programEnabled = msg.program;
        if (ready) return;
        ready = true;
        clearTimeout(readyTimer);
        recorder.start($('prefLowLatency')?.checked ? 500 : 1000);
        state.startedAt = Date.now();
        state.uploaded = 0;
        state.live = true;
        state.starting = false;
        wakeLock();
        updateControls();
        notice('Live broadcast started to configured destinations.', 'success');
        state.heartbeat = setInterval(() => {
          if (state.socket !== ws || ws.readyState !== WebSocket.OPEN) return;
          ws.send(JSON.stringify({ type: 'ping', at: Date.now() }));
        }, 4000);
      } else if (msg.type === 'error') abortStream(msg.message);
      else if (msg.type === 'warning') notice(msg.message, 'warning');
      else if (msg.type === 'graphic') ui?.renderGraphic(msg.graphic);
      else if (msg.type === 'automation') {
        state.automation = msg.automation;
        ui?.renderAutomation(state.automation);
      } else if (msg.type === 'stopped') {
        cleanupStream();
        notice('Broadcast stopped.', 'info');
      } else if (msg.type === 'stats') {
        if (msg.automation) {
          state.automation = msg.automation;
          ui?.renderAutomation(state.automation);
        }
        health('upload', `${msg.frames > 0 ? 'Live streaming' : 'Buffering'} · ${((state.uploaded * 8) / 1e6).toFixed(1)} Mb`, 'good');
      }
    };

    ws.onclose = () => {
      clearTimeout(readyTimer);
      if (state.socket === ws) cleanupStream();
    };
  } catch (err) {
    abortStream(err.message);
  }
}

function stopStream() {
  if (!state.live || state.stopping) return;
  state.stopping = true;
  state.live = false;
  $('stopConfirm').hidden = true;
  updateControls();
  try {
    if (state.recorder?.state !== 'inactive') state.recorder.stop();
    else state.socket?.send(JSON.stringify({ type: 'stop' }));
  } catch {
    cleanupStream();
  }
  const ws = state.socket;
  setTimeout(() => {
    if (state.socket === ws && state.stopping) cleanupStream();
  }, 10000);
}

$('goLive').addEventListener('click', startStream);
$('stopLive').addEventListener('click', () => {
  $('stopConfirm').hidden = false;
  $('confirmStop').focus();
});
$('confirmStop').addEventListener('click', stopStream);
$('cancelStop').addEventListener('click', () => { $('stopConfirm').hidden = true; });

// Live Timer tick
setInterval(() => {
  if (!state.live && !state.stopping) return;
  const t = duration((Date.now() - state.startedAt) / 1000);
  $('timer').textContent = t;
  $('dimTimer').textContent = t;
}, 1000);

// Setup guide toggle
function toggleGuide(show) {
  $('guide').hidden = !show;
  $('guideToggle').setAttribute('aria-expanded', String(show));
}
$('guideToggle').addEventListener('click', () => toggleGuide($('guide').hidden));
$('closeGuide').addEventListener('click', () => toggleGuide(false));

// Initialize UI
ui = installStudio({
  state,
  api,
  notice,
  sendControl,
  openCamera,
  updateControls,
  togglePreview,
  feed
});

renderRelay();
updateControls();

// Initial match load (Match 986, Club 300, FWCWL)
const initClub = saved('club') || '300';
const initMatch = saved('match') || '986';
const initLeague = saved('league') || 'FWCWL';
feed.start({ clubId: initClub, matchId: initMatch, league: initLeague }, { archive: saved('archive') || archiveBase() });
