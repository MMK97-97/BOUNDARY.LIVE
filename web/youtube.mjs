const $ = id => document.getElementById(id);
const localDate = date => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
export function installYouTube({ state, api, notice, refreshInfo }) {
  let data = null, busy = false, popup = null, pending = null, authorizationChannel = null, timeout = null, identity = null, polling = false, requestId = null, titleTouched = false, autoWatch = null;
  $('ytSchedule').value = localDate(new Date(Date.now() + 5 * 60000));
  $('ytTimezone').textContent = 'Schedule timezone: ' + Intl.DateTimeFormat().resolvedOptions().timeZone;
  $('ytTitle').addEventListener('input', () => { titleTouched = true; });
  const locked = () => state.live || state.starting || state.stopping;
  const post = (path, value = {}) => api('/api/youtube/' + path, { method: 'POST', body: JSON.stringify(value), timeoutMs: 60000 });
  function clearAuth() { clearTimeout(timeout); timeout = null; pending = null; authorizationChannel?.close(); authorizationChannel = null; try { popup?.close(); } catch {} popup = null; }
  function accept(value) {
    if (identity !== state.session) { identity = state.session; clearAuth(); requestId = null; busy = false; data = null; }
    data = value; if (data?.setup?.requestId) requestId = data.setup.requestId; update();
  }
  function update() {
    const b = data?.broadcast, connected = Boolean(data?.connected), disabled = !state.session || busy || locked();
    $('ytConnect').disabled = disabled || !data?.configured || data?.authorizing; $('ytConnect').hidden = connected;
    $('ytCancelAuth').hidden = !pending && !data?.authorizing;
    $('ytDisconnect').hidden = !connected; $('ytDisconnect').disabled = disabled;
    $('ytConfiguration').hidden = Boolean(data?.configured); $('ytAccountState').textContent = !state.session ? 'Connect relay first' : connected ? 'Account connected' : 'Not connected';
    $('ytChannel').textContent = data?.channel?.title || 'Your channel. Your broadcast.';
    $('ytSetupHelp').textContent = !state.session ? 'Connect your laptop relay in Settings before linking YouTube.' : data?.configurationError || 'Sign in with Google to the channel you want to stream. Tokens and ingestion keys stay in relay memory.';
    for (const name of ['ytTitle', 'ytDescription', 'ytPrivacy', 'ytSchedule', 'ytAudience']) $(name).disabled = disabled || !connected || Boolean(data?.setup);
    $('ytCreate').disabled = disabled || !connected || data?.setup?.stage === 'ready' || data?.setup?.uncertain;
    $('ytCreate').textContent = busy ? 'Working…' : data?.setup?.stage === 'ready' ? 'Setup ready' : data?.setup ? 'Retry setup' : 'Create YouTube setup';
    if (!titleTouched && !data?.setup && state.score) $('ytTitle').value = `${state.score.batting} vs ${state.score.bowling} · ${state.score.series || 'Live cricket'}`.slice(0, 100);
    $('ytCapture').textContent = `Capture: ${state.camera?.height ? state.camera.height + 'p' : state.captureResolution === 'auto' ? 'Auto' : state.captureResolution + 'p'} · 30 fps program. YouTube detects the incoming format.`;
    $('ytEvent').hidden = !b;
    $('ytOperation').textContent = data?.setup && data.setup.stage !== 'ready' ? `Setup stage: ${data.setup.stage}${data.setup.uncertain ? ' · result unconfirmed; review Studio before New setup' : ''}` : '';
    $('ytError').textContent = data?.error || '';
    $('ytNew').hidden = !data?.setup; $('ytNew').disabled = disabled || ['live', 'testing', 'liveStarting', 'testStarting'].includes(b?.state);
    if (b) {
      if (!$('watchUrl').value || $('watchUrl').value === autoWatch) { $('watchUrl').value = b.watchUrl; autoWatch = b.watchUrl; try { localStorage.setItem('boundary.watch', b.watchUrl); } catch {} }
      $('ytEventTitle').textContent = b.title; $('ytEventState').textContent = b.state; $('ytEventPrivacy').textContent = b.privacy;
      $('ytSignal').textContent = b.streamStatus; $('ytHealth').textContent = b.health; $('ytKeyState').textContent = b.keyReady ? 'Ready · kept on relay' : 'Not available for upload';
      $('ytIssues').textContent = b.issues?.length ? 'YouTube checks: ' + b.issues.join(', ') : 'Check the platform preview for video, score and audio.';
      $('ytWatch').href = b.watchUrl; $('ytStudio').href = b.studioUrl;
      $('ytPreview').disabled = busy || b.streamStatus !== 'active' || !['ready', 'created'].includes(b.state);
      $('ytGoLive').disabled = busy || b.streamStatus !== 'active' || !['ready', 'testing'].includes(b.state);
      $('ytEnd').disabled = busy || !['live', 'testing', 'liveStarting', 'testStarting'].includes(b.state);
      $('ytRefresh').disabled = busy;
    }
  }
  async function action(work, message) {
    if (busy) return; const session = state.session; busy = true; update();
    try { const result = await work(); if (state.session !== session) return; if (result?.connected != null) data = result; await refreshInfo(); if (message) notice(message, 'success'); }
    catch (e) { if (state.session === session) { notice(e.message, 'error'); try { data = await api('/api/youtube/status'); } catch {} } }
    finally { if (state.session === session) { busy = false; update(); } }
  }
  function cancelSignIn(message) { clearAuth(); busy = false; if (state.session) action(() => post('auth/cancel'), message); else update(); }
  $('ytConnect').addEventListener('click', async () => {
    if (busy || locked() || !state.session) return;
    clearAuth(); popup = window.open('about:blank', '_blank', 'popup,width=520,height=740');
    if (!popup) return notice('Allow popups for this studio, then connect YouTube again.', 'error');
    const session = state.session; busy = true; update();
    try {
      const flow = await post('auth/start'); if (session !== state.session) return clearAuth();
      const u = new URL(flow.authorizationUrl); if (u.origin !== 'https://accounts.google.com' || !/^[A-Za-z0-9_-]{43}$/.test(flow.state)) throw new Error('Relay returned an invalid Google sign-in URL.');
      pending = { state: flow.state, session };
      if (typeof BroadcastChannel === 'function') { authorizationChannel = new BroadcastChannel('boundary.youtube.' + flow.state); authorizationChannel.onmessage = e => { if (e.origin === location.origin) completeSignIn(e.data); }; }
      popup.location.replace(u.href);
      update();
      timeout = setTimeout(() => cancelSignIn('Google sign-in timed out. Connect again when ready.'), 5 * 60000);
      notice('Complete Google sign-in in the opened window, then return to this studio.');
    } catch (e) { clearAuth(); busy = false; try { if (session === state.session) { await post('auth/cancel'); await refreshInfo(); } } catch {} update(); notice(e.message, 'error'); }
  });
  $('ytCancelAuth').addEventListener('click', () => cancelSignIn('Google sign-in cancelled.'));
  async function completeSignIn(v) {
    if (!pending || v?.type !== 'boundary:youtube-oauth' || v.state !== pending.state || pending.session !== state.session) return;
    const returned = { state: pending.state, ...(v.error ? { error: 'denied' } : { code: typeof v.code === 'string' ? v.code.slice(0, 4097) : '' }) };
    clearAuth(); busy = false;
    await action(() => post('auth/complete', returned), 'YouTube connected. Complete your broadcast details below.');
  }
  window.addEventListener('message', event => { if (event.origin === location.origin && event.source === popup) completeSignIn(event.data); });
  $('ytBroadcastForm').addEventListener('submit', event => {
    event.preventDefault(); if (locked() || !data?.connected) return;
    requestId ||= [...crypto.getRandomValues(new Uint8Array(24))].map(v => v.toString(16).padStart(2, '0')).join('');
    const at = new Date($('ytSchedule').value); if (!Number.isFinite(at.getTime())) return notice('Choose a valid scheduled start time.', 'error');
    const audience = $('ytAudience').value; if (!['true', 'false'].includes(audience)) return notice('Choose the audience declaration.', 'error');
    action(() => post('setup', { requestId, title: $('ytTitle').value, description: $('ytDescription').value, privacy: $('ytPrivacy').value,
      scheduledStartTime: at.toISOString(), madeForKids: audience === 'true' }), 'YouTube setup is ready. Close the panel and press START to send the camera.');
  });
  $('ytDisconnect').addEventListener('click', () => action(async () => { const result = await post('disconnect'); clearAuth(); data = null; requestId = null; if (!result.revoked) notice('Disconnected locally. Google revocation could not be confirmed; remove this app in your Google account connections if needed.'); }, null));
  $('ytRefresh').addEventListener('click', () => action(() => api('/api/youtube/status')));
  for (const [button, target, message] of [['ytPreview', 'testing', 'YouTube preview requested. Check its monitor player in YouTube Studio.'], ['ytGoLive', 'live', 'YouTube Go live requested. Check status and public playback.']]) $(button).addEventListener('click', () => action(() => post('transition', { state: target }), message));
  $('ytEnd').addEventListener('click', () => { $('ytEndConfirm').hidden = false; });
  $('ytEndNo').addEventListener('click', () => { $('ytEndConfirm').hidden = true; });
  $('ytEndYes').addEventListener('click', () => { $('ytEndConfirm').hidden = true; action(() => post('transition', { state: 'complete' }), 'YouTube end requested. Other selected destinations continue.'); });
  $('ytNew').addEventListener('click', () => { $('ytNewConfirm').hidden = false; $('ytReviewed').checked = false; $('ytNewYes').disabled = true; });
  $('ytReviewed').addEventListener('change', () => { $('ytNewYes').disabled = !$('ytReviewed').checked; });
  $('ytNewNo').addEventListener('click', () => { $('ytNewConfirm').hidden = true; });
  $('ytNewYes').addEventListener('click', () => { if (!$('ytReviewed').checked || locked()) return; $('ytNewConfirm').hidden = true; action(async () => { const r = await post('reset'); requestId = null; return r; }, 'Ready for new event details. Previous events remain in YouTube Studio.'); });
  setInterval(async () => {
    if (!state.session || !data?.connected || busy || polling || document.hidden) return; const session = state.session; polling = true;
    try { const next = await api('/api/youtube/status'); if (session === state.session) { data = next; update(); } } catch (e) { if (session === state.session) $('ytError').textContent = e.message; }
    finally { polling = false; }
  }, 15000);
  return { accept, update };
}
