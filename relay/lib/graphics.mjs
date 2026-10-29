import { Resvg } from '@resvg/resvg-js';
import { scoreLines } from './score.mjs';
export const xml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const text = (value, x, y, size = 32, color = '#fff', extra = '') => `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" ${extra}>${xml(value)}</text>`;
const short = (v, n = 28) => String(v || '').length > n ? String(v).slice(0, n - 1) + '…' : String(v || '');
export function graphicSvg(score, event = null, replay = false, showScore = true) {
  let g = '';
  if (showScore && score) {
    const [, detail] = scoreLines(score);
    const status = score.stale || Date.now() - score.fetchedAt > 30000 ? 'SCORE DELAYED' : score.status === 'complete' ? 'MATCH COMPLETE' : score.superOver ? 'SUPER OVER' : 'LIVE SCORE';
    g += '<rect x="55" y="818" width="350" height="42" rx="5" fill="#0a1018" fill-opacity="0.9"/>' + text(status, 78, 847, 25, '#cce5ff');
    g += '<path d="M55 860 H722 L806 964 H30 Z" fill="#0055bb"/><path d="M722 860 H1330 L1268 964 H806 Z" fill="#f5f6fa"/><path d="M1330 860 H1840 L1890 964 H1268 Z" fill="#111924" stroke="#ea8c24" stroke-width="3"/>';
    g += text(short(score.batting, 18), 100, 897, 30) + text(`${score.runs}/${score.wickets}`, 100, 948, 58, '#fff', 'font-weight="700"') + text(`(${score.overs})`, 342, 943, 30);
    g += text(`CRR  ${score.runRate || '—'}     RRR  ${score.requiredRate && score.requiredRate !== '--.--' ? score.requiredRate : '—'}`, 820, 904, 28, '#101827');
    g += text(short(score.result || score.detail || 'CricClubs', 34), 815, 943, 22, '#101827');
    g += text(short(score.bowling, 23), 1375, 925, 29, '#fff', 'font-weight="700"');
    g += '<rect x="30" y="964" width="1860" height="90" fill="#0a1018" fill-opacity="0.94"/>';
    const a = score.batters?.[0], b = score.batters?.[1], bowler = score.bowler;
    g += text(a ? `${short(a.name, 23)}  ${a.runs} (${a.balls})` : short(detail, 50), 65, 1019, 28);
    if (b) g += text(`${short(b.name, 23)}  ${b.runs} (${b.balls})`, 640, 1019, 28);
    if (bowler) g += text(`${short(bowler.name, 20)}  ${bowler.wickets}-${bowler.runs} (${bowler.overs})`, 1200, 1019, 28);
  }
  if (replay) g += '<rect x="70" y="55" width="260" height="62" rx="12" fill="#ec3346"/>' + text('↺  REPLAY', 95, 98, 32, '#fff', 'font-weight="700"');
  if (event && ['team', 'player'].includes(event.type)) {
    g += '<rect x="480" y="210" width="960" height="560" rx="30" fill="#07192e" stroke="#edb84c" stroke-width="5"/>';
    for (let i = 0; i < 18; i++) { const x = 540 + (i * 131) % 850, y = 240 + (i * 71) % 450; g += `<circle cx="${x}" cy="${y}" r="${3 + i % 5}" fill="${i % 2 ? '#167df0' : '#f5bf50'}" opacity="0.4"/>`; }
    g += text(event.type === 'team' ? 'TEAM MILESTONE' : 'PLAYER MILESTONE', 960, 300, 36, '#f6c35c', 'text-anchor="middle" letter-spacing="6"');
    g += text(event.milestone, 960, 515, 190, '#fff', 'text-anchor="middle" font-weight="700"');
    g += text('RUNS', 960, 580, 36, '#b6d3ef', 'text-anchor="middle" letter-spacing="8"');
    g += text(short(event.title, 35), 960, 681, 43, '#fff', 'text-anchor="middle" font-weight="700"');
  } else if (event && ['batting', 'bowling'].includes(event.type)) {
    const batting = event.type === 'batting', rows = event.cards?.[batting ? 'batting' : 'bowling'] || [];
    g += '<rect x="270" y="125" width="1380" height="680" rx="24" fill="#07192e" stroke="#246fe1" stroke-width="3"/><path d="M270 149 Q270 125 294 125 H1626 Q1650 125 1650 149 V235 H270 Z" fill="#085cc2"/>';
    g += text(`${batting ? 'BATTING' : 'BOWLING'} SCORECARD`, 320, 187, 40, '#fff', 'font-weight="700"');
    g += text(`OVER ${event.over ?? '—'}`, 1585, 185, 29, '#bedaff', 'text-anchor="end"');
    g += text(event.cards?.[batting ? 'battingTeam' : 'bowlingTeam'] || '', 320, 275, 28, '#b4d8fc');
    const cols = batting ? [['R', 1160], ['B', 1270], ['4s', 1380], ['6s', 1490]] : [['O', 1160], ['M', 1270], ['R', 1380], ['W', 1490]];
    for (const [label, x] of cols) g += text(label, x, 275, 27, '#b4d8fc', 'text-anchor="middle"');
    rows.slice(0, 11).forEach((p, i) => {
      const y = 322 + i * 37;
      if (i % 2 === 0) g += `<rect x="304" y="${y - 27}" width="1312" height="36" fill="#102a46"/>`;
      g += text(short(p.name, 40), 325, y, 27);
      const values = batting ? [p.runs, p.balls, p.fours, p.sixes] : [p.overs, p.maidens, p.runs, p.wickets];
      values.forEach((v, j) => { g += text(v === '' || v == null ? '—' : v, cols[j][1], y, 27, '#fff', 'text-anchor="middle"'); });
    });
    if (!rows.length) g += text('Waiting for available player statistics', 960, 435, 37, '#a3bad2', 'text-anchor="middle"');
    g += text(event.cards?.complete ? 'CricClubs score data' : 'Available players observed since feed connection · full card not supplied by this feed', 320, 770, 21, '#a3bad2');
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><g font-family="Arial,sans-serif">${g}</g></svg>`;
}
export class GraphicRenderer {
  constructor(font) { this.font = font; this.cache = new Map(); }
  frame(score, event, replay, showScore) {
    const compact = score ? { ...score, fetchedAt: 0, error: null } : null;
    const drawing = event ? { type: event.type, title: event.title, milestone: event.milestone, over: event.over, cards: event.cards } : null;
    const key = JSON.stringify([compact, drawing, replay, showScore]);
    if (this.cache.has(key)) return this.cache.get(key);
    const png = new Resvg(graphicSvg(score, event, replay, showScore), { font: { fontFiles: [this.font], loadSystemFonts: false, defaultFontFamily: this.font.includes('DejaVu') ? 'DejaVu Sans' : 'Arial' } }).render().asPng();
    if (this.cache.size >= 16) this.cache.delete(this.cache.keys().next().value);
    this.cache.set(key, png); return png;
  }
}
