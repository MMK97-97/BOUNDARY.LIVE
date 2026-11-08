// Browser-compatible CricClubs full scorecard HTML/JSON parser and score enricher.
import { clean, validateIds } from './score-data.mjs';

const key = v => clean(v, 200).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const sameTeam = (a, b) => key(a) && key(a) === key(b);
const number = v => /^\d{1,6}$/.test(String(v).trim()) ? String(v).trim() : '';
const rate = v => /^\d{1,6}(?:\.\d{1,3})?$/.test(String(v).trim()) ? String(v).trim() : '';
const overs = v => /^\d{1,4}(?:\.[0-5])?$/.test(String(v).trim()) ? String(v).trim() : '';
const legalBalls = v => { if (!overs(v)) return null; const [o, b = '0'] = v.split('.'); return Number(o) * 6 + Number(b); };
const HEADINGS = 'h1,h2,h3,h4,h5,h6,caption,.panel-heading,.panel-title,.box-title,.innings-header';

const aliases = {
  name: ['batting', 'batsman', 'batsmen', 'batter', 'batters', 'bowling', 'bowler', 'bowlers', 'player', 'name'],
  runs: ['r', 'runs'], balls: ['b', 'bf', 'balls', 'ballsfaced'], fours: ['4', '4s', 'fours'], sixes: ['6', '6s', 'sixes'],
  strikeRate: ['sr', 'strikerate'], status: ['dismissal', 'howout', 'out', 'status'],
  overs: ['o', 'ov', 'overs'], maidens: ['m', 'maidens'], wickets: ['w', 'wkts', 'wickets'], economy: ['econ', 'eco', 'er', 'economy'],
  over: ['over', 'ball', 'delivery'], text: ['commentary', 'comment', 'description']
};

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
  if (/\binnings\b/i.test(text)) {
    const before = text.split(/\s+(?:(?:1st|2nd|3rd|4th|first|second)\s+)?innings\b/i)[0].replace(/\s*[:\-–—]?\s*\(?\d+\s*\/\s*\d+.*$/, '').trim();
    const after = text.split(/\binnings\s*[:\-–—]?\s*/i)[1]?.replace(/\s*[:\-–—]?\s*\(?\d+\s*\/\s*\d+.*$/, '').trim() || '';
    const team = before && !/^(?:first|second|1st|2nd|3rd|4th|current|batting|bowling|match|super over)$/i.test(before) ? before : after;
    return team && !/^(?:first|second|1st|2nd|3rd|4th|current|batting|bowling|match|super over)$/i.test(team) ? { team: clean(team, 100), ...summary(text) } : null;
  }
  if (/\b\d{1,4}\s*\/\s*\d{1,2}\b/.test(text) && /\b(?:\d{1,4}(?:\.[0-5])?\s*(?:overs?|ovs?)|\(\s*\d{1,4}(?:\.[0-5])?\s*\))/i.test(text)) {
    const team = text.replace(/\s*[:\-–—]?\s*\(?\d{1,4}\s*\/\s*\d{1,2}\b.*$/, '').trim();
    return team && !/^(?:total|extras?|fall of wickets|first|second|1st|2nd|current|batting|bowling|match|super over)$/i.test(team) ? { team: clean(team, 100), ...summary(text) } : null;
  }
  return null;
}

function header(row) {
  const cells = [...row.children].filter(c => c.tagName === 'TH' || c.tagName === 'TD');
  const titles = cells.map(e => key(e.textContent)), indexes = {};
  for (const [field, names] of Object.entries(aliases)) indexes[field] = titles.findIndex(t => names.includes(t));
  const batting = indexes.runs >= 0 && indexes.balls >= 0 && (indexes.fours >= 0 || indexes.strikeRate >= 0);
  const bowling = indexes.overs >= 0 && indexes.runs >= 0 && indexes.wickets >= 0;
  const commentary = indexes.over >= 0 && indexes.text >= 0;
  if (indexes.name < 0 && titles[0] === '' && (batting || bowling)) indexes.name = 0;
  if (indexes.status < 0 && indexes.name === 0 && indexes.runs > 1 && titles[1] === '') indexes.status = 1;
  return { indexes, type: commentary ? 'commentary' : bowling && indexes.name >= 0 ? 'bowling' : batting && indexes.name >= 0 ? 'batting' : null };
}

function rowPlayer(cells, h) {
  const at = field => h[field] < 0 || !cells[h[field]] ? '' : clean(cells[h[field]].textContent, 300);
  const cell = cells[h.name];
  const link = [...cell.querySelectorAll('a[href]')].find(e => /viewPlayer\.do/.test(e.getAttribute('href') || ''));
  const detailNode = cell.querySelector('small,.dismissal,.out-string');
  const detail = detailNode ? detailNode.textContent : '';
  let rawName = '';
  if (link) rawName = link.textContent;
  else {
    const clone = cell.cloneNode(true);
    for (const n of clone.querySelectorAll('small,.dismissal,.out-string')) n.remove();
    rawName = clone.textContent;
  }
  const name = clean(rawName, 120).replace(/\s*(?:\((?:c|wk|c\s*&\s*wk)\)|[*†])+\s*$/i, '');
  let id = '';
  try { const url = new URL(link.getAttribute('href'), 'https://cricclubs.com'); id = number(url.searchParams.get('playerId')); } catch {}
  const status = at('status') || clean(detail || (link ? cell.textContent.replace(link.textContent, '') : ''), 200);
  return { at, id, name, status };
}

function extras(text) {
  const value = text.match(/^extras?\s*[:\-]?\s*(\d{1,6})\b/i)?.[1] || text.match(/\)\s*(\d{1,6})\s*$/)?.[1];
  const out = { total: value || '', text: clean(text, 300) };
  for (const [field, pattern] of Object.entries({ byes: /\b(?:b|byes?)\s*[:=]?\s*(\d+)\b/i, legByes: /\b(?:lb|leg byes?)\s*[:=]?\s*(\d+)\b/i,
    wides: /\b(?:w|wd|wides?)\s*[:=]?\s*(\d+)\b/i, noBalls: /\b(?:nb|no balls?)\s*[:=]?\s*(\d+)\b/i, penalty: /\b(?:p|penalty)\s*[:=]?\s*(\d+)\b/i })) out[field] = number(text.match(pattern)?.[1] || '');
  return out;
}

function context(doc, table, previous) {
  let node = table;
  for (let depth = 0; node && depth < 7; depth++, node = node.parentElement) {
    if (!node || node.tagName === 'BODY' || node.tagName === 'HTML') break;
    if (node.getAttribute('data-team')) return { team: clean(node.getAttribute('data-team'), 100), ...summary(node.getAttribute('data-score') || '') };
    let sib = node.previousElementSibling;
    while (sib) {
      if (sib.matches?.(HEADINGS)) { const h = teamHeading(sib.textContent); if (h) return h; }
      sib = sib.previousElementSibling;
    }
    for (const child of node.children) {
      if (child.matches?.(HEADINGS)) { const h = teamHeading(child.textContent); if (h) return h; }
    }
    const id = node.getAttribute('id');
    if (id) {
      const links = [...doc.querySelectorAll('a[href],[data-target],[data-bs-target]')].filter(e => [e.getAttribute('href'), e.getAttribute('data-target'), e.getAttribute('data-bs-target')].includes('#' + id));
      for (const l of links) { const h = teamHeading(l.textContent); if (h) return h; }
    }
  }
  return previous;
}

function metadata(doc) {
  const out = { series: '', ground: '', result: '', toss: '', playerOfMatch: '', date: '', umpires: '', scorer: '', matchType: '' };
  const labels = {
    series: ['series', 'tournament', 'league', 'division'],
    ground: ['ground', 'venue', 'location', 'stadium'],
    result: ['result', 'matchresult', 'status'],
    toss: ['toss', 'tosswonby'],
    playerOfMatch: ['playerofthematch', 'manofthematch', 'mom', 'mvp'],
    date: ['date', 'matchdate', 'playedon', 'datetime'],
    umpires: ['umpires', 'umpire', 'matchofficials', 'officials'],
    scorer: ['scorer', 'scorers'],
    matchType: ['matchtype', 'format', 'gameformat']
  };
  const set = (label, value) => { for (const [field, names] of Object.entries(labels)) if (names.includes(key(label)) && value) out[field] = clean(value, 200); };
  for (const r of [...doc.querySelectorAll('tr')].slice(0, 500)) {
    const cells = [...r.children].filter(c => c.tagName === 'TH' || c.tagName === 'TD');
    if (cells.length === 2) set(cells[0].textContent, cells[1].textContent);
  }
  for (const dt of [...doc.querySelectorAll('dt')].slice(0, 100)) {
    const dd = dt.nextElementSibling;
    if (dd?.tagName === 'DD') set(dt.textContent, dd.textContent);
  }
  for (const m of [...doc.querySelectorAll('.match-result,[data-match-result]')].slice(0, 2)) {
    if (!out.result) out.result = clean(m.textContent, 200);
  }
  return out;
}

export function parseBrowserScorecard(rawInput, ref) {
  const ids = validateIds(ref.clubId, ref.matchId);
  const text = String(rawInput ?? '').trim();
  if (!text) throw new Error('Paste or choose a CricClubs scorecard HTML or JSON file.');
  if (text.length > 2_000_000) throw new Error('Scorecard file exceeds the 2 MB limit.');
  if (text.startsWith('{')) {
    let parsed;
    try { parsed = JSON.parse(text); } catch { throw new Error('Invalid JSON scorecard file.'); }
    if (parsed?.schema === 'mk97.cricclubs.scorecard.v1') {
      if (String(parsed.clubId) !== ids.clubId || String(parsed.matchId) !== ids.matchId) throw new Error('The imported JSON scorecard is for a different Club ID or Match ID.');
      return { ...parsed, origin: 'imported-json', fetchedAt: Date.now() };
    }
    throw new Error('Unsupported JSON schema. Use a CricClubs HTML scorecard or mk97.cricclubs.scorecard.v1 JSON.');
  }
  if (/(?:cf-chl-|challenge-platform|id=["']challenge-form|<title[^>]*>\s*(?:just a moment|attention required)|verify you are human)/i.test(text)) {
    throw new Error('The provided HTML is a Cloudflare verification screen, not the match scorecard.');
  }
  const doc = new DOMParser().parseFromString(text, 'text/html');
  for (const name of ['clubId', 'matchId']) {
    for (const e of doc.querySelectorAll('input[name],body[data-match-id],body[data-club-id],main[data-match-id],main[data-club-id],[data-scorecard][data-match-id],[data-scorecard][data-club-id]')) {
      const value = e.getAttribute('name') === name ? e.getAttribute('value') : e.getAttribute(name === 'clubId' ? 'data-club-id' : 'data-match-id');
      if (value && String(value) !== ids[name]) throw new Error(`The scorecard HTML belongs to a different ${name} (${value}).`);
    }
  }
  for (const n of doc.querySelectorAll('script,style,template,noscript,iframe,object,input,textarea,select,button')) n.remove();
  const inningsCards = [], commentary = [];
  const addComment = (over, cText, id = '') => {
    cText = clean(cText, 2000); if (!cText) return;
    over = clean(over, 10);
    const rowId = clean(id || `c-${commentary.length}-${over}`, 80);
    if (!commentary.some(p => p.id === rowId || (p.over === over && p.text === cText))) commentary.push({ id: rowId, over, text: cText });
  };
  let heading = null;
  for (const e of doc.querySelectorAll(HEADINGS + ',table')) {
    if (e.tagName !== 'TABLE') { heading = teamHeading(e.textContent) || heading; continue; }
    const rows = [...e.querySelectorAll('tr')].filter(r => r.closest('table') === e);
    let found;
    for (let i = 0; i < Math.min(rows.length, 8); i++) { const h = header(rows[i]); if (h.type) { found = { ...h, row: i }; break; } }
    if (!found) continue;
    const ctx = context(doc, e, heading);
    if (found.type === 'commentary') {
      for (const row of rows.slice(found.row + 1)) {
        const c = [...row.children].filter(x => x.tagName === 'TD' || x.tagName === 'TH');
        addComment(c[found.indexes.over]?.textContent || '', c[found.indexes.text]?.textContent || '', row.getAttribute('id') || '');
      }
      continue;
    }
    if (!ctx?.team) continue;
    let card = inningsCards.find(c => sameTeam(c.team, ctx.team));
    if (!card) {
      if (inningsCards.length >= 4) break;
      card = { id: String(inningsCards.length + 1), team: ctx.team, bowling: '', runs: ctx.runs || '', wickets: ctx.wickets || '', overs: ctx.overs || '',
        batting: [], bowlers: [], extras: null, fallOfWickets: [], didNotBat: [], complete: false, issues: [], tables: { batting: false, bowling: false } };
      inningsCards.push(card);
    }
    const field = found.type === 'batting' ? 'batting' : 'bowlers', parsed = [];
    card.tables[found.type] = true;
    for (const row of rows.slice(found.row + 1)) {
      const cells = [...row.children].filter(x => x.tagName === 'TD' || x.tagName === 'TH'); if (!cells.length) continue;
      const values = cells.map(c => clean(c.textContent, 500)), rText = values.join(' ').trim(); if (!rText) continue;
      if (/^total\b/i.test(rText)) {
        const total = summary(rText, values);
        for (const k of ['runs', 'wickets', 'overs']) if (total[k]) card[k] = total[k];
        continue;
      }
      if (/^extras?\b/i.test(rText)) { card.extras = extras(rText); if (!card.extras.total) card.extras.total = [...values].reverse().map(number).find(Boolean) || ''; continue; }
      if (/^fall of wickets\b/i.test(rText)) { card.fallOfWickets.push(clean(rText.replace(/^fall of wickets\s*:?\s*/i, ''), 1000)); continue; }
      if (/^(?:did not bat|yet to bat)\b/i.test(rText)) { card.didNotBat.push(...rText.replace(/^(?:did not bat|yet to bat)\s*:?\s*/i, '').split(',').map(n => clean(n, 120)).filter(Boolean)); continue; }
      if (header(row).type) continue;
      if (cells.length < 3) continue;
      const p = rowPlayer(cells, found.indexes);
      if (!p.name) continue;
      const player = field === 'batting' ? { id: p.id, name: p.name, status: p.status, runs: number(p.at('runs')), balls: number(p.at('balls')),
        fours: number(p.at('fours')), sixes: number(p.at('sixes')), strikeRate: rate(p.at('strikeRate')) } :
        { id: p.id, name: p.name, overs: overs(p.at('overs')), maidens: number(p.at('maidens')), runs: number(p.at('runs')), wickets: number(p.at('wickets')), economy: rate(p.at('economy')) };
      if (player.runs === '' || field === 'batting' && player.balls === '' || field === 'bowlers' && (player.overs === '' || player.wickets === '')) continue;
      if (!parsed.some(v => p.id && v.id === p.id || sameTeam(v.name, p.name))) parsed.push(player);
    }
    if (parsed.length) card[field] = parsed.slice(0, 15);
  }
  for (const e of [...doc.querySelectorAll('.commentary-item,.commentary-row,[data-commentary-id]')].slice(0, 500)) {
    const desc = e.querySelector('.commentary-text,.description,p');
    const ov = e.querySelector('.over,.ball,[data-over]');
    addComment(ov?.textContent || e.getAttribute('data-over') || '', desc?.textContent || '', e.getAttribute('data-commentary-id') || e.getAttribute('id') || '');
  }
  if (!inningsCards.some(c => c.batting.length || c.bowlers.length)) throw new Error('No batting or bowling scorecard tables were found in the supplied HTML.');
  for (const card of inningsCards) {
    const opponent = inningsCards.filter(c => c !== card); if (opponent.length === 1) card.bowling = opponent[0].team;
    const battingOK = card.extras?.total !== '' && card.extras?.total != null && card.runs !== '' && card.batting.length > 0 &&
      card.batting.reduce((n, p) => n + Number(p.runs), 0) + Number(card.extras.total) === Number(card.runs);
    const bowlingOK = card.overs !== '' && card.bowlers.length > 0 && card.bowlers.reduce((n, p) => n + legalBalls(p.overs), 0) === legalBalls(card.overs);
    card.complete = Boolean(card.tables.batting && card.tables.bowling && card.wickets !== '' && Number(card.wickets) <= 20 && battingOK && bowlingOK);
    card.didNotBat = [...new Set(card.didNotBat)].slice(0, 15); card.fallOfWickets = card.fallOfWickets.slice(0, 20);
    delete card.tables;
  }
  return {
    schema: 'mk97.cricclubs.scorecard.v1',
    clubId: ids.clubId,
    matchId: ids.matchId,
    league: ref.league || 'FWCWL',
    inningsCards,
    commentary: commentary.slice(-120),
    metadata: metadata(doc),
    origin: 'imported-html',
    fetchedAt: Date.now()
  };
}

export function enrichBrowserScore(score, document) {
  if (!score || !document) return score;
  const cards = [];
  for (const parsed of document.inningsCards || []) {
    const matches = (score.inningsCards || []).filter(c => sameTeam(c.team, parsed.team));
    if (matches.length === 1) {
      const current = matches[0];
      cards.push({ ...parsed, id: current.id, bowling: current.bowling, runs: parsed.runs || current.runs, wickets: parsed.wickets || current.wickets, overs: parsed.overs || current.overs, runRate: current.runRate || '', fetchedAt: document.fetchedAt });
    } else {
      cards.push({ ...parsed, fetchedAt: document.fetchedAt });
    }
  }
  const inningsCards = (score.inningsCards || []).length
    ? score.inningsCards.map(c => cards.find(p => p.id === c.id || sameTeam(p.team, c.team)) || c)
    : cards;
  const active = inningsCards.find(c => c.id === score.innings) || inningsCards.at(-1);
  const complete = inningsCards.length > 0 && inningsCards.every(c => c.complete);
  return {
    ...score,
    source: 'CricClubs ticker + scorecard',
    series: score.series || document.metadata?.series || '',
    ground: score.ground || document.metadata?.ground || '',
    result: score.result || document.metadata?.result || '',
    inningsCards,
    cards: active ? { batting: active.batting || [], bowling: active.bowlers || [], complete: Boolean(active.complete) } : score.cards,
    commentary: document.commentary?.length ? document.commentary : score.commentary,
    stats: {
      ...score.stats,
      toss: document.metadata?.toss || score.stats?.toss || '',
      playerOfMatch: document.metadata?.playerOfMatch || score.stats?.playerOfMatch || '',
      date: document.metadata?.date || score.stats?.date || '',
      umpires: document.metadata?.umpires || score.stats?.umpires || '',
      scorer: document.metadata?.scorer || score.stats?.scorer || '',
      matchType: document.metadata?.matchType || score.stats?.matchType || ''
    },
    scorecard: {
      state: complete ? 'complete' : 'partial',
      fetchedAt: document.fetchedAt || Date.now(),
      message: complete ? 'Full scorecard loaded and reconciled.' : 'Full scorecard tables loaded.'
    }
  };
}
