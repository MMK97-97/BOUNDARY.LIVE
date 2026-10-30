import { validateIds } from './score-data.mjs';

// Public league identifiers, not credentials. Full scorecard URLs also support
// other leagues without allowing the browser to choose an upstream host.
export const CRICCLUBS_LEAGUES = Object.freeze([
  Object.freeze({ clubId: '300', league: 'FWCWL', label: 'FWCWL' }),
  Object.freeze({ clubId: '1507', league: 'TampaCricket', label: 'Tampa Cricket' }),
  Object.freeze({ clubId: '157', league: 'TCL', label: 'TCL' })
]);
export const knownLeague = clubId => CRICCLUBS_LEAGUES.find(item => item.clubId === String(clubId));
export function validateLeague(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(value)) throw new Error('Use the league path from a CricClubs scorecard URL, such as TampaCricket or TCL.');
  return value;
}
export function matchReference(input, savedClub, savedLeague) {
  let clubId = String(savedClub || '').trim(), matchId = String(input || '').trim(), league;
  if (/^https?:/i.test(matchId)) {
    const url = new URL(matchId);
    if (url.protocol !== 'https:' || url.hostname !== 'cricclubs.com' || url.port || url.username || url.password || url.hash) throw new Error('Use an HTTPS scorecard URL from cricclubs.com without credentials or fragments.');
    const path = url.pathname.match(/^\/([A-Za-z0-9_-]{1,80})\/viewScorecard\.do$/);
    if (!path || url.searchParams.getAll('matchId').length !== 1 || url.searchParams.getAll('clubId').length !== 1 ||
      [...url.searchParams.keys()].some(key => !['matchId', 'clubId'].includes(key))) throw new Error('Paste the CricClubs scorecard URL with one Club ID and one Match ID.');
    clubId = url.searchParams.get('clubId'); matchId = url.searchParams.get('matchId'); league = path[1];
  } else league = validateLeague(savedLeague);
  const ids = validateIds(clubId, matchId);
  return league ? { ...ids, league } : ids;
}
export function selectedReference(value) {
  const ids = validateIds(value?.clubId, value?.matchId), league = validateLeague(value?.league);
  return league ? { ...ids, league } : ids;
}
