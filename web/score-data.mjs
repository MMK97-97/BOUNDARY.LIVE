// Shared source normalization. Safe in both Node and the browser; no credentials or generated match data.
const truth = v => v === true || v === 'true' || v === '1' || v === 1;
export const clean = (value, length = 80) => String(value ?? '')
  .replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'")
  .replace(/&quot;/g, '"').replace(/[\r\n\t\x00-\x1f\x7f]/g, ' ')
  .replace(/\s+/g, ' ').trim().slice(0, length);
const decimal = (value, label) => {
  const s = String(value ?? '').trim();
  if (!/^\d{1,6}(?:\.\d{1,2})?$/.test(s)) throw new Error(`Score feed is missing or has invalid ${label}.`);
  return s;
};
function commentaryRows(raw) {
  const rows = Array.isArray(raw) ? raw : typeof raw === 'string' && raw.trim() ? [{ text: raw }] : [];
  return rows.slice(-120).filter(v => v && typeof v === 'object').map((v, i) => ({ id: clean(v.id || `source-${i}`, 80),
    over: clean(v.over ?? v.overs, 10), text: clean(v.text ?? v.commentary ?? v.comment, 2000) })).filter(v => v.text);
}
const rows = value => Array.isArray(value) ? value.filter(p => p && typeof p === 'object' && !Array.isArray(p)).slice(0, 15) : [];
export function sourceLogo(value) {
  try { const url = new URL(String(value || ''), 'https://cricclubs.com');
    return url.protocol === 'https:' && !url.username && !url.password && /(^|\.)cricclubs\.com$/.test(url.hostname) && value ? url.href : '';
  } catch { return ''; }
}
function sourceBatter(p) { return normalPlayer({ id: p.playerID ?? p.id, name: p.playerName || p.name || `${p.firstName || ''} ${p.lastName || ''}`,
  runs: p.runsScored ?? p.runs, balls: p.ballsFaced ?? p.balls, fours: p.fours, sixes: p.sixers ?? p.sixes,
  status: p.outStringNoLink || p.status, strikeRate: p.strikeRate }); }
function sourceBowler(p) { return normalBowler({ id: p.playerID ?? p.id, name: p.playerName || p.name || `${p.firstName || ''} ${p.lastName || ''}`,
  overs: p.overs ?? p.oversBowled ?? (/^\d{1,4}$/.test(String(p.balls)) ? `${Math.floor(Number(p.balls) / 6)}.${Number(p.balls) % 6}` : ''),
  maidens: p.maidens, runs: p.runs, wickets: p.wickets, economy: p.economy }); }
function inningsCard(p) { return { id: clean(p.id, 8), team: clean(p.team, 100), bowling: clean(p.bowling, 100),
  runs: clean(p.runs, 6), wickets: clean(p.wickets, 3), overs: clean(p.overs, 6),
  batting: rows(p.batting).map(normalPlayer), bowlers: rows(p.bowlers).map(normalBowler), complete: p.complete === true,
  extras: p.extras && typeof p.extras === 'object' ? Object.fromEntries(['total', 'byes', 'legByes', 'wides', 'noBalls', 'penalty', 'text'].map(k => [k, clean(p.extras[k], k === 'text' ? 300 : 6)])) : null,
  fallOfWickets: (Array.isArray(p.fallOfWickets) ? p.fallOfWickets : []).slice(0, 20).map(v => clean(v, 1000)),
  didNotBat: (Array.isArray(p.didNotBat) ? p.didNotBat : []).slice(0, 15).map(v => clean(v, 120)) }; }
function partnership(raw) {
  if (!raw || typeof raw !== 'object' || raw.runs == null || raw.balls == null) return null;
  return { runs: clean(raw.runs, 6), balls: clean(raw.balls, 6), batters: (Array.isArray(raw.batters) ? raw.batters : []).slice(0, 2).map(p => ({ name: clean(p?.name, 40), runs: clean(p?.runs, 5), balls: clean(p?.balls, 5) })) };
}
export function validateIds(clubId, matchId) {
  if (!/^[1-9]\d{0,11}$/.test(String(clubId)) || !/^[1-9]\d{0,11}$/.test(String(matchId))) {
    throw new Error('Provide numeric Club ID and Match ID, or paste the full CricClubs scorecard URL.');
  }
  return { clubId: String(clubId), matchId: String(matchId) };
}
export function normalizeScore(raw, ids, now = Date.now()) {
  ids = validateIds(ids.clubId, ids.matchId);
  let s;
  if (['boundary.score.v1', 'mk97.score.v1'].includes(raw?.schema)) {
    if (raw.matchId != null && String(raw.matchId) !== ids.matchId || raw.clubId != null && String(raw.clubId) !== ids.clubId) throw new Error('Score feed returned different match identifiers.');
    s = {
      batting: clean(raw.batting, 28), bowling: clean(raw.bowling, 28),
      runs: decimal(raw.runs, 'runs'), wickets: decimal(raw.wickets, 'wickets'),
      overs: decimal(raw.overs, 'overs'), runRate: clean(raw.runRate, 10),
      target: clean(raw.target, 8), result: clean(raw.result, 100),
      status: ['live', 'complete', 'break', 'scheduled'].includes(raw.status) ? raw.status : 'live',
      balls: Array.isArray(raw.balls) ? raw.balls.slice(-32).map(v => clean(v, 8)) : [],
      detail: clean(raw.detail, 110), source: 'Approved score feed',
      batters: (Array.isArray(raw.batters) ? raw.batters : []).slice(0, 2).map(normalPlayer), bowler: raw.bowler ? normalBowler(raw.bowler) : null,
      series: clean(raw.series, 120), ground: clean(raw.ground, 100),
      teams: rows(raw.teams).slice(0, 2).map(t => ({ name: clean(t.name, 100), code: clean(t.code || t.name, 12), logo: sourceLogo(t.logo), runs: clean(t.runs, 6), wickets: clean(t.wickets, 3), overs: clean(t.overs, 6) })),
      innings: clean(raw.innings || raw.batting, 40),
      cards: { batting: (Array.isArray(raw.cards?.batting) ? raw.cards.batting : []).slice(0, 15).map(normalPlayer), bowling: (Array.isArray(raw.cards?.bowling) ? raw.cards.bowling : []).slice(0, 15).map(normalBowler), complete: raw.cards?.complete === true && Array.isArray(raw.cards?.batting) && Array.isArray(raw.cards?.bowling) },
      deliveries: (Array.isArray(raw.deliveries) ? raw.deliveries : []).slice(-12).filter(d => d && typeof d === 'object').map(d => ({ id: clean(d.id, 80), batRuns: Number(d.batRuns), occurredAt: Date.parse(d.occurredAt), batterName: clean(d.batterName, 32) })).filter(d => d.id && Number.isFinite(d.occurredAt))
    };
    s.commentary = commentaryRows(raw.commentary);
    s.lastOut = raw.lastOut ? normalPlayer(raw.lastOut) : null;
    s.stats = { toss: clean(raw.stats?.toss, 120), playerOfMatch: clean(raw.stats?.playerOfMatch, 60), partnership: partnership(raw.stats?.partnership) };
    s.inningsCards = rows(raw.inningsCards).slice(0, 4).map(inningsCard);
  } else {
    const v = raw?.values;
    if (!v || typeof v !== 'object') throw new Error('CricClubs did not return a supported score feed. Check feed access with your league.');
    if (v.matchId && String(v.matchId) !== ids.matchId) throw new Error('Score feed returned a different Match ID.');
    if (v.clubId && String(v.clubId) !== ids.clubId) throw new Error('Score feed returned a different Club ID.');
    const superOver = truth(raw.isSuperOver);
    const second = superOver ? truth(raw.isSuperOverSecondInningsStarted) : truth(raw.isSecondInningsStarted ?? v.isSecondInningsStarted);
    const bat = second ? 't2' : 't1', bowl = second ? 't1' : 't2';
    const batters = [1, 2].filter(n => v[`batsman${n}Name`]).map(n => normalPlayer({
      id: v[`batsman${n}ID`], name: v[`batsman${n}Name`], runs: v[`batsman${n}Runs`], balls: v[`batsman${n}Balls`],
      fours: v[`batsman${n}Fours`], sixes: v[`batsman${n}Sixers`], status: truth(v[`batsman${n}IsOut`]) ? 'out' : 'not out'
    }));
    const bowler = v.bowlerName ? normalBowler({ id: v.bowlerID, name: v.bowlerName, overs: v.bowlerOvers,
      maidens: v.bowlerMaidens, runs: v.bowlerRuns, wickets: v.bowlerWickets }) : null;
    s = {
      batting: clean(v[`${bat}Code`] || v[`${bat}Name`], 28),
      bowling: clean(v[`${bowl}Code`] || v[`${bowl}Name`] || 'Opposition', 28),
      runs: decimal(v[`${bat}Total`], 'batting total'), wickets: decimal(v[`${bat}Wickets`], 'wickets'),
      overs: decimal(v[`${bat}Overs`], 'overs'), runRate: clean(v[`${bat}RR`], 10),
      target: clean(v.revisedTarget, 8), result: clean(v.shortResult || v.result, 100),
      status: truth(v.isMatchEnded) ? 'complete' : 'live',
      balls: Array.isArray(raw.balls) ? raw.balls.slice(-32).map(b => clean(b, 8)) : [],
      detail: clean(v.customTextValue || v.showMsgForScoreNeeded || v.seriesName, 110),
      source: 'CricClubs', superOver,
      series: clean(v.seriesName, 80), ground: clean(v.groundName, 60), batters, bowler,
      innings: `${superOver ? 'SO' : ''}${second ? '2' : '1'}`, requiredRate: clean(v.RRR, 10),
      totalOvers: clean(v.totalOvers, 6), deliveries: [],
      cards: {
        batting: rows(v[`${bat}Batting`]).map(sourceBatter),
        bowling: rows(v[`${bowl}Bowling`]).map(sourceBowler),
        complete: false
      },
      teams: ['t1', 't2'].filter(t => v[`${t}Name`] && /^\d+$/.test(String(v[`${t}Total`]))).map(t => ({
        name: clean(v[`${t}Name`], 100), code: clean(v[`${t}Code`] || v[`${t}Name`], 12), logo: sourceLogo(t === 't1' ? v.firstLogo : v.secondLogo),
        runs: clean(v[`${t}Total`], 6), wickets: clean(v[`${t}Wickets`], 3), overs: clean(v[`${t}Overs`], 6)
      })),
      partialView: ![1, 42, 45, 54].includes(Number(raw.view))
    };
    const p = v.currentPartnershipMap;
    s.lastOut = v.lastOutName ? normalPlayer({ id: v.lastOutID, name: v.lastOutName, runs: v.lastOutRuns, balls: v.lastOutBalls,
      fours: v.lastOutFours, sixes: v.lastOutSixers ?? v.lastOUtSixers, status: v.lastOutString }) : null;
    s.commentary = commentaryRows(raw.comments);
    s.stats = { toss: clean(v.toss, 120), playerOfMatch: clean(v.manOfTheMatch, 60),
      partnership: p ? partnership({ runs: p.partnershipTotalRuns, balls: p.partnershipTotalBalls,
        batters: [1, 2].map(n => ({ name: p[`partnershipBatsman${n}Name`], runs: p[`partnershipBatsman${n}ContributionRuns`], balls: p[`partnershipBatsman${n}ContributionBalls`] })) }) : null };
    s.inningsCards = ['t1', 't2'].filter(t => v[`${t}Name`] && /^\d+$/.test(String(v[`${t}Total`]))).map((t, i) => {
      const other = t === 't1' ? 't2' : 't1';
      return { id: superOver ? `SO${i + 1}` : String(i + 1), team: clean(v[`${t}Name`], 100), bowling: clean(v[`${other}Name`], 100),
        runs: clean(v[`${t}Total`], 6), wickets: clean(v[`${t}Wickets`], 3), overs: clean(v[`${t}Overs`], 6),
        batting: rows(v[`${t}Batting`]).map(sourceBatter), bowlers: rows(v[`${other}Bowling`]).map(sourceBowler), complete: false };
    });
  }
  if (!s.batting) throw new Error('Score feed has no batting team. Wait for live scoring or use an approved feed.');
  if (!/^\d+$/.test(s.runs) || !/^\d{1,6}(?:\.[0-5])?$/.test(s.overs)) throw new Error('Unsupported runs or cricket over notation.');
  if (!/^\d{1,2}$/.test(s.wickets) || Number(s.wickets) > 20) throw new Error('Unsupported wicket value.');
  return { ...s, ...ids, fetchedAt: now, stale: false, error: null };
}
function normalPlayer(p) { p ||= {}; return { id: clean(p.id, 30), name: clean(p.name, 120), runs: clean(p.runs, 5), balls: clean(p.balls, 5), fours: clean(p.fours, 4), sixes: clean(p.sixes, 4), status: clean(p.status, 200), strikeRate: clean(p.strikeRate, 8) }; }
function normalBowler(p) { p ||= {}; return { id: clean(p.id, 30), name: clean(p.name, 120), overs: clean(p.overs, 6), maidens: clean(p.maidens, 4), runs: clean(p.runs, 5), wickets: clean(p.wickets, 3), economy: clean(p.economy, 8) }; }
export function scoreLines(score, now = Date.now()) {
  if (!score) return ['MK97  |  CRICKET', 'Waiting for score feed'];
  const delayed = score.stale || now - score.fetchedAt > 30000;
  const first = `${score.batting}  ${score.runs}/${score.wickets}    ${score.overs} ov${score.runRate ? `   CRR ${score.runRate}` : ''}`;
  const status = delayed ? 'SCORE DELAYED' : score.status === 'complete' ? 'MATCH COMPLETE' : score.superOver ? 'SUPER OVER' : 'LIVE SCORE';
  const shortName = name => name.length > 18 ? name.slice(0, 17) + '…' : name;
  const players = score.batters?.map(p => `${shortName(p.name)} ${p.runs}(${p.balls})`).join('  ·  ');
  const detail = score.result || players || score.detail || (score.target ? `Target ${score.target}` : score.bowling === 'Opposition' ? '' : `v ${score.bowling}`);
  return [clean(first, 95), clean(`${status}  |  ${detail ? `${detail}  |  ` : ''}${score.source}`, 120)];
}
