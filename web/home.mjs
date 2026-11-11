const $ = id => document.getElementById(id);
export function installHome({ state, ui, loadMatch, notice, onView = () => {} }) {
  function openStudio(panel) {
    if (!panel) ui.closeDrawer();
    $('home').hidden = true; $('studio').hidden = false; document.body.classList.remove('at-home');
    onView('studio'); $('openCamera').focus(); if (panel) ui.panel(panel);
  }
  function home() {
    if (state.live || state.starting || state.stopping) { notice('Keep the camera studio open during upload. Use the side tools for score, stats and stream controls.'); return; }
    ui.closeDrawer(); $('home').hidden = false; $('studio').hidden = true; document.body.classList.add('at-home'); onView('home'); $('enterStudio').focus();
  }
  $('enterStudio').addEventListener('click', () => openStudio());
  $('backButton').addEventListener('click', home);
  for (const button of document.querySelectorAll('[data-home-panel]')) button.addEventListener('click', () => {
    openStudio(button.dataset.homePanel);
    if (button.dataset.homeTab) document.querySelector(`#scoreTabs [data-score-tab="${button.dataset.homeTab}"]`)?.click();
  });
  async function load(input, club) {
    try { const result = await loadMatch(input, club); $('homeMatchInput').value = result.score.matchId; $('homeClubInput').value = result.score.clubId; }
    catch (error) { notice(error.message, 'error'); }
  }
  $('homeMatchForm').addEventListener('submit', e => { e.preventDefault(); load($('homeMatchInput').value, $('homeClubInput').value); });
  $('homeExample').addEventListener('click', () => { $('homeMatchInput').value = '986'; $('homeClubInput').value = '300'; load('986', '300'); });
  $('homeMatchInput').value = $('matchInput').value; $('homeClubInput').value = $('clubInput').value || '300';
  function update() {
    const s = state.score, busy = state.scoreLoading || state.live || state.starting || state.stopping;
    for (const id of ['homeMatchInput', 'homeClubInput', 'homeLeaguePreset', 'homeLoad', 'homeExample']) $(id).disabled = Boolean(busy);
    $('homeLoad').textContent = state.scoreLoading ? 'Fetching source…' : 'Fetch match';
    $('homeMatchState').textContent = state.scoreLoading ? 'Fetching CricClubs' : s ? s.stale ? 'Score delayed' : s.status === 'scheduled' ? 'Match scheduled' : s.status === 'complete' ? 'Match complete' : 'Source connected' : state.scoreError ? 'Fetch failed' : 'No match loaded';
    $('homeMatchState').className = 'home-status' + (s && !s.stale ? ' ready' : '');
    $('homeMatchTitle').textContent = s ? (s.status === 'scheduled' ? `${s.batting} vs ${s.bowling} · Scheduled` : `${s.batting} ${s.runs}/${s.wickets} · ${s.overs} overs`) : 'Bring your match into the picture.';
    $('homeMatchDetail').textContent = s ? (s.status === 'scheduled' ? ([s.stats?.date, s.ground, s.series].filter(Boolean).join(' · ') || 'Waiting for CricClubs live scoring to start') : (s.teams?.map(t => `${t.name} ${t.runs}/${t.wickets} (${t.overs})`).join(' · ') || `v ${s.bowling}`)) : state.scoreError || 'Enter your Match ID (or scorecard URL) to scrape live match data.';
    $('homeMatchResult').textContent = s ? [s.result || s.stats?.scoreNeededText || s.stats?.toss || s.series || '', s.stats?.date ? `Date: ${s.stats.date}` : ''].filter(Boolean).join(' · ') : '';
    $('homeSource').textContent = s ? `${s.source} · Club ${s.clubId} / Match ${s.matchId} · ${state.scoreTransport === 'relay' ? 'relay feed' : 'direct feed'} · ${s.stale ? 'last verified' : 'fetched'} ${new Date(s.fetchedAt).toLocaleTimeString()}` : 'Scorecard, commentary and stats from your selected match appear here.';
    $('homeRelayState').textContent = state.session ? state.info?.encoder.ready ? 'Relay connected' : 'Encoder needs attention' : 'Connect your cloud studio';
    const ready = state.info?.destinations?.filter(d => d.configured).map(d => d.id) || [];
    $('homePlatformState').textContent = ready.length ? `Ready: ${ready.join(', ')}` : 'Choose your destinations';
    $('homeCameraState').textContent = state.camera ? `${state.camera.width} × ${state.camera.height} · camera ready` : `${state.captureResolution === 'auto' ? 'Auto' : state.captureResolution + 'p'} target · camera off`;
    $('homeConnection').textContent = state.live ? 'Sending video' : state.session ? 'Relay online' : 'Studio offline';
  }
  update();
  return { update, openStudio, home };
}
