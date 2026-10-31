const $ = id => document.getElementById(id);
export function installSavedStudio({ state, api, notice, updateControls, connectIdentity, clearConnection, refreshInfo }) {
  let config = null, eligible = false, restoring = null, busy = false, codeTimer = null, keyTimer = null, listFingerprint = '', restoreError = '';
  let preferencesSession = null, preferencesFingerprint = '', preferencesTimer = null, preferencesRetryAfter = 0;
  function preferences() { return { destinations:['youtube','facebook','instagram'].filter(id=>$('dest-'+id).checked), resolution:state.captureResolution,
    quality:$('qualitySelect').value, overlay:$('overlayToggle').checked, milestones:$('autoMilestones').checked, cards:$('autoCards').checked, watchUrl:$('watchUrl').value.trim() }; }
  function synced() { preferencesSession = state.session; preferencesFingerprint = JSON.stringify(preferences()); }
  function queuePreferences() {
    if (!state.info?.savedStudio?.remembered || preferencesSession !== state.session || locked() || Date.now() < preferencesRetryAfter) return;
    const value = preferences(), fingerprint = JSON.stringify(value);
    if (fingerprint === preferencesFingerprint) return;
    clearTimeout(preferencesTimer); const session = state.session;
    preferencesTimer = setTimeout(async () => {
      try { await api('/api/preferences',{method:'POST',body:JSON.stringify(value)}); if(session===state.session) { preferencesFingerprint=fingerprint; preferencesRetryAfter=0; } }
      catch(e) { if(session===state.session) { preferencesRetryAfter=Date.now()+30000; $('savedDeviceMessage').textContent='Settings could not be saved: '+e.message; } }
    },500);
  }
  const locked = () => Boolean(state.live || state.starting || state.stopping || state.connecting || state.destinationBusy || state.youtubeBusy || busy);
  function clearCode() { clearTimeout(codeTimer); codeTimer = null; $('deviceCode').textContent = ''; $('deviceCodePanel').hidden = true; }
  function clearKey() { clearTimeout(keyTimer); keyTimer=null; $('newEncryptionKey').textContent=''; $('newEncryptionKeyPanel').hidden=true; }
  function update() {
    const remembered = Boolean(state.info?.savedStudio?.remembered), disabled = locked();
    $('rememberDevice').disabled = !eligible || disabled; $('deviceName').disabled = !eligible || disabled;
    $('connectRelay').textContent = state.connecting ? 'Connecting…' : eligible && $('rememberDevice').checked ? 'Connect & remember' : 'Connect securely';
    $('rememberHelp').textContent = restoreError || (eligible ? 'Enter the relay token once on your first device. This browser reconnects automatically for 30 days.' :
      config?.savedStudio?.message || 'Open your hosted MK97 address to enable saved-device sign-in. Browser preview connections remain temporary.');
    $('savedHostSetup').hidden = eligible;
    if (eligible) clearKey();
    $('linkDeviceDetails').hidden = !eligible || Boolean(state.session);
    for (const id of ['linkDevice', 'linkDeviceName', 'linkDeviceCode']) $(id).disabled = !eligible || disabled;
    $('savedDevicePanel').hidden = !remembered;
    $('createDeviceCode').disabled = !remembered || disabled;
    $('copyDeviceCode').disabled = !$('deviceCode').textContent || disabled;
    $('savedConnectionState').textContent = remembered ? 'This device is remembered. Your studio connections are saved encrypted and shared with linked devices.' : 'Temporary connection. Enable saved studio storage and remember this device to reconnect automatically.';
    if (!state.session) { clearCode(); clearTimeout(preferencesTimer); preferencesSession = null; listFingerprint = ''; $('rememberedDevices').replaceChildren(); }
    for (const button of $('rememberedDevices').querySelectorAll('button')) button.disabled = disabled;
    queuePreferences();
  }
  function accept(info) {
    const saved = info?.savedStudio;
    if (!saved?.remembered) { update(); return; }
    const entries = saved.device?.devices || [], fingerprint = JSON.stringify(entries);
    if (fingerprint !== listFingerprint) {
      listFingerprint = fingerprint; $('rememberedDevices').replaceChildren();
      for (const entry of entries) {
        const row = document.createElement('div'); row.className = 'remembered-device';
        const text = document.createElement('div'); text.textContent = entry.name;
        const detail = document.createElement('small'); detail.textContent = `${entry.current ? 'This device · ' : ''}Remembered until ${new Date(entry.expiresAt).toLocaleDateString()}`; text.append(detail); row.append(text);
        if (!entry.current) {
          const button = document.createElement('button'); button.className = 'secondary'; button.textContent = 'Sign out'; button.setAttribute('aria-label', 'Sign out ' + entry.name);
          button.addEventListener('click', () => operation(async () => { await api('/api/devices/revoke', {method:'POST', body:JSON.stringify({deviceId:entry.id})}); await refreshInfo(); $('savedDeviceMessage').textContent = entry.name + ' was signed out. Its camera upload, if any, was stopped.'; })); row.append(button);
        }
        $('rememberedDevices').append(row);
      }
    }
    if (saved.warning) $('savedDeviceMessage').textContent = saved.warning;
    update();
  }
  async function operation(work) {
    if (busy || state.connecting) return;
    const session = state.session; busy = true; update();
    try { await work(); } catch (e) { if (state.session === session) { $('savedDeviceMessage').textContent = e.message; notice(e.message, 'error'); } }
    finally { busy = false; update(); }
  }
  async function restore() {
    if (!eligible || state.connecting || state.live || state.starting || state.stopping) return false;
    if (restoring) return restoring;
    const previous = state.session; restoreError = ''; state.connecting = true; updateControls();
    restoring = (async () => {
      try {
        const identity = await api('/api/device/restore', {method:'POST', body:'{}', timeoutMs:60000}, null);
        if (state.session !== previous) return false;
        if (!identity.remembered) { if (previous) await clearConnection(); return false; }
        await connectIdentity(identity, true); return true;
      } catch (e) { restoreError = e.message; if (state.session !== previous) await clearConnection(); return false; }
      finally { restoring = null; state.connecting = false; updateControls(); }
    })();
    return restoring;
  }
  function hostedLink(value) {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return;
      if (!state.session && !state.connecting && !$('relayUrl').value) $('relayUrl').value = url.origin;
      $('openSavedStudio').href = url.origin; $('openSavedStudio').hidden = url.origin === location.origin;
      if (url.origin !== location.origin) $('cloudDiscovery').textContent = 'Open your hosted studio to restore saved connections or link this device. The app address is already configured.';
    } catch {}
  }
  async function staticHost() {
    try {
      const response = await fetch(new URL('./studio-config.json', document.baseURI), {cache:'no-store',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(5000)});
      if (response.ok) hostedLink((await response.json()).studioUrl);
    } catch {}
  }
  async function discover() {
    try {
      const response = await fetch(new URL('./api/public-config', document.baseURI), { cache:'no-store', credentials:'same-origin', redirect:'error', signal:AbortSignal.timeout(15000) });
      if (!response.ok) { $('rememberDevice').checked = false; await staticHost(); update(); return; }
      config = await response.json();
      if (config.product !== 'mk97') { await staticHost(); return; }
      if (config.studioUrl && new URL(config.studioUrl).origin !== location.origin) { hostedLink(config.studioUrl); $('rememberDevice').checked = false; update(); return; }
      const local = location.protocol === 'http:' && ['localhost','127.0.0.1'].includes(location.hostname);
      if (config.sameOrigin === true && location.protocol === 'https:' || local) {
        if (!state.session && !state.connecting) { $('relayUrl').value = location.origin; state.relay = location.origin; }
        eligible = Boolean(config.savedStudio?.configured);
        $('cloudDiscovery').textContent = eligible ? 'Your saved studio is available here. Checking whether this device is already linked…' :
          'Your hosted studio is here. Connect with its token; enable saved studio storage once to remember devices.';
      }
      if (!eligible) $('rememberDevice').checked = false;
      update();
      if (!state.session && eligible) await restore();
      $('cloudDiscovery').textContent = eligible ? state.session ? 'Your remembered device connected automatically.' : 'Use your relay token once, or link this device with a code from another connected device.' : $('cloudDiscovery').textContent;
    } catch { await staticHost(); update(); }
  }
  $('rememberDevice').addEventListener('change', update);
  for (const id of ['autoMilestones','autoCards','qualitySelect','overlayToggle','dest-youtube','dest-facebook','dest-instagram']) $(id).addEventListener('change', queuePreferences);
  $('watchUrl').addEventListener('input', queuePreferences);
  $('watchUrl').addEventListener('change', queuePreferences);
  $('generateEncryptionKey').addEventListener('click', () => {
    try { clearKey(); const key=crypto.getRandomValues(new Uint8Array(32)); $('newEncryptionKey').textContent=[...key].map(b=>b.toString(16).padStart(2,'0')).join(''); key.fill(0);
      $('newEncryptionKeyPanel').hidden=false; keyTimer=setTimeout(clearKey,300000); }
    catch { $('encryptionKeyMessage').textContent='Key generation needs a secure HTTPS browser. Follow docs/SAVED_STUDIO.md for another private method.'; }
  });
  $('copyEncryptionKey').addEventListener('click', async () => {
    try { const key=$('newEncryptionKey').textContent; if (!key) return; await navigator.clipboard.writeText(key); $('encryptionKeyMessage').textContent='Copied. Save as STUDIO_ENCRYPTION_KEY in your hosting dashboard and retain it privately. This page does not save it.'; }
    catch { $('encryptionKeyMessage').textContent='Select and copy the private key above, then save it in your hosting dashboard.'; }
  });
  $('linkDeviceForm').addEventListener('submit', async event => {
    event.preventDefault(); if (!eligible || locked()) return;
    state.connecting = true; updateControls(); let code = $('linkDeviceCode').value;
    try {
      const identity = await api('/api/device/link', {method:'POST', body:JSON.stringify({code,deviceName:$('linkDeviceName').value}), timeoutMs:60000}, null);
      await connectIdentity(identity, true); notice('Device linked. Your saved studio is connected.', 'success');
    } catch (e) { notice(e.message, 'error'); }
    finally { code = ''; $('linkDeviceCode').value = ''; state.connecting = false; updateControls(); }
  });
  $('createDeviceCode').addEventListener('click', () => operation(async () => {
    const session = state.session, result = await api('/api/devices/pair', {method:'POST',body:'{}'});
    if (session !== state.session) return;
    clearCode(); $('deviceCode').textContent = result.code; $('deviceCodePanel').hidden = false;
    $('deviceCodeExpiry').textContent = 'Expires ' + new Date(result.expiresAt).toLocaleTimeString();
    codeTimer = setTimeout(clearCode, Math.max(0,result.expiresAt-Date.now()));
  }));
  $('copyDeviceCode').addEventListener('click', async () => { try { await navigator.clipboard.writeText($('deviceCode').textContent); $('savedDeviceMessage').textContent = 'One-time code copied. Use it only on the device you want to link.'; } catch { $('savedDeviceMessage').textContent = 'Copy the one-time code shown above.'; } });
  const timer = setInterval(async () => {
    if (!state.session || !state.info?.savedStudio?.remembered || locked() || document.hidden) return;
    try { await refreshInfo(); } catch (e) { if (e.status === 401 && e.payload?.code === 'SESSION_REQUIRED') await restore(); }
  },30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !state.session) restore(); });
  return { accept, update, discover, restore, synced, destroy() {clearInterval(timer);clearTimeout(preferencesTimer);clearCode();clearKey();} };
}
