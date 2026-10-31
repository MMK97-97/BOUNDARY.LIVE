import { captureProfile, programSize } from './capture.mjs';
import { PROFILES } from './core.mjs';
import { graphicSvg } from './score-graphic.mjs';

export const SCREEN_ROUTES = Object.freeze({
  match: { panel: 'match' }, settings: { panel: 'settings' },
  streamSettings: { panel: 'streamSettings' }, graphics: { panel: 'graphics' },
  matchEvents: { panel: 'graphics', target: 'matchEventsPanel' },
  quality: { panel: 'quality' }, destinations: { panel: 'quality', target: 'destinationPanel' },
  advanced: { panel: 'advanced' }, score: { panel: 'score' }, stats: { panel: 'stats' },
  share: { panel: 'share' }, youtube: { panel: 'youtube' },
  youtubecreate: { panel: 'youtubecreate' }, events: { panel: 'events' },
  account: { panel: 'settings', target: 'accountPanel' },
  studio: { view: 'studio' }, home: { view: 'home' }, auth: { view: 'auth' }
});

// Presentation and navigation only. Provider calls stay in the existing controllers.
export function installInterface({ state, ui, home, notice }) {
  const $ = id => document.getElementById(id);
  let view = 'auth', currentPanel = null, previousSession = state.session, authMode = 'auto';
  let scoreDrawingKey = '', previousEvent = false, createPending = false, goingBack = false;
  const history = [];
  const locked = () => Boolean(state.live || state.starting || state.stopping);

  function closeMenu() {
    $('homeMenu').hidden = true;
    $('homeMenuButton').setAttribute('aria-expanded', 'false');
  }
  function maskSecrets() {
    for (const button of document.querySelectorAll('[data-password-toggle]')) {
      const field = $(button.dataset.passwordToggle);
      field.type = 'password'; button.setAttribute('aria-pressed', 'false');
      button.setAttribute('aria-label', 'Show ' + secretLabel(field.id));
    }
  }
  function secretLabel(id) {
    return id.toLowerCase().includes('token') ? 'studio token' : id === 'destinationKey' ? 'stream key' : 'password';
  }
  function mountCloud() {
    const target = view === 'auth' && !currentPanel ? $('authMount') : $('cloudSettingsMount');
    if ($('cloudConnectionPanel').parentElement !== target) target.append($('cloudConnectionPanel'));
    const legacyHost = view === 'auth' && !currentPanel ? $('authAdvancedMount') : $('cloudConnectionPanel');
    if ($('legacyConnectionDetails').parentElement !== legacyHost) legacyHost.append($('legacyConnectionDetails'));
  }
  function viewChanged(next) {
    view = next;
    for (const [name, id] of [['auth', 'authScreen'], ['home', 'home'], ['studio', 'studio']]) $(id).hidden = name !== view;
    document.body.classList.toggle('at-auth', view === 'auth');
    document.body.classList.toggle('at-home', view === 'home');
    document.body.classList.toggle('at-studio', view === 'studio');
    closeMenu(); mountCloud();
  }
  function signIn() {
    if (state.session) { ui.panel('settings', 'accountPanel'); return; }
    ui.closeDrawer(); viewChanged('auth');
    if (!$('accountPanel').hidden) $('accountEmail').focus();
  }
  function navigate(name) {
    const route = SCREEN_ROUTES[name];
    if (!route) { notice('This studio page is unavailable.', 'error'); return; }
    closeMenu();
    if (name === 'account' && !state.session || name === 'auth') { signIn(); return; }
    if (route.view === 'studio') { home.openStudio(); return; }
    if (route.view === 'home') { home.home(); return; }
    ui.panel(route.panel, route.target);
  }
  function updateSteps() {
    const selected = currentPanel === 'match' ? 'match' : currentPanel === 'settings' ? 'stream' : 'studio';
    const ready = {
      match: Boolean(state.score),
      stream: Boolean(state.session && state.info?.encoder.ready && ['youtube', 'facebook', 'instagram'].some(id => $('dest-' + id).checked && state.info?.destinations?.some(d => d.id === id && d.configured))),
      studio: Boolean(state.stream)
    };
    for (const button of document.querySelectorAll('[data-step]')) {
      const step = button.dataset.step;
      button.classList.toggle('active', step === selected);
      button.classList.toggle('complete', ready[step]);
      if (step === selected) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    }
  }
  function opened(name) {
    if (currentPanel && name !== currentPanel && !goingBack) history.push(currentPanel);
    goingBack = false;
    currentPanel = name; closeMenu(); maskSecrets(); mountCloud();
    $('home').inert = true; $('authScreen').inert = true;
    $('drawerSteps').hidden = !['match', 'settings'].includes(name);
    if (['youtube', 'youtubecreate', 'events'].includes(name)) document.querySelector(`[data-drawer="${name}"]`).append($('youtubeFeedback'));
    updateSteps();
  }
  function closed() {
    currentPanel = null; history.length = 0; $('home').inert = false; $('authScreen').inert = false;
    maskSecrets(); mountCloud();
  }
  function back() {
    if (history.length) { goingBack = true; ui.panel(history.pop()); }
    else ui.closeDrawer();
  }
  $('ytBroadcastForm').addEventListener('submit', () => { createPending = true; });
  for (const button of document.querySelectorAll('[data-route]')) button.addEventListener('click', () => navigate(button.dataset.route));
  $('homeMenuButton').addEventListener('click', () => {
    const open = $('homeMenu').hidden; $('homeMenu').hidden = !open;
    $('homeMenuButton').setAttribute('aria-expanded', String(open));
    if (open) $('homeMenu').querySelector('button').focus();
  });
  document.addEventListener('click', event => { if (!event.target.closest('#homeMenu, #homeMenuButton')) closeMenu(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('homeMenu').hidden) { closeMenu(); $('homeMenuButton').focus(); } });
  $('authUseToken').addEventListener('click', () => {
    authMode = 'token'; $('legacyConnectionDetails').open = true; update(); $('relayToken').focus();
  });
  $('authUseAccount').addEventListener('click', () => { authMode = 'account'; $('legacyConnectionDetails').open = false; update(); $('accountEmail').focus(); });
  $('authPreview').addEventListener('click', () => home.openStudio());
  for (const button of document.querySelectorAll('[data-password-toggle]')) button.addEventListener('click', () => {
    const field = $(button.dataset.passwordToggle); if (field.disabled) return;
    const show = field.type === 'password'; field.type = show ? 'text' : 'password';
    button.setAttribute('aria-pressed', String(show)); button.setAttribute('aria-label', (show ? 'Hide ' : 'Show ') + secretLabel(field.id));
  });
  document.addEventListener('submit', maskSecrets, true);
  for (const button of document.querySelectorAll('[data-resolution-proxy]')) button.addEventListener('click', () => {
    if (button.disabled) return;
    $('resolutionOptions').querySelector(`[data-resolution="${button.dataset.resolutionProxy}"]`).click();
  });
  for (const button of document.querySelectorAll('[data-configure-destination]')) button.addEventListener('click', () => {
    const platform = button.dataset.configureDestination;
    if (platform === 'youtube') { navigate('youtube'); return; }
    if (locked()) return;
    ui.panel('quality', 'manualDestinationDetails'); $('manualDestinationDetails').open = true;
    $('destinationPlatform').value = platform; $('destinationPlatform').dispatchEvent(new Event('change'));
    $('destinationServer').focus();
  });

  function update() {
    if (view === 'auth' && state.session && state.info) { $('legacyConnectionDetails').open = false; home.home(); }
    else if (previousSession && !state.session && !locked()) signIn();
    previousSession = state.session;
    const accountAvailable = !$('accountPanel').hidden;
    const token = authMode === 'token' || authMode === 'auto' && !accountAvailable;
    $('authScreen').classList.toggle('token-mode', token);
    if (view === 'auth' && token) $('cloudDiscovery').textContent = 'Use your private studio token to connect this device.';
    $('authUseToken').disabled = $('authUseAccount').disabled = Boolean(state.connecting);
    $('authUseToken').hidden = token; $('authUseAccount').hidden = !token || !accountAvailable;
    if (view === 'auth' && token) $('legacyConnectionDetails').open = true;
    $('authAlternatives').hidden = !accountAvailable;
    for (const button of document.querySelectorAll('[data-password-toggle]')) button.disabled = Boolean($(button.dataset.passwordToggle).disabled);
    for (const button of document.querySelectorAll('[data-resolution-proxy]')) {
      const selected = button.dataset.resolutionProxy === state.captureResolution;
      button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected));
      button.disabled = locked() || Boolean(state.cameraBusy);
    }
    const profile = captureProfile(state.camera) || (state.captureResolution === 'auto' ? '1080' : state.captureResolution);
    const bitrate = (PROFILES[$('qualitySelect').value] || PROFILES.balanced).bitrate * (profile === '1080' ? 1 : profile === '720' ? .56 : .25);
    $('qualityActual').textContent = `Phone upload target: ${(bitrate / 1_000_000).toFixed(1)} Mbps · 30 FPS. ${state.captureResolution === 'auto' && !state.camera ? 'Auto checks the camera when it opens.' : 'Actual capture is checked before streaming.'}`;
    $('homeWelcome').textContent = state.session ? 'Welcome back.' : 'Your match day starts here.';
    const score = state.score;
    $('homeMatchQuick').textContent = score ? `${score.batting} ${score.runs}/${score.wickets} · Match ${score.matchId}` : 'Select league, fetch CricClubs match';
    $('matchTeamPreview').hidden = !score;
    for (const [side, name] of [['A', score?.batting], ['B', score?.bowling]]) {
      $('matchTeam' + side + 'Name').textContent = name || '—';
      $('matchTeam' + side + 'Icon').textContent = name ? name.slice(0, 4) : '—';
    }
    for (const [id, value] of [['matchSeriesValue', score?.series], ['matchClubValue', score?.clubId], ['matchIdValue', score?.matchId], ['matchVenueValue', score?.ground]]) $(id).textContent = value || '—';
    $('graphicsSourceState').textContent = !score ? 'No match loaded' : score.stale ? 'Score delayed' : score.status === 'complete' ? 'Match complete' : 'Source connected';
    $('graphicsScorePreview').hidden = !score; $('graphicsPreviewEmpty').hidden = Boolean(score);
    const key = JSON.stringify([score, programSize(state.camera)]);
    if (key !== scoreDrawingKey) {
      scoreDrawingKey = key;
      if (score) {
        const canvas = programSize(state.camera), barHeight = canvas.height > canvas.width ? 286 * canvas.width / 1080 : 236 * canvas.width / 1920;
        const drawing = graphicSvg(score, null, true, '', canvas).replace(`height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}"`, `height="${barHeight}" viewBox="0 ${canvas.height - barHeight} ${canvas.width} ${barHeight}"`);
        $('graphicsScorePreview').src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(drawing);
      }
      else $('graphicsScorePreview').removeAttribute('src');
    }
    const hasEvent = !$('ytEvent').hidden;
    $('eventEmpty').hidden = hasEvent; $('createEventLink').hidden = !hasEvent;
    const broadcast = state.info?.youtube?.broadcast;
    $('homeEventQuick').textContent = broadcast ? `${broadcast.title} · ${broadcast.state}` : 'Your saved YouTube event & live controls';
    $('openYouTubeCreate').disabled = !state.session || !state.info?.youtube?.connected || Boolean(state.youtubeBusy);
    for (const button of document.querySelectorAll('[data-configure-destination]')) if (button.dataset.configureDestination !== 'youtube') button.disabled = locked();
    if (currentPanel === 'youtubecreate' && createPending && hasEvent && !state.youtubeBusy && $('ytCreate').textContent === 'Setup ready') { createPending = false; ui.panel('events'); }
    else if (currentPanel === 'events' && previousEvent && !hasEvent && !state.youtubeBusy && state.info?.youtube?.connected) ui.panel('youtubecreate');
    previousEvent = hasEvent;
    $('publishReminder').textContent = state.live ? 'Sending camera · check platform publication' : 'Camera upload · publish from platform controls';
    updateSteps();
  }
  viewChanged(state.session ? 'home' : 'auth'); update();
  return { update, navigate, opened, closed, back, viewChanged, get view() { return view; }, get panel() { return currentPanel; } };
}
