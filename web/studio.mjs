const $ = id => document.getElementById(id);
const label = { settings: 'Stream settings', score: 'Score & scorecards', stats: 'Broadcast statistics', clips: 'Instant replay', share: 'Share broadcast' };
const el = (tag, content, className) => { const n = document.createElement(tag); if (content != null) n.textContent = String(content); if (className) n.className = className; return n; };
const icon = id => { const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), use = document.createElementNS(svg.namespaceURI, 'use'); use.setAttribute('href', '#i-' + id); svg.append(use); return svg; };
const safeWatch = value => { const u = new URL(value); if (u.protocol !== 'https:' || u.username || u.password || !['youtube.com', 'youtu.be', 'facebook.com', 'fb.watch', 'instagram.com'].some(h => u.hostname === h || u.hostname.endsWith('.' + h))) throw new Error('Enter your public YouTube, Facebook or Instagram watch URL.'); return u.href; };
export function installStudio({ state, api, notice, sendControl, openCamera, updateControls, togglePreview }) {
  let lastFocus = null, objectUrl = null, request = 0, statsKey = '', dragging = false, lastGraphic = null;
  document.body.append($('notice'), $('dismissNotice'));
  try { $('watchUrl').value = localStorage.getItem('boundary.watch') || ''; } catch {}
  function closeDrawer() { $('drawer').hidden = true; $('drawerScrim').hidden = true; $('studio').inert = false; lastFocus?.focus(); }
  function panel(name) {
    lastFocus = document.activeElement;
    for (const p of document.querySelectorAll('[data-drawer]')) p.hidden = p.dataset.drawer !== name;
    $('drawerTitle').textContent = label[name]; $('drawer').hidden = false; $('drawerScrim').hidden = false; $('studio').inert = true;
    $('closeDrawer').focus(); $('drawer').scrollTop = 0;
    if (name === 'stats' || name === 'score') tables();
  }
  for (const b of document.querySelectorAll('[data-panel]')) b.addEventListener('click', () => panel(b.dataset.panel));
  for (const id of ['backButton', 'settingsButton', 'quickSetup']) $(id).addEventListener('click', () => panel('settings'));
  $('viewersButton').addEventListener('click', () => panel('stats'));
  $('closeDrawer').addEventListener('click', closeDrawer); $('drawerScrim').addEventListener('click', closeDrawer);
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
  $('fitButton').addEventListener('click', () => { const fill = $('studio').classList.toggle('fit-fill'); $('fitButton').querySelector('small').textContent = fill ? 'Fill' : 'Fit'; $('fitButton').setAttribute('aria-pressed', String(fill)); });
  async function fullscreen() {
    try {
      if (document.fullscreenElement) { await document.exitFullscreen(); return; }
      if (document.documentElement.requestFullscreen) { await document.documentElement.requestFullscreen(); try { await screen.orientation?.lock('landscape'); } catch {} }
      else document.body.classList.toggle('theater');
    } catch { document.body.classList.toggle('theater'); }
  }
  $('fullscreenTop').addEventListener('click', fullscreen); $('fullscreenBottom').addEventListener('click', fullscreen);
  document.addEventListener('fullscreenchange', () => { for (const id of ['fullscreenTop', 'fullscreenBottom']) $(id).setAttribute('aria-label', document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen'); });
  $('resolutionOptions').addEventListener('click', async e => {
    const b = e.target.closest('button[data-resolution]'); if (!b || b.disabled) return;
    state.captureResolution = b.dataset.resolution; updateControls();
    if (state.stream) await openCamera(state.camera?.deviceId || '');
    else notice(`${state.captureResolution === 'auto' ? 'Auto will try 1080p, then 720p/480p if unsupported' : state.captureResolution + 'p capture selected'}. Open the camera to check support.`);
  });
  function resetMonitor() {
    request++; if (objectUrl) URL.revokeObjectURL(objectUrl); objectUrl = null; state.monitorClip = false;
    $('cameraVideo').removeAttribute('src'); $('replayMonitorBadge').hidden = true;
    $('cameraVideo').muted = true; $('monitorVolume').value = 0;
    graphic(lastGraphic);
  }
  function returnLive() {
    resetMonitor(); $('cameraVideo').srcObject = state.stream;
    if (state.stream) { $('cameraVideo').hidden = false; state.previewOff = false; togglePreview(false); }
    update();
  }
  $('jumpLive').addEventListener('click', returnLive);
  async function clipVideo(id, download = false) {
    const identity = state.session, generation = ++request;
    const r = await fetch(state.relay + `/api/clips/${id}.mp4`, { headers: { Authorization: `Bearer ${identity}` }, credentials: 'omit', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(45000) });
    if (!r.ok) { let m; try { m = await r.json(); } catch {} throw new Error(m?.error || 'Clip could not be prepared.'); }
    const blob = await r.blob(); if (identity !== state.session || generation !== request) return;
    if (blob.size > 32 * 1024 * 1024 || blob.size < 100) throw new Error('Clip response was outside its permitted size.');
    const url = URL.createObjectURL(blob);
    if (download) { const a = el('a'); a.href = url; a.download = `Boundary-Replay-${id}.mp4`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); return; }
    resetMonitor(); objectUrl = url; state.monitorClip = true; graphic(lastGraphic);
    $('cameraVideo').srcObject = null; $('cameraVideo').src = url; $('cameraVideo').hidden = false; $('cameraPlaceholder').hidden = true; $('previewHidden').hidden = true;
    state.previewOff = false; $('replayMonitorBadge').hidden = false; closeDrawer();
    await $('cameraVideo').play(); update();
  }
  async function select(behind = 0, preview = false) {
    try { const clip = await api('/api/clip/select', { method: 'POST', body: JSON.stringify({ behind }) });
      const snapshot = await api('/api/automation'); state.automation = snapshot; automation(snapshot);
      if (preview) await clipVideo(clip.id); else notice('Ball clip saved to the private buffer. Preview it or put it on air from Clips.', 'success');
    } catch (e) { notice(e.message, 'error'); }
  }
  $('clipLatest').addEventListener('click', () => select());
  for (const id of ['markBall', 'markBallClips']) $(id).addEventListener('click', () => sendControl({ type: 'mark-ball' }));
  $('replayTimeline').addEventListener('pointerdown', () => { dragging = true; });
  for (const event of ['pointerup', 'pointercancel']) $('replayTimeline').addEventListener(event, () => { dragging = false; });
  $('replayTimeline').addEventListener('input', () => { $('timelineLabel').textContent = `${Math.max(0, Number($('replayTimeline').max) - Number($('replayTimeline').value)).toFixed(1)}s behind live · release to preview`; });
  $('replayTimeline').addEventListener('change', async () => { const behind = Math.max(0, Number($('replayTimeline').max) - Number($('replayTimeline').value)); await select(behind, true); dragging = false; });
  $('showBatting').addEventListener('click', () => sendControl({ type: 'card', kind: 'batting' })); $('showBowling').addEventListener('click', () => sendControl({ type: 'card', kind: 'bowling' }));
  $('monitorVolume').addEventListener('input', () => { if (!state.monitorClip) return; const v = Number($('monitorVolume').value); $('cameraVideo').volume = v; $('cameraVideo').muted = v === 0; });
  $('volumeButton').addEventListener('click', () => { if (!state.monitorClip) return; const v = $('cameraVideo'); v.muted = !v.muted; if (!v.muted && v.volume === 0) v.volume = .6; $('monitorVolume').value = v.muted ? 0 : v.volume; });
  $('cameraVideo').addEventListener('ended', () => { if (state.monitorClip) returnLive(); });
  async function watch() { const url = safeWatch($('watchUrl').value.trim()); try { localStorage.setItem('boundary.watch', url); } catch {} return url; }
  $('copyWatch').addEventListener('click', async () => { try { const url = await watch(); await navigator.clipboard.writeText(url); notice('Public broadcast link copied.', 'success'); } catch (e) { $('watchUrl').focus(); $('watchUrl').select(); notice(e.message || 'Copy the selected public link manually.', 'error'); } });
  $('shareWatch').addEventListener('click', async () => { try { const url = await watch(); if (navigator.share) await navigator.share({ title: state.score?.series || 'Live cricket', url }); else { await navigator.clipboard.writeText(url); notice('Public broadcast link copied.', 'success'); } } catch (e) { if (e.name !== 'AbortError') notice(e.message, 'error'); } });
  $('castButton').addEventListener('click', async () => {
    try { const v = $('cameraVideo'); if (v.webkitShowPlaybackTargetPicker) { v.webkitShowPlaybackTargetPicker(); return; } if (v.remote?.prompt) { await v.remote.prompt(); return; } throw new Error(); }
    catch { panel('share'); notice('This browser cannot cast the local camera/replay source. Open your public broadcast in its platform player and use that player’s Cast or AirPlay control.'); }
  });
  function table(title, rows, columns) {
    const section = el('div'); section.append(el('p', title, 'card-caption'));
    if (!rows?.length) { section.append(el('p', 'Waiting for available player data.', 'helper')); return section; }
    const t = el('table', null, 'data-table'), head = el('tr'); for (const [name] of columns) head.append(el('th', name)); const thead = el('thead'); thead.append(head); t.append(thead);
    const body = el('tbody'); for (const p of rows) { const row = el('tr'); for (const [, key] of columns) row.append(el('td', p[key] === '' || p[key] == null ? '—' : p[key])); body.append(row); } t.append(body); section.append(t); return section;
  }
  function tables() {
    const cards = state.automation?.cards, s = state.score;
    for (const id of ['scoreTables', 'statsTables']) {
      const root = $(id); root.replaceChildren();
      root.append(table('BATTING', cards?.batting || s?.cards?.batting?.length && s.cards.batting || s?.batters, [['Batter', 'name'], ['R', 'runs'], ['B', 'balls'], ['4s', 'fours'], ['6s', 'sixes']]));
      root.append(table('BOWLING', cards?.bowling || s?.cards?.bowling?.length && s.cards.bowling || (s?.bowler ? [s.bowler] : []), [['Bowler', 'name'], ['O', 'overs'], ['M', 'maidens'], ['R', 'runs'], ['W', 'wickets']]));
      root.append(el('p', cards?.complete ? 'Full card supplied by feed.' : 'Available player statistics. This feed does not guarantee a complete innings card.', 'helper'));
    }
  }
  function automation(a) {
    const sec = Number(a?.bufferSeconds || 0); $('bufferInfo').textContent = `${sec.toFixed(1)}s buffered · ${a?.memoryMB || 0} MB · laptop memory only`;
    $('replayTimeline').disabled = !state.live || sec < 1;
    if (!dragging && !state.monitorClip) { $('replayTimeline').max = Math.max(1, sec); $('replayTimeline').value = Math.max(1, sec); $('timelineLabel').textContent = sec >= 1 ? `${sec.toFixed(1)}s private replay buffer` : 'Replay buffer warming up'; }
    $('clipLatest').disabled = !state.live || sec < 1;
    const key = JSON.stringify(a?.clips || []);
    if ($('clipList').dataset.key !== key) {
      $('clipList').dataset.key = key; $('clipList').replaceChildren();
      for (const c of a?.clips || []) {
        const article = el('article'), actions = el('div', null, 'row'); article.append(el('strong', c.title), el('p', `${c.duration.toFixed(1)}s · ${c.timing} · ${new Date(c.createdAt).toLocaleTimeString()}`));
        for (const [name, action] of [['Preview', () => clipVideo(c.id)], ['On air', () => sendControl({ type: 'replay', clipId: c.id })], ['Download', () => clipVideo(c.id, true)]]) {
          const b = el('button', name, name === 'On air' ? 'primary' : 'secondary'); b.addEventListener('click', async () => { b.disabled = true; try { await action(); } catch (e) { notice(e.message, 'error'); } finally { b.disabled = false; } }); actions.append(b);
        }
        article.append(actions); $('clipList').append(article);
      }
      if (!a?.clips?.length) $('clipList').append(el('p', 'Confirmed boundary clips will appear here. Use Clip last ball to save a manual selection.', 'helper'));
    }
    const cardKey = JSON.stringify(a?.cards || null); if (cardKey !== statsKey) { statsKey = cardKey; tables(); }
    const stats = $('sessionStats'); stats.replaceChildren();
    for (const [k, v] of [['Capture', state.camera ? `${state.camera.width} × ${state.camera.height}` : 'Camera off'], ['Camera frame rate', state.camera?.frameRate ? `${Math.round(state.camera.frameRate)} fps` : '—'], ['Replay buffer', `${sec.toFixed(1)} seconds`], ['Replay RAM', `${a?.memoryMB || 0} MB`], ['On-air graphic', a?.current?.type || 'Live camera'], ['Viewer count', 'Check platform analytics']]) stats.append(el('dt', k), el('dd', v));
  }
  function score(s) {
    if (!s) return;
    $('seriesTitle').textContent = s.series || 'FWCWL 2026–27'; $('groundTitle').textContent = `${s.ground || 'Florida West Coast Winter League'} · Match ${s.matchId}`;
    $('oppositionTeam').textContent = s.teams?.find(t => t.code !== s.batting)?.name || s.bowling;
    $('battingLogo').textContent = s.batting.slice(0, 4); $('bowlingLogo').textContent = s.bowling.slice(0, 4);
    $('requiredRate').textContent = 'RRR ' + (s.requiredRate && s.requiredRate !== '--.--' ? s.requiredRate : '—');
    $('overlayDetail').textContent = s.result || s.detail || 'CricClubs live score';
    for (const [n, p] of [[1, s.batters?.[0]], [2, s.batters?.[1]]]) { $(`batter${n}Name`).textContent = p?.name || '—'; $(`batter${n}Runs`).textContent = p ? `${p.runs} (${p.balls})` : '—'; }
    $('bowlerName').textContent = s.bowler?.name || '—'; $('bowlerFigures').textContent = s.bowler ? `${s.bowler.wickets}-${s.bowler.runs} (${s.bowler.overs})` : '—';
    $('overBalls').replaceChildren(); for (const b of (s.balls || []).slice(-6)) $('overBalls').append(el('span', b === '.' ? '0' : b, `ball ${b === '4' ? 'four' : b === '6' ? 'six' : b.toUpperCase().includes('W') && !b.toLowerCase().includes('wd') ? 'wicket' : ''}`));
    tables();
  }
  function graphic(g) {
    lastGraphic = g;
    $('programGraphic').hidden = !g || state.monitorClip; $('studio').classList.toggle('graphic-active', Boolean(g) && !state.monitorClip);
    if (g?.png && /^[A-Za-z0-9+/=]+$/.test(g.png) && g.png.length < 2_000_000) $('programGraphic').src = 'data:image/png;base64,' + g.png;
    else if (!g) $('programGraphic').removeAttribute('src');
    $('onAirAction').textContent = g ? g.type === 'replay' ? 'REPLAY ON AIR · camera monitor stays live' : `${g.type.toUpperCase()} ON AIR · ${g.duration}s` : 'Local camera monitor';
  }
  function update() {
    const locked = state.live || state.starting || state.stopping;
    if (!state.camera) $('cameraSpec').textContent = `${state.captureResolution === 'auto' ? 'Auto' : state.captureResolution + 'p'} target · 30 fps`;
    for (const id of ['youtube', 'facebook']) $(id + 'Resolution').textContent = `${state.camera?.height ? state.camera.height + 'p' : state.captureResolution === 'auto' ? 'Auto' : state.captureResolution + 'p'} · landscape`;
    for (const b of $('resolutionOptions').querySelectorAll('button')) { b.disabled = locked || state.cameraBusy; b.classList.toggle('selected', b.dataset.resolution === state.captureResolution); }
    for (const id of ['markBall', 'markBallClips', 'showBatting', 'showBowling']) $(id).disabled = !state.live || !state.programEnabled;
    $('previewToggle').replaceChildren(icon(state.previewOff ? 'play' : 'pause')); $('previewToggle').setAttribute('aria-label', state.previewOff ? 'Resume local monitor' : 'Pause local monitor · broadcast continues');
    $('volumeButton').disabled = !state.monitorClip; $('monitorVolume').disabled = !state.monitorClip; $('volumeButton').setAttribute('aria-label', state.monitorClip ? 'Toggle replay monitor audio' : 'Camera monitor stays muted to prevent feedback');
    if (!state.live) { $('replayTimeline').disabled = true; $('clipLatest').disabled = true; }
  }
  return { closeDrawer, update, score, automation, graphic, resetMonitor };
}
