import { installInterface } from './interface.mjs';
import { openNativeCamera, captureProfile, programSize } from './capture.mjs';
import { PROFILES, effectiveBitrate, captureReady, parseMatch, relayOrigin, chooseMime, clampZoom, duration, preflight } from './core.mjs';
import { installStudio } from './studio.mjs';
import { installYouTube } from './youtube.mjs';
import { createFeed, fetchPublicSchedule } from './feed.mjs';
import { parseLeagueScheduleInput, sortScheduleMatches, filterScheduleMatches } from './cricclubs-schedule.mjs';
import { subscribeRelayScores } from './score-live.mjs';
import { installHome } from './home.mjs';
import { installStreamSetup } from './stream-setup.mjs';
import { CRICCLUBS_LEAGUES, knownLeague } from './cricclubs-reference.mjs';
import { installMatchSelection } from './match-setup.mjs';
import { installSavedStudio } from './saved-studio.mjs';
import { installStudioAccount } from './studio-account.mjs';
import { calculateEquation } from './score-graphic.mjs';
let ui = null;
let youtubeUI = null;
let homeUI = null;
let setupUI = null;
let matchUI = null;
let savedUI = null;
let accountUI = null;
let interfaceUI = null;
let audioCtx = null, audioAnalyser = null, audioSource = null, audioTimer = null, audioBuf = null;
const $ = id => document.getElementById(id);
const DESTS = ['youtube', 'facebook', 'instagram'];
const state = { stream: null, camera: null, zoom: null, recorder: null, socket: null, session: null,
  relay: '', info: null, score: null, pollTimer: null, polling: false, live: false, starting: false, stopping: false,
  cameraBusy: false, connecting: false, micMuted: false, previewOff: false, startedAt: 0, uploaded: 0, lastBytes: 0,
  lastStat: 0, lastServerMessage: 0, heartbeat: null, wake: null, sessionExpiry: 0, closedByUser: false,
  captureResolution: '1080', graphics: { cards: null, current: null }, overlayStyle: 'gold', overlayTicker: '',
  rttMs: null, uploadMbps: 0, batteryLevel: null, batteryCharging: false, torchSupported: false, torchOn: false,
  coolMode: false, autoDim: false, scheduleLoading: false, scheduleMatches: [], scheduleClubId: '', scheduleLeague: '', scheduleNote: '', scheduleFilter: 'all', scheduleQuery: '' };
// Remove the obsolete build's browser-stored platform key; new credentials stay in relay memory.
try { localStorage.removeItem('boundary.ytKey'); } catch {}
const saved = key => { try { return localStorage.getItem(`mk97.${key}`) || ''; } catch { return ''; } };
const save = (key, value) => { try { localStorage.setItem(`mk97.${key}`, value); } catch {} };
$('relayUrl').value = saved('relay'); $('clubInput').value = saved('club') || '300';
if (saved('match')) $('matchInput').value = saved('match');
state.overlayStyle = saved('overlayStyle') || 'gold';
state.overlayTicker = saved('ticker') || '';
state.coolMode = saved('coolMode') === '1';
state.autoDim = saved('autoDim') === '1';
if ($('coolModeToggle')) $('coolModeToggle').checked = state.coolMode;
if ($('autoDimBattery')) $('autoDimBattery').checked = state.autoDim;
function notice(message, type = 'info') { $('notice').textContent = message; $('notice').className = `notice ${type}`; $('notice').hidden = !message; $('dismissNotice').hidden = !message; }
function updateTelemetryHud() {
  const parts = [];
  if (state.live) parts.push(`${state.uploadMbps.toFixed(1)} Mbps`);
  if (state.live && state.rttMs != null) parts.push(`${state.rttMs} ms`);
  if (state.coolMode) parts.push('Cool 24fps');
  if (state.batteryLevel != null) parts.push(`🔋 ${Math.round(state.batteryLevel * 100)}%${state.batteryCharging ? '⚡' : ''}`);
  if ($('telemetryHud')) {
    $('telemetryHud').textContent = parts.join(' · ');
    $('telemetryHud').hidden = parts.length === 0;
    $('telemetryHud').className = 'telemetry-hud' + (state.live ? (state.rttMs > 450 ? ' warning' : ' good') : '');
  }
  if ($('dimTelemetry')) $('dimTelemetry').textContent = parts.length ? parts.join('  ·  ') : 'Upload active';
}
function health(id, text, kind = '') { $(id + 'Health').textContent = text; $(id + 'Dot').className = 'health-dot ' + kind; }
function currentDestinations() { return DESTS.filter(id => $('dest-' + id).checked && state.info?.destinations.find(d => d.id === id)?.configured); }
function issue() {
  if (state.session && $('overlayToggle').checked && state.score && state.scoreTransport !== 'relay') return 'Load this match on the relay, or turn off the score overlay.';
  return preflight({ connected: Boolean(state.session), encoderReady: state.info?.encoder.ready,
    camera: state.camera, destinations: currentDestinations(), overlay: $('overlayToggle').checked, score: state.score, resolution: state.captureResolution });
}
function updateControls() {
  const locked = state.live || state.starting || state.stopping;
  $('goLive').disabled = locked || state.cameraBusy || state.scoreLoading || state.connecting || Boolean(state.destinationBusy) || Boolean(state.youtubeBusy);
  $('goLive').setAttribute('aria-label', issue() ? 'Set up stream before starting' : 'Start camera upload');
  $('goLive').hidden = state.live || state.stopping;
  $('stopLive').hidden = !(state.live || state.stopping);
  $('stopLive').disabled = state.stopping;
  $('stopLive').textContent = state.stopping ? 'Stopping…' : '■ Stop stream';
  for (const id of ['qualitySelect', 'overlayToggle', 'relayUrl', 'relayToken', 'connectRelay', 'disconnectRelay', 'matchInput', 'clubInput', 'loadMatch']) $(id).disabled = locked || Boolean(state.destinationBusy);
  $('connectRelay').disabled = locked || state.connecting || Boolean(state.destinationBusy);
  $('overlayToggle').disabled = locked && (!state.live || !state.programEnabled);
  for (const id of ['autoMilestones', 'autoCards', 'autoStingers']) if ($(id)) $(id).disabled = locked;
  if ($('torchToggle')) {
    $('torchToggle').disabled = !state.stream || !state.torchSupported;
    $('torchToggle').setAttribute('aria-pressed', String(state.torchOn));
    $('torchToggle').textContent = state.torchSupported ? (state.torchOn ? '🔦 Torch on' : '🔦 Torch off') : '🔦 Torch unavailable';
  }
  updateTelemetryHud();
  if ($('coolModeToggle')) $('coolModeToggle').disabled = locked || state.cameraBusy;
  if ($('coolPresetBtn')) $('coolPresetBtn').disabled = locked || state.cameraBusy;
  if ($('allowScheduledToggle')) $('allowScheduledToggle').disabled = locked || Boolean(state.scoreLoading);
  document.body.classList.toggle('eco-streaming', Boolean(state.coolMode && (state.live || state.starting)));
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
  syncAudioMeterState();
  ui?.update();
  youtubeUI?.update();
  homeUI?.update();
  setupUI?.update();
  matchUI?.update();
  savedUI?.update();
  accountUI?.update();
  interfaceUI?.update();
}
async function api(path, options = {}, authToken = state.session) {
  const deviceRequest = ['/api/device/restore', '/api/device/link','/api/account/status','/api/account/login','/api/account/register','/api/account/recover'].includes(path);
  if (!state.relay || !authToken && !deviceRequest) throw new Error('Connect the relay first.');
  let response;
  const { timeoutMs = 12000, ...requestOptions } = options;
  try {
    response = await fetch(state.relay + path, { ...requestOptions, cache: 'no-store', credentials: state.relay === location.origin ? 'same-origin' : 'omit',
      redirect: 'error', signal: AbortSignal.timeout(Math.max(1000, Math.min(60000, timeoutMs))),
      headers: { 'Content-Type': 'application/json', ...(authToken ? {Authorization: `Bearer ${authToken}`} : {}), 'X-MK97-Origin': location.origin, ...(options.headers || {}) } });
  } catch { throw new Error('Relay unreachable. Check its HTTPS address, internet connection and ALLOWED_ORIGINS setting.'); }
  let data; try { data = await response.json(); } catch { throw new Error('The address did not return a MK97 relay response.'); }
  if (!response.ok) {
    const error = new Error(data.error || 'Relay request failed.'); error.payload = data; error.status = response.status; throw error;
  }
  return data;
}
function renderRelay() {
  youtubeUI?.accept(state.info?.youtube || null);
  savedUI?.accept(state.info);
  accountUI?.accept(state.info);
  const connected = Boolean(state.session);
  const cloudVersion = state.info?.version;
  $('relayVersion').textContent = connected ? `Cloud reader ${cloudVersion || 'unknown version'} · MK97 website 1.9.0${cloudVersion !== '1.9.0' ? ' · Deploy v1.9.0 to Render to use the matching update.' : ''}` : '';
  $('relayForm').hidden = connected; $('relayConnected').hidden = !connected;
  $('connectionBadge').replaceChildren(); const i = document.createElement('i');
  $('connectionBadge').append(i, document.createTextNode(connected ? ' Secure relay connected' : ' Relay disconnected'));
  $('connectionBadge').classList.toggle('connected', connected);
  $('relayState').textContent = connected ? 'Connected' : 'Offline'; $('relayState').classList.toggle('good', connected);
  for (const id of DESTS) {
    const d = state.info?.destinations.find(x => x.id === id);
    if (!state.live) $(id + 'Status').textContent = d?.configured ? d.mode === 'account' ? 'YouTube account setup ready' : d.mode === 'saved' ? 'Saved studio key · ready' : d.mode === 'session' ? 'Temporary session key · ready' : 'Server key configured · ready' : d?.error || 'Add a stream key or connect an account';
    $(id + 'Status').className = 'destination-status' + (d?.configured ? ' good' : '');
    $(id + 'Resolution').textContent = id === 'instagram' ? (d?.resolution?.startsWith('1080') ? '1080p · portrait (check acceptance)' : '720p · portrait compatibility') : '1080p · landscape';
    if (!d?.configured) $('dest-' + id).checked = false;
  }
  updateControls();
}
async function connectIdentity(identity, quiet = false) {
  const previousSession=state.session,info=await api('/api/info',{},identity.sessionToken);if(state.session!==previousSession)return;
  if (info.name !== 'MK97 relay' || !Array.isArray(info.destinations)) throw new Error('Incompatible relay response.');
  state.session = identity.sessionToken; state.sessionExpiry = identity.expiresAt;const session=state.session;
  state.info = info; save('relay', state.relay); $('relayUrl').value = state.relay;
  $('relayExpiry').textContent = identity.remembered ? 'Remembered until ' + new Date(identity.deviceExpiresAt).toLocaleDateString() :
    'Session expires ' + new Date(identity.expiresAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
  const preferences = info.savedStudio?.preferences || {};
  if (!state.camera && !state.live && ['auto','1080','720','480'].includes(preferences.resolution)) state.captureResolution = preferences.resolution;
  if (['balanced','detail'].includes(preferences.quality)) $('qualitySelect').value = preferences.quality;
  for (const [key,id] of [['overlay','overlayToggle'],['milestones','autoMilestones'],['cards','autoCards']]) if (typeof preferences[key] === 'boolean') $(id).checked = preferences[key];
  if (typeof preferences.watchUrl === 'string') $('watchUrl').value = preferences.watchUrl;
  for (const id of DESTS) $('dest-' + id).checked = Boolean(info.destinations.find(d=>d.id===id)?.configured && preferences.destinations?.includes(id));
  if (!Array.isArray(preferences.destinations)) { const first = info.destinations.find(d=>d.configured); if (first) $('dest-'+first.id).checked = true; }
  renderRelay(); savedUI?.synced();
  if (!quiet) notice(info.encoder.ready ? identity.remembered ? 'Studio connected and remembered on this device.' : 'Studio connected for this session.' : info.encoder.error, info.encoder.ready ? 'success' : 'error');
  refreshLeagueSchedule({ clubId: $('clubInput').value || '300' });
  if (!feed.ids && preferences.match) {
    try { const ref = preferences.match; if (ref.league) save('league.' + ref.clubId, ref.league); await loadSelectedMatch(ref.matchId, ref.clubId); } catch (e) { if (session === state.session) notice(e.message,'error'); }
  } else await feed.changeSource();
}
$('relayForm').addEventListener('submit', async event => {
  event.preventDefault(); if (state.live || state.starting || state.connecting) return;
  const remember = $('rememberDevice').checked && !$('rememberDevice').disabled;
  state.connecting = true; updateControls(); let master = $('relayToken').value.trim();
  try {
    state.relay = relayOrigin($('relayUrl').value.trim());
    const identity = await api('/api/session', {method:'POST', body:JSON.stringify({remember,deviceName:$('deviceName').value}), timeoutMs:60000}, master);
    await connectIdentity(identity);
  } catch (error) {
    state.session = null; state.info = null; notice(error.message, 'error');
  } finally { state.connecting = false; master = ''; $('relayToken').value = ''; renderRelay(); }
});
async function clearConnection() {
  state.session = null; state.info = null; state.score = null; renderScore(null); renderRelay(); await feed.changeSource();
}
async function disconnect() {
  if (state.live || state.starting || state.connecting) return;
  try { if (state.session) await api('/api/logout', {method:'POST',body:'{}'}); }
  catch (e) { notice('Sign-out could not be confirmed. ' + e.message,'error'); return; }
  await clearConnection(); notice('This device is signed out. Saved studio connections remain available to your other linked devices.');
}
$('disconnectRelay').addEventListener('click', disconnect);
function renderScore(result) {
  const prevStatus = state.score?.status, prevMatch = state.score ? `${state.score.clubId}:${state.score.matchId}` : '';
  const s = result?.score || null; state.score = s; state.scoreError = result?.error || ''; state.scoreTransport = result?.transport || state.scoreTransport || '';
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
  const sameMatch = prevMatch === `${s.clubId}:${s.matchId}`;
  if (sameMatch && prevStatus === 'scheduled' && s.status === 'live') {
    notice(`Match ${s.matchId} is now LIVE on CricClubs! (${s.batting} ${s.runs}/${s.wickets})`, 'success');
    if (state.session && !s.cards?.complete && s.scorecard?.state !== 'complete' && s.scorecard?.state !== 'blocked') {
      api('/api/score/scrape', { method: 'POST', body: '{}' }).then(scraped => {
        if (scraped?.score && state.score?.matchId === scraped.score.matchId && state.score?.clubId === scraped.score.clubId) {
          renderScore({ ...result, ...scraped, transport: 'relay' });
        }
      }).catch(() => {});
    }
  }
  youtubeUI?.syncFromMatch?.(s);
  const delayed = s.stale || Date.now() - s.fetchedAt > 30000;
  const eq = calculateEquation(s);
  $('overlayTeam').textContent = s.batting || '—';
  $('overlayRuns').textContent = eq.isScheduled ? 'VS' : `${s.runs}/${s.wickets}`;
  $('overlayOvers').textContent = eq.isScheduled ? (s.stats?.date || 'Scheduled') : `${s.overs} ov`;
  $('overlayRate').textContent = eq.isScheduled ? `Match ${s.matchId}` : eq.crr ? `CRR ${eq.crr}` : '';
  if ($('battingLogo')) $('battingLogo').textContent = (s.batting || 'CC').slice(0, 3).toUpperCase();
  if ($('bowlingLogo')) $('bowlingLogo').textContent = (s.bowling || 'CC').slice(0, 3).toUpperCase();
  if (eq.isScheduled) {
    $('overlayStatus').textContent = delayed ? 'SCORE DELAYED' : 'MATCH SCHEDULED';
    $('requiredRate').textContent = 'SCHEDULED';
    $('requiredRate').hidden = false;
    $('overlayDetail').textContent = s.detail || s.stats?.date || 'Waiting for CricClubs live scoring';
    $('oppositionTeam').textContent = s.bowling || 'OPPOSITION';
  } else if (eq.isChasing) {
    $('overlayStatus').textContent = delayed ? 'SCORE DELAYED' : eq.isComplete ? 'MATCH COMPLETE' : s.superOver ? 'SUPER OVER' : '2ND INNINGS · CHASE';
    $('requiredRate').textContent = eq.rrr ? `RRR ${eq.rrr}` : (eq.target ? `TARGET ${eq.target}` : 'RRR —');
    $('requiredRate').hidden = false;
    $('overlayDetail').textContent = eq.isComplete ? (s.result || 'MATCH COMPLETE') : eq.runsNeeded !== null ? (eq.runsNeeded === 0 ? 'SCORES LEVEL' : `NEED ${eq.runsNeeded} RUNS FROM ${eq.ballsLeft}b`) : (s.detail || `TARGET ${eq.target || '—'}`);
    $('oppositionTeam').textContent = eq.oppTeam ? `${eq.oppTeam.code || eq.oppTeam.name} ${eq.oppTeam.runs}/${eq.oppTeam.wickets}` : (s.bowling ? `v ${s.bowling}` : 'OPPOSITION');
  } else {
    $('overlayStatus').textContent = delayed ? 'SCORE DELAYED' : eq.isComplete ? 'MATCH COMPLETE' : s.superOver ? 'SUPER OVER' : '1ST INNINGS · BATTING FIRST';
    $('requiredRate').textContent = `PROJ ${eq.projected}`;
    $('requiredRate').hidden = false;
    $('overlayDetail').textContent = eq.isComplete ? (s.result || 'MATCH COMPLETE') : `1ST INNINGS · PROJ ${eq.projected} (${eq.maxOvers} OV)`;
    $('oppositionTeam').textContent = s.bowling ? `${s.bowling} (YET TO BAT)` : 'YET TO BAT';
  }
  const b0 = s.batters?.[0];
  if ($('batter1Name')) $('batter1Name').textContent = b0 ? b0.name.slice(0, 18) : '—';
  if ($('batter1Runs')) $('batter1Runs').textContent = b0 ? `${b0.runs || 0} (${b0.balls || 0})` : '—';
  const b1 = s.batters?.[1];
  if ($('batter2Name')) $('batter2Name').textContent = b1 ? b1.name.slice(0, 18) : '—';
  if ($('batter2Runs')) $('batter2Runs').textContent = b1 ? `${b1.runs || 0} (${b1.balls || 0})` : '—';
  const bw = s.bowler || s.bowlers?.[0];
  if ($('bowlerName')) $('bowlerName').textContent = bw ? bw.name.slice(0, 18) : '—';
  if ($('bowlerFigures')) $('bowlerFigures').textContent = bw ? `${bw.wickets ?? 0}/${bw.runs ?? 0} (${bw.overs ?? 0} ov)` : '—';
  if ($('overBalls')) {
    $('overBalls').replaceChildren();
    const balls = Array.isArray(s.balls) && s.balls.length
      ? s.balls.slice(-6)
      : Array.isArray(s.stats?.recentBalls) && s.stats.recentBalls.length
        ? s.stats.recentBalls.slice(-6)
        : Array.isArray(s.recentBalls) && s.recentBalls.length
          ? s.recentBalls.slice(-6)
          : [];
    for (const b of balls) {
      const span = document.createElement('span');
      span.className = 'ball' + (b === 'W' ? ' wicket' : b === '4' || b === '6' ? ' boundary' : '');
      span.textContent = b;
      $('overBalls').append(span);
    }
  }
  $('scoreOverlay').classList.toggle('delayed', delayed);
  $('matchTitle').textContent = eq.isScheduled ? `${s.batting} vs ${s.bowling} · Scheduled` : `${s.batting} ${s.runs}/${s.wickets} · ${s.overs} ov`;
  const teams = s.teams?.map(t => `${t.code} ${t.runs}/${t.wickets} (${t.overs})`).join(' · ');
  $('matchStatus').textContent = result?.error || (eq.isScheduled ? ([s.stats?.date, s.ground, 'Waiting for live scoring (polls every 3s)'].filter(Boolean).join(' · ')) : teams) || `${s.source} · Match ${s.matchId} · ${s.status === 'complete' ? 'Completed' : 'Feed connected'}`;
  $('scoreFreshness').textContent = `${delayed ? 'Last successful fetch' : 'Fetched'} ${new Date(s.fetchedAt).toLocaleTimeString()} · ${result.delivery === 'push' ? 'live relay link · source checks' : 'refresh'} every ${result.pollSeconds || (eq.isScheduled ? 3 : 5)}s${s.partialView ? ' · limited CricClubs view' : ''}`;
  $('dimScore').textContent = eq.isScheduled ? `${s.batting} vs ${s.bowling} · Scheduled` : `${s.batting} ${s.runs}/${s.wickets} (${s.overs})${delayed ? ' · delayed' : ''}`;
  ui?.score(s);
  health('score', delayed ? 'Score delayed' : eq.isScheduled ? 'Match scheduled · auto-live' : s.status === 'complete' ? 'Match complete' : 'Score connected', delayed ? 'warning' : 'good');
  updateControls();
  renderScheduleLists();
}
const feed = createFeed({
  onUpdate: result => { renderScore(result); if (result?.status === 401) notice('Relay session expired. Disconnect and reconnect in Settings.', 'error'); },
  getRelay: () => state.session ? { session: state.session, request: api,
    subscribe: (ids, callbacks) => subscribeRelayScores({ relay: state.relay, session: state.session, origin: location.origin, ids, ...callbacks }) } : null,
  visible: () => document.visibilityState === 'visible' || state.live
});
async function pollScore() { return feed.refresh(); }
function renderScheduleLists() {
  const all = state.scheduleMatches || [];
  const list = filterScheduleMatches(all, { filter: state.scheduleFilter, query: state.scheduleQuery });
  const activeKey = state.score ? `${state.score.clubId}:${state.score.matchId}` : '';
  const statusText = state.scheduleLoading
    ? `Scanning Club ${$('clubInput').value || '300'} schedule on CricClubs…`
    : all.length
      ? `${list.length} of ${all.length} match${all.length === 1 ? '' : 'es'} shown for Club ${state.scheduleClubId || $('clubInput').value}. Tap any match to load.`
      : (state.scheduleNote || 'No recent matches discovered automatically. Enter a Match ID above or paste CricClubs schedule text.');
  for (const statusId of ['homeScheduleStatus', 'matchScheduleStatus']) {
    if ($(statusId)) $(statusId).textContent = statusText;
  }
  for (const filterBoxId of ['homeScheduleFilters', 'matchScheduleFilters']) {
    const box = $(filterBoxId);
    if (!box) continue;
    for (const pill of box.querySelectorAll('[data-schedule-filter]')) {
      pill.setAttribute('aria-pressed', String(pill.dataset.scheduleFilter === (state.scheduleFilter || 'all')));
    }
  }
  for (const rootId of ['homeScheduleList', 'matchScheduleList']) {
    const root = $(rootId);
    if (!root) continue;
    root.replaceChildren();
    if (all.length && !list.length) {
      const empty = document.createElement('p');
      empty.className = 'helper';
      empty.textContent = 'No matches match this filter. Try "All" or clear search.';
      root.append(empty);
      continue;
    }
    for (const m of list) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'schedule-card' + (activeKey === `${m.clubId}:${m.matchId}` ? ' active' : '');
      const head = document.createElement('div');
      head.className = 'schedule-card-head';
      const badge = document.createElement('span');
      badge.className = 'schedule-badge ' + (m.status || 'scheduled');
      badge.textContent = m.status === 'live' ? '🔴 LIVE' : m.status === 'complete' ? '✓ FINAL' : '📅 SCHEDULED';
      const idSpan = document.createElement('span');
      idSpan.textContent = `Match #${m.matchId}`;
      head.append(badge, idSpan);
      const teams = document.createElement('div');
      teams.className = 'schedule-teams';
      teams.textContent = `${m.team1 || 'Team A'} vs ${m.team2 || 'Team B'}`;
      const meta = document.createElement('div');
      meta.className = 'schedule-meta';
      const scoreSummary = [m.t1Score ? `${m.t1Code || 'T1'} ${m.t1Score}` : '', m.t2Score ? `${m.t2Code || 'T2'} ${m.t2Score}` : ''].filter(Boolean).join(' · ');
      meta.textContent = [scoreSummary, m.date, m.ground, m.result, m.series].filter(Boolean).join(' · ') || `${m.league || 'CricClubs'} · Club ${m.clubId}`;
      btn.append(head, teams, meta);
      btn.addEventListener('click', async () => {
        if (state.live || state.starting || state.stopping || state.scoreLoading) {
          notice('Stop the current broadcast before switching matches.', 'error');
          return;
        }
        try {
          if (m.league) save('league.' + m.clubId, m.league);
          const loaded = await loadSelectedMatch(m.matchId, m.clubId, { allowScheduled: true, fromSchedule: true, scheduleHint: m });
          notice(`Loaded ${m.team1} vs ${m.team2} (Match ${m.matchId})${loaded?.score?.status === 'scheduled' ? ' · waiting for live start' : ''}.`, 'success');
        } catch (err) {
          notice(err.message, 'error');
        }
      });
      root.append(btn);
    }
  }
}

let scheduleEpoch = 0;
async function refreshLeagueSchedule({ clubId = $('clubInput').value, league = '', force = false } = {}) {
  const club = String(clubId || '').trim();
  if (!/^[1-9][0-9]{0,11}$/.test(club)) return;
  const resolvedLeague = league || saved('league.' + club) || knownLeague(club)?.league || 'FWCWL';
  const gen = ++scheduleEpoch;
  state.scheduleLoading = true;
  state.scheduleNote = '';
  renderScheduleLists();
  matchUI?.update();
  try {
    const res = state.session
      ? await api('/api/league/schedule', { method: 'POST', body: JSON.stringify({ clubId: club, league: resolvedLeague, force }), timeoutMs: 20000 })
      : await fetchPublicSchedule({ clubId: club, league: resolvedLeague, force });
    if (gen !== scheduleEpoch) return;
    state.scheduleClubId = res.clubId || club;
    state.scheduleLeague = res.league || resolvedLeague;
    state.scheduleMatches = res.matches || [];
    state.scheduleNote = state.scheduleMatches.length ? '' : 'No active matches returned for this club. Enter a Match ID manually or paste schedule text.';
  } catch (err) {
    if (gen !== scheduleEpoch) return;
    state.scheduleClubId = club;
    state.scheduleLeague = resolvedLeague;
    state.scheduleMatches = [];
    state.scheduleNote = err?.message || 'Could not scan CricClubs schedule directly. Enter a Match ID above or paste your schedule.';
  } finally {
    if (gen === scheduleEpoch) {
      state.scheduleLoading = false;
      renderScheduleLists();
      matchUI?.update();
    }
  }
}

$('homePasteSchedule')?.addEventListener('click', () => {
  if ($('homeSchedulePasteBox')) {
    const nextHidden = !$('homeSchedulePasteBox').hidden;
    $('homeSchedulePasteBox').hidden = nextHidden;
    if (!nextHidden) $('homeSchedulePasteText')?.focus();
  }
});
for (const filterBoxId of ['homeScheduleFilters', 'matchScheduleFilters']) {
  $(filterBoxId)?.addEventListener('click', event => {
    const btn = event.target.closest('button[data-schedule-filter]');
    if (!btn) return;
    state.scheduleFilter = btn.dataset.scheduleFilter || 'all';
    renderScheduleLists();
  });
}
$('homeScheduleSearch')?.addEventListener('input', event => {
  state.scheduleQuery = event.target.value || '';
  renderScheduleLists();
});

$('homeSchedulePasteApply')?.addEventListener('click', () => {
  try {
    const club = $('clubInput').value.trim() || '300';
    const league = saved('league.' + club) || knownLeague(club)?.league || 'FWCWL';
    const parsed = parseLeagueScheduleInput($('homeSchedulePasteText')?.value || '', { clubId: club, league });
    const existing = new Map((state.scheduleMatches || []).map(m => [`${m.clubId}:${m.matchId}`, m]));
    for (const item of parsed) {
      const k = `${item.clubId}:${item.matchId}`;
      const prev = existing.get(k);
      existing.set(k, prev ? { ...prev, ...item, status: prev.status !== 'scheduled' ? prev.status : item.status } : item);
    }
    state.scheduleClubId = club;
    state.scheduleLeague = league;
    state.scheduleMatches = sortScheduleMatches([...existing.values()]);
    state.scheduleNote = '';
    if ($('homeSchedulePasteBox')) $('homeSchedulePasteBox').hidden = true;
    renderScheduleLists();
    notice(`Added ${parsed.length} match${parsed.length === 1 ? '' : 'es'} from pasted schedule.`, 'success');
  } catch (err) {
    notice(err.message, 'error');
  }
});

async function loadSelectedMatch(input, club, opts = {}) {
  if (state.live || state.starting || state.stopping || state.scoreLoading) throw new Error('Stop the current upload before changing matches.');
  const rawInput = String(input || '').trim();
  const isUrl = /^https?:/i.test(rawInput);
  let ids = parseMatch(rawInput, club, saved('league.' + club) || knownLeague(club)?.league);
  state.scoreLoading = true; state.graphics.cards = null;
  const league = opts.scheduleHint?.league || ids.league || knownLeague(ids.clubId)?.league;
  if (league) { ids = { ...ids, league }; save('league.' + ids.clubId, league); }
  const allowScheduled = opts.allowScheduled ?? Boolean($('allowScheduledToggle')?.checked ?? true);
  const hint = opts.scheduleHint || state.scheduleMatches?.find(m => m.clubId === ids.clubId && m.matchId === ids.matchId) || null;
  matchUI?.accept(ids);
  save('club', ids.clubId); save('match', ids.matchId); updateControls();
  try {
    const useScheduledDirect = Boolean(opts.fromSchedule || isUrl || hint);
    let result = await feed.select(ids, useScheduledDirect && (allowScheduled || hint) ? { allowScheduled, ...(hint ? { scheduleHint: hint } : {}) } : null);
    if (!result?.score && !isUrl && !opts.fromSchedule) {
      for (const candidate of CRICCLUBS_LEAGUES) {
        if (candidate.clubId === ids.clubId) continue;
        const altIds = { clubId: candidate.clubId, matchId: ids.matchId, league: candidate.league };
        const altResult = await feed.select(altIds);
        if (altResult?.score) {
          ids = altIds;
          result = altResult;
          matchUI?.accept(ids);
          save('league.' + ids.clubId, ids.league);
          save('club', ids.clubId); save('match', ids.matchId);
          break;
        }
      }
      if (!result?.score) {
        if (allowScheduled) {
          result = await feed.select(ids, { allowScheduled: true, ...(hint ? { scheduleHint: hint } : {}) });
        } else {
          await feed.select(ids);
        }
      }
    }
    if (!result?.score) throw new Error(result?.error || 'No score data was returned.');
    if (result.score.status !== 'scheduled' && state.session && !result.score.cards?.complete && result.score.scorecard?.state !== 'complete' && result.score.scorecard?.state !== 'blocked') {
      api('/api/score/scrape', { method: 'POST', body: '{}' }).then(scraped => {
        if (scraped?.score && state.score?.matchId === scraped.score.matchId && state.score?.clubId === scraped.score.clubId) {
          renderScore({ ...result, ...scraped, transport: 'relay' });
        }
      }).catch(() => {});
    }
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
    state.stream = await openNativeCamera(navigator.mediaDevices, state.captureResolution, deviceId, matchMedia('(orientation: portrait)').matches, { frameRate: state.coolMode ? 24 : 30 });
    state.camera = state.stream.getVideoTracks()[0].getSettings();
    const track = state.stream.getVideoTracks()[0];
    track.addEventListener('ended', () => { if (state.live || state.starting) abortStream('Camera was disconnected. Reopen it and start a new stream.'); closeCamera(); });
    ui?.resetMonitor(); $('cameraVideo').removeAttribute('src'); $('cameraVideo').srcObject = state.stream; $('cameraVideo').hidden = false; await $('cameraVideo').play();
    state.previewOff = false; $('previewHidden').hidden = true; $('previewToggle').setAttribute('aria-pressed', 'false');
    $('previewToggle').textContent = '◐ Hide preview'; $('cameraPlaceholder').hidden = true;
    for (const audio of state.stream.getAudioTracks()) audio.enabled = !state.micMuted;
    const caps = track.getCapabilities?.() || {};
    state.torchSupported = Boolean(caps.torch); state.torchOn = false;
    startAudioMeter(state.stream);
    $('cameraSpec').textContent = `${state.camera.width} × ${state.camera.height} · ${Math.round(state.camera.frameRate || (state.coolMode ? 24 : 30))} fps${state.coolMode ? ' · Cool' : ''}`;
    health('video', `${captureProfile(state.camera)}p camera ready`, 'good'); setupZoom(track);
    await listCameras().catch(() => {});
    notice('Camera ready. Use a tripod behind the bowler’s arm and keep the full pitch in frame.', 'success');
  } catch (error) {
    closeCamera(false);
    const messages = { NotAllowedError: 'Camera or microphone permission was denied. Allow both in your browser settings, then try again.',
      NotFoundError: 'No camera or microphone was found.', NotReadableError: 'Camera is in use by another app. Close that app and try again.',
      OverconstrainedError: 'This camera cannot supply the selected native resolution. Try another rear camera, or choose Auto before streaming.' };
    notice(messages[error.name] || error.message, 'error');
  } finally { state.cameraBusy = false; updateControls(); }
}
function closeCamera(update = true) {
  if (state.live || state.starting) return;
  if (state.stream) for (const track of state.stream.getTracks()) track.stop();
  stopAudioMeter();
  state.stream = null; state.camera = null; state.zoom = null; state.torchSupported = false; state.torchOn = false;
  ui?.resetMonitor();
  $('cameraVideo').srcObject = null; $('cameraVideo').hidden = true; $('cameraPlaceholder').hidden = false; $('previewHidden').hidden = true;
  $('cameraSpec').textContent = `${state.captureResolution === 'auto' ? 'Auto' : state.captureResolution + 'p'} target · ${state.coolMode ? '24 fps (Cool)' : '30 fps'}`; health('video', 'Camera off');
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
  syncAudioMeterState();
});
$('torchToggle')?.addEventListener('click', async () => {
  const track = state.stream?.getVideoTracks?.()[0];
  if (!track || !state.torchSupported) return;
  const next = !state.torchOn;
  try {
    await track.applyConstraints({ advanced: [{ torch: next }] });
    state.torchOn = next;
    updateControls();
  } catch (e) { notice('Torch unavailable on this camera: ' + e.message, 'error'); }
});
function stopAudioMeter() {
  clearInterval(audioTimer); audioTimer = null;
  try { audioSource?.disconnect(); } catch {}
  try { audioCtx?.close(); } catch {}
  audioCtx = null; audioAnalyser = null; audioSource = null; audioBuf = null;
  if ($('audioMeterFill')) $('audioMeterFill').style.width = '0%';
  if ($('audioPeakLabel')) $('audioPeakLabel').textContent = state.micMuted ? 'Mic muted' : 'Mic idle';
}
function syncAudioMeterState() {
  if (!audioCtx || !audioAnalyser) {
    if ($('audioMeterFill')) $('audioMeterFill').style.width = '0%';
    if ($('audioPeakLabel')) $('audioPeakLabel').textContent = state.micMuted ? 'Mic muted' : 'Mic idle';
    return;
  }
  const shouldPause = state.micMuted || document.hidden || (state.coolMode && state.previewOff);
  if (shouldPause) {
    if (audioCtx.state === 'running') audioCtx.suspend().catch(() => {});
    if ($('audioMeterFill')) $('audioMeterFill').style.width = '0%';
    if ($('audioPeakLabel')) $('audioPeakLabel').textContent = state.micMuted ? 'Mic muted' : 'Paused (Cool saver)';
  } else if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
}
function startAudioMeter(stream) {
  stopAudioMeter();
  if (!stream?.getAudioTracks?.().length) return;
  const Ctx = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!Ctx) return;
  try {
    audioCtx = new Ctx();
    audioAnalyser = audioCtx.createAnalyser();
    audioAnalyser.fftSize = 256;
    audioSource = audioCtx.createMediaStreamSource(stream);
    audioSource.connect(audioAnalyser);
    audioBuf = new Uint8Array(audioAnalyser.frequencyBinCount);
    audioTimer = setInterval(() => {
      if (!audioAnalyser || state.micMuted || document.hidden || (state.coolMode && state.previewOff)) return;
      audioAnalyser.getByteTimeDomainData(audioBuf);
      let peak = 0;
      for (let i = 0; i < audioBuf.length; i++) {
        const amp = Math.abs(audioBuf[i] - 128) / 128;
        if (amp > peak) peak = amp;
      }
      const pct = Math.min(100, Math.round(peak * 140));
      if ($('audioMeterFill')) $('audioMeterFill').style.width = `${pct}%`;
      if ($('audioPeakLabel')) $('audioPeakLabel').textContent = pct >= 92 ? 'CLIPPING' : pct > 55 ? 'Strong signal' : pct > 8 ? 'Active' : 'Quiet';
    }, 120);
    syncAudioMeterState();
  } catch { stopAudioMeter(); }
}
$('gridToggle').addEventListener('click', () => { $('framingGuide').hidden = !$('framingGuide').hidden; $('gridToggle').setAttribute('aria-pressed', String(!$('framingGuide').hidden)); });
function togglePreview(off) {
  state.previewOff = off; $('previewHidden').hidden = !off; $('previewToggle').setAttribute('aria-pressed', String(off));
  $('previewToggle').textContent = off ? '◉ Show preview' : '◐ Hide preview';
  if (off) { $('cameraVideo').pause(); $('cameraVideo').hidden = true; }
  else {
    if (state.stream) { $('cameraVideo').hidden = false; $('cameraVideo').play().catch(() => notice('Tap Show preview again to resume the preview.')); }
    if (state.coolMode && state.score) ui?.score(state.score);
  }
  syncAudioMeterState();
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
  clearInterval(state.heartbeat); state.heartbeat = null; clearTimeout(autoDimTimer); autoDimTimer = null;
  if (state.recorder && state.recorder.state !== 'inactive') { state.recorder.ondataavailable = null; try { state.recorder.stop(); } catch {} }
  state.recorder = null; state.live = false; state.starting = false; state.stopping = false;
  if (state.socket) { const ws = state.socket; state.socket = null; if (ws.readyState < WebSocket.CLOSING) ws.close(1000, 'Camera upload ended'); }
  if (state.wake) { state.wake.release().catch(() => {}); state.wake = null; }
  state.rttMs = null; state.uploadMbps = 0;
  exitBattery(); $('stopConfirm').hidden = true; health('upload', 'Upload idle'); updateControls();
}
function abortStream(message) { cleanupStream(); notice(message, 'error'); }
async function startStream() {
  if (state.stream) state.camera = state.stream.getVideoTracks()[0]?.getSettings();
  const problem = issue(); if (problem) { ui?.panel('settings'); $('startHint').textContent = problem; return; }
  if (state.starting || state.live || state.stopping || state.destinationBusy || state.youtubeBusy) return;
  const capture = { ...state.camera };
  state.programCanvas = programSize(capture);
  state.starting = true; state.closedByUser = false; updateControls();
  let ws;
  try {
    const mimeType = chooseMime(window.MediaRecorder);
    // Construct before claiming a relay session; unsupported codec options fail early.
    const nativeProfile = captureProfile(capture);
    const bitrate = effectiveBitrate($('qualitySelect').value, nativeProfile, Boolean(state.coolMode));
    const recorder = new MediaRecorder(state.stream, { mimeType, videoBitsPerSecond: bitrate, audioBitsPerSecond: state.coolMode ? 64_000 : 128_000 });
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
        width: capture.width, height: capture.height, resolution: state.captureResolution, coolMode: Boolean(state.coolMode), framing: state.framing || 'fit', overlay: $('overlayToggle').checked, overlayStyle: state.overlayStyle || 'gold', ticker: state.overlayTicker || '',
        match: state.score ? { clubId: state.score.clubId, matchId: state.score.matchId } : null,
        automation: { milestones: $('autoMilestones').checked, cards: $('autoCards').checked, stingers: Boolean($('autoStingers')?.checked ?? true) } }));
    };
    recorder.ondataavailable = event => {
      if (!event.data.size || state.socket !== ws) return;
      if (ws.readyState !== WebSocket.OPEN) return abortStream('Upload connection was lost. Start a new stream after reconnecting.');
      if (ws.bufferedAmount + event.data.size > 12 * 1024 * 1024) return abortStream('Upload cannot keep up with the selected quality. Improve your connection or choose Balanced, then restart.');
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
        try { recorder.start(state.coolMode ? 2000 : 1000); } catch { return abortStream('This browser could not start live encoding. Try another camera or browser.'); }
        state.startedAt = Date.now(); state.uploaded = 0; state.lastBytes = 0; state.lastStat = Date.now(); state.live = true; state.starting = false;
        wakeLock(); updateControls(); resetAutoDimTimer(); ui?.closeDrawer(); notice('Camera upload started. Confirm Go Live in your platform’s preview.', 'success');
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
      } else if (message.type === 'pong') {
        if (typeof message.at === 'number') state.rttMs = Math.max(0, Date.now() - message.at);
        updateTelemetryHud();
      } else if (message.type === 'stats') {
        if (message.graphics) { state.graphics = message.graphics; ui?.graphics(state.graphics); }
        const now = Date.now(), elapsed = (now - state.lastStat) / 1000;
        const mbps = elapsed > 0 ? Math.max(0, (message.bytes - state.lastBytes) * 8 / elapsed / 1e6) : 0;
        state.lastBytes = message.bytes; state.lastStat = now; state.uploadMbps = mbps;
        health('upload', `${mbps.toFixed(1)} Mbps${message.frames > 0 ? ' · encoding' : ' · buffering'}`, message.frames > 0 ? 'good' : 'warning');
        updateTelemetryHud();
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
let autoDimTimer = null;
function openBatteryScreen() {
  if (!state.live) return;
  clearTimeout(autoDimTimer); autoDimTimer = null;
  ui?.closeDrawer();
  togglePreview(true); $('batteryScreen').hidden = false; document.querySelector('main').inert = true; document.querySelector('header').inert = true;
  $('exitBattery').focus(); wakeLock();
}
function resetAutoDimTimer() {
  clearTimeout(autoDimTimer); autoDimTimer = null;
  if (!state.live || !state.autoDim || !$('batteryScreen').hidden) return;
  autoDimTimer = setTimeout(() => {
    if (state.live && state.autoDim && $('batteryScreen').hidden) openBatteryScreen();
  }, 45000);
}
function exitBattery() {
  const wasOpen = !$('batteryScreen').hidden; $('batteryScreen').hidden = true; document.querySelector('main').inert = false; document.querySelector('header').inert = false;
  if (wasOpen && state.stream) { togglePreview(false); $('dimScreen').focus(); }
  resetAutoDimTimer();
}
$('dimScreen').addEventListener('click', openBatteryScreen);
for (const ev of ['pointerdown', 'keydown']) document.addEventListener(ev, () => { if (state.live && state.autoDim && $('batteryScreen').hidden) resetAutoDimTimer(); }, { passive: true });
async function setCoolMode(enabled) {
  state.coolMode = Boolean(enabled);
  save('coolMode', state.coolMode ? '1' : '0');
  if ($('coolModeToggle')) $('coolModeToggle').checked = state.coolMode;
  updateControls();
  if (state.stream && !state.live && !state.starting && !state.stopping) await openCamera(state.camera?.deviceId || '');
  else notice(state.coolMode ? 'Cool & Battery Saver enabled (24 fps, hardware codec & lower heat).' : 'Standard 30 fps capture restored.', 'info');
}
$('coolModeToggle')?.addEventListener('change', () => setCoolMode($('coolModeToggle').checked));
$('coolPresetBtn')?.addEventListener('click', async () => {
  if (state.live || state.starting || state.stopping || state.cameraBusy) return;
  state.captureResolution = '720';
  $('qualitySelect').value = 'balanced';
  state.autoDim = true; save('autoDim', '1');
  if ($('autoDimBattery')) $('autoDimBattery').checked = true;
  await setCoolMode(true);
  notice('720p Cool Stream Preset applied (24 fps · 2.0 Mbps · auto OLED dim).', 'success');
});
$('autoDimBattery')?.addEventListener('change', () => {
  state.autoDim = Boolean($('autoDimBattery').checked);
  save('autoDim', state.autoDim ? '1' : '0');
  resetAutoDimTimer();
});
$('exitBattery').addEventListener('click', exitBattery);
$('batteryScreen').addEventListener('click', e => { if (e.target.id === 'batteryScreen') exitBattery(); });
$('batteryScreen').addEventListener('keydown', e => { if (e.key === 'Tab') { e.preventDefault(); $('exitBattery').focus(); } if (e.key === 'Escape') exitBattery(); });
setInterval(() => {
  if (!state.live && !state.stopping) return;
  const time = duration((Date.now() - state.startedAt) / 1000); $('timer').textContent = time; $('dimTimer').textContent = time;
  if (state.score && !state.score.stale && Date.now() - state.score.fetchedAt > 30000) renderScore({ score: { ...state.score, stale: true }, error: 'Score feed delayed.' });
}, 1000);
document.addEventListener('visibilitychange', () => {
  feed.visibilityChanged();
  syncAudioMeterState();
  if (document.visibilityState === 'visible') { if (state.live) wakeLock(); }
  else if (state.live) notice('Keep this page visible. Mobile browsers can pause the camera when you switch apps or lock the phone.');
});
window.addEventListener('offline', () => { if (state.live || state.starting) abortStream('Internet connection lost. Reconnect and start a new stream.'); });
window.addEventListener('beforeunload', event => { if (state.live || state.starting || state.stopping) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('pagehide', event => { if (event.persisted) feed.pause(); else feed.stop(); if (state.live || state.starting) cleanupStream(); if (!state.live && !state.starting) closeCamera(); });
window.addEventListener('pageshow', event => { if (event.persisted && feed.ids) feed.visibilityChanged(); });
function toggleGuide(show) { $('guide').hidden = !show; $('guideToggle').setAttribute('aria-expanded', String(show)); if (show) $('guide').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
$('guideToggle').addEventListener('click', () => toggleGuide($('guide').hidden)); $('closeGuide').addEventListener('click', () => toggleGuide(false));
ui = installStudio({ state, api, notice, sendControl, openCamera, updateControls, togglePreview, onPanel: name => interfaceUI?.opened(name), onClosePanel: () => interfaceUI?.closed(), onBackPanel: () => interfaceUI?.back() });
async function refreshInfo() {
  const owner = state.session, next = await api('/api/info');
  if (owner === state.session) { state.info = next; renderRelay(); }
}
youtubeUI = installYouTube({ state, api, notice, refreshInfo, updateControls, closePanel: () => homeUI.openStudio() });
homeUI = installHome({ state, ui, loadMatch: loadSelectedMatch, notice, openCamera, onView: view => interfaceUI?.viewChanged(view) });
setupUI = installStreamSetup({ state, api, ui, updateControls, openCamera: () => { homeUI.openStudio(); return openCamera(); }, returnToStudio: () => homeUI.openStudio(), refreshInfo });
matchUI = installMatchSelection({ state, onLeagueSelected: ({ clubId, league }) => refreshLeagueSchedule({ clubId, league }), onRefreshSchedule: () => refreshLeagueSchedule({ force: true }) });
accountUI=installStudioAccount({state,api,notice,updateControls,connectIdentity});
savedUI = installSavedStudio({state,api,notice,updateControls,connectIdentity,clearConnection,refreshInfo,onConfig:(config,eligible)=>accountUI.configure(config,eligible)});
interfaceUI = installInterface({ state, ui, home: homeUI, notice });
renderRelay(); updateControls();
renderScheduleLists();
document.documentElement.dataset.ready = 'true';
savedUI.discover();
refreshLeagueSchedule({ clubId: $('clubInput').value || '300' });

if (typeof navigator !== 'undefined' && navigator.getBattery) {
  navigator.getBattery().then(b => {
    const chk = () => {
      state.batteryLevel = b.level; state.batteryCharging = b.charging;
      updateTelemetryHud();
      if (b.level <= 0.20 && !b.charging && state.live) notice(`Battery low (${Math.round(b.level * 100)}%). Tap 'Battery screen' to save power.`, 'warning');
    };
    chk();
    b.addEventListener('levelchange', chk); b.addEventListener('chargingchange', chk);
  }).catch(() => {});
}

let refreshing = false;
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then(reg => {
      reg.update().catch(() => {});
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              notice('MK97 App updated to latest version! Reloading…', 'good');
              setTimeout(() => window.location.reload(), 600);
            }
          });
        }
      });
    }).catch(() => {});
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      navigator.serviceWorker.getRegistration().then(reg => reg?.update().catch(() => {}));
    }
  });
}

async function triggerAppUpdate() {
  notice('Checking for updates…', 'info');
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) await reg.update();
    }
    await fetch('./build.json?t=' + Date.now(), { cache: 'no-store' });
    notice('MK97 App updated! Reloading to latest build…', 'good');
    setTimeout(() => {
      window.location.href = window.location.origin + window.location.pathname + '?v=' + Date.now();
    }, 700);
  } catch {
    window.location.reload();
  }
}

let currentCommit = '';
async function checkBuildVersion() {
  if (typeof document !== 'undefined' && document.hidden) return;
  try {
    const res = await fetch('./build.json?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    if (!currentCommit) {
      currentCommit = data.commit || '';
      return;
    }
    if (data.commit && currentCommit && data.commit !== currentCommit) {
      notice('New MK97 update available! Reloading…', 'good');
      setTimeout(() => triggerAppUpdate(), 1000);
    }
  } catch {}
}
if (typeof window !== 'undefined') {
  checkBuildVersion();
  setInterval(checkBuildVersion, 45000);
}

let deferredInstallPrompt = null;
function isStandaloneApp() {
  return Boolean(
    (typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches) ||
    (typeof navigator !== 'undefined' && navigator.standalone === true)
  );
}
function syncInstallButtons() {
  const installed = isStandaloneApp();
  const ready = Boolean(deferredInstallPrompt);
  const label = installed ? 'Check for App Updates ↻' : ready ? 'Install MK97 App Now' : 'Download MK97 App';
  $('installAppAuthLabel').textContent = label;
  $('installAppHomeLabel').textContent = installed ? 'Check for App Updates (Latest Build) ↻' : ready ? 'Install MK97 App (1-Tap Install)' : 'Download MK97 App (Phone & Desktop)';
  $('installAppMenuLabel').textContent = label;
  $('installAppStudio').textContent = label;
  $('installAppAuth').hidden = false;
  $('installAppHome').hidden = false;
}
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  syncInstallButtons();
});
window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  $('installAppModal').hidden = true;
  syncInstallButtons();
  notice('MK97 Cricket Studio installed! Launch it anytime from your home screen.', 'good');
});
async function triggerInstallApp() {
  $('homeMenu').hidden = true;
  $('homeMenuButton').setAttribute('aria-expanded', 'false');
  $('studioMenu').hidden = true;
  $('moreButton').setAttribute('aria-expanded', 'false');
  if (isStandaloneApp()) {
    await triggerAppUpdate();
    return;
  }
  if (deferredInstallPrompt) {
    try {
      deferredInstallPrompt.prompt();
      const choice = await deferredInstallPrompt.userChoice;
      if (choice?.outcome === 'accepted') {
        deferredInstallPrompt = null;
        syncInstallButtons();
      }
      return;
    } catch {}
  }
  $('installAppModal').hidden = false;
  $('closeInstallModal').focus();
}
for (const id of ['installAppAuth', 'installAppHome', 'installAppMenu', 'installAppStudio']) {
  $(id)?.addEventListener('click', triggerInstallApp);
}
$('closeInstallModal')?.addEventListener('click', () => { $('installAppModal').hidden = true; });
$('installAppModal')?.addEventListener('keydown', e => { if (e.key === 'Escape') $('installAppModal').hidden = true; });
syncInstallButtons();
