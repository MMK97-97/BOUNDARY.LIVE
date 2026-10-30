const $ = id => document.getElementById(id);
const localDate = date => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
export function installYouTube({ state, api, notice, refreshInfo, updateControls = () => {}, closePanel = () => {} }) {
  let data = null, busy = false, popup = null, pending = null, authorizationChannel = null, timeout = null;
  let revision = 0;
  let identity = state.session, polling = false, authPolling = false, epoch = 0, requestId = null, submitted = null, titleTouched = false, autoWatch = null;
  $('ytSchedule').value = localDate(new Date(Date.now() + 5 * 60000));
  $('ytTimezone').textContent = 'Schedule timezone: ' + Intl.DateTimeFormat().resolvedOptions().timeZone;
  $('ytTitle').addEventListener('input', () => { titleTouched = true; });
  const locked = () => state.live || state.starting || state.stopping || state.destinationBusy;
  const post = (path, value = {}) => api('/api/youtube/' + path, { method: 'POST', body: JSON.stringify(value), timeoutMs: 60000 });
  function clearAuth() {
    epoch++; clearTimeout(timeout); timeout = null; pending = null;
    authorizationChannel?.close(); authorizationChannel = null;
    try { popup?.close(); } catch {} popup = null;
  }
  function setBusy(value) { if (value) revision++; busy = value; state.youtubeBusy = value; update(); updateControls(); }
  function accept(value) {
    if (identity !== state.session) {
      identity = state.session; clearAuth(); requestId = null; submitted = null; busy = false; state.youtubeBusy = false; data = null;
      $('ytEndConfirm').hidden = true; $('ytNewConfirm').hidden = true;
    }
    data = value;
    if (data?.setup) {
      requestId = data.setup.requestId;
      if (data.setup.details) {
        submitted = { ...data.setup.details, requestId };
        $('ytTitle').value = submitted.title; $('ytDescription').value = submitted.description;
        $('ytPrivacy').value = submitted.privacy; $('ytAudience').value = String(submitted.madeForKids);
        $('ytSchedule').value = localDate(new Date(submitted.scheduledStartTime));
      }
    } else if (!busy) { requestId = null; submitted = null; }
    update();
  }
  function update() {
    const b = data?.broadcast, connected = Boolean(data?.connected), disabled = !state.session || busy || data?.busy || locked();
    const recommended = new URL('./youtube-callback.html', document.baseURI).href;
    const mismatch = Boolean(data?.redirectUri && new URL(data.redirectUri).origin !== location.origin);
    $('ytConnect').disabled = Boolean(disabled || !data?.configured || data?.authorizing || mismatch); $('ytConnect').hidden = connected;
    $('ytCancelAuth').hidden = !pending && !data?.authorizing;
    $('ytCancelAuth').disabled = Boolean(!state.session || locked());
    $('ytDisconnect').hidden = !connected; $('ytDisconnect').disabled = Boolean(disabled || data?.authorizing);
    $('ytConfiguration').hidden = Boolean(data?.configured && !mismatch);
    $('ytCallback').value = mismatch ? recommended : data?.redirectUri || recommended;
    $('ytCopyCallback').disabled = !state.session;
    $('ytCallbackHelp').textContent = mismatch ? 'Callback mismatch. Set YOUTUBE_REDIRECT_URI to ' + recommended + ' in Render and register the identical URL in Google Cloud.' : 'Register this exact URL as an authorized redirect URI for your Google Web application client.';
    $('ytAccountState').textContent = !state.session ? 'Connect cloud studio first' : pending || data?.authorizing ? 'Connecting…' : connected ? 'Account connected' : 'Not connected';
    $('ytChannel').textContent = data?.channel?.title || 'Your channel. Your broadcast.';
    $('ytSetupHelp').textContent = !state.session ? 'Connect your cloud studio in Stream setup before linking YouTube.' : data?.configurationError || 'Sign in with Google to the channel you want to stream. Tokens and ingestion keys stay in cloud studio memory.';
    $('ytAuthStatus').textContent = pending ? 'Finish Google sign-in in the opened tab, then return here. MK97 checks the secure result automatically.' : '';
    for (const name of ['ytTitle', 'ytDescription', 'ytPrivacy', 'ytStartMode', 'ytAudience']) $(name).disabled = Boolean(disabled || !connected || data?.setup || data?.authorizing);
    $('ytScheduleRow').hidden = $('ytStartMode').value !== 'scheduled' && !data?.setup;
    $('ytSchedule').required = $('ytStartMode').value === 'scheduled';
    $('ytSchedule').disabled = Boolean(disabled || !connected || data?.setup || $('ytStartMode').value !== 'scheduled');
    $('ytCreate').disabled = Boolean(disabled || !connected || data?.authorizing || data?.setup?.stage === 'ready' || data?.setup?.uncertain);
    $('ytCreate').textContent = busy ? 'Working…' : data?.setup?.stage === 'ready' ? 'Setup ready' : data?.setup ? 'Retry setup' : 'Create YouTube setup';
    if (!titleTouched && !data?.setup && !submitted && state.score) $('ytTitle').value = `${state.score.batting} vs ${state.score.bowling} · ${state.score.series || 'Live cricket'}`.slice(0, 100);
    $('ytCapture').textContent = `Capture: ${state.camera?.height ? state.camera.height + 'p' : state.captureResolution === 'auto' ? 'Auto' : state.captureResolution + 'p'} · 30 fps program. YouTube detects the incoming format.`;
    $('ytEvent').hidden = !b;
    $('ytOperation').textContent = data?.setup && data.setup.stage !== 'ready' ? `Setup stage: ${data.setup.stage}${data.setup.uncertain ? ' · result unconfirmed; review Studio before New setup' : ''}` : '';
    $('ytError').textContent = data?.error || '';
    $('ytNew').hidden = !data?.setup; $('ytNew').disabled = Boolean(disabled || ['live', 'testing', 'liveStarting', 'testStarting'].includes(b?.state));
    if (b) {
      if (!$('watchUrl').value || $('watchUrl').value === autoWatch) { $('watchUrl').value = b.watchUrl; autoWatch = b.watchUrl; try { localStorage.setItem('boundary.watch', b.watchUrl); } catch {} }
      $('ytEventTitle').textContent = b.title; $('ytEventState').textContent = b.state; $('ytEventPrivacy').textContent = b.privacy;
      $('ytSignal').textContent = b.streamStatus; $('ytHealth').textContent = b.health; $('ytKeyState').textContent = b.keyReady ? 'Ready · kept on cloud studio' : 'Not available for upload';
      $('ytIssues').textContent = b.issues?.length ? 'YouTube checks: ' + b.issues.join(', ') : 'Check the platform preview for video, score and audio.';
      $('ytWatch').href = b.watchUrl; $('ytStudio').href = b.studioUrl;
      const transitionDisabled = !state.session || busy || data?.busy || data?.authorizing || state.starting || state.stopping;
      $('ytPreview').disabled = Boolean(transitionDisabled || b.streamStatus !== 'active' || !['ready', 'created'].includes(b.state));
      $('ytGoLive').disabled = Boolean(transitionDisabled || b.streamStatus !== 'active' || !['ready', 'testing'].includes(b.state));
      $('ytEnd').disabled = Boolean(transitionDisabled || !['live', 'testing', 'liveStarting', 'testStarting'].includes(b.state));
      $('ytRefresh').disabled = Boolean(!state.session || busy || data?.busy);
      $('ytUseSetup').disabled = Boolean(disabled || !b.keyReady);
    }
  }
  $('ytStartMode').addEventListener('change', update);
  $('ytCopyCallback').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('ytCallback').value); notice('Callback URL copied. Add it to your Google Web application client.'); }
    catch { $('ytCallback').focus(); $('ytCallback').select(); notice('Select and copy the callback URL shown here.'); }
  });
  async function action(work, message, select = false) {
    if (busy || data?.busy) return; const session = state.session; setBusy(true);
    try {
      const result = await work(); if (state.session !== session) return;
      if (result?.connected != null) data = result;
      await refreshInfo(); if (state.session !== session) return;
      if (select && data?.broadcast?.keyReady) $('dest-youtube').checked = true;
      if (message) notice(message, 'success');
    } catch (e) {
      if (state.session === session) {
        notice(e.message, 'error');
        try { const next = await api('/api/youtube/status'); if (state.session === session) { accept(next); if (!next.setup) { requestId = null; submitted = null; } } } catch {}
      }
    } finally { if (state.session === session) setBusy(false); }
  }
  async function cancelSignIn(message) {
    const session = state.session; let cancelled = false; clearAuth();
    try { if (session) { const next = await post('auth/cancel'); if (state.session === session) { data = next; await refreshInfo(); cancelled = true; } } }
    catch (e) { if (state.session === session) notice(e.message, 'error'); }
    finally { if (state.session === session) { setBusy(false); if (message && cancelled) notice(message); } }
  }
  $('ytConnect').addEventListener('click', async () => {
    if (busy || locked() || !state.session || !data?.configured) return;
    clearAuth(); popup = window.open('about:blank', '_blank', 'popup,width=520,height=740');
    if (!popup) return notice('Allow popups for this studio, then connect YouTube again.', 'error');
    const session = state.session; setBusy(true);
    try {
      const flow = await post('auth/start'); if (session !== state.session) return clearAuth();
      const u = new URL(flow.authorizationUrl); if (u.origin !== 'https://accounts.google.com' || !/^[A-Za-z0-9_-]{43}$/.test(flow.state)) throw new Error('Cloud studio returned an invalid Google sign-in URL.');
      pending = { state: flow.state, session, epoch, callbackMode: flow.callbackMode };
      if (flow.callbackMode !== 'server' && typeof BroadcastChannel === 'function') {
        authorizationChannel = new BroadcastChannel('boundary.youtube.' + flow.state);
        authorizationChannel.onmessage = e => { if (e.origin === location.origin) completeSignIn(e.data); };
      }
      popup.location.replace(u.href); update();
      timeout = setTimeout(() => cancelSignIn('Google sign-in timed out. Connect again when ready.'), 5 * 60000);
      await refreshInfo();
      if (session === state.session && pending) notice('Complete Google sign-in in the opened tab, then return to MK97.');
    } catch (e) {
      if (session !== state.session) return;
      clearAuth(); try { await post('auth/cancel'); await refreshInfo(); } catch {}
      if (session === state.session) { setBusy(false); notice(e.message, 'error'); }
    }
  });
  $('ytCancelAuth').addEventListener('click', () => cancelSignIn('Google sign-in cancelled.'));
  async function completeSignIn(v) {
    if (!pending || pending.callbackMode === 'server' || v?.type !== 'boundary:youtube-oauth' || v.state !== pending.state || pending.session !== state.session) return;
    const returned = { state: pending.state, ...(v.error ? { error: 'denied' } : { code: typeof v.code === 'string' ? v.code.slice(0, 4097) : '' }) };
    clearAuth(); setBusy(false);
    await action(() => post('auth/complete', returned), 'YouTube connected. Complete your broadcast details below.');
  }
  window.addEventListener('message', event => { if (event.origin === location.origin && event.source === popup) completeSignIn(event.data); });
  async function pollAuthorization() {
    if (!pending || authPolling || document.hidden) return;
    const flow = pending; authPolling = true;
    try {
      const next = await api('/api/youtube/status');
      if (pending !== flow || state.session !== flow.session || epoch !== flow.epoch) return;
      const result = next.authorization;
      if (result?.state !== flow.state || !['connected', 'failed'].includes(result.status)) return;
      data = next; clearAuth();
      await refreshInfo(); if (state.session !== flow.session) return;
      setBusy(false);
      notice(result.status === 'connected' ? 'YouTube connected. Complete your broadcast details below.' : result.error || 'Google sign-in failed. Check your Google setup and reconnect.', result.status === 'connected' ? 'success' : 'error');
    } catch (e) { if (pending === flow) $('ytAuthStatus').textContent = 'Waiting for your cloud studio. Return here after Google sign-in; you can retry if the connection fails.'; }
    finally { authPolling = false; }
  }
  const authTimer = setInterval(pollAuthorization, 2000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { pollAuthorization(); pollStatus(); } });
  window.addEventListener('focus', pollAuthorization);
  $('ytBroadcastForm').addEventListener('submit', event => {
    event.preventDefault(); if (locked() || busy || !data?.connected || data?.authorizing) return;
    if (!submitted) {
      const at = $('ytStartMode').value === 'now' ? new Date() : new Date($('ytSchedule').value);
      if (!Number.isFinite(at.getTime())) return notice('Choose a valid scheduled start time.', 'error');
      const audience = $('ytAudience').value; if (!['true', 'false'].includes(audience)) return notice('Choose the audience declaration.', 'error');
      requestId ||= [...crypto.getRandomValues(new Uint8Array(24))].map(v => v.toString(16).padStart(2, '0')).join('');
      submitted = { requestId, title: $('ytTitle').value, description: $('ytDescription').value, privacy: $('ytPrivacy').value,
        scheduledStartTime: at.toISOString(), madeForKids: audience === 'true' };
    }
    action(() => post('setup', submitted), 'YouTube setup ready and selected. Return to studio, open your camera and press START. Use Go live after the signal becomes active.', true);
  });
  $('ytUseSetup').addEventListener('click', () => { if (locked() || !data?.broadcast?.keyReady) return; $('dest-youtube').checked = true; updateControls(); closePanel(); });
  $('ytDisconnect').addEventListener('click', () => { const owner = state.session; return action(async () => {
    const result = await post('disconnect'); if (state.session !== owner) return;
    clearAuth(); data = null; requestId = null; submitted = null;
    if (!result.revoked) notice('Disconnected locally. Google revocation could not be confirmed; remove this app in your Google account connections if needed.');
  }); });
  $('ytRefresh').addEventListener('click', () => action(() => api('/api/youtube/status?refresh=1')));
  for (const [button, target, message] of [['ytPreview', 'testing', 'YouTube preview requested. Check its monitor player in YouTube Studio.'], ['ytGoLive', 'live', 'YouTube Go live requested. Check status and public playback.']]) $(button).addEventListener('click', () => action(() => post('transition', { state: target }), message));
  $('ytEnd').addEventListener('click', () => { $('ytEndConfirm').hidden = false; });
  $('ytEndNo').addEventListener('click', () => { $('ytEndConfirm').hidden = true; });
  $('ytEndYes').addEventListener('click', () => { $('ytEndConfirm').hidden = true; action(() => post('transition', { state: 'complete' }), 'YouTube end requested. Other selected destinations continue.'); });
  $('ytNew').addEventListener('click', () => { $('ytNewConfirm').hidden = false; $('ytReviewed').checked = false; $('ytNewYes').disabled = true; });
  $('ytReviewed').addEventListener('change', () => { $('ytNewYes').disabled = !$('ytReviewed').checked; });
  $('ytNewNo').addEventListener('click', () => { $('ytNewConfirm').hidden = true; });
  $('ytNewYes').addEventListener('click', () => {
    if (!$('ytReviewed').checked || locked()) return; $('ytNewConfirm').hidden = true;
    const owner = state.session;
    action(async () => { const r = await post('reset'); if (state.session !== owner) return; requestId = null; submitted = null; return r; }, 'Ready for new event details. Previous events remain in YouTube Studio.');
  });
  async function pollStatus() {
    if (!state.session || !data?.connected || busy || polling || document.hidden) return;
    const session = state.session, generation = revision; polling = true;
    try {
      const next = await api('/api/youtube/status'); if (session !== state.session || generation !== revision) return;
      const changed = next.broadcast?.keyReady !== data?.broadcast?.keyReady || next.connected !== data?.connected;
      accept(next); if (changed) await refreshInfo();
    } catch (e) { if (session === state.session && generation === revision) $('ytError').textContent = e.message; }
    finally { polling = false; }
  }
  const statusTimer = setInterval(pollStatus, 15000);
  return { accept, update, destroy() { clearAuth(); clearInterval(authTimer); clearInterval(statusTimer); } };
}
