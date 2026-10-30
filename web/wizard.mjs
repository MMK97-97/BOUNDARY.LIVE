// =========================================================================
// MK97 Cricket Live Streaming - 11-Screen Mobile Application Router & Wizard
// =========================================================================
import { parseMatch } from './core.mjs';
import { inningsStats, parseBall, describe } from './match-model.mjs';

const $ = id => document.getElementById(id);
const el = (tag, content, className) => {
  const node = document.createElement(tag);
  if (content != null) node.textContent = content;
  if (className) node.className = className;
  return node;
};

export function installWizard({ state, feed, notice }) {
  let activeScreen = 'splash';
  let selectedPlatform = 'YouTube';
  let selectedOverlay = 'clean';
  let activeScoreTab = 'batting';
  let selectedInningsKey = null;
  let activeStatsTab = 'overview';
  let activeClipFilter = 'all';
  let audienceCount = 1248;

  const SCREENS = [
    'screenSplash',
    'screenMatchId',
    'screenMatchPreview',
    'screenOverlaySelect',
    'screenPlatformSelect',
    'screenStreamSetup',
    'studio',
    'screenScorecard',
    'screenStats',
    'screenClips',
    'screenShare'
  ];

  function showScreen(name) {
    activeScreen = name;
    for (const sid of SCREENS) {
      const el = $(sid);
      if (el) el.hidden = true;
    }
    const target = $(name === 'live' ? 'studio' : name);
    if (target) {
      target.hidden = false;
      target.scrollTop = 0;
    }
    document.body.classList.toggle('in-live-studio', name === 'live' || name === 'studio');
    if (name === 'screenScorecard') renderScorecardScreen();
    if (name === 'screenStats') renderStatsScreen();
    if (name === 'screenClips') renderClipsScreen();
  }

  // --- Screen 1: Splash Screen ---
  $('btnSplashEnter')?.addEventListener('click', () => {
    showScreen('screenMatchId');
  });

  // --- Screen 2: Enter CricClubs Match ID ---
  $('btnSettingsMatchId')?.addEventListener('click', () => {
    showScreen('screenStreamSetup');
  });

  async function handleFetchMatch(inputVal) {
    const raw = String(inputVal || $('wizardMatchInput')?.value || '986').trim();
    if (!raw) {
      notice('Please enter a valid CricClubs Match ID or scorecard URL.', 'error');
      return;
    }

    const btn = $('btnFetchMatch');
    const origText = btn ? btn.textContent : 'Fetch Match';
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Fetching from CricClubs…';
    }

    try {
      let ids;
      try {
        ids = parseMatch(raw, '300');
      } catch {
        // If not a full URL, fallback to matchId with default club 300
        const cleanId = raw.replace(/\D/g, '') || '986';
        ids = { clubId: '300', matchId: cleanId };
      }

      feed.start(ids, { league: 'FWCWL' });
      notice(`Fetching match ${ids.matchId} data…`, 'info');

      // Update input display
      if ($('wizardMatchInput')) $('wizardMatchInput').value = ids.matchId;

      // Wait briefly for first snapshot or cached model
      setTimeout(() => {
        updatePreviewFromModel(ids.matchId);
        showScreen('screenMatchPreview');
        if (btn) {
          btn.disabled = false;
          btn.textContent = origText;
        }
      }, 400);

    } catch (e) {
      notice(e.message || 'Failed to fetch match details.', 'error');
      if (btn) {
        btn.disabled = false;
        btn.textContent = origText;
      }
    }
  }

  $('btnFetchMatch')?.addEventListener('click', () => handleFetchMatch());
  $('btnViewExample')?.addEventListener('click', () => {
    if ($('wizardMatchInput')) $('wizardMatchInput').value = '986';
    handleFetchMatch('986');
  });

  // --- Screen 3: Match Details Preview ---
  $('btnBackToMatchId')?.addEventListener('click', () => showScreen('screenMatchId'));
  $('btnContinueToOverlay')?.addEventListener('click', () => showScreen('screenOverlaySelect'));

  function updatePreviewFromModel(matchId) {
    const m = feed.model;
    const series = m?.meta.series || 'FWCWL 2026-27 Season';
    const ground = `${m?.meta.ground || 'Tampa Bay'} · Match ${matchId || m?.matchId || '986'}`;

    if ($('previewSeries')) $('previewSeries').textContent = series;
    if ($('previewGround')) $('previewGround').textContent = ground;

    const t1 = m?.meta.teams.t1 || { name: 'ICAT', code: 'ICAT' };
    const t2 = m?.meta.teams.t2 || { name: 'THUNDERBOLTS', code: 'TT' };

    const isT1Icat = /icat/i.test(t1.name || t1.code);
    const batTeam = isT1Icat ? t1 : t2;
    const bowlTeam = isT1Icat ? t2 : t1;

    if ($('previewBatName')) $('previewBatName').textContent = batTeam.name || batTeam.code || 'ICAT';
    if ($('previewBatLogo')) $('previewBatLogo').src = './assets/logo-icat.png';

    if ($('previewBowlName')) $('previewBowlName').textContent = bowlTeam.name && !/royal/i.test(bowlTeam.name) ? bowlTeam.name : 'THUNDERBOLTS';
    if ($('previewBowlLogo')) $('previewBowlLogo').src = './assets/logo-thunderbolts.png';

    if ($('previewVenue')) $('previewVenue').textContent = m?.meta.ground ? `${m.meta.ground}, FL` : 'Tampa Bay, FL';
    if ($('previewFormat')) $('previewFormat').textContent = m?.meta.totalOvers ? `${m.meta.totalOvers} Overs · League Match` : 'T20 · League Match';

    if ($('wizardStreamTitle')) {
      $('wizardStreamTitle').value = `${series} | ICAT vs Thunderbolts | Live Cricket`;
    }
    if ($('wizardStreamDesc')) {
      $('wizardStreamDesc').value = `Live from ${m?.meta.ground || 'Tampa Bay'}\n${series} | Match ${matchId || '986'}\nICAT vs Tampa Thunderbolts`;
    }
  }

  // --- Screen 4: Choose Scoreboard Overlay ---
  $('btnBackToPreview')?.addEventListener('click', () => showScreen('screenMatchPreview'));
  $('btnNextToPlatform')?.addEventListener('click', () => showScreen('screenPlatformSelect'));

  function applyOverlayStyle(style) {
    selectedOverlay = style;
    const overlay = $('scoreOverlay');
    if (overlay) {
      overlay.classList.remove('style-clean', 'style-modern', 'style-minimal', 'style-detailed', 'style-custom');
      overlay.classList.add(`style-${style}`);
    }
  }

  for (const card of document.querySelectorAll('.overlay-card')) {
    card.addEventListener('click', () => {
      document.querySelectorAll('.overlay-card').forEach(c => {
        c.classList.remove('active');
        const rc = c.querySelector('.radio-circle');
        if (rc) rc.classList.remove('checked');
      });
      card.classList.add('active');
      const rc = card.querySelector('.radio-circle');
      if (rc) rc.classList.add('checked');
      const style = card.dataset.style || 'clean';
      applyOverlayStyle(style);
      notice(`Scoreboard style set to: ${style.toUpperCase()}`, 'info');
    });
  }

  // --- Screen 5: Choose Streaming Platform ---
  $('btnBackToOverlay')?.addEventListener('click', () => showScreen('screenOverlaySelect'));

  function connectPlatform(name) {
    selectedPlatform = name;
    let defaultAcc = `MK97 ${name}`;
    const userAcc = prompt(`Connect ${name} Account / Stream Key:`, defaultAcc);
    const finalAcc = userAcc ? userAcc.trim() : defaultAcc;

    if ($('connectedAccountName')) $('connectedAccountName').textContent = finalAcc;

    // Update banner icon in Screen 6
    const bannerIcon = document.querySelector('.connected-banner .platform-icon');
    const bannerTitle = document.querySelector('.banner-info strong');
    if (bannerTitle) bannerTitle.textContent = `${name} Live Setup`;
    if (bannerIcon) {
      bannerIcon.className = `platform-icon ${name.toLowerCase().slice(0, 2)}`;
      if (name === 'YouTube') bannerIcon.innerHTML = `<svg><use href="#i-yt"/></svg>`;
      else if (name === 'Facebook') bannerIcon.textContent = 'f';
      else if (name === 'Twitch') bannerIcon.innerHTML = `<svg><use href="#i-twitch"/></svg>`;
      else bannerIcon.innerHTML = `<svg><use href="#i-link"/></svg>`;
    }

    notice(`Connected to ${name} Live as "${finalAcc}"!`, 'success');
    showScreen('screenStreamSetup');
  }

  $('btnConnectYoutube')?.addEventListener('click', () => connectPlatform('YouTube'));
  $('btnConnectFacebook')?.addEventListener('click', () => connectPlatform('Facebook'));
  $('btnConnectTwitch')?.addEventListener('click', () => connectPlatform('Twitch'));
  $('btnConnectRtmp')?.addEventListener('click', () => connectPlatform('Custom RTMP'));

  // --- Screen 6: Stream Setup ---
  $('btnBackToPlatform')?.addEventListener('click', () => showScreen('screenPlatformSelect'));
  $('btnChangePlatform')?.addEventListener('click', () => showScreen('screenPlatformSelect'));

  // Custom Thumbnail Upload
  $('btnUploadThumb')?.addEventListener('click', () => {
    $('thumbFileInput')?.click();
  });
  $('thumbFileInput')?.addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = ev => {
        const url = ev.target.result;
        if ($('wizardThumbImg')) $('wizardThumbImg').src = url;
        const thumb = $('shareThumb');
        if (thumb) thumb.style.backgroundImage = `url("${url}")`;
        notice('Custom stream thumbnail applied!', 'success');
      };
      reader.readAsDataURL(file);
    }
  });

  // Go Live from Wizard
  $('btnGoLiveWizard')?.addEventListener('click', () => {
    state.live = true;
    state.startedAt = Date.now();
    notice(`Broadcasting live to ${selectedPlatform}!`, 'success');
    showScreen('live');
  });

  // --- Screen 7: Live Streaming Screen navigation ---
  $('backButton')?.addEventListener('click', () => {
    showScreen('screenStreamSetup');
  });

  // Wire side panel buttons to open dedicated screens in portrait
  document.querySelectorAll('.side-actions button[data-panel]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const panel = btn.dataset.panel;
      if (panel === 'score') showScreen('screenScorecard');
      else if (panel === 'stats') showScreen('screenStats');
      else if (panel === 'clips') showScreen('screenClips');
      else if (panel === 'share') showScreen('screenShare');
    });
  });

  // --- Screen 8: Scorecard (Live) ---
  $('btnScorecardBack')?.addEventListener('click', () => showScreen('live'));
  $('tabScoreLive')?.addEventListener('click', () => showScreen('live'));
  $('btnTabBatting')?.addEventListener('click', () => {
    activeScoreTab = 'batting';
    $('btnTabBatting').classList.add('active');
    $('btnTabBowling').classList.remove('active');
    renderScorecardScreen();
  });
  $('btnTabBowling')?.addEventListener('click', () => {
    activeScoreTab = 'bowling';
    $('btnTabBowling').classList.add('active');
    $('btnTabBatting').classList.remove('active');
    renderScorecardScreen();
  });

  function renderScorecardScreen() {
    const m = feed.model;
    const currentKey = selectedInningsKey || m?.order.at(-1) || '2';
    const inn = m?.innings[currentKey] || m?.innings['2'] || m?.innings['1'];
    const container = $('scorecardTableContainer');
    if (!container) return;

    // Render Innings Chips if multiple innings exist
    const chipBox = $('screenScoreInnings');
    if (chipBox) {
      chipBox.replaceChildren();
      if (m?.order.length > 1) {
        chipBox.hidden = false;
        for (const k of m.order) {
          const item = m.innings[k];
          const tName = item?.batKey && m.meta.teams[item.batKey]?.code || `Inn ${k}`;
          const scoreStr = item?.runs != null ? `${item.runs}/${item.wickets}` : '';
          const chipBtn = el('button', `${tName} ${scoreStr}`, k === currentKey ? 'selected' : '');
          chipBtn.addEventListener('click', () => {
            selectedInningsKey = k;
            renderScorecardScreen();
          });
          chipBox.append(chipBtn);
        }
      } else {
        chipBox.hidden = true;
      }
    }

    // Team Header
    if (inn) {
      const batTeam = m?.meta.teams[inn.batKey] || { name: 'ICAT', code: 'ICAT' };
      const isIcat = /icat/i.test(batTeam.name || batTeam.code);
      if ($('scoreScreenLogo')) $('scoreScreenLogo').src = isIcat ? './assets/logo-icat.png' : './assets/logo-thunderbolts.png';
      if ($('scoreScreenTeamRuns')) $('scoreScreenTeamRuns').textContent = `${batTeam.name || batTeam.code} ${inn.runs ?? 125}/${inn.wickets ?? 3}`;
      if ($('scoreScreenOvers')) $('scoreScreenOvers').textContent = ` (${inn.overs || '15.2'})`;
    }

    if (activeScoreTab === 'batting') {
      const batters = (inn?.batting && inn.batting.length > 0) ? inn.batting : [
        { name: 'R. Sharma', runs: 42, balls: 28, fours: 6, sixes: 1, howOut: 'not out' },
        { name: 'K. Verma', runs: 18, balls: 12, fours: 2, sixes: 1, howOut: 'not out' },
        { name: 'A. Rahman', runs: 25, balls: 20, fours: 3, sixes: 0, howOut: 'c & b Bowler' },
        { name: 'S. Khan', runs: 12, balls: 8, fours: 1, sixes: 1, howOut: 'b Bowler' }
      ];

      let html = `<table class="score-table"><thead><tr><th>Player</th><th>R</th><th>B</th><th>4s</th><th>6s</th><th>SR</th></tr></thead><tbody>`;
      for (const p of batters) {
        const sr = p.balls > 0 ? ((p.runs / p.balls) * 100).toFixed(1) : '0.0';
        const isNotOut = !p.howOut || /not out/i.test(p.howOut);
        html += `<tr><td><strong>${p.name}</strong><small class="${isNotOut ? 'not-out' : ''}">${p.howOut || 'not out'}</small></td><td>${p.runs}</td><td>${p.balls}</td><td>${p.fours || 0}</td><td>${p.sixes || 0}</td><td>${sr}</td></tr>`;
      }
      const st = inn ? inningsStats(inn) : null;
      html += `</tbody></table><div class="card-footer"><p>Extras: ${st?.extras != null ? st.extras : '4 (b 0, lb 1, w 3, nb 0)'}</p><p>Total: ${inn?.runs ?? 125}/${inn?.wickets ?? 3} (${inn?.overs || '15.2'} overs)</p></div>`;
      container.innerHTML = html;

    } else {
      const bowlers = (inn?.bowling && inn.bowling.length > 0) ? inn.bowling : [
        { name: 'M. Khan', overs: '2.2', maidens: 0, runs: 18, wickets: 1 },
        { name: 'Kaushal T', overs: '3.0', maidens: 0, runs: 24, wickets: 1 }
      ];

      let html = `<table class="score-table"><thead><tr><th>Bowler</th><th>O</th><th>M</th><th>R</th><th>W</th><th>Econ</th></tr></thead><tbody>`;
      for (const b of bowlers) {
        const legal = (b.overs || '').includes('.') ? Number((b.overs || '').split('.')[0]) * 6 + Number((b.overs || '').split('.')[1]) : (Number(b.overs) || 0) * 6;
        const econ = legal > 0 ? ((b.runs * 6) / legal).toFixed(2) : '0.00';
        html += `<tr><td><strong>${b.name}</strong></td><td>${b.overs}</td><td>${b.maidens || 0}</td><td>${b.runs || 0}</td><td>${b.wickets || 0}</td><td>${econ}</td></tr>`;
      }
      html += `</tbody></table>`;
      container.innerHTML = html;
    }
  }

  // --- Screen 9: Match Stats ---
  $('btnStatsBack')?.addEventListener('click', () => showScreen('live'));
  $('tabStatsLive')?.addEventListener('click', () => showScreen('live'));

  // Wire Stats Subtabs (Overview, Partnership, Runs, Wickets)
  for (const btn of document.querySelectorAll('#statsScreenTabs button')) {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#statsScreenTabs button').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      activeStatsTab = btn.dataset.tab || 'overview';
      renderStatsScreen();
    });
  }

  function renderStatsScreen() {
    const m = feed.model;
    const compBox = $('statsScreenComparison');
    const detailBox = $('statsScreenDetail');
    if (!compBox) return;

    const t1 = m?.meta.teams.t1 || { name: 'ICAT', code: 'ICAT' };
    const t2 = m?.meta.teams.t2 || { name: 'THUNDERBOLTS', code: 'TT' };
    const isT1Icat = /icat/i.test(t1.name || t1.code);
    const teamA = isT1Icat ? t1 : t2;
    const teamB = isT1Icat ? t2 : t1;
    const innA = isT1Icat ? m?.innings['1'] : m?.innings['2'];
    const innB = isT1Icat ? m?.innings['2'] : m?.innings['1'];

    if (activeStatsTab === 'overview') {
      compBox.hidden = false;
      if (detailBox) detailBox.hidden = true;

      const st1 = innA ? inningsStats(innA) : null;
      const st2 = innB ? inningsStats(innB) : null;
      const r1 = teamA.runs ?? st1?.runs ?? 125, r2 = teamB.runs ?? st2?.runs ?? 87;
      const w1 = teamA.wickets ?? st1?.wickets ?? 3, w2 = teamB.wickets ?? st2?.wickets ?? 5;
      const o1 = teamA.overs || st1?.overs || '15.2', o2 = teamB.overs || st2?.overs || '15.0';
      const rr1 = teamA.runRate || st1?.runRate || '8.15', rr2 = teamB.runRate || st2?.runRate || '5.80';
      const bnd1 = ((st1?.fours || 0) + (st1?.sixes || 0)) || 9, bnd2 = ((st2?.fours || 0) + (st2?.sixes || 0)) || 7;
      const sx1 = st1?.sixes || 4, sx2 = st2?.sixes || 3;

      const rows = [
        ['Runs', r1, r2],
        ['Wickets', w1, w2],
        ['Overs', o1, o2, parseFloat(o1), parseFloat(o2)],
        ['Run Rate', rr1, rr2, parseFloat(rr1), parseFloat(rr2)],
        ['Boundaries', bnd1, bnd2],
        ['Sixes', sx1, sx2]
      ];

      let html = '';
      for (const [label, v1, v2, n1, n2] of rows) {
        const val1 = n1 != null ? n1 : Number(v1) || 0;
        const val2 = n2 != null ? n2 : Number(v2) || 0;
        const total = val1 + val2 || 1;
        const pct1 = Math.round((val1 / total) * 100);
        const pct2 = 100 - pct1;
        html += `
          <div class="comp-row">
            <span class="val left">${v1}</span>
            <div class="bar-box">
              <span class="bar-label">${label}</span>
              <div class="bar-track">
                <div class="fill-blue" style="width: ${pct1}%"></div>
                <div class="fill-orange" style="width: ${pct2}%"></div>
              </div>
            </div>
            <span class="val right">${v2}</span>
          </div>`;
      }
      compBox.innerHTML = html;

    } else if (activeStatsTab === 'partnership') {
      compBox.hidden = true;
      if (detailBox) {
        detailBox.hidden = false;
        const pm = m?.latest?.partnership;
        if (pm) {
          detailBox.innerHTML = `
            <div class="partnership-card">
              <h3>${pm.runs || 88} runs (${pm.balls || 73} balls)</h3>
              <p>${pm.b1?.name || 'R. Sharma'}: ${pm.b1?.runs || 53} (${pm.b1?.balls || 38})</p>
              <p>${pm.b2?.name || 'K. Verma'}: ${pm.b2?.runs || 25} (${pm.b2?.balls || 35})</p>
            </div>`;
        } else {
          detailBox.innerHTML = `
            <div class="partnership-card">
              <h3>88 runs (73 balls)</h3>
              <p>R. Sharma: 53 (38)</p>
              <p>K. Verma: 25 (35)</p>
            </div>`;
        }
      }

    } else if (activeStatsTab === 'runs') {
      compBox.hidden = true;
      if (detailBox) {
        detailBox.hidden = false;
        const inn1 = m?.innings['1'];
        const oversList = Object.values(inn1?.overs_ || {}).sort((a, b) => a.n - b.n);
        let html = '<div class="manhattan-chart">';
        if (oversList.length > 0) {
          for (const o of oversList) {
            const h = Math.min(100, (o.runs || 0) * 6);
            html += `<div class="m-col"><div class="m-bar" style="height:${h}%" title="Over ${o.n}: ${o.runs} runs"></div><span class="m-label">${o.n}</span></div>`;
          }
        } else {
          for (let i = 1; i <= 15; i++) {
            const runs = [4, 8, 2, 12, 6, 14, 5, 9, 3, 11, 7, 15, 6, 10, 8][i - 1];
            html += `<div class="m-col"><div class="m-bar" style="height:${runs * 6}%" title="Over ${i}: ${runs} runs"></div><span class="m-label">${i}</span></div>`;
          }
        }
        html += '</div>';
        detailBox.innerHTML = html;
      }

    } else if (activeStatsTab === 'wickets') {
      compBox.hidden = true;
      if (detailBox) {
        detailBox.hidden = false;
        const inn1 = m?.innings['1'];
        const fow = inn1?.fow || [
          { n: 1, runs: 19, name: 'S. Iyer', overs: '3.4' },
          { n: 2, runs: 64, name: 'D. Hooda', overs: '8.2' },
          { n: 3, runs: 112, name: 'R. Pant', overs: '14.1' }
        ];
        let html = '<div class="fow-list">';
        for (const f of fow) {
          html += `<p>${f.n}-${f.runs} (${f.name || 'Wicket'}, ${f.overs} ov)</p>`;
        }
        html += '</div>';
        detailBox.innerHTML = html;
      }
    }
  }

  // --- Screen 10: Clips / Highlights ---
  $('btnClipsBack')?.addEventListener('click', () => showScreen('live'));
  $('tabClipsLive')?.addEventListener('click', () => showScreen('live'));
  $('btnCloseReplay')?.addEventListener('click', () => {
    $('clipReplayBanner').hidden = true;
  });

  // Filter chips in Screen 10
  for (const b of document.querySelectorAll('#clipsScreenFilters button')) {
    b.addEventListener('click', () => {
      document.querySelectorAll('#clipsScreenFilters button').forEach(btn => btn.classList.remove('selected'));
      b.classList.add('selected');
      activeClipFilter = b.dataset.filter || 'all';
      renderClipsScreen();
    });
  }

  function renderClipsScreen() {
    const list = $('clipsScreenList');
    if (!list) return;

    const clips = [
      { kind: 'six', over: '15.2', batter: 'R. Sharma', title: 'Six • 15.2', sub: 'R. Sharma' },
      { kind: 'four', over: '14.6', batter: 'K. Verma', title: 'Four • 14.6', sub: 'K. Verma' },
      { kind: 'wicket', over: '13.4', bowler: 'M. Khan', outName: 'S. Iyer', title: 'Wicket • 13.4', sub: 'M. Khan to S. Iyer' },
      { kind: 'six', over: '12.1', batter: 'R. Sharma', title: 'Six • 12.1', sub: 'R. Sharma' }
    ];

    const filtered = clips.filter(c => {
      if (activeClipFilter === 'all') return true;
      if (activeClipFilter === 'four') return c.kind === 'four';
      if (activeClipFilter === 'six') return c.kind === 'six';
      if (activeClipFilter === 'wicket') return c.kind === 'wicket';
      return true;
    });

    list.replaceChildren();
    for (const c of filtered) {
      const card = el('article', null, 'clip-card');
      const thumb = el('div', null, 'clip-thumb');
      const play = el('span', '▶', 'play-circle');
      thumb.append(play);

      const info = el('div', null, 'clip-info');
      info.append(el('strong', c.title), el('span', c.sub));
      card.append(thumb, info);

      card.addEventListener('click', () => {
        const banner = $('clipReplayBanner');
        if (banner) {
          $('replayText').textContent = `REPLAY: ${c.title} — ${c.sub}`;
          banner.hidden = false;
        }
        notice(`Instant Replay: ${c.title} (${c.sub})`, 'info');
      });

      list.append(card);
    }
  }

  // --- Screen 11: Share & Stream Info ---
  $('btnShareBack')?.addEventListener('click', () => showScreen('live'));
  $('tabShareLive')?.addEventListener('click', () => showScreen('live'));

  function getShareUrl() {
    return window.location.href;
  }
  function getShareText() {
    const m = feed.model;
    const inn = m?.innings['2'] || m?.innings['1'];
    const score = inn ? ` (${inn.runs}/${inn.wickets} in ${inn.overs} ov)` : '';
    return `Watch live cricket on MK97: ${m?.meta.series || 'FWCWL 2026-27'}${score}!`;
  }

  $('btnShareLink')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(getShareUrl());
      notice('Stream link copied to clipboard!', 'success');
    } catch {
      notice('Share link: ' + getShareUrl(), 'info');
    }
  });
  $('btnShareWa')?.addEventListener('click', () => {
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(getShareText() + ' ' + getShareUrl())}`, '_blank');
  });
  $('btnShareFb')?.addEventListener('click', () => {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(getShareUrl())}`, '_blank');
  });
  $('btnShareTw')?.addEventListener('click', () => {
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(getShareText())}&url=${encodeURIComponent(getShareUrl())}`, '_blank');
  });
  $('btnShareIg')?.addEventListener('click', async () => {
    await navigator.clipboard?.writeText(getShareUrl());
    notice('Link copied! Open Instagram to share.', 'info');
    window.open('https://instagram.com', '_blank');
  });
  $('btnShareYt')?.addEventListener('click', () => {
    const m = feed.model;
    if (m?.meta.youtube) window.open(`https://www.youtube.com/watch?v=${m.meta.youtube}`, '_blank');
    else window.open(getShareUrl(), '_blank');
  });
  $('btnShareEm')?.addEventListener('click', () => {
    window.location.href = `mailto:?subject=${encodeURIComponent(getShareText())}&body=${encodeURIComponent(getShareUrl())}`;
  });
  $('btnShareMore')?.addEventListener('click', async () => {
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

  // Simulated slight audience fluctuation for live feel
  setInterval(() => {
    const delta = Math.floor(Math.random() * 5) - 2;
    audienceCount = Math.max(1210, Math.min(1280, audienceCount + delta));
    const formatted = `${(audienceCount / 1000).toFixed(1)}K`;
    if ($('shareScreenViewers')) $('shareScreenViewers').textContent = formatted;
    if ($('viewerCount')) $('viewerCount').textContent = formatted;
  }, 3500);

  // Auto-detect landscape orientation to show live studio
  function checkOrientation() {
    if (window.matchMedia('(orientation: landscape)').matches && window.innerHeight < 600) {
      if (activeScreen.startsWith('screen') && activeScreen !== 'screenSplash') {
        showScreen('live');
      }
    }
  }
  window.addEventListener('resize', checkOrientation);

  // Initial renders
  renderScorecardScreen();
  renderStatsScreen();
  renderClipsScreen();

  // If URL has ?screen=... navigate accordingly, else start at splash
  const params = new URLSearchParams(window.location.search);
  const startScr = params.get('screen') || 'screenSplash';
  showScreen(startScr);

  return {
    showScreen,
    renderScorecardScreen,
    renderStatsScreen,
    renderClipsScreen,
    updatePreviewFromModel
  };
}
