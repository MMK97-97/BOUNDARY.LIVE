// Parse server-rendered scorecards only. Scripts, lazy-loaded API calls and page
// instructions are never executed. Only the fields below leave the parser.
import { loadBuffer } from 'cheerio';
import { createHash } from 'node:crypto';
import { clean, validateIds } from '../../web/score-data.mjs';

export class CricClubsError extends Error {
  constructor(code, message) { super(message); this.name = 'CricClubsError'; this.code = code; }
}
const fail = (code, message) => { throw new CricClubsError(code, message); };
const key = v => clean(v, 200).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const sameTeam = (a, b) => key(a) && key(a) === key(b);
const number = v => /^\d{1,6}$/.test(String(v).trim()) ? String(v).trim() : '';
const rate = v => /^\d{1,6}(?:\.\d{1,3})?$/.test(String(v).trim()) ? String(v).trim() : '';
const overs = v => /^\d{1,4}(?:\.[0-5])?$/.test(String(v).trim()) ? String(v).trim() : '';
const legalBalls = v => { if (!overs(v)) return null; const [o, b = '0'] = v.split('.'); return Number(o) * 6 + Number(b); };
const HEADINGS = 'h1,h2,h3,h4,h5,h6,caption,.panel-heading,.box-title';

export function cricclubsReference(input) {
  let ids, league;
  if (typeof input === 'string' || input instanceof URL) {
    let url;
    try { url = new URL(input); } catch { fail('INVALID_REFERENCE', 'Provide a complete HTTPS CricClubs scorecard URL.'); }
    if (url.protocol !== 'https:' || url.hostname !== 'cricclubs.com' || url.port || url.username || url.password || url.hash) {
      fail('INVALID_REFERENCE', 'Only https://cricclubs.com scorecard URLs without credentials or fragments are accepted.');
    }
    const m = url.pathname.match(/^\/([A-Za-z0-9_-]{1,80})\/viewScorecard\.do$/);
    if (!m || [...url.searchParams.keys()].some(k => !['clubId', 'matchId'].includes(k)) ||
      url.searchParams.getAll('clubId').length !== 1 || url.searchParams.getAll('matchId').length !== 1) {
      fail('INVALID_REFERENCE', 'Use the scorecard URL with one Club ID and one Match ID.');
    }
    league = m[1]; ids = validateIds(url.searchParams.get('clubId'), url.searchParams.get('matchId'));
  } else {
    ids = validateIds(input?.clubId, input?.matchId); league = input?.league;
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(String(league || ''))) fail('INVALID_REFERENCE', 'Provide the CricClubs league path, for example FWCWL.');
  }
  const url = new URL(`https://cricclubs.com/${league}/viewScorecard.do`);
  url.searchParams.set('matchId', ids.matchId); url.searchParams.set('clubId', ids.clubId);
  return { ...ids, league: String(league), url: url.href };
}

function assertIdentity($, ref) {
  for (const name of ['clubId', 'matchId']) {
    $('input[name],body[data-match-id],body[data-club-id],main[data-match-id],main[data-club-id],[data-scorecard][data-match-id],[data-scorecard][data-club-id]').each((_, e) => {
      const node = $(e), value = node.attr('name') === name ? node.attr('value') : node.attr(name === 'clubId' ? 'data-club-id' : 'data-match-id');
      if (value && String(value) !== ref[name]) fail('WRONG_MATCH', `The scorecard contains a different ${name}.`);
    });
  }
  $('link[rel="canonical"]').each((_, e) => {
    let url; try { url = new URL($(e).attr('href'), ref.url); } catch { return; }
    if (url.pathname.endsWith('/viewScorecard.do')) {
      for (const name of ['clubId', 'matchId']) if (url.searchParams.has(name) && url.searchParams.get(name) !== ref[name]) {
        fail('WRONG_MATCH', 'The scorecard canonical URL identifies a different match.');
      }
    }
  });
}

function summary(text, cells = []) {
  text = clean(text, 1000);
  const fraction = text.match(/\b(\d{1,6})\s*\/\s*(\d{1,2})\b/);
  const wkts = fraction?.[2] || text.match(/\b(\d{1,2})\s*(?:wickets?|wkts?)\b/i)?.[1] || '';
  const ov = text.match(/\b(\d{1,4}(?:\.[0-5])?)\s*(?:overs?|ovs?)\b/i)?.[1] ||
    text.match(/\d+\s*\/\s*\d+\s*\(\s*(\d{1,4}(?:\.[0-5])?)\s*\)/)?.[1] || '';
  const runs = fraction?.[1] || (/^total\b/i.test(text) ? text.match(/^total\s*[:\-]?\s*(\d{1,6})(?:\s|$|\()/i)?.[1] || [...cells].reverse().map(number).find(Boolean) : '') || '';
  return { runs: number(runs), wickets: number(wkts), overs: overs(ov) };
}
function teamHeading(text) {
  text = clean(text, 300);
  if (!/\binnings\b/i.test(text)) return null;
  const team = text.split(/\s+(?:(?:1st|2nd|3rd|4th|first|second)\s+)?innings\b/i)[0].replace(/\s+\d+\s*\/\s*\d+.*$/, '').trim();
  return team && !/^(?:first|second|1st|2nd|current|batting|bowling|match|super over)$/i.test(team) ? { team: clean(team, 100), ...summary(text) } : null;
}
function context($, table, previous) {
  let node = $(table);
  for (let depth = 0; node.length && depth < 7; depth++, node = node.parent()) {
    if (node.is('body,html')) break;
    if (node.attr('data-team')) return { team: clean(node.attr('data-team'), 100), ...summary(node.attr('data-score') || '') };
    const caption = node.children(HEADINGS).toArray().map(e => teamHeading($(e).text())).find(Boolean);
    if (caption) return caption;
    const id = node.attr('id');
    if (id) {
      const label = $('a[href]').toArray().filter(e => $(e).attr('href') === '#' + id).map(e => teamHeading($(e).text())).find(Boolean);
      if (label) return label;
    }
  }
  return previous;
}
const aliases = {
  name: ['batting', 'batsman', 'batsmen', 'batter', 'batters', 'bowling', 'bowler', 'bowlers', 'player', 'name'],
  runs: ['r', 'runs'], balls: ['b', 'bf', 'balls', 'ballsfaced'], fours: ['4', '4s', 'fours'], sixes: ['6', '6s', 'sixes'],
  strikeRate: ['sr', 'strikerate'], status: ['dismissal', 'howout', 'out', 'status'],
  overs: ['o', 'ov', 'overs'], maidens: ['m', 'maidens'], wickets: ['w', 'wkts', 'wickets'], economy: ['econ', 'eco', 'er', 'economy'],
  over: ['over', 'ball', 'delivery'], text: ['commentary', 'comment', 'description']
};
function header($, row) {
  const cells = $(row).children('th,td').toArray(), titles = cells.map(e => key($(e).text())), indexes = {};
  for (const [field, names] of Object.entries(aliases)) indexes[field] = titles.findIndex(t => names.includes(t));
  const batting = indexes.runs >= 0 && indexes.balls >= 0 && (indexes.fours >= 0 || indexes.strikeRate >= 0);
  const bowling = indexes.overs >= 0 && indexes.runs >= 0 && indexes.wickets >= 0;
  const commentary = indexes.over >= 0 && indexes.text >= 0;
  if (indexes.name < 0 && titles[0] === '' && (batting || bowling)) indexes.name = 0;
  if (indexes.status < 0 && indexes.name === 0 && indexes.runs > 1 && titles[1] === '') indexes.status = 1;
  return { indexes, type: commentary ? 'commentary' : bowling && indexes.name >= 0 ? 'bowling' : batting && indexes.name >= 0 ? 'batting' : null };
}
function rowPlayer($, cells, h) {
  const at = field => h[field] < 0 || !cells[h[field]] ? '' : clean($(cells[h[field]]).text(), 300);
  const cell = $(cells[h.name]), link = cell.find('a[href]').filter((_, e) => /viewPlayer\.do/.test($(e).attr('href'))).first();
  const detail = cell.find('small,.dismissal,.out-string').first().text();
  const name = clean(link.length ? link.text() : cell.clone().find('small,.dismissal,.out-string').remove().end().text(), 120).replace(/\s*[*†]+\s*$/, '');
  let id = ''; try { const url = new URL(link.attr('href'), 'https://cricclubs.com'); id = number(url.searchParams.get('playerId')); } catch { /* optional public player ID */ }
  const status = at('status') || clean(detail || (link.length ? cell.text().replace(link.text(), '') : ''), 200);
  return { at, id, name, status };
}
function extras(text) {
  const value = text.match(/^extras?\s*[:\-]?\s*(\d{1,6})\b/i)?.[1] || text.match(/\)\s*(\d{1,6})\s*$/)?.[1];
  const out = { total: value || '', text: clean(text, 300) };
  for (const [field, pattern] of Object.entries({ byes: /\b(?:b|byes?)\s*[:=]?\s*(\d+)\b/i, legByes: /\b(?:lb|leg byes?)\s*[:=]?\s*(\d+)\b/i,
    wides: /\b(?:w|wd|wides?)\s*[:=]?\s*(\d+)\b/i, noBalls: /\b(?:nb|no balls?)\s*[:=]?\s*(\d+)\b/i, penalty: /\b(?:p|penalty)\s*[:=]?\s*(\d+)\b/i })) out[field] = number(text.match(pattern)?.[1] || '');
  return out;
}
function metadata($) {
  const out = { series: '', ground: '', result: '', toss: '', playerOfMatch: '' };
  const labels = { series: ['series', 'tournament'], ground: ['ground', 'venue'], result: ['result', 'matchresult'], toss: ['toss'], playerOfMatch: ['playerofthematch', 'manofthematch'] };
  const set = (label, value) => { for (const [field, names] of Object.entries(labels)) if (names.includes(key(label)) && value) out[field] = clean(value, 200); };
  $('tr').slice(0, 500).each((_, e) => { const cells = $(e).children('th,td'); if (cells.length === 2) set(cells.eq(0).text(), cells.eq(1).text()); });
  $('dt').slice(0, 100).each((_, e) => set($(e).text(), $(e).next('dd').text()));
  $('.match-result,[data-match-result]').slice(0, 2).each((_, e) => { if (!out.result) out.result = clean($(e).text(), 200); });
  return out;
}

export function parseCricClubsScorecard(html, input) {
  const ref = cricclubsReference(input), bytes = Buffer.isBuffer(html) ? html : Buffer.from(String(html));
  if (bytes.length > 2_000_000) fail('TOO_LARGE', 'CricClubs scorecard exceeds the 2 MB limit.');
  const prefix = bytes.toString('utf8');
  if (/(?:cf-chl-|challenge-platform|id=["']challenge-form|<title[^>]*>\s*(?:just a moment|attention required)|verify you are human)/i.test(prefix)) {
    fail('ACCESS_BLOCKED', 'CricClubs returned a verification page; full scorecard scraping stopped.');
  }
  const $ = loadBuffer(bytes);
  if ($('input[type="password"]').length && !/\b(?:batting|bowling)\b/i.test($('table').text())) fail('ACCESS_BLOCKED', 'CricClubs requires sign-in; full scorecard scraping stopped.');
  assertIdentity($, ref);
  $('script,style,template,noscript,iframe,object,input,textarea,select,button').remove();
  if ($('table').length > 100) fail('UNSUPPORTED_LAYOUT', 'The scorecard contains too many tables.');
  const inningsCards = [], commentary = [], warnings = [];
  const addComment = (over, text, id = '') => {
    text = clean(text, 2000); if (!text) return;
    over = clean(over, 10);
    const row = { id: clean(id, 80) || createHash('sha256').update(`${over}|${text}`).digest('hex').slice(0, 24), over, text };
    if (!commentary.some(p => p.id === row.id)) commentary.push(row);
  };
  let heading = null;
  $(HEADINGS + ',table').each((_, e) => {
    if (e.tagName !== 'table') { heading = teamHeading($(e).text()) || heading; return; }
    const rows = $(e).find('tr').toArray().filter(r => $(r).closest('table')[0] === e);
    if (rows.length > 1000) fail('UNSUPPORTED_LAYOUT', 'A scorecard table exceeds the row limit.');
    let found;
    for (let i = 0; i < Math.min(rows.length, 8); i++) { const h = header($, rows[i]); if (h.type) { found = { ...h, row: i }; break; } }
    if (!found) return;
    const ctx = context($, e, heading);
    if (found.type === 'commentary') {
      for (const row of rows.slice(found.row + 1)) { const c = $(row).children('td,th'); addComment(c.eq(found.indexes.over).text(), c.eq(found.indexes.text).text(), $(row).attr('id')); }
      return;
    }
    if (rows.length > 150) fail('UNSUPPORTED_LAYOUT', 'A player table exceeds the row limit.');
    if (!ctx?.team) { warnings.push('A player table could not be assigned to a named innings.'); return; }
    let card = inningsCards.find(c => sameTeam(c.team, ctx.team));
    if (!card) {
      if (inningsCards.length >= 4) fail('UNSUPPORTED_LAYOUT', 'More than four innings require a specific parser.');
      card = { id: String(inningsCards.length + 1), team: ctx.team, bowling: '', runs: ctx.runs || '', wickets: ctx.wickets || '', overs: ctx.overs || '',
        batting: [], bowlers: [], extras: null, fallOfWickets: [], didNotBat: [], complete: false, issues: [], tables: { batting: false, bowling: false } };
      inningsCards.push(card);
    }
    const field = found.type === 'batting' ? 'batting' : 'bowlers', parsed = [];
    card.tables[found.type] = true;
    for (const row of rows.slice(found.row + 1)) {
      const cells = $(row).children('td,th').toArray(); if (!cells.length) continue;
      const values = cells.map(c => clean($(c).text(), 500)), text = values.join(' ').trim(); if (!text) continue;
      if (/^total\b/i.test(text)) {
        const total = summary(text, values);
        for (const k of ['runs', 'wickets', 'overs']) if (total[k]) {
          if (card[k] && (k === 'overs' ? legalBalls(card[k]) !== legalBalls(total[k]) : Number(card[k]) !== Number(total[k]))) card.issues.push('Conflicting innings totals in the page.');
          card[k] = total[k];
        }
        continue;
      }
      if (/^extras?\b/i.test(text)) { card.extras = extras(text); if (!card.extras.total) card.extras.total = [...values].reverse().map(number).find(Boolean) || ''; continue; }
      if (/^fall of wickets\b/i.test(text)) { card.fallOfWickets.push(clean(text.replace(/^fall of wickets\s*:?\s*/i, ''), 1000)); continue; }
      if (/^(?:did not bat|yet to bat)\b/i.test(text)) { card.didNotBat.push(...text.replace(/^(?:did not bat|yet to bat)\s*:?\s*/i, '').split(',').map(n => clean(n, 120)).filter(Boolean)); continue; }
      if (header($, row).type) continue;
      if (cells.length < 3 || cells.every(c => Number($(c).attr('colspan') || 1) > 1)) { card.issues.push('An unrecognized short player-table row was not parsed.'); continue; }
      const p = rowPlayer($, cells, found.indexes);
      if (!p.name) continue;
      const player = field === 'batting' ? { id: p.id, name: p.name, status: p.status, runs: number(p.at('runs')), balls: number(p.at('balls')),
        fours: number(p.at('fours')), sixes: number(p.at('sixes')), strikeRate: rate(p.at('strikeRate')) } :
        { id: p.id, name: p.name, overs: overs(p.at('overs')), maidens: number(p.at('maidens')), runs: number(p.at('runs')), wickets: number(p.at('wickets')), economy: rate(p.at('economy')) };
      if (player.runs === '' || field === 'batting' && player.balls === '' || field === 'bowlers' && (player.overs === '' || player.wickets === '')) {
        card.issues.push('A player row contains missing or unsupported numeric fields.'); continue;
      }
      if (parsed.some(v => p.id && v.id === p.id || sameTeam(v.name, p.name))) { card.issues.push('Duplicate player rows in a table.'); continue; }
      parsed.push(player);
    }
    if (parsed.length > 15) fail('UNSUPPORTED_LAYOUT', 'An innings table exceeds 15 player rows.');
    // Responsive copies are permitted only when their normalized contents agree.
    if (card[field].length && JSON.stringify(card[field]) !== JSON.stringify(parsed)) card.issues.push('Conflicting duplicate player tables.');
    else if (parsed.length) card[field] = parsed;
  });
  $('.commentary-item,.commentary-row,[data-commentary-id]').slice(0, 500).each((_, e) => {
    const node = $(e), text = node.find('.commentary-text,.description,p').first().text();
    addComment(node.find('.over,.ball,[data-over]').first().text() || node.attr('data-over') || '', text, node.attr('data-commentary-id') || node.attr('id'));
  });
  if (!inningsCards.some(c => c.batting.length || c.bowlers.length)) fail('UNSUPPORTED_LAYOUT', 'No supported server-rendered innings tables were found. The page may require JavaScript or a parser update.');
  for (const card of inningsCards) {
    const opponent = inningsCards.filter(c => c !== card); if (opponent.length === 1) card.bowling = opponent[0].team;
    const battingOK = card.extras?.total !== '' && card.extras?.total != null && card.runs !== '' && card.batting.length > 0 &&
      card.batting.reduce((n, p) => n + Number(p.runs), 0) + Number(card.extras.total) === Number(card.runs);
    const bowlingOK = card.overs !== '' && card.bowlers.length > 0 && card.bowlers.reduce((n, p) => n + legalBalls(p.overs), 0) === legalBalls(card.overs);
    if (!battingOK) card.issues.push('Batting runs plus source extras do not reconcile with a supplied innings total.');
    if (!bowlingOK) card.issues.push('Bowler overs do not reconcile with supplied innings overs.');
    card.complete = card.tables.batting && card.tables.bowling && card.wickets !== '' && Number(card.wickets) <= 20 && battingOK && bowlingOK && card.issues.length === 0;
    card.didNotBat = [...new Set(card.didNotBat)].slice(0, 15); card.fallOfWickets = card.fallOfWickets.slice(0, 20); card.issues = [...new Set(card.issues)];
    delete card.tables;
  }
  return { schema: 'mk97.cricclubs.scorecard.v1', ...ref, inningsCards, commentary: commentary.slice(-120), metadata: metadata($),
    coverage: { innings: inningsCards.length, reconciledInnings: inningsCards.filter(c => c.complete).length, commentary: commentary.length > 0,
      commentaryRowsPresent: commentary.length, commentaryRowsReturned: Math.min(commentary.length, 120), commentaryTruncated: commentary.length > 120 },
    warnings: [...new Set([...warnings, ...(commentary.length > 120 ? ['Commentary is limited to the last 120 unique rows in this response.'] : []), 'Only scorecard and commentary records present in the returned HTML are included.'])] };
}

export function enrichCricClubsScore(score, document) {
  if (String(document.clubId) !== score.clubId || String(document.matchId) !== score.matchId) fail('WRONG_MATCH', 'Full scorecard and ticker identify different matches.');
  const messages = [], cards = [];
  for (const parsed of document.inningsCards) {
    if (parsed.issues.some(issue => /conflicting|duplicate/i.test(issue))) { messages.push('Conflicting HTML tables were excluded from the score overlay.'); continue; }
    const matches = (score.inningsCards || []).filter(c => sameTeam(c.team, parsed.team));
    if (matches.length !== 1) { messages.push('An HTML innings could not be matched unambiguously to the ticker teams.'); continue; }
    const current = matches[0];
    if (['runs', 'wickets', 'overs'].some(k => parsed[k] === '' || (k === 'overs' ? legalBalls(parsed[k]) !== legalBalls(current[k]) : Number(parsed[k]) !== Number(current[k])))) {
      messages.push('Full scorecard totals differ from the latest ticker; waiting for matching data.'); continue;
    }
    cards.push({ ...parsed, id: current.id, bowling: current.bowling, fetchedAt: document.fetchedAt });
  }
  const inningsCards = (score.inningsCards || []).map(c => cards.find(p => p.id === c.id) || c);
  const active = cards.find(c => c.id === score.innings), complete = cards.length > 0 && cards.length === inningsCards.length && cards.every(c => c.complete);
  return { ...score, source: cards.length ? 'CricClubs ticker + scorecard' : score.source, inningsCards,
    cards: active ? { batting: active.batting, bowling: active.bowlers, complete: active.complete } : score.cards,
    commentary: document.commentary.length ? document.commentary : score.commentary,
    stats: { ...score.stats, toss: document.metadata.toss || score.stats?.toss || '', playerOfMatch: document.metadata.playerOfMatch || score.stats?.playerOfMatch || '' },
    scorecard: { state: complete ? 'complete' : 'partial', fetchedAt: document.fetchedAt, message: messages[0] || (complete ? 'Innings tables reconcile with source totals.' : 'Some innings records remain incomplete or unverified.') } };
}
