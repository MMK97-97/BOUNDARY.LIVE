import { captureReady } from './core.mjs';
const $ = id => document.getElementById(id);
const defaults = { youtube: 'rtmps://a.rtmps.youtube.com/live2', facebook: 'rtmps://live-api-s.facebook.com:443/rtmp/', instagram: '' };
export function installStreamSetup({ state, api, ui, updateControls, refreshInfo, openCamera }) {
  let identity = state.session, operation = 0;
  const locked = () => Boolean(state.live || state.starting || state.stopping || state.destinationBusy || state.youtubeBusy);
  function fieldDefaults() {
    $('destinationServer').value = defaults[$('destinationPlatform').value] || '';
    $('destinationServer').placeholder = defaults[$('destinationPlatform').value] || 'Paste your Instagram Live Producer RTMPS URL';
    $('destinationKey').value = ''; $('destinationOperation').textContent = '';
  }
  $('destinationPlatform').addEventListener('change', fieldDefaults); fieldDefaults();
  function update() {
    if (identity !== state.session) { identity = state.session; operation++; state.destinationBusy = false; $('destinationKey').value = ''; $('destinationOperation').textContent = ''; }
    const selected = state.info?.destinations?.filter(d => Object.hasOwn(defaults, d.id) && d.configured && $('dest-' + d.id).checked) || [];
    const ready = [Boolean(state.session && state.info?.encoder.ready), selected.length > 0,
      !$('overlayToggle').checked || Boolean(state.score && state.scoreTransport === 'relay'), Boolean(state.camera && captureReady(state.camera, state.captureResolution))];
    const captions = [state.session ? state.info?.encoder.ready ? 'Connected · encoder ready' : 'Encoder needs attention' : 'Connect securely',
      selected.length ? selected.map(d => d.id).join(', ') : 'Choose where to stream',
      !$('overlayToggle').checked ? 'Overlay switched off' : state.score ? `Match ${state.score.matchId}${state.scoreTransport !== 'relay' ? ' · connect cloud' : ''}` : 'Load Match ID',
      state.camera ? `${state.camera.width} × ${state.camera.height}` : 'Open rear camera'];
    const statusIds = ['setupConnectionState', 'setupDestinationState', 'setupMatchState', 'setupCameraState'];
    statusIds.forEach((id, i) => { $(id).textContent = captions[i]; $(id).closest('button').classList.toggle('ready', ready[i]); });
    const count = ready.filter(Boolean).length; $('setupProgress').value = count;
    $('setupSummary').textContent = count === 4 ? 'Ready to send camera video · return to studio and press START' : `${count} of 4 ready`;
    for (const id of ['destinationPlatform', 'destinationServer', 'destinationKey', 'saveDestination', 'clearDestination']) $(id).disabled = !state.session || locked();
    $('saveDestination').textContent = state.destinationBusy ? 'Saving…' : 'Save securely';
    $('setupCameraStep').disabled = locked() || state.cameraBusy;
  }
  $('setupConnectionStep').addEventListener('click', () => { $('cloudConnectionPanel').scrollIntoView({ block: 'start', behavior: 'smooth' }); if (!state.session) $('relayToken').focus({ preventScroll: true }); });
  $('setupDestinationStep').addEventListener('click', () => { $('destinationPanel').scrollIntoView({ block: 'start', behavior: 'smooth' }); });
  $('setupCameraStep').addEventListener('click', () => { ui.closeDrawer(); if (!state.stream) openCamera(); });
  $('returnToStudio').addEventListener('click', () => ui.closeDrawer());
  async function change(clear = false) {
    if (!state.session || locked()) return;
    const owner = state.session, id = $('destinationPlatform').value, generation = ++operation;
    let key = $('destinationKey').value.trim();
    const server = $('destinationServer').value.trim();
    state.destinationBusy = true; $('destinationOperation').textContent = ''; updateControls();
    try {
      await api('/api/destination' + (clear ? '/clear' : ''), { method: 'POST', body: JSON.stringify(clear ? { id } : { id, server, key }) });
      if (owner !== state.session || generation !== operation) return;
      await refreshInfo();
      if (owner !== state.session || generation !== operation) return;
      if (!clear) $('dest-' + id).checked = Boolean(state.info?.destinations?.find(d => d.id === id)?.configured);
      const remembered = state.info?.savedStudio?.remembered;
      $('destinationOperation').textContent = clear ? `${remembered ? 'Saved studio' : 'Temporary session'} key removed. A server-configured fallback, if present, remains available.` :
        remembered ? 'Key saved encrypted in your studio and shared with linked devices. Destination selected.' : 'Key saved for this temporary session. Destination selected.';
      $('destinationOperation').className = 'helper good';
    } catch (e) {
      if (owner === state.session && generation === operation) { $('destinationOperation').textContent = e.message; $('destinationOperation').className = 'helper error'; }
    } finally {
      key = ''; $('destinationKey').value = '';
      if (generation === operation) { state.destinationBusy = false; updateControls(); }
    }
  }
  $('destinationForm').addEventListener('submit', e => { e.preventDefault(); change(); });
  $('clearDestination').addEventListener('click', () => change(true));
  update();
  return { update };
}
