import { programRect, programSize, captureProfile } from './capture.mjs';
import { graphicSvg } from './score-graphic.mjs';
const $ = id => document.getElementById(id);
const label = { match: 'Match Setup', streamSettings: 'Stream Settings', graphics: 'Live Score Graphics', quality: 'Quality & Destinations', advanced: 'Camera, Audio & Advanced', youtubecreate: 'Create Live Setup', events: 'My Event & Live Controls', settings: 'Stream Setup', score: 'Score & commentary', stats: 'Match statistics', share: 'Share broadcast', youtube: 'YouTube live setup' };
const el = (tag, content, className) => { const n = document.createElement(tag); if (content != null) n.textContent = String(content); if (className) n.className = className; return n; };
const icon = id => { const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), use = document.createElementNS(svg.namespaceURI, 'use'); use.setAttribute('href', '#i-' + id); svg.append(use); return svg; };
const safeWatch = value => { const u = new URL(value); if (u.protocol !== 'https:' || u.username || u.password || !['youtube.com', 'youtu.be', 'facebook.com', 'fb.watch', 'instagram.com'].some(h => u.hostname === h || u.hostname.endsWith('.' + h))) throw new Error('Enter your public YouTube, Facebook or Instagram watch URL.'); return u.href; };
export function installStudio({ state, api, notice, sendControl, openCamera, updateControls, togglePreview, onPanel = () => {}, onClosePanel = () => {}, onBackPanel }) {
  let lastFocus = null, lastGraphic = null;
  let scoreTab = 'batting', statsTab = 'overview';
  let monitorCanvas = programSize(state.camera);
  function drawScore(s = state.score) {
    if (s) $('scoreGraphic').src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(graphicSvg(s, null, true, '', monitorCanvas));
    else $('scoreGraphic').removeAttribute('src');
  }
  function frameMonitor() {
    const canvas = (state.live || state.starting || state.stopping) && state.programCanvas || programSize(state.camera), changed = canvas.width !== monitorCanvas.width || canvas.height !== monitorCanvas.height;
    monitorCanvas = canvas;
    const box = $('viewfinder'), rect = programRect(box.clientWidth, box.clientHeight, canvas.width, canvas.height), surface = $('programSurface');
    document.documentElement.style.setProperty('--studio-notice-top', `${Math.max(8, box.getBoundingClientRect().top + 10)}px`);
    surface.style.width = `${rect.width}px`; surface.style.height = `${rect.height}px`;
    surface.style.setProperty('--program-unit', `${rect.width / 1920}px`);
    if (changed) drawScore();
  }
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(frameMonitor).observe($('viewfinder'));
  else window.addEventListener('resize', frameMonitor);
  frameMonitor();
  function tabs(root, attribute, changed) {
    const buttons = [...$(root).querySelectorAll('button')];
    for (const [i, b] of buttons.entries()) {
      b.tabIndex = i ? -1 : 0;
      b.addEventListener('click', () => { for (const x of buttons) { x.setAttribute('aria-selected', String(x === b)); x.tabIndex = x === b ? 0 : -1; } changed(b.dataset[attribute]); });
      b.addEventListener('keydown', e => { const next = e.key === 'ArrowRight' ? (i + 1) % buttons.length : e.key === 'ArrowLeft' ? (i + buttons.length - 1) % buttons.length : e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : null; if (next !== null) { e.preventDefault(); buttons[next].click(); buttons[next].focus(); } });
    }
  }
  tabs('scoreTabs', 'scoreTab', value => { scoreTab = value; tables(); });
  tabs('statsTabs', 'statTab', value => { statsTab = value; tables(); });
  document.body.append($('notice'), $('dismissNotice'));
  try { $('watchUrl').value = localStorage.getItem('boundary.watch') || ''; } catch {}
  function closeMenu() { $('studioMenu').hidden = true; $('moreButton').setAttribute('aria-expanded', 'false'); }
  $('moreButton').addEventListener('click', () => { const open = $('studioMenu').hidden; $('studioMenu').hidden = !open; $('moreButton').setAttribute('aria-expanded', String(open)); if (open) $('studioMenu').querySelector('button:not(:disabled)')?.focus(); });
  document.addEventListener('click', e => { if (!e.target.closest('#studioMenu, #moreButton')) closeMenu(); });
  $('studioMenu').addEventListener('keydown', e => {
    const buttons = [...$('studioMenu').querySelectorAll('button:not(:disabled)')]; const index = buttons.indexOf(document.activeElement);
    if (e.key === 'Escape') { closeMenu(); $('moreButton').focus(); }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) { e.preventDefault(); const next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : (index + (e.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length; buttons[next]?.focus(); }
  });
  $('monitorInfo').addEventListener('click', () => { panel('stats'); });
  function closeDrawer() { document.body.append($('notice'), $('dismissNotice')); $('drawer').hidden = true; $('drawerScrim').hidden = true; $('studio').inert = false; onClosePanel(); lastFocus?.focus(); }
  function panel(name, target) {
    if (!Object.hasOwn(label, name)) return;
    const focus = document.activeElement;
    if (!$('drawer').contains(focus)) lastFocus = $('studioMenu').contains(focus) ? $('moreButton') : focus;
    closeMenu();
    onPanel(name);
    $('drawerFeedback').append($('notice'), $('dismissNotice'));
    for (const p of document.querySelectorAll('[data-drawer]')) p.hidden = p.dataset.drawer !== name;
    $('drawerTitle').textContent = label[name]; $('drawer').hidden = false; $('drawerScrim').hidden = false; $('studio').inert = true;
    $('closeDrawer').focus(); $('drawer').scrollTop = 0;
    if (name === 'stats' || name === 'score') tables();
    if (target && !$(target)?.hidden) $(target)?.scrollIntoView({ block: 'start' });
  }
  for (const b of document.querySelectorAll('[data-panel]')) b.addEventListener('click', () => panel(b.dataset.panel, b.dataset.panelTarget));
  $('settingsButton').addEventListener('click', () => panel('streamSettings'));
  $('quickSetup').addEventListener('click', () => panel('settings'));
  $('viewersButton').addEventListener('click', () => panel('stats'));
  $('closeDrawer').addEventListener('click', closeDrawer); $('drawerScrim').addEventListener('click', closeDrawer);
  $('drawerBack').addEventListener('click', () => onBackPanel ? onBackPanel() : closeDrawer());
  $('drawer').addEventListener('keydown', e => {
    if (e.key === 'Escape') closeDrawer();
    if (e.key === 'Tab') {
      const nodes = [...$('drawer').querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),summary')].filter(n => n.getClientRects().length);
      if (!nodes.length) return;
      if (e.shiftKey && document.activeElement === nodes[0]) { e.preventDefault(); nodes.at(-1).focus(); }
      else if (!e.shiftKey && document.activeElement === nodes.at(-1)) { e.preventDefault(); nodes[0].focus(); }
    }
  });
  $('dismissNotice').addEventListener('click', () => notice(''));
  $('fitButton').addEventListener('click', () => {
    if (state.live || state.starting || state.stopping) return;
    const fill = $('studio').classList.toggle('fit-fill'); state.framing = fill ? 'fill' : 'fit';
    $('fitButton').querySelector('small').textContent = fill ? 'Fill' : 'Fit'; $('fitButton').setAttribute('aria-pressed', String(fill)); $('fitButton').setAttribute('aria-label', 'Camera framing: ' + (fill ? 'Fill' : 'Fit'));
    notice(fill ? 'Fill crops the camera to the broadcast frame. Portrait capture may lose detail when enlarged. Use Fit to keep the full camera image.' : 'Fit keeps the full camera image in the broadcast frame.');
  });
  async function fullscreen() {
    try {
      if (document.fullscreenElement) { await document.exitFullscreen(); return; }
      if (document.documentElement.requestFullscreen) { await document.documentElement.requestFullscreen();  }
      else document.body.classList.toggle('theater');
    } catch { document.body.classList.toggle('theater'); }
  }
  $('fullscreenTop').addEventListener('click', () => { closeMenu(); fullscreen(); }); $('fullscreenBottom').addEventListener('click', fullscreen);
  document.addEventListener('fullscreenchange', () => { for (const id of ['fullscreenTop', 'fullscreenBottom']) $(id).setAttribute('aria-label', document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen'); });
  $('resolutionOptions').addEventListener('click', async e => {
    const b = e.target.closest('button[data-resolution]'); if (!b || b.disabled) return;
    state.captureResolution = b.dataset.resolution; updateControls();
    if (state.stream) await openCamera(state.camera?.deviceId || '');
    else notice(`${state.captureResolution === 'auto' ? 'Auto will try 1080p, then 720p/480p if unsupported' : state.captureResolution + 'p capture selected'}. Open the camera to check support.`);
  });
  function resetMonitor() { lastGraphic = null; graphic(null); $('cameraVideo').muted = true; }
  $('jumpLive').addEventListener('click', () => { if (state.stream) togglePreview(false); else openCamera(); });
  $('showBatting').addEventListener('click', () => sendControl({ type: 'card', kind: 'batting' }));
  $('showBowling').addEventListener('click', () => sendControl({ type: 'card', kind: 'bowling' }));
  $('volumeButton').addEventListener('click', () => { if (!$('micToggle').disabled) $('micToggle').click(); });
  async function watch() { const url = safeWatch($('watchUrl').value.trim()); try { localStorage.setItem('boundary.watch', url); } catch {} return url; }
  $('copyWatch').addEventListener('click', async () => { try { const url = await watch(); await navigator.clipboard.writeText(url); notice('Public broadcast link copied.', 'success'); } catch (e) { $('watchUrl').focus(); $('watchUrl').select(); notice(e.message || 'Copy the selected public link manually.', 'error'); } });
  $('shareWatch').addEventListener('click', async () => { try { const url = await watch(); if (navigator.share) await navigator.share({ title: state.score?.series || 'Live cricket', url }); else { await navigator.clipboard.writeText(url); notice('Public broadcast link copied.', 'success'); } } catch (e) { if (e.name !== 'AbortError') notice(e.message, 'error'); } });
  $('castButton').addEventListener('click', async () => {
    try { const v = $('cameraVideo'); if (v.webkitShowPlaybackTargetPicker) { v.webkitShowPlaybackTargetPicker(); return; } if (v.remote?.prompt) { await v.remote.prompt(); return; } throw new Error(); }
    catch { panel('share'); notice('This browser cannot cast the local camera source. Open your public broadcast in its platform player and use that player’s Cast or AirPlay control.'); }
  });
  $('inningsSelect').addEventListener('change', tables);
  function table(title, rows, columns) {
    const section = el('div'); section.append(el('p', title, 'card-caption'));
    if (!rows?.length) { section.append(el('p', 'Player rows are not supplied for this innings by the current feed.', 'helper')); return section; }
    const t = el('table', null, 'data-table'), head = el('tr'); for (const [name] of columns) head.append(el('th', name)); const thead = el('thead'); thead.append(head); t.append(thead);
    const body = el('tbody'); for (const p of rows) { const row = el('tr'); for (const [, key] of columns) { const cell = el('td', p[key] === '' || p[key] == null ? '—' : p[key]); if (key === 'name' && p.status) cell.append(el('small', p.status, 'dismissal')); row.append(cell); } body.append(row); } t.append(body); section.append(t); return section;
  }
  function tables() {
    const s = state.score, select = $('inningsSelect');
    const selection = select.value || 'current', options = s?.inningsCards || [];
    const key = options.map(c => `${c.id}:${c.team}:${c.runs}:${c.wickets}`).join('|');
    if (select.dataset.key !== key) {
      select.dataset.key = key; select.replaceChildren();
      const first = el('option', 'Current innings'); first.value = 'current'; select.append(first);
      for (const c of options) { const option = el('option', `${c.team} · ${c.runs}/${c.wickets} (${c.overs})`); option.value = c.id; select.append(option); }
      select.value = options.some(c => c.id === selection) ? selection : 'current';
    }
    const selected = options.find(c => c.id === select.value), current = !selected || selected.id === s?.innings;
    const available = [...(s?.batters || [])]; if (s?.lastOut && !available.some(p => p.id && p.id === s.lastOut.id || p.name === s.lastOut.name)) available.push(s.lastOut);
    const batting = selected?.batting?.length ? selected.batting : current ? (s?.cards?.batting?.length ? s.cards.batting : available) : [];
    const bowling = selected?.bowlers?.length ? selected.bowlers : current ? (s?.cards?.bowling?.length ? s.cards.bowling : s?.bowler ? [s.bowler] : []) : [];
    const root = $('scoreTables'); root.replaceChildren();
    if (scoreTab === 'batting') root.append(table(`BATTING${selected ? ' · ' + selected.team : ''}`, batting, [['Batter', 'name'], ['R', 'runs'], ['B', 'balls'], ['4s', 'fours'], ['6s', 'sixes'], ['SR', 'strikeRate']]));
    else if (scoreTab === 'bowling') root.append(table(`BOWLING${selected ? ' · ' + selected.bowling : ''}`, bowling, [['Bowler', 'name'], ['O', 'overs'], ['M', 'maidens'], ['R', 'runs'], ['W', 'wickets'], ['Econ', 'economy']]));
    else {
      root.append(el('p', 'SOURCE COMMENTARY', 'card-caption'));
      for (const row of [...(s?.commentary || [])].reverse()) { const item = el('article', null, 'commentary-row'); if (row.over) item.append(el('strong', row.over)); item.append(el('p', row.text)); root.append(item); }
      if (!s?.commentary?.length) root.append(el('p', 'Commentary is not supplied by this CricClubs feed. No ball commentary is generated from score changes.', 'source-empty'));
    }
    const detail = selected || options.find(c => c.id === s?.innings);
    if (scoreTab === 'batting' && detail) {
      if (detail.extras?.text) root.append(el('p', detail.extras.text, 'helper'));
      if (detail.didNotBat?.length) root.append(el('p', 'Did not bat: ' + detail.didNotBat.join(', '), 'helper'));
      for (const text of detail.fallOfWickets || []) root.append(el('p', 'Fall of wickets: ' + text, 'helper'));
    }
    $('sourceNote').textContent = s ? `${s.source} · Club ${s.clubId} / Match ${s.matchId} · ${selected?.complete || current && s.cards?.complete ? 'Complete card supplied or source tables reconciled.' : 'Supplied records only; full innings card not confirmed.'} ${s.scorecard?.message || (s.source === 'CricClubs' ? state.session ? 'Full scorecard data is not available from the relay.' : 'Connect the relay for full scorecard reading.' : '')} Missing source fields show —. Commentary lists source text for the match.` : 'Load a match to see source data.';
    const stats = $('statsTables'); stats.replaceChildren();
    if (!s) return stats.append(el('p', 'Load a match to see source statistics.', 'source-empty'));
    const teams = s.teams?.length ? s.teams : [{ code: s.batting, name: s.batting, runs: s.runs, wickets: s.wickets, overs: s.overs }];
    if (statsTab === 'overview') {
      const metrics = el('div', null, 'source-metrics'); for (const [value, caption] of [[s.runs, 'Runs'], [s.wickets, 'Wickets'], [s.overs, 'Overs']]) { const m = el('div'); m.append(el('strong', value), el('span', caption)); metrics.append(m); } stats.append(metrics);
      stats.append(table('TEAMS', teams, [['Team', 'name'], ['R', 'runs'], ['W', 'wickets'], ['O', 'overs']]));
      for (const value of [s.stats?.toss, s.result, s.stats?.playerOfMatch ? 'Player of the match: ' + s.stats.playerOfMatch : '']) if (value) stats.append(el('p', value, 'helper'));
    } else if (statsTab === 'partnership') {
      const p = s.stats?.partnership;
      if (p) stats.append(el('p', `${p.runs} runs · ${p.balls} balls`, 'partnership-total'), table('SOURCE PARTNERSHIP CONTRIBUTIONS', p.batters, [['Batter', 'name'], ['R', 'runs'], ['B', 'balls']]));
      else stats.append(el('p', 'Partnership statistics are not supplied by this feed.', 'source-empty'));
    } else {
      const key = statsTab === 'runs' ? 'runs' : 'wickets', max = Math.max(key === 'wickets' ? 10 : 1, ...teams.map(t => Number(t[key]) || 0));
      for (const team of teams) { const line = el('div', null, 'source-bar'); line.append(el('span', team.name), el('strong', team[key])); const meter = el('meter'); meter.min = 0; meter.max = max; meter.value = Number(team[key]); meter.setAttribute('aria-label', `${team.name} ${key}`); line.append(meter); stats.append(line); }
      stats.append(table(key === 'runs' ? 'AVAILABLE BATTERS' : 'AVAILABLE BOWLERS', key === 'runs' ? batting : bowling, key === 'runs' ? [['Batter', 'name'], ['R', 'runs'], ['B', 'balls']] : [['Bowler', 'name'], ['O', 'overs'], ['R', 'runs'], ['W', 'wickets']]));
    }
    stats.append(el('p', 'Values come from the selected source match. Missing players or statistics are not estimated.', 'helper'));
  }
  function graphics(a) {
    const stats = $('sessionStats'); stats.replaceChildren();
    for (const [k, v] of [['Capture', state.camera ? `${state.camera.width} × ${state.camera.height}` : 'Camera off'], ['Camera frame rate', state.camera?.frameRate ? `${Math.round(state.camera.frameRate)} fps` : '—'], ['On-air graphic', a?.current?.type || 'Live camera'], ['Cloud studio', state.session ? 'Connected' : 'Disconnected'], ['Viewer count', 'Check platform analytics']]) stats.append(el('dt', k), el('dd', v));
  }
  function score(s) {
    if (!s) { $('scoreGraphic').removeAttribute('src'); tables(); return; }
    drawScore(s);
    $('seriesTitle').textContent = s.series || `CricClubs · Match ${s.matchId}`; $('groundTitle').textContent = `${s.ground || 'Club ' + s.clubId} · Match ${s.matchId}`;
    $('oppositionTeam').textContent = s.teams?.find(t => t.code === s.bowling || t.name === s.bowling)?.name || s.bowling;
    $('battingLogo').textContent = s.batting.slice(0, 4); $('bowlingLogo').textContent = s.bowling.slice(0, 4);
    $('requiredRate').textContent = 'RRR ' + (s.requiredRate && s.requiredRate !== '--.--' ? s.requiredRate : '—');
    $('overlayDetail').textContent = s.result || s.detail || 'CricClubs live score';
    for (const [n, p] of [[1, s.batters?.[0]], [2, s.batters?.[1]]]) { $(`batter${n}Name`).textContent = p?.name || '—'; $(`batter${n}Runs`).textContent = p ? `${p.runs} (${p.balls})` : '—'; }
    $('bowlerName').textContent = s.bowler?.name || '—'; $('bowlerFigures').textContent = s.bowler ? `${s.bowler.wickets}-${s.bowler.runs} (${s.bowler.overs})` : '—';
    $('overBalls').replaceChildren(); for (const b of (s.balls || [])) $('overBalls').append(el('span', b === '.' ? '0' : b, `ball ${b === '4' ? 'four' : b === '6' ? 'six' : b.toUpperCase().includes('W') && !b.toLowerCase().includes('wd') ? 'wicket' : ''}`));
    tables();
  }
  function graphic(g) {
    lastGraphic = g;
    $('programGraphic').hidden = !g; $('studio').classList.toggle('graphic-active', Boolean(g));
    if (g?.png && /^[A-Za-z0-9+/=]+$/.test(g.png) && g.png.length < 2_000_000) $('programGraphic').src = 'data:image/png;base64,' + g.png;
    else if (!g) $('programGraphic').removeAttribute('src');
    $('onAirAction').textContent = g ? `${g.type.toUpperCase()} ON AIR · ${g.duration}s` : 'Local camera monitor';
  }
  function update() {
    const locked = state.live || state.starting || state.stopping;
    $('fitButton').disabled = locked; $('fitButton').setAttribute('aria-label', 'Camera framing: ' + (state.framing === 'fill' ? 'Fill' : 'Fit'));
    frameMonitor();
    if (!state.camera) $('cameraSpec').textContent = `${state.captureResolution === 'auto' ? 'Auto' : state.captureResolution + 'p'} target · 30 fps`;
    for (const id of ['youtube', 'facebook']) $(id + 'Resolution').textContent = `${state.camera?.height ? captureProfile(state.camera) + 'p' : state.captureResolution === 'auto' ? 'Auto' : state.captureResolution + 'p'} · ${state.camera?.height > state.camera?.width ? 'portrait' : 'landscape'}`;
    for (const b of $('resolutionOptions').querySelectorAll('button')) { b.disabled = locked || state.cameraBusy; b.classList.toggle('selected', b.dataset.resolution === state.captureResolution); b.setAttribute('aria-pressed', String(b.dataset.resolution === state.captureResolution)); }
    for (const id of ['showBatting', 'showBowling']) $(id).disabled = !state.live || !state.programEnabled;
    $('previewToggle').replaceChildren(icon(state.previewOff ? 'play' : 'pause'), el('span', state.previewOff ? 'Resume local monitor' : 'Pause local monitor'));
    $('studio').classList.toggle('camera-open', Boolean(state.stream));
    $('studio').classList.toggle('is-streaming', Boolean(state.live)); $('previewToggle').setAttribute('aria-label', state.previewOff ? 'Resume local monitor' : 'Pause local monitor · broadcast continues');
    $('volumeButton').disabled = !state.stream?.getAudioTracks().length;
    $('volumeButton').replaceChildren(icon(state.micMuted ? 'volume-off' : 'volume'));
    $('volumeButton').setAttribute('aria-label', state.micMuted ? 'Unmute live microphone' : 'Mute live microphone');
    $('volumeButton').setAttribute('aria-pressed', String(state.micMuted));
    $('transportHint').textContent = state.live ? state.micMuted ? 'Microphone muted' : 'Sending live camera' : 'One camera. One upload.';
    graphics(state.graphics);

  }
  return { panel, closeDrawer, update, score, graphics, graphic, resetMonitor };
}
