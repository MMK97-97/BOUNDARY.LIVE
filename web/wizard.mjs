// =========================================================================
// MK97 Cricket Live Streaming - 11-Screen Mobile Application Router & Wizard
// =========================================================================
const $ = id => document.getElementById(id);

export function installWizard({ state, feed, notice }) {
  let activeScreen = 'splash';
  let selectedPlatform = 'YouTube';
  let selectedOverlay = 'clean';
  let activeScoreTab = 'batting';

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
  }

  // --- Screen 1: Splash Screen ---
  $('btnSplashEnter')?.addEventListener('click', () => {
    showScreen('screenMatchId');
  });

  // --- Screen 2: Enter Match ID ---
  $('btnSettingsMatchId')?.addEventListener('click', () => {
    showScreen('screenStreamSetup');
  });

  async function handleFetchMatch(val) {
    const matchId = String(val || $('wizardMatchInput')?.value || '986').trim();
    if (!matchId) {
      notice('Please enter a valid CricClubs Match ID', 'error');
      return;
    }
    notice(`Fetching match ${matchId} from CricClubs...`, 'info');
    feed.start({ clubId: '300', matchId, league: 'FWCWL' });
    updatePreviewFromModel(matchId);
    showScreen('screenMatchPreview');
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
    const series = m?.meta.series || 'FWCWL 2026-27';
    const ground = `${m?.meta.ground || 'Tampa Bay'} · Match ${matchId || '986'}`;
    if ($('previewSeries')) $('previewSeries').textContent = series;
    if ($('previewGround')) $('previewGround').textContent = ground;
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

  for (const card of document.querySelectorAll('.overlay-card')) {
    card.addEventListener('click', () => {
      document.querySelectorAll('.overlay-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      const radio = card.querySelector('input[type="radio"]');
      if (radio) radio.checked = true;
      selectedOverlay = card.dataset.style || 'clean';
      notice(`Score overlay style: ${card.querySelector('.overlay-tag')?.textContent || selectedOverlay}`);
    });
  }

  // --- Screen 5: Choose Streaming Platform ---
  $('btnBackToOverlay')?.addEventListener('click', () => showScreen('screenOverlaySelect'));

  function connectPlatform(name) {
    selectedPlatform = name;
    if ($('connectedAccountName')) $('connectedAccountName').textContent = `MK97 ${name}`;
    notice(`Connected to ${name} Live!`, 'success');
    showScreen('screenStreamSetup');
  }

  $('btnConnectYoutube')?.addEventListener('click', () => connectPlatform('YouTube'));
  $('btnConnectFacebook')?.addEventListener('click', () => connectPlatform('Facebook'));
  $('btnConnectTwitch')?.addEventListener('click', () => connectPlatform('Twitch'));
  $('btnConnectRtmp')?.addEventListener('click', () => connectPlatform('RTMP'));

  // --- Screen 6: Stream Setup ---
  $('btnBackToPlatform')?.addEventListener('click', () => showScreen('screenPlatformSelect'));
  $('btnChangePlatform')?.addEventListener('click', () => showScreen('screenPlatformSelect'));
  $('btnUploadThumb')?.addEventListener('click', () => {
    notice('Default broadcast match thumbnail active.', 'info');
  });

  $('btnGoLiveWizard')?.addEventListener('click', () => {
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
    const inn = m?.innings['2'] || m?.innings['1'];
    const container = $('scorecardTableContainer');
    if (!container) return;

    if ($('scoreScreenTeamRuns')) {
      $('scoreScreenTeamRuns').textContent = `ICAT ${inn?.runs ?? 125}/${inn?.wickets ?? 3}`;
    }
    if ($('scoreScreenOvers')) {
      $('scoreScreenOvers').textContent = ` (${inn?.overs || '15.2'})`;
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
        html += `<tr><td><strong>${p.name}</strong>${p.howOut && p.howOut !== 'not out' ? `<small>${p.howOut}</small>` : ''}</td><td>${p.runs}</td><td>${p.balls}</td><td>${p.fours || 0}</td><td>${p.sixes || 0}</td><td>${sr}</td></tr>`;
      }
      html += `</tbody></table><div class="card-footer"><p>Extras: 4 (b 0, lb 1, w 3, nb 0)</p><p>Total: ${inn?.runs ?? 125}/${inn?.wickets ?? 3} (${inn?.overs || '15.2'} overs)</p></div>`;
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

  function renderStatsScreen() {
    const list = $('statsScreenComparison');
    if (!list) return;
    const rows = [
      ['Runs', 125, 87],
      ['Wickets', 3, 5],
      ['Overs', '15.2', '15.0', 15.2, 15.0],
      ['Run Rate', '8.15', '5.80', 8.15, 5.80],
      ['Boundaries', 9, 7],
      ['Sixes', 4, 3]
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
    list.innerHTML = html;
  }

  // --- Screen 10: Clips / Highlights ---
  $('btnClipsBack')?.addEventListener('click', () => showScreen('live'));
  $('tabClipsLive')?.addEventListener('click', () => showScreen('live'));

  function renderClipsScreen() {
    const list = $('clipsScreenList');
    if (!list) return;
    const clips = [
      { title: 'Six • 15.2', sub: 'R. Sharma', kind: 'six' },
      { title: 'Four • 14.6', sub: 'K. Verma', kind: 'four' },
      { title: 'Wicket • 13.4', sub: 'M. Khan to S. Iyer', kind: 'wicket' },
      { title: 'Six • 12.1', sub: 'R. Sharma', kind: 'six' }
    ];
    let html = '';
    for (const c of clips) {
      html += `
        <article class="clip-card" onclick="alert('Playing highlight: ${c.title}')">
          <div class="clip-thumb"><span class="play-circle">▶</span></div>
          <div class="clip-info"><strong>${c.title}</strong><span>${c.sub}</span></div>
        </article>`;
    }
    list.innerHTML = html;
  }

  // --- Screen 11: Share & Stream Info ---
  $('btnShareBack')?.addEventListener('click', () => showScreen('live'));
  $('tabShareLive')?.addEventListener('click', () => showScreen('live'));

  $('btnShareLink')?.addEventListener('click', async () => {
    await navigator.clipboard?.writeText(window.location.href);
    notice('Stream link copied to clipboard!', 'success');
  });
  $('btnShareWa')?.addEventListener('click', () => {
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent('Watch live cricket on MK97: ' + window.location.href)}`, '_blank');
  });
  $('btnShareFb')?.addEventListener('click', () => {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.href)}`, '_blank');
  });
  $('btnShareTw')?.addEventListener('click', () => {
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent('Live cricket on MK97')}&url=${encodeURIComponent(window.location.href)}`, '_blank');
  });
  $('btnShareYt')?.addEventListener('click', () => {
    window.open('https://youtube.com', '_blank');
  });
  $('btnShareEm')?.addEventListener('click', () => {
    window.location.href = `mailto:?subject=Watch Live Cricket on MK97&body=${encodeURIComponent(window.location.href)}`;
  });
  $('btnShareMore')?.addEventListener('click', async () => {
    if (navigator.share) {
      try { await navigator.share({ title: 'MK97 Cricket Live', url: window.location.href }); } catch {}
    } else {
      notice('Stream link copied!', 'success');
    }
  });

  // Handle auto landscape detection
  function checkOrientation() {
    if (window.matchMedia('(orientation: landscape)').matches && window.innerHeight < 600) {
      if (activeScreen.startsWith('screen') && activeScreen !== 'screenSplash') {
        showScreen('live');
      }
    }
  }
  window.addEventListener('resize', checkOrientation);

  // Initial setup
  renderScorecardScreen();
  renderStatsScreen();
  renderClipsScreen();

  // If URL has ?screen=... or hash, navigate accordingly, else start at splash
  const params = new URLSearchParams(window.location.search);
  const startScr = params.get('screen') || 'screenSplash';
  showScreen(startScr);

  return {
    showScreen,
    renderScorecardScreen,
    renderStatsScreen,
    renderClipsScreen
  };
}
