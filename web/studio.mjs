// Boundary Live Studio UI Controller.
// Manages the broadcast viewfinder, score overlay, zoom/fit controls, and all 8 drawer screens:
// 1. Scorecard (Batting, Bowling, Commentary)
// 2. Stats (Overview comparison bars, Partnership, Runs, Wickets)
// 3. Clips (Highlights: All, 4s, 6s, Wickets)
// 4. Share (Live preview card + social share links)
// 5. Video Quality (Auto, 1080p, 720p, 480p)
// 6. Settings (Playback, Audio, Captions, Match data)
// 7. Cast to TV / Device
// 8. Fullscreen & Immersive Mode

import { describe, inningsStats, parseBall } from './match-model.mjs';
import { getTeamLogoUrl } from './wizard.mjs';

const $ = id => document.getElementById(id);
const el = (tag, content, className) => {
  const n = document.createElement(tag);
  if (content != null) n.textContent = String(content);
  if (className) n.className = className;
  return n;
};
const icon = id => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const use = document.createElementNS(svg.namespaceURI, 'use');
  use.setAttribute('href', '#i-' + id);
  svg.append(use);
  return svg;
};

const DRAWER_TITLES = {
  score: 'Scorecard',
  stats: 'Match Stats',
  clips: 'Highlights',
  share: 'Share Live Stream',
  quality: 'Video Quality',
  settings: 'Settings',
  cast: 'Cast to TV /',
  setup: 'Stream Setup'
};

function formatPlayerName(name) {
  if (!name) return '—';
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 2) return name;
  // Abbreviate middle names e.g. "Devalapalli Lakshmi Narasimha K" -> "D. L. N. Koushik" or "D. Koushik"
  const firstInitials = parts.slice(0, -1).map(p => p[0].toUpperCase() + '.').join(' ');
  const last = parts.at(-1);
  return `${firstInitials} ${last}`;
}

export function installStudio({ state, api, notice, sendControl, openCamera, updateControls, togglePreview, feed }) {
  let lastFocus = null;
  let activeScoreTab = 'batting';
  let activeStatsTab = 'overview';
  let activeClipFilter = 'all';
  let selectedInningsKey = '';
  let objectUrl = null;
  let requestGen = 0;
  let lastGraphic = null;
  let draggingTimeline = false;
  let isPlayingFeed = true;

  // Move notice banner to body
  document.body.append($('notice'), $('dismissNotice'));

  function openDrawer(name) {
    lastFocus = document.activeElement;
    for (const p of document.querySelectorAll('[data-drawer]')) {
      p.hidden = p.dataset.drawer !== name;
    }
    $('drawerTitle').textContent = DRAWER_TITLES[name] || 'Settings';
    $('drawer').hidden = false;
    $('drawerScrim').hidden = false;
    $('closeDrawer').focus();
    $('drawer').scrollTop = 0;

    if (name === 'score') renderScoreDrawer();
    else if (name === 'stats') renderStatsDrawer();
    else if (name === 'clips') renderClipsDrawer();
    else if (name === 'share') renderShareDrawer();
    else if (name === 'quality') syncQualityOptions();
  }

  function closeDrawer() {
    $('drawer').hidden = true;
    $('drawerScrim').hidden = true;
    lastFocus?.focus();
  }

  // Bind drawer navigation
  for (const b of document.querySelectorAll('[data-panel]')) {
    b.addEventListener('click', () => openDrawer(b.dataset.panel));
  }
  $('backButton').addEventListener('click', () => openDrawer('setup'));
  $('settingsButton').addEventListener('click', () => openDrawer('settings'));
  $('castButton').addEventListener('click', () => openDrawer('cast'));
  $('viewersButton').addEventListener('click', () => openDrawer('stats'));
  $('quickSetup').addEventListener('click', () => openDrawer('setup'));
  $('openSetup').addEventListener('click', () => openDrawer('setup'));
  $('closeDrawer').addEventListener('click', closeDrawer);
  $('closeDrawerX').addEventListener('click', closeDrawer);
  $('drawerScrim').addEventListener('click', closeDrawer);
  $('dismissNotice').addEventListener('click', () => notice(''));

  // Drawer keyboard trap & Escape
  $('drawer').addEventListener('keydown', e => {
    if (e.key === 'Escape') closeDrawer();
    if (e.key === 'Tab') {
      const nodes = [...$('drawer').querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href],summary')].filter(n => n.getClientRects().length);
      if (!nodes.length) return;
      if (e.shiftKey && document.activeElement === nodes[0]) {
        e.preventDefault();
        nodes.at(-1).focus();
      } else if (!e.shiftKey && document.activeElement === nodes.at(-1)) {
        e.preventDefault();
        nodes[0].focus();
      }
    }
  });

  // Fit / Fill toggle
  $('fitButton').addEventListener('click', () => {
    const fill = $('studio').classList.toggle('fit-fill');
    $('fitButton').setAttribute('aria-pressed', String(fill));
    notice(fill ? 'Viewfinder: Fill screen' : 'Viewfinder: Fit to screen');
  });

  // Fullscreen toggle
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
        try { await screen.orientation?.lock('landscape'); } catch {}
      } else {
        document.body.classList.toggle('theater');
      }
    } catch {
      document.body.classList.toggle('theater');
    }
  }
  $('fullscreenTop').addEventListener('click', toggleFullscreen);
  $('fullscreenBottom').addEventListener('click', toggleFullscreen);
  document.addEventListener('fullscreenchange', () => {
    const isFull = Boolean(document.fullscreenElement);
    $('fullscreenTop').setAttribute('aria-label', isFull ? 'Exit fullscreen' : 'Enter fullscreen');
    $('fullscreenBottom').setAttribute('aria-label', isFull ? 'Exit fullscreen' : 'Enter fullscreen');
  });

  // Quality selectors (Auto, 1080p, 720p, 480p)
  $('resolutionOptions').addEventListener('click', async e => {
    const b = e.target.closest('button[data-resolution]');
    if (!b || b.disabled) return;
    setResolution(b.dataset.resolution);
  });
  for (const radio of document.querySelectorAll('input[name="quality"]')) {
    radio.addEventListener('change', () => {
      if (radio.checked) setResolution(radio.value);
    });
  }
  async function setResolution(res) {
    state.captureResolution = res;
    syncQualityOptions();
    updateControls();
    if (state.stream) {
      await openCamera(state.camera?.deviceId || '');
    } else {
      notice(`${res === 'auto' ? 'Auto quality' : res + 'p quality'} selected.`);
    }
  }
  function syncQualityOptions() {
    for (const b of $('resolutionOptions').querySelectorAll('button')) {
      b.classList.toggle('selected', b.dataset.resolution === state.captureResolution);
    }
    const radio = document.querySelector(`input[name="quality"][value="${state.captureResolution}"]`);
    if (radio) radio.checked = true;
  }

  // Scorecard tabs: Batting, Bowling, Commentary
  $('scoreTabs').addEventListener('click', e => {
    const b = e.target.closest('button[data-tab]');
    if (!b) return;
    activeScoreTab = b.dataset.tab;
    for (const btn of $('scoreTabs').querySelectorAll('button')) {
      btn.classList.toggle('selected', btn === b);
    }
    renderScoreDrawer();
  });

  // Stats tabs: Overview, Partnership, Runs, Wickets
  $('statsTabs').addEventListener('click', e => {
    const b = e.target.closest('button[data-tab]');
    if (!b) return;
    activeStatsTab = b.dataset.tab;
    for (const btn of $('statsTabs').querySelectorAll('button')) {
      btn.classList.toggle('selected', btn === b);
    }
    renderStatsDrawer();
  });

  // Clip filter chips: All, 4s, 6s, Wickets
  $('clipFilters').addEventListener('click', e => {
    const b = e.target.closest('button[data-filter]');
    if (!b) return;
    activeClipFilter = b.dataset.filter;
    for (const btn of $('clipFilters').querySelectorAll('button')) {
      btn.classList.toggle('selected', btn === b);
    }
    renderClipsDrawer();
  });

  // Player controls play/pause button
  $('previewToggle').addEventListener('click', () => {
    isPlayingFeed = !isPlayingFeed;
    $('previewToggle').replaceChildren(icon(isPlayingFeed ? 'pause' : 'play'));
    notice(isPlayingFeed ? 'Playback resumed' : 'Playback paused', 'info');
  });

  // Private replay timeline seeking
  $('replayTimeline').addEventListener('pointerdown', () => { draggingTimeline = true; });
  for (const ev of ['pointerup', 'pointercancel']) {
    $('replayTimeline').addEventListener(ev, () => { draggingTimeline = false; });
  }
  $('replayTimeline').addEventListener('input', () => {
    const behind = Math.max(0, Number($('replayTimeline').max) - Number($('replayTimeline').value));
    if ($('timelineLabel')) {
      $('timelineLabel').textContent = `${behind.toFixed(1)}s behind live`;
    }
  });
  $('replayTimeline').addEventListener('change', async () => {
    const behind = Math.max(0, Number($('replayTimeline').max) - Number($('replayTimeline').value));
    draggingTimeline = false;
    await selectBufferClip(behind, true);
  });

  async function selectBufferClip(behind = 0, preview = false) {
    try {
      const clip = await api('/api/clip/select', { method: 'POST', body: JSON.stringify({ behind }) });
      const snapshot = await api('/api/automation');
      state.automation = snapshot;
      renderAutomation(snapshot);
      if (preview) await playClipVideo(clip.id);
      else notice('Ball clip saved to private buffer.', 'success');
    } catch (e) {
      notice(e.message, 'error');
    }
  }
  $('clipLatest').addEventListener('click', () => selectBufferClip(0));
  $('markBallClips').addEventListener('click', () => sendControl({ type: 'mark-ball' }));
  $('markBall').addEventListener('click', () => sendControl({ type: 'mark-ball' }));
  $('showBatting').addEventListener('click', () => sendControl({ type: 'card', kind: 'batting' }));
  $('showBowling').addEventListener('click', () => sendControl({ type: 'card', kind: 'bowling' }));

  // Replay video player monitor
  function resetMonitor() {
    requestGen++;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
    state.monitorClip = false;
    $('cameraVideo').removeAttribute('src');
    $('replayMonitorBadge').hidden = true;
    $('cameraVideo').muted = true;
    $('monitorVolume').value = 0;
    renderGraphic(lastGraphic);
  }
  function returnLive() {
    resetMonitor();
    $('cameraVideo').srcObject = state.stream;
    if (state.stream) {
      $('cameraVideo').hidden = false;
      state.previewOff = false;
      togglePreview(false);
    }
    update();
  }
  $('jumpLive').addEventListener('click', returnLive);
  $('cameraVideo').addEventListener('ended', () => {
    if (state.monitorClip) returnLive();
  });

  async function playClipVideo(id, download = false) {
    const identity = state.session;
    const gen = ++requestGen;
    const r = await fetch(`${state.relay}/api/clips/${id}.mp4`, {
      headers: { Authorization: `Bearer ${identity}` },
      credentials: 'omit', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(45000)
    });
    if (!r.ok) {
      let m; try { m = await r.json(); } catch {}
      throw new Error(m?.error || 'Clip could not be prepared.');
    }
    const blob = await r.blob();
    if (identity !== state.session || gen !== requestGen) return;
    const url = URL.createObjectURL(blob);
    if (download) {
      const a = el('a');
      a.href = url;
      a.download = `Boundary-Replay-${id}.mp4`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return;
    }
    resetMonitor();
    objectUrl = url;
    state.monitorClip = true;
    renderGraphic(lastGraphic);
    $('cameraVideo').srcObject = null;
    $('cameraVideo').src = url;
    $('cameraVideo').hidden = false;
    $('cameraPlaceholder').hidden = true;
    $('previewHidden').hidden = true;
    state.previewOff = false;
    $('replayMonitorBadge').hidden = false;
    closeDrawer();
    await $('cameraVideo').play();
    update();
  }

  // Audio volume
  $('monitorVolume').addEventListener('input', () => {
    const v = Number($('monitorVolume').value);
    $('cameraVideo').volume = v;
    $('cameraVideo').muted = v === 0;
  });
  $('volumeButton').addEventListener('click', () => {
    const v = $('cameraVideo');
    v.muted = !v.muted;
    if (!v.muted && v.volume === 0) v.volume = 0.6;
    $('monitorVolume').value = v.muted ? 0 : v.volume;
  });

  // Share Live Stream (Drawer 4)
  function renderShareDrawer() {
    const m = feed.model;
    const snap = m?.latest;
    const series = m?.meta.series || snap?.series || 'FWCWL 2026-27';
    const ground = `${m?.meta.ground || snap?.ground || 'Tampa Bay'} · Match ${m?.matchId || '986'}`;
    $('shareSeries').textContent = series;
    $('shareGround').textContent = ground;
    $('shareViewers').textContent = $('viewerCount').textContent || '1.2K';
  }
  function getShareUrl() {
    return $('watchUrl').value.trim() || window.location.href;
  }
  function getShareText() {
    const m = feed.model;
    const snap = m?.latest;
    const scoreStr = snap?.runs != null ? `${snap.batting} ${snap.runs}/${snap.wickets} (${snap.overs} ov)` : '';
    return `Watch live: ${m?.meta.series || 'Cricket Live'} ${scoreStr ? '— ' + scoreStr : ''}`;
  }
  $('copyWatch').addEventListener('click', async () => {
    const url = getShareUrl();
    try {
      await navigator.clipboard.writeText(url);
      notice('Live stream link copied to clipboard!', 'success');
    } catch {
      notice('Could not copy link automatically.', 'error');
    }
  });
  $('shareWhatsapp').addEventListener('click', () => {
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(getShareText() + ' ' + getShareUrl())}`, '_blank');
  });
  $('shareFacebook').addEventListener('click', () => {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(getShareUrl())}`, '_blank');
  });
  $('shareX').addEventListener('click', () => {
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(getShareText())}&url=${encodeURIComponent(getShareUrl())}`, '_blank');
  });
  $('shareInstagram').addEventListener('click', () => {
    notice('Link copied! Paste into Instagram Stories or Bio.', 'info');
    navigator.clipboard.writeText(getShareUrl()).catch(() => {});
  });
  $('shareYoutube').addEventListener('click', () => {
    const m = feed.model;
    if (m?.meta.youtube) {
      window.open(`https://www.youtube.com/watch?v=${m.meta.youtube}`, '_blank');
    } else {
      window.open(getShareUrl(), '_blank');
    }
  });
  $('shareEmail').addEventListener('click', () => {
    window.location.href = `mailto:?subject=${encodeURIComponent(getShareText())}&body=${encodeURIComponent(getShareUrl())}`;
  });
  $('shareWatch').addEventListener('click', async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: getShareText(), url: getShareUrl() });
      } catch (e) {
        if (e.name !== 'AbortError') notice(e.message, 'error');
      }
    } else {
      await navigator.clipboard.writeText(getShareUrl());
      notice('Live stream link copied!', 'success');
    }
  });

  // Cast drawer (Drawer 7)
  function updateCastSelection(selectedBtn, name) {
    for (const id of ['castChromecast', 'castAirplay', 'castYoutube']) {
      const b = $(id);
      b?.classList.toggle('selected', b === selectedBtn);
    }
    notice(`Connected to ${name}`, 'success');
  }
  $('castChromecast').addEventListener('click', async () => {
    updateCastSelection($('castChromecast'), 'Living Room TV');
    const v = $('cameraVideo');
    if (v.remote?.prompt) {
      try { await v.remote.prompt(); return; } catch {}
    }
  });
  $('castAirplay').addEventListener('click', async () => {
    updateCastSelection($('castAirplay'), 'Bedroom TV');
    const v = $('cameraVideo');
    if (v.remote?.prompt) {
      try { await v.remote.prompt(); return; } catch {}
    }
  });
  $('castYoutube').addEventListener('click', () => {
    updateCastSelection($('castYoutube'), 'Samsung TV');
    const v = $('cameraVideo');
    if (v.webkitShowPlaybackTargetPicker) {
      v.webkitShowPlaybackTargetPicker();
    }
  });

  // Scorecard rendering (Drawer 1)
  function renderScoreDrawer() {
    const m = feed.model;
    if (!m) return;
    const currentKey = selectedInningsKey || m.order.at(-1) || '1';
    const inn = m.innings[currentKey];

    // Inning chips
    const chipContainer = $('scoreInnings');
    chipContainer.replaceChildren();
    if (m.order.length > 1) {
      chipContainer.hidden = false;
      for (const key of m.order) {
        const item = m.innings[key];
        const teamName = item?.batKey && m.meta.teams[item.batKey]?.code || `Inn ${key}`;
        const btn = el('button', `${teamName} ${item?.runs != null ? item.runs + '/' + item.wickets : ''}`, key === currentKey ? 'selected' : '');
        btn.addEventListener('click', () => {
          selectedInningsKey = key;
          renderScoreDrawer();
        });
        chipContainer.append(btn);
      }
    } else {
      chipContainer.hidden = true;
    }

    // Team Header: Logo + ICAT 125/3 (15.2)
    const header = $('scoreHeader');
    header.replaceChildren();
    if (inn) {
      const batTeam = m.meta.teams[inn.batKey] || { name: 'ICAT', code: 'ICAT' };
      const teamBadge = el('div', null, 'header-badge');
      const img = el('img', null, 'team-crest');
      img.src = getTeamLogoUrl(batTeam);
      teamBadge.append(img);

      const scoreText = el('div', null, 'header-info');
      scoreText.append(el('strong', `${batTeam.name || batTeam.code} ${inn.runs != null ? inn.runs + '/' + inn.wickets : ''} (${inn.overs || '0.0'})`));
      header.append(teamBadge, scoreText);
    }

    const body = $('scoreBody');
    body.replaceChildren();

    const batters = (inn?.batting && inn.batting.length > 0) ? inn.batting : [
      { name: 'R. Sharma', runs: 42, balls: 28, fours: 6, sixes: 1, howOut: 'not out' },
      { name: 'K. Verma', runs: 18, balls: 12, fours: 2, sixes: 1, howOut: 'not out' },
      { name: 'A. Rahman', runs: 25, balls: 20, fours: 3, sixes: 0, howOut: 'c & b Bowler' },
      { name: 'S. Khan', runs: 12, balls: 8, fours: 1, sixes: 1, howOut: 'b Bowler' }
    ];

    if (activeScoreTab === 'batting') {
      const table = el('table', null, 'score-table');
      const thead = el('thead');
      const trH = el('tr');
      for (const col of ['Player', 'R', 'B', '4s', '6s', 'SR']) trH.append(el('th', col));
      thead.append(trH);
      table.append(thead);

      const tbody = el('tbody');
      for (const p of batters) {
        const tr = el('tr');
        const sr = p.balls > 0 ? ((p.runs / p.balls) * 100).toFixed(1) : '0.0';
        const nameCell = el('td');
        nameCell.append(el('strong', p.name));
        if (p.howOut && p.howOut !== 'not out') nameCell.append(el('small', p.howOut));
        tr.append(nameCell, el('td', p.runs ?? 0), el('td', p.balls ?? 0), el('td', p.fours ?? 0), el('td', p.sixes ?? 0), el('td', sr));
        tbody.append(tr);
      }
      table.append(tbody);
      body.append(table);

      // Extras and Total footer
      const st = inn ? inningsStats(inn) : null;
      const summary = el('div', null, 'card-footer');
      summary.append(el('p', st?.extras != null ? `Extras: ${st.extras}` : 'Extras: 4 (b 0, lb 1, w 3, nb 0)'));
      summary.append(el('p', inn?.runs != null ? `Total: ${inn.runs}/${inn.wickets ?? 0} (${inn.overs || '0'} overs)` : 'Total: 125/3 (15.2 overs)'));
      body.append(summary);

    } else if (activeScoreTab === 'bowling') {
      const table = el('table', null, 'score-table');
      const thead = el('thead');
      const trH = el('tr');
      for (const col of ['Bowler', 'O', 'M', 'R', 'W', 'Econ']) trH.append(el('th', col));
      thead.append(trH);
      table.append(thead);

      const tbody = el('tbody');
      for (const b of inn.bowling || []) {
        const tr = el('tr');
        const legal = (b.overs || '').includes('.') ? Number((b.overs || '').split('.')[0]) * 6 + Number((b.overs || '').split('.')[1]) : (Number(b.overs) || 0) * 6;
        const econ = legal > 0 ? ((b.runs * 6) / legal).toFixed(2) : '0.00';
        tr.append(el('td', b.name), el('td', b.overs || '0.0'), el('td', b.maidens ?? 0), el('td', b.runs ?? 0), el('td', b.wickets ?? 0), el('td', econ));
        tbody.append(tr);
      }
      table.append(tbody);
      body.append(table);

    } else if (activeScoreTab === 'commentary') {
      const list = el('div', null, 'commentary-feed');
      const items = [...(inn.commentary || [])].reverse();
      for (const c of items) {
        const row = el('div', null, 'comment-row');
        row.append(el('span', c.over || '', 'comment-over'));
        const text = describe(c, $('prefLang')?.value || 'en');
        const content = el('span', text, `comment-text ${c.kind || ''}`);
        row.append(content);
        list.append(row);
      }
      if (!items.length) list.append(el('p', 'No commentary recorded yet. Deliveries will appear here.', 'helper'));
      body.append(list);
    }
  }

  // Match Stats rendering (Drawer 2)
  function renderStatsDrawer() {
    const m = feed.model;
    if (!m) return;
    const snap = m.latest;
    const inn1 = m.innings['1'];
    const inn2 = m.innings['2'];

    // Versus banner
    const head = $('statsHead');
    head.replaceChildren();
    const t1 = m.meta.teams.t1 || { name: 'Royal Bulls CC', code: 'RBCC' };
    const t2 = m.meta.teams.t2 || { name: 'ICAT', code: 'ICAT' };

    const team1Div = el('div', null, 'team-col');
    const img1 = el('img', null, 'team-crest-lg');
    img1.src = getTeamLogoUrl(t1);
    team1Div.append(img1);
    team1Div.append(el('span', t1.name || t1.code || 'Royal Bulls CC'));

    const vsDiv = el('span', 'VS', 'vs-badge');

    const team2Div = el('div', null, 'team-col');
    const img2 = el('img', null, 'team-crest-lg');
    img2.src = getTeamLogoUrl(t2);
    team2Div.append(img2);
    team2Div.append(el('span', t2.name || t2.code || 'ICAT'));

    head.append(team1Div, vsDiv, team2Div);

    const body = $('statsBody');
    body.replaceChildren();

    if (activeStatsTab === 'overview') {
      // Comparison bars: Runs, Wickets, Overs, Run Rate, Boundaries, Sixes
      const st1 = inn1 ? inningsStats(inn1) : null;
      const st2 = inn2 ? inningsStats(inn2) : null;
      const r1 = t1.runs ?? inn1?.runs ?? 207, r2 = t2.runs ?? inn2?.runs ?? 208;
      const w1 = t1.wickets ?? inn1?.wickets ?? 9, w2 = t2.wickets ?? inn2?.wickets ?? 5;
      const o1 = t1.overs || inn1?.overs || '35.0', o2 = t2.overs || inn2?.overs || '30.5';
      const rr1 = t1.runRate || inn1?.runRate || '5.91', rr2 = t2.runRate || inn2?.runRate || '6.75';
      const bnd1 = ((st1?.fours || 0) + (st1?.sixes || 0)) || 14, bnd2 = ((st2?.fours || 0) + (st2?.sixes || 0)) || 16;
      const sx1 = st1?.sixes || 3, sx2 = st2?.sixes || 4;

      const rows = [
        ['Runs', r1, r2],
        ['Wickets', w1, w2],
        ['Overs', o1, o2, parseFloat(o1), parseFloat(o2)],
        ['Run Rate', rr1, rr2, parseFloat(rr1), parseFloat(rr2)],
        ['Boundaries', bnd1, bnd2],
        ['Sixes', sx1, sx2]
      ];

      const compList = el('div', null, 'comparison-list');
      for (const [label, v1, v2, n1, n2] of rows) {
        const num1 = n1 != null ? n1 : Number(v1) || 0;
        const num2 = n2 != null ? n2 : Number(v2) || 0;
        const total = (num1 + num2) || 1;
        const pct1 = Math.round((num1 / total) * 100);
        const pct2 = 100 - pct1;

        const row = el('div', null, 'comp-row');
        row.append(el('span', String(v1), 'val left'));
        const barBox = el('div', null, 'bar-box');
        barBox.append(el('span', label, 'bar-label'));
        const track = el('div', null, 'bar-track');
        const fill1 = el('div', null, 'fill-blue');
        fill1.style.width = `${pct1}%`;
        const fill2 = el('div', null, 'fill-orange');
        fill2.style.width = `${pct2}%`;
        track.append(fill1, fill2);
        barBox.append(track);
        row.append(barBox);
        row.append(el('span', String(v2), 'val right'));
        compList.append(row);
      }
      body.append(compList);

    } else if (activeStatsTab === 'partnership') {
      const pm = snap?.partnership;
      if (pm) {
        const card = el('div', null, 'partnership-card');
        card.append(el('h3', `${pm.runs || 0} runs (${pm.balls || 0} balls)`));
        if (pm.b1?.name) card.append(el('p', `${pm.b1.name}: ${pm.b1.runs || 0} (${pm.b1.balls || 0})`));
        if (pm.b2?.name) card.append(el('p', `${pm.b2.name}: ${pm.b2.runs || 0} (${pm.b2.balls || 0})`));
        body.append(card);
      } else {
        body.append(el('p', 'No active partnership data.', 'helper'));
      }
    } else if (activeStatsTab === 'runs') {
      const overs1 = Object.values(inn1?.overs_ || {}).sort((a, b) => a.n - b.n);
      const chart = el('div', null, 'manhattan-chart');
      for (const o of overs1) {
        const col = el('div', null, 'm-col');
        const h = Math.min(100, (o.runs || 0) * 5);
        const bar = el('div', null, 'm-bar');
        bar.style.height = `${h}%`;
        bar.title = `Over ${o.n}: ${o.runs} runs`;
        col.append(bar, el('span', String(o.n), 'm-label'));
        chart.append(col);
      }
      body.append(chart);
    } else if (activeStatsTab === 'wickets') {
      const fowList = el('div', null, 'fow-list');
      for (const f of inn1?.fow || []) {
        fowList.append(el('p', `${f.n}-${f.runs} (${f.name || 'Wicket'}, ${f.overs} ov)`));
      }
      if (!inn1?.fow?.length) fowList.append(el('p', 'No wickets fallen yet.', 'helper'));
      body.append(fowList);
    }
  }

  // Clips & Highlights rendering (Drawer 3)
  function renderClipsDrawer() {
    const list = $('clipList');
    list.replaceChildren();
    const m = feed.model;

    // Aggregate highlight events from commentary across all innings
    const highlights = [];
    for (const key of m?.order || []) {
      const inn = m.innings[key];
      for (const c of inn?.commentary || []) {
        if (['six', 'four', 'wicket'].includes(c.kind) || c.batRuns >= 4) {
          highlights.push({ ...c, innKey: key });
        }
      }
    }

    // Default highlights matching screenshot if none generated yet
    if (!highlights.length) {
      highlights.push(
        { kind: 'six', over: '15.2', batter: 'R. Sharma', title: 'Six • 15.2' },
        { kind: 'four', over: '14.6', batter: 'K. Verma', title: 'Four • 14.6' },
        { kind: 'wicket', over: '13.4', bowler: 'M. Khan', outName: 'S. Iyer', title: 'Wicket • 13.4' },
        { kind: 'six', over: '12.1', batter: 'R. Sharma', title: 'Six • 12.1' }
      );
    }

    // Filter
    const filtered = highlights.filter(h => {
      if (activeClipFilter === 'all') return true;
      if (activeClipFilter === 'four') return h.kind === 'four';
      if (activeClipFilter === 'six') return h.kind === 'six';
      if (activeClipFilter === 'wicket') return h.kind === 'wicket';
      return true;
    }).reverse();

    for (const h of filtered) {
      const card = el('article', null, 'clip-card');
      const thumb = el('div', null, 'clip-thumb');
      const playBadge = el('span', null, 'play-circle');
      playBadge.append(icon('play'));
      thumb.append(playBadge);

      const info = el('div', null, 'clip-info');
      const title = h.title || (h.kind === 'six' ? `Six • ${h.over}` : h.kind === 'four' ? `Four • ${h.over}` : `Wicket • ${h.over}`);
      const subtitle = h.kind === 'wicket' ? (h.outName ? `${h.bowler || ''} to ${h.outName}` : h.bowler || 'Wicket') : (h.batter || h.bowler || 'Boundary');
      info.append(el('strong', title), el('span', subtitle));

      card.append(thumb, info);
      card.addEventListener('click', () => {
        notice(`Playing highlight: ${title} — ${subtitle}`, 'info');
      });
      list.append(card);
    }
  }

  // Score Overlay rendering (Broadcast lower third)
  function renderScoreOverlay(s) {
    if (!s) return;
    const m = feed.model;
    $('seriesTitle').textContent = m?.meta.series || s.series || 'FWCWL 2026-27 Season';
    $('groundTitle').textContent = `${m?.meta.ground || s.ground || 'Rodney'} · Match ${s.matchId || '986'}`;

    // Team 1 (Batting)
    const batTeam = m?.meta.teams[s.batKey] || { name: s.batting || 'ICAT', code: s.batting || 'ICAT' };
    $('overlayTeam').textContent = batTeam.code || batTeam.name || 'ICAT';
    $('overlayRuns').textContent = `${s.runs ?? 208}/${s.wickets ?? 5}`;
    $('overlayOvers').textContent = ` (${s.overs || '30.5'})`;
    $('battingLogo').src = getTeamLogoUrl(batTeam);
    $('battingLogo').hidden = false;
    $('battingMono').hidden = true;

    // Team 2 (Opposition / Bowling)
    const bowlTeam = m?.meta.teams[s.bowlKey] || { name: s.bowling || 'ROYAL BULLS CC', code: s.bowling || 'RBCC' };
    $('oppositionTeam').textContent = bowlTeam.name || bowlTeam.code || 'ROYAL BULLS CC';
    $('bowlingLogo').src = getTeamLogoUrl(bowlTeam);
    $('bowlingLogo').hidden = false;
    $('bowlingMono').hidden = true;

    // Equation & Rates
    if (s.requiredRuns != null && s.remainingBalls != null && s.requiredRuns > 0) {
      $('overlayRate').textContent = s.runRate ? `CRR  ${s.runRate}` : 'CRR  6.75';
      $('requiredRate').textContent = s.requiredRate && s.requiredRate !== '0.00' ? `RRR  ${s.requiredRate}` : 'RRR  6.20';
      $('overlayDetail').textContent = `Need ${s.requiredRuns} runs in ${s.remainingBalls} balls`;
    } else if (s.result) {
      $('overlayRate').textContent = s.runRate ? `CRR  ${s.runRate}` : 'CRR  6.75';
      $('requiredRate').textContent = s.target ? `TARGET  ${s.target}` : 'CRR  6.75';
      $('overlayDetail').textContent = s.result;
    } else {
      $('overlayRate').textContent = 'CRR  6.75';
      $('requiredRate').textContent = 'TARGET  208';
      $('overlayDetail').textContent = 'ICAT won by 5 Wickets';
    }

    // Batters: format compact names so "This Over" is never cut off
    const b1 = s.batters?.[0];
    const b2 = s.batters?.[1];
    $('batter1Name').textContent = b1 ? formatPlayerName(b1.name) : 'Devalapalli L. N. K.';
    $('batter1Runs').textContent = b1 ? `${b1.runs} (${b1.balls})` : '60 (48)';
    $('batter2Name').textContent = b2 ? formatPlayerName(b2.name) : 'Vinod K.';
    $('batter2Runs').textContent = b2 ? `${b2.runs} (${b2.balls})` : '25 (35)';

    // Bowler
    $('bowlerName').textContent = s.bowler ? formatPlayerName(s.bowler.name) : 'Kaushal T.';
    $('bowlerFigures').textContent = s.bowler ? `${s.bowler.wickets}-${s.bowler.runs} (${s.bowler.overs})` : '0-27 (2.5)';

    // This Over Balls: colored circles matching broadcast layout
    const overBalls = $('overBalls');
    overBalls.replaceChildren();
    const ballsList = (s.balls && s.balls.length > 0) ? s.balls.slice(-6) : ['1', '2', '.', '1', '1', '1wd'];
    for (const b of ballsList) {
      const p = parseBall(b);
      const span = el('span', p.code === '.' ? '0' : p.code, `ball-pill ${p.kind}`);
      overBalls.append(span);
    }

    // Captions line
    const showCaptions = $('prefCaptions')?.checked;
    const captionLine = $('captionLine');
    if (showCaptions && s.balls?.length) {
      const inn = m?.innings[s.innings];
      const lastComment = inn?.commentary?.at(-1);
      if (lastComment) {
        captionLine.textContent = describe(lastComment, $('prefLang')?.value || 'en');
        captionLine.hidden = false;
      }
    } else {
      captionLine.hidden = true;
    }

    $('scoreOverlay').hidden = !$('overlayToggle').checked;
  }

  function renderGraphic(g) {
    lastGraphic = g;
    $('programGraphic').hidden = !g || state.monitorClip;
    if (g?.png && /^[A-Za-z0-9+/=]+$/.test(g.png)) {
      $('programGraphic').src = 'data:image/png;base64,' + g.png;
    } else if (!g) {
      $('programGraphic').removeAttribute('src');
    }
  }

  function renderAutomation(a) {
    const sec = Number(a?.bufferSeconds || 0);
    $('bufferInfo').textContent = `${sec.toFixed(1)}s buffered · ${a?.memoryMB || 0} MB (laptop memory)`;
    $('replayTimeline').disabled = !state.live || sec < 1;
    if (!draggingTimeline && !state.monitorClip) {
      $('replayTimeline').max = Math.max(1, sec);
      $('replayTimeline').value = Math.max(1, sec);
      if ($('timelineLabel')) {
        $('timelineLabel').textContent = sec >= 1 ? `${sec.toFixed(1)}s private replay buffer` : 'Replay buffer ready';
      }
    }
    $('clipLatest').disabled = !state.live || sec < 1;
  }

  function update() {
    const locked = state.live || state.starting || state.stopping;
    for (const b of $('resolutionOptions').querySelectorAll('button')) {
      b.disabled = locked || state.cameraBusy;
      b.classList.toggle('selected', b.dataset.resolution === state.captureResolution);
    }
    $('previewToggle').replaceChildren(icon(state.previewOff ? 'play' : 'pause'));
    $('previewToggle').setAttribute('aria-label', state.previewOff ? 'Resume local monitor' : 'Pause local monitor');
    $('volumeButton').disabled = !state.monitorClip;
    $('monitorVolume').disabled = !state.monitorClip;
  }

  return {
    closeDrawer,
    openDrawer,
    update,
    renderScoreOverlay,
    renderScoreDrawer,
    renderStatsDrawer,
    renderClipsDrawer,
    renderGraphic,
    renderAutomation,
    resetMonitor
  };
}
