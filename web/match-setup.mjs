import { knownLeague } from './cricclubs-reference.mjs';
const $ = id => document.getElementById(id);
export function installMatchSelection({ state, onLeagueSelected = () => {}, onRefreshSchedule = () => {} }) {
  function sync(clubId, league) {
    const known = knownLeague(clubId), label = known?.label || league || 'CricClubs';
    $('clubInput').value = clubId; $('homeClubInput').value = clubId;
    $('leaguePreset').value = known ? clubId : 'custom'; $('homeLeaguePreset').value = known ? clubId : 'custom';
    $('leagueDetails').querySelector('summary').textContent = `${label} · Club ${clubId}`;
    $('clubHelp').textContent = 'Enter the Match ID directly (known leagues auto-detect Club ID), or select a Club ID / paste a scorecard URL. Examples: FWCWL 986; Tampa Cricket 3866; TCL 6098.';
  }
  const locked = () => Boolean(state.live || state.starting || state.stopping || state.scoreLoading);
  for (const id of ['leaguePreset', 'homeLeaguePreset']) $(id).addEventListener('change', () => {
    if (locked()) return;
    const club = $(id).value;
    if (club === 'custom') { $('leagueDetails').open = true; $(id === 'homeLeaguePreset' ? 'homeClubInput' : 'clubInput').focus(); return; }
    if (!knownLeague(club)) return;
    if ($('clubInput').value !== club) { $('matchInput').value = ''; $('homeMatchInput').value = ''; }
    sync(club); $(id === 'homeLeaguePreset' ? 'homeMatchInput' : 'matchInput').focus();
    onLeagueSelected({ clubId: club, league: knownLeague(club)?.league });
  });
  for (const id of ['clubInput', 'homeClubInput']) $(id).addEventListener('change', () => {
    if (locked()) return;
    const club = $(id).value.trim();
    sync(club);
    if (/^[1-9][0-9]{0,11}$/.test(club)) onLeagueSelected({ clubId: club, league: knownLeague(club)?.league || '' });
  });
  for (const id of ['homeRefreshSchedule', 'matchRefreshSchedule']) $(id)?.addEventListener('click', () => {
    if (!locked()) onRefreshSchedule();
  });
  function update() {
    $('leaguePreset').disabled = locked(); $('homeLeaguePreset').disabled = locked();
    if ($('homeRefreshSchedule')) $('homeRefreshSchedule').disabled = Boolean(locked() || state.scheduleLoading);
    if ($('matchRefreshSchedule')) $('matchRefreshSchedule').disabled = Boolean(locked() || state.scheduleLoading);
    $('matchFailure').hidden = !state.scoreError; $('matchFailure').textContent = state.scoreError || '';
    $('matchConnect').hidden = Boolean(state.session);
    $('matchConnectionHelp').textContent = state.session ? state.info?.scoreSource === 'configured-feed' ?
      'A custom score feed is configured on your server. To read CricClubs directly, remove SCORE_URL_TEMPLATE from Render, save and redeploy. Keep any authorized custom feed only if it supplies this selected club and match.' :
      'Cloud reader connected. Scores refresh automatically after a temporary source failure.' :
      'For the streaming overlay, connect your cloud studio in Stream setup. A direct browser preview depends on CricClubs allowing the request.';
  }
  sync($('clubInput').value); update();
  return { accept(ids) { sync(ids.clubId, ids.league); $('matchInput').value = ids.matchId; $('homeMatchInput').value = ids.matchId; }, update };
}
