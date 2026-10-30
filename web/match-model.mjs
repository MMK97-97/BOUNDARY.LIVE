// Boundary Live match model.
// Shared by the browser (web/feed.mjs) and the GitHub Actions archiver (scripts/archive-match.mjs).
// Pure functions only: no DOM, no network. Every value comes from the CricClubs live score feed
// (liveScoreOverlayData.do). Values copied verbatim from the feed are marked `exact`; anything this
// module infers from consecutive snapshots (ball-by-ball text, per-over runs) is marked `derived`.
export const SCHEMA = 'boundary.match.v2';
export const CRICCLUBS = 'https://cricclubs.com';
const MAX_COMMENTARY = 1500;

const truth = v => v === true || v === 'true' || v === '1' || v === 1;
export const clean = (value, length = 80) => String(value ?? '')
  .replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'")
  .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/[\r\n\t\x00-\x1f\x7f]/g, ' ')
  .replace(/\s+/g, ' ').trim().slice(0, length);
const num = v => { const s = String(v ?? '').trim(); if (!/^-?\d+(?:\.\d+)?$/.test(s)) return null; const n = Number(s); return Number.isFinite(n) ? n : null; };
const int = v => { const n = num(v); return n == null ? null : Math.trunc(n); };
const id = v => clean(v, 30);
const asset = path => { const p = clean(path, 300); if (!p) return ''; if (/^https:\/\/([a-z0-9-]+\.)*cricclubs\.com\//i.test(p)) return p; return p.startsWith('/') && !p.startsWith('//') ? CRICCLUBS + p : ''; };

/** Cricket overs ("30.5") to legal balls (185). Returns null for malformed input. */
export function oversToBalls(overs) {
  const s = String(overs ?? '').trim();
  const m = /^(\d{1,4})(?:\.([0-5]))?$/.exec(s);
  return m ? Number(m[1]) * 6 + Number(m[2] || 0) : null;
}
export const ballsToOvers = balls => `${Math.floor(balls / 6)}.${balls % 6}`.replace(/\.0$/, '');
export const overlayUrl = ({ clubId, matchId }) => `${CRICCLUBS}/liveScoreOverlayData.do?clubId=${encodeURIComponent(clubId)}&matchId=${encodeURIComponent(matchId)}`;
export const scorecardUrl = ({ clubId, matchId, league }) => `${CRICCLUBS}/${encodeURIComponent(league || 'FWCWL')}/viewScorecard.do?matchId=${encodeURIComponent(matchId)}&clubId=${encodeURIComponent(clubId)}`;
export function youtubeId(value) {
  const s = String(value || '');
  const m = /(?:youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?v=|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/.exec(s);
  return m ? m[1] : '';
}

/** Parse one ball code from the CricClubs "balls" array ("4", ".", "1wd", "W", "2lb", "4nb"). */
export function parseBall(code) {
  const raw = clean(code, 8), s = raw.toLowerCase();
  const digits = /^(\d+)/.exec(s), n = digits ? Number(digits[1]) : 0;
  const extra = /wd/.test(s) ? 'wd' : /nb/.test(s) ? 'nb' : /lb/.test(s) ? 'lb' : /(^|\d)b($|\W)/.test(s) ? 'b' : '';
  const wicket = /w(?!d)/.test(s) || /\bout\b/.test(s);
  const legal = extra !== 'wd' && extra !== 'nb';
  // CricClubs shows "1wd"/"1nb" for the single penalty run; bat runs off a no-ball appear as "5nb"/"4nb".
  const batRuns = extra === 'nb' ? Math.max(0, n - 1) : extra ? 0 : n;
  const runs = extra === 'wd' || extra === 'nb' ? Math.max(1, n) : n;
  const kind = wicket ? 'wicket' : batRuns === 6 ? 'six' : batRuns === 4 ? 'four' : extra ? 'extra' : runs === 0 ? 'dot' : 'run';
  return { code: raw || '.', runs, batRuns, extra, wicket, legal, kind };
}
const sumRuns = balls => balls.reduce((t, b) => t + parseBall(b).runs, 0);
const legalCount = balls => balls.filter(b => parseBall(b).legal).length;

function player(p) {
  return { id: id(p.id), name: clean(p.name, 40), runs: int(p.runs), balls: int(p.balls), fours: int(p.fours), sixes: int(p.sixes),
    out: Boolean(p.out), howOut: clean(p.howOut, 80) };
}
function bowler(p) {
  return { id: id(p.id), name: clean(p.name, 40), overs: clean(p.overs, 6), maidens: int(p.maidens), runs: int(p.runs), wickets: int(p.wickets),
    wides: int(p.wides), noBalls: int(p.noBalls), dots: int(p.dots) };
}
const fullName = p => clean(p.playerName || p.name || `${p.firstName || ''} ${p.lastName || ''}`, 40);
function cardBatter(p) {
  const how = clean(p.outStringNoLink || p.outString || p.howOut || p.dismissal, 80);
  return player({ id: p.playerID ?? p.playerId ?? p.id, name: fullName(p), runs: p.runsScored ?? p.runs, balls: p.ballsFaced ?? p.balls,
    fours: p.fours, sixes: p.sixers ?? p.sixes, out: how ? !/not out|batting/i.test(how) : truth(p.isOut), howOut: how || (truth(p.isOut) ? 'out' : 'not out') });
}
function cardBowler(p) {
  return bowler({ id: p.playerID ?? p.playerId ?? p.id, name: fullName(p), overs: p.overs ?? p.oversBowled, maidens: p.maidens,
    runs: p.runs ?? p.runsGiven ?? p.runsConceded, wickets: p.wickets, wides: p.wides, noBalls: p.noBalls ?? p.noballs, dots: p.dots ?? p.dotBalls });
}

/** Turn a raw liveScoreOverlayData.do response into a validated snapshot. */
export function parseSnapshot(raw, ids, now = Date.now()) {
  const v = raw?.values;
  if (!v || typeof v !== 'object' || !Object.keys(v).length) throw new Error('CricClubs has no live score data for this Club ID and Match ID yet.');
  if (v.matchId != null && v.matchId !== '' && String(v.matchId) !== String(ids.matchId)) throw new Error('CricClubs returned a different match.');
  const superOver = truth(raw.isSuperOver ?? v.isSuperOver);
  const second = superOver ? truth(raw.isSuperOverSecondInningsStarted ?? v.isSuperOverSecondInningsStarted) : truth(raw.isSecondInningsStarted ?? v.isSecondInningsStarted);
  const batKey = second ? 't2' : 't1', bowlKey = second ? 't1' : 't2';
  const team = k => ({ id: id(v[`${k}ID`]), name: clean(v[`${k}Name`], 40), code: clean(v[`${k}Code`] || v[`${k}Name`], 12),
    logo: asset(k === 't1' ? v.firstLogo : v.secondLogo), runs: int(v[`${k}Total`]), wickets: int(v[`${k}Wickets`]), overs: clean(v[`${k}Overs`], 6), runRate: clean(v[`${k}RR`], 8) });
  const teams = { t1: team('t1'), t2: team('t2') };
  const bat = teams[batKey];
  const legal = oversToBalls(bat.overs);
  const hasScore = bat.runs != null && bat.wickets != null && legal != null;
  const batters = [1, 2].filter(n => clean(v[`batsman${n}Name`])).map(n => player({ id: v[`batsman${n}ID`], name: v[`batsman${n}Name`],
    runs: v[`batsman${n}Runs`], balls: v[`batsman${n}Balls`], fours: v[`batsman${n}Fours`], sixes: v[`batsman${n}Sixers`],
    out: truth(v[`batsman${n}IsOut`]), howOut: clean(v[`batsman${n}OutString`], 80) }));
  const pm = v.currentPartnershipMap && typeof v.currentPartnershipMap === 'object' ? v.currentPartnershipMap : null;
  const lastOut = clean(v.lastOutName) ? player({ id: v.lastOutID, name: v.lastOutName, runs: v.lastOutRuns, balls: v.lastOutBalls,
    fours: v.lastOutFours, sixes: v.lastOUtSixers ?? v.lastOutSixers, out: true, howOut: clean(v.lastOutString, 80) || 'out' }) : null;
  const cards = {};
  for (const k of ['t1', 't2']) {
    if (Array.isArray(v[`${k}Batting`]) && v[`${k}Batting`].length) cards[`${k}Batting`] = v[`${k}Batting`].slice(0, 15).map(cardBatter);
    if (Array.isArray(v[`${k}Bowling`]) && v[`${k}Bowling`].length) cards[`${k}Bowling`] = v[`${k}Bowling`].slice(0, 15).map(cardBowler);
  }
  const remaining = oversToBalls(v.remainingOvers);
  return {
    clubId: String(ids.clubId), matchId: String(ids.matchId), at: now, view: int(raw.view),
    series: clean(v.seriesName, 80), ground: clean(v.groundName, 60), toss: clean(v.toss, 120),
    result: clean(v.shortResult || v.result, 120), status: truth(v.isMatchEnded) ? 'complete' : hasScore ? 'live' : 'scheduled',
    totalOvers: int(v.totalOvers), superOver, innings: `${superOver ? 'SO' : ''}${second ? '2' : '1'}`, batKey, bowlKey, teams, hasScore,
    batting: bat.name || bat.code, bowling: teams[bowlKey].name || teams[bowlKey].code,
    runs: bat.runs, wickets: bat.wickets, overs: bat.overs, legal, runRate: clean(v.runrate || bat.runRate, 8),
    requiredRate: clean(v.RRR, 8), requiredRuns: second ? int(v.requiredRuns) : null, remainingBalls: second ? remaining : null,
    target: second ? (int(v.revisedTarget) || (teams[bowlKey].runs != null ? teams[bowlKey].runs + 1 : null)) : null,
    parScore: int(v.parScore), dls: truth(v.isDls),
    batters, bowler: clean(v.bowlerName) ? bowler({ id: v.bowlerID, name: v.bowlerName, overs: v.bowlerOvers, maidens: v.bowlerMaidens, runs: v.bowlerRuns, wickets: v.bowlerWickets }) : null,
    balls: Array.isArray(raw.balls) ? raw.balls.slice(0, 16).map(b => clean(b, 8)).filter(Boolean) : [],
    partnership: pm ? { runs: int(pm.partnershipTotalRuns), balls: int(pm.partnershipTotalBalls),
      b1: { id: id(pm.partnershipBatsman1ID), name: clean(pm.partnershipBatsman1Name, 40), runs: int(pm.partnershipBatsman1ContributionRuns), balls: int(pm.partnershipBatsman1ContributionBalls) },
      b2: { id: id(pm.partnershipBatsman2ID), name: clean(pm.partnershipBatsman2Name, 40), runs: int(pm.partnershipBatsman2ContributionRuns), balls: int(pm.partnershipBatsman2ContributionBalls) } } : null,
    lastOut, comment: clean(raw.comments, 400), fow: clean(v.fow, 400), mom: clean(v.manOfTheMatch, 40),
    youtube: youtubeId(v.liveYouTubeLink), cards
  };
}

export function emptyModel(ids) {
  return { schema: SCHEMA, clubId: String(ids.clubId), matchId: String(ids.matchId), league: ids.league || '', createdAt: Date.now(), updatedAt: 0, polls: 0,
    meta: { series: '', ground: '', toss: '', result: '', status: 'scheduled', totalOvers: null, mom: '', youtube: '', teams: {} }, latest: null, order: [], innings: {} };
}
function newInnings(key, snap) {
  return { key, batKey: snap.batKey, bowlKey: snap.bowlKey, runs: null, wickets: null, overs: '', legal: null, runRate: '',
    batting: [], bowling: [], exact: { batting: false, bowling: false }, fow: [], partnerships: [], partnership: null,
    overs_: {}, commentary: [], lastComment: '', last: null, firstSeenLegal: snap.legal };
}
function ensureInnings(model, key, batKey, bowlKey, team) {
  const inn = newInnings(key, { batKey, bowlKey, legal: null });
  Object.assign(inn, { runs: team?.runs ?? null, wickets: team?.wickets ?? null, overs: team?.overs || '', legal: oversToBalls(team?.overs), runRate: team?.runRate || '' });
  model.innings[key] = inn; model.order.push(key);
  const rank = k => (k.startsWith('SO') ? 10 : 0) + Number(k.replace('SO', ''));
  model.order.sort((x, y) => rank(x) - rank(y));
  return inn;
}
const sameP = (a, b) => (a.id && b.id ? a.id === b.id : a.name === b.name);
function upsert(list, p, better) { const i = list.findIndex(x => sameP(x, p)); if (i < 0) { list.push({ ...p, seen: list.length + 1 }); return list.at(-1); } if (better(list[i], p)) list[i] = { ...list[i], ...p, seen: list[i].seen }; return list[i]; }
const moreBalls = (a, b) => (b.balls ?? -1) >= (a.balls ?? -1);
const moreOvers = (a, b) => (oversToBalls(b.overs) ?? -1) >= (oversToBalls(a.overs) ?? -1);

function overIndexOf(snap) {
  const inOver = legalCount(snap.balls);
  // When the over just finished CricClubs keeps showing its six balls until the next delivery.
  return snap.legal % 6 === 0 && inOver >= 6 && snap.legal > 0 ? snap.legal / 6 - 1 : Math.floor(snap.legal / 6);
}

function addDelivery(inn, overIdx, pos, code, ctx) {
  const b = parseBall(code);
  const legalBefore = legalCount(ctx.balls.slice(0, pos));
  const entry = { id: `${inn.key}:${overIdx}.${pos}`, sort: overIdx * 100 + pos, at: ctx.at, over: `${overIdx}.${Math.min(6, legalBefore + 1)}`,
    code: b.code, kind: b.kind, runs: b.runs, batRuns: b.batRuns, extra: b.extra, bowler: ctx.bowler || '', batter: ctx.batter || '',
    outName: b.wicket ? ctx.outName || '' : '', howOut: b.wicket ? ctx.howOut || '' : '', source: 'derived', baseline: Boolean(ctx.baseline) };
  const i = inn.commentary.findIndex(c => c.id === entry.id);
  if (i >= 0) inn.commentary[i] = { ...inn.commentary[i], ...entry, batter: entry.batter || inn.commentary[i].batter }; else inn.commentary.push(entry);
}

/** Fold a snapshot into the accumulated model. Returns the same (mutated) model. */
export function applySnapshot(model, snap) {
  model.polls++; model.updatedAt = snap.at;
  const m = model.meta;
  for (const k of ['series', 'ground', 'toss', 'result', 'status', 'mom', 'youtube']) if (snap[k] || k === 'status') m[k] = snap[k] || m[k];
  if (snap.totalOvers) m.totalOvers = snap.totalOvers;
  for (const k of ['t1', 't2']) { const t = snap.teams[k]; m.teams[k] = { id: t.id, name: t.name, code: t.code, logo: t.logo || m.teams[k]?.logo || '', runs: t.runs, wickets: t.wickets, overs: t.overs, runRate: t.runRate }; }
  const { cards: _cards, ...latest } = snap; model.latest = latest;
  // Joined during the chase: keep the first innings total even though its balls were never observed.
  if (snap.hasScore && snap.innings === '2' && !model.innings['1']) ensureInnings(model, '1', 't1', 't2', snap.teams.t1);
  // Exact full cards supplied by the feed (when the league overlay shows a scorecard view).
  for (const k of ['t1', 't2']) {
    const key = k === 't1' ? '1' : '2';
    if ((snap.cards[`${k}Batting`] || snap.cards[`${k === 't1' ? 't2' : 't1'}Bowling`]) && !model.innings[key] && (key === '1' || snap.innings === '2')) ensureInnings(model, key, k, k === 't1' ? 't2' : 't1', snap.teams[k]);
    const target = model.innings[key];
    if (target) {
      if (snap.cards[`${k}Batting`]) { target.batting = snap.cards[`${k}Batting`].map((p, i) => ({ ...p, seen: i + 1 })); target.exact.batting = true; }
      const bowlCard = snap.cards[`${k === 't1' ? 't2' : 't1'}Bowling`];
      if (bowlCard) { target.bowling = bowlCard.map((p, i) => ({ ...p, seen: i + 1 })); target.exact.bowling = true; }
    }
  }
  if (!snap.hasScore) return model;
  for (const key of model.order) {
    const other = model.innings[key], t = snap.teams[other.batKey];
    if (key !== snap.innings && !key.startsWith('SO') && t?.runs != null) Object.assign(other, { runs: t.runs, wickets: t.wickets, overs: t.overs, legal: oversToBalls(t.overs), runRate: t.runRate || other.runRate });
  }
  if (!model.innings[snap.innings]) { model.innings[snap.innings] = newInnings(snap.innings, snap); model.order.push(snap.innings); }
  const inn = model.innings[snap.innings], prev = inn.last;
  Object.assign(inn, { runs: snap.runs, wickets: snap.wickets, overs: snap.overs, legal: snap.legal, runRate: snap.runRate, batKey: snap.batKey, bowlKey: snap.bowlKey });
  if (snap.cards[`${snap.batKey}Batting`]) { inn.batting = snap.cards[`${snap.batKey}Batting`].map((p, i) => ({ ...p, seen: i + 1 })); inn.exact.batting = true; }
  if (snap.cards[`${snap.bowlKey}Bowling`]) { inn.bowling = snap.cards[`${snap.bowlKey}Bowling`].map((p, i) => ({ ...p, seen: i + 1 })); inn.exact.bowling = true; }

  // Batting card built from consecutive snapshots (unless an exact card is present).
  if (!inn.exact.batting) {
    for (const p of snap.batters) upsert(inn.batting, { ...p, out: false, howOut: 'not out' }, moreBalls);
    if (snap.lastOut && (snap.wickets ?? 0) > 0) upsert(inn.batting, snap.lastOut, () => true);
  }
  if (!inn.exact.bowling && snap.bowler) upsert(inn.bowling, snap.bowler, moreOvers);

  // Fall of wickets and finished partnerships.
  if (prev && snap.wickets > prev.wickets && snap.legal >= prev.legal) {
    for (let n = prev.wickets + 1; n <= snap.wickets; n++) {
      if (inn.fow.some(f => f.n === n)) continue;
      const lo = n === snap.wickets ? snap.lastOut : null;
      inn.fow.push({ n, runs: snap.runs, overs: snap.overs, id: lo?.id || '', name: lo?.name || '', playerRuns: lo?.runs ?? null, playerBalls: lo?.balls ?? null, howOut: lo?.howOut || '', exact: Boolean(lo) });
      if (prev.partnership && n === prev.wickets + 1) inn.partnerships.push({ wicket: n, ...prev.partnership, final: true });
    }
  }
  inn.partnership = snap.partnership;

  // Ball-by-ball (derived) from the "this over" array.
  const overIdx = overIndexOf(snap);
  const prevIdx = prev ? overIndexOf(prev) : null;
  const batterFor = () => {
    if (!prev) return '';
    const moved = snap.batters.filter(p => { const o = prev.batters.find(x => sameP(x, p)); return o && (p.balls ?? 0) > (o.balls ?? 0); });
    return moved.length === 1 ? moved[0].name : '';
  };
  const ctx = { at: snap.at, balls: snap.balls, bowler: snap.bowler?.name, batter: batterFor(),
    outName: prev && snap.wickets > prev.wickets ? snap.lastOut?.name : '', howOut: prev && snap.wickets > prev.wickets ? snap.lastOut?.howOut : '' };
  let fresh = [];
  if (!prev || prevIdx !== overIdx) fresh = snap.balls.map((_, i) => i);
  else {
    let d = 0; while (d < prev.balls.length && d < snap.balls.length && prev.balls[d] === snap.balls[d]) d++;
    if (d < prev.balls.length) inn.commentary = inn.commentary.filter(c => !(c.id.startsWith(`${inn.key}:${overIdx}.`) && c.sort % 100 >= d && c.source === 'derived'));
    fresh = snap.balls.map((_, i) => i).filter(i => i >= d);
  }
  const newestOnly = fresh.length === 1;
  for (const pos of fresh) addDelivery(inn, overIdx, pos, snap.balls[pos], { ...ctx, baseline: !prev, batter: newestOnly ? ctx.batter : '', outName: parseBall(snap.balls[pos]).wicket ? ctx.outName : '', howOut: parseBall(snap.balls[pos]).wicket ? ctx.howOut : '' });

  // Per-over runs (Manhattan) — derived from team totals so it stays correct even if a ball is missed.
  const startRuns = snap.runs - sumRuns(snap.balls);
  if (prev && prevIdx != null && prevIdx < overIdx && inn.overs_[prevIdx]) { const o = inn.overs_[prevIdx]; o.runs = Math.max(0, startRuns - o.start); o.complete = true; }
  const o = inn.overs_[overIdx] || (inn.overs_[overIdx] = { n: overIdx + 1, start: startRuns, runs: 0, wickets: 0, balls: [], bowler: '', complete: false });
  o.runs = Math.max(0, snap.runs - o.start); o.balls = [...snap.balls]; o.wickets = snap.balls.filter(b => parseBall(b).wicket).length; o.bowler = snap.bowler?.name || o.bowler;
  if (legalCount(snap.balls) >= 6) o.complete = true;

  // CricClubs' own commentary line (exact text) when the scorer provides it.
  if (snap.comment && snap.comment !== inn.lastComment) {
    inn.lastComment = snap.comment;
    inn.commentary.push({ id: `${inn.key}:c:${hash(snap.comment)}`, sort: overIdx * 100 + Math.max(0, snap.balls.length - 1) + 0.5, at: snap.at,
      over: snap.overs, kind: 'comment', text: snap.comment, source: 'cricclubs' });
  }
  inn.commentary.sort((a, b) => a.sort - b.sort);
  if (inn.commentary.length > MAX_COMMENTARY) inn.commentary.splice(0, inn.commentary.length - MAX_COMMENTARY);
  inn.last = { runs: snap.runs, wickets: snap.wickets, legal: snap.legal, overs: snap.overs, balls: [...snap.balls], batters: snap.batters, partnership: snap.partnership };
  return model;
}
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }

/** Merge two models of the same match (e.g. local browser history + GitHub Actions archive). */
export function mergeModels(a, b) {
  if (!a || a.schema !== SCHEMA) return b; if (!b || b.schema !== SCHEMA) return a;
  if (a.clubId !== b.clubId || a.matchId !== b.matchId) return a;
  const [newer, older] = a.updatedAt >= b.updatedAt ? [a, b] : [b, a];
  const out = structuredClone(newer);
  out.createdAt = Math.min(a.createdAt || Infinity, b.createdAt || Infinity);
  out.polls = Math.max(a.polls, b.polls);
  for (const key of older.order) {
    const o = older.innings[key];
    if (!out.innings[key]) { out.innings[key] = structuredClone(o); out.order.push(key); continue; }
    const n = out.innings[key];
    if (!n.exact.batting) { if (o.exact.batting) { n.batting = structuredClone(o.batting); n.exact.batting = true; } else for (const p of o.batting) upsert(n.batting, p, (x, y) => (y.out && !x.out) || moreBalls(x, y) && !x.out); }
    if (!n.exact.bowling) { if (o.exact.bowling) { n.bowling = structuredClone(o.bowling); n.exact.bowling = true; } else for (const p of o.bowling) upsert(n.bowling, p, moreOvers); }
    for (const f of o.fow) if (!n.fow.some(x => x.n === f.n)) n.fow.push(f);
    n.fow.sort((x, y) => x.n - y.n);
    for (const p of o.partnerships) if (!n.partnerships.some(x => x.wicket === p.wicket)) n.partnerships.push(p);
    n.partnerships.sort((x, y) => x.wicket - y.wicket);
    for (const [k, ov] of Object.entries(o.overs_)) { const cur = n.overs_[k]; if (!cur || (!cur.complete && ov.complete) || (cur.balls.length < ov.balls.length && !cur.complete)) n.overs_[k] = ov; }
    const seen = new Set(n.commentary.map(c => c.id));
    for (const c of o.commentary) if (!seen.has(c.id)) n.commentary.push(c);
    n.commentary.sort((x, y) => x.sort - y.sort);
    n.firstSeenLegal = Math.min(n.firstSeenLegal ?? Infinity, o.firstSeenLegal ?? Infinity);
  }
  const rank = k => (k.startsWith('SO') ? 10 : 0) + Number(k.replace('SO', ''));
  out.order.sort((x, y) => rank(x) - rank(y));
  return out;
}

/** Summary statistics for the Stats panel. Each value notes whether it is exact or derived. */
export function inningsStats(inn) {
  if (!inn) return null;
  const bat = inn.batting;
  const sum = k => bat.reduce((t, p) => t + (p[k] ?? 0), 0);
  const allBatters = bat.length >= Math.min(11, (inn.wickets ?? 0) + 2) || inn.exact.batting;
  const batRuns = sum('runs');
  const overs = Object.values(inn.overs_).sort((a, b) => a.n - b.n);
  const dots = inn.commentary.filter(c => c.source === 'derived' && c.kind === 'dot').length;
  return { runs: inn.runs, wickets: inn.wickets, overs: inn.overs, runRate: inn.runRate || (inn.legal ? (inn.runs * 6 / inn.legal).toFixed(2) : ''),
    fours: sum('fours'), sixes: sum('sixes'), boundaryRuns: sum('fours') * 4 + sum('sixes') * 6,
    extras: allBatters && inn.runs != null ? Math.max(0, inn.runs - batRuns) : null, cardComplete: allBatters, dots,
    observedFrom: inn.firstSeenLegal ? ballsToOvers(inn.firstSeenLegal) : '0', overs_: overs };
}

// Caption / commentary text in the viewer's language.
export const LANGS = {
  en: { name: 'English', four: 'FOUR!', six: 'SIX!', wicket: 'WICKET!', dot: 'no run', run: n => `${n} run${n === 1 ? '' : 's'}`, wd: n => n > 1 ? `${n} wides` : 'wide', nb: 'no ball', lb: n => `${n} leg bye${n === 1 ? '' : 's'}`, b: n => `${n} bye${n === 1 ? '' : 's'}`, to: (b, p) => `${b} to ${p}`, out: 'out' },
  hi: { name: 'हिन्दी', four: 'चौका!', six: 'छक्का!', wicket: 'विकेट!', dot: 'कोई रन नहीं', run: n => `${n} रन`, wd: n => n > 1 ? `${n} वाइड` : 'वाइड', nb: 'नो बॉल', lb: n => `${n} लेग बाई`, b: n => `${n} बाई`, to: (b, p) => `${b} → ${p}`, out: 'आउट' },
  te: { name: 'తెలుగు', four: 'ఫోర్!', six: 'సిక్స్!', wicket: 'వికెట్!', dot: 'పరుగు లేదు', run: n => `${n} పరుగు${n === 1 ? '' : 'లు'}`, wd: n => n > 1 ? `${n} వైడ్లు` : 'వైడ్', nb: 'నో బాల్', lb: n => `${n} లెగ్ బై`, b: n => `${n} బై`, to: (b, p) => `${b} → ${p}`, out: 'ఔట్' }
};
export function describe(c, lang = 'en') {
  if (!c) return '';
  if (c.source === 'cricclubs') return c.text;
  const L = LANGS[lang] || LANGS.en;
  const who = c.bowler && c.batter ? L.to(c.bowler, c.batter) : c.bowler || c.batter || '';
  let what;
  if (c.kind === 'wicket') what = `${L.wicket}${c.outName ? ` ${c.outName}` : ''}${c.howOut ? ` · ${c.howOut}` : ''}`;
  else if (c.kind === 'six') what = L.six + (c.extra === 'nb' ? ` (${L.nb})` : '');
  else if (c.kind === 'four') what = L.four + (c.extra === 'nb' ? ` (${L.nb})` : '');
  else if (c.extra === 'wd') what = L.wd(c.runs);
  else if (c.extra === 'nb') what = c.batRuns ? `${L.nb}, ${L.run(c.batRuns)}` : L.nb;
  else if (c.extra === 'lb') what = L.lb(c.runs);
  else if (c.extra === 'b') what = L.b(c.runs);
  else what = c.runs ? L.run(c.runs) : L.dot;
  return who ? `${who}, ${what}` : what;
}
