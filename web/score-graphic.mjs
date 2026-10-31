// One drawing for the monitor and encoded program. All source strings are escaped.
export const xml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const text = (value, x, y, size = 32, color = '#fff', extra = '') => `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" ${extra}>${xml(value)}</text>`;
const short = (v, n = 28) => String(v || '').length > n ? String(v).slice(0, n - 1) + '…' : String(v || '');
function portraitScore(score, status, width, height) {
  const scale = width / 1080, a = score.batters?.[0], b = score.batters?.[1], bowler = score.bowler;
  let g = `<g transform="translate(0 ${height - 286 * scale}) scale(${scale})"><rect x="12" y="0" width="1056" height="286" fill="#081522" fill-opacity="0.95"/>`;
  g += text(status, 32, 25, 20, '#bad6f4');
  g += '<path d="M12 34 H430 L470 142 H12 Z" fill="#0055bb"/><path d="M430 34 H760 L720 142 H470 Z" fill="#f5f6fa"/><path d="M760 34 H1068 V142 H720 Z" fill="#111924" stroke="#ea8c24" stroke-width="2"/>';
  g += text(short(score.batting, 12), 36, 70, 27) + text(`${score.runs}/${score.wickets}`, 36, 124, 55, '#fff', 'font-weight="700"') + text(`(${score.overs})`, 257, 122, 26);
  g += text(`CRR ${score.runRate || '—'}`, 475, 73, 23, '#101827') + text(`RRR ${score.requiredRate && score.requiredRate !== '--.--' ? score.requiredRate : '—'}`, 475, 111, 23, '#101827');
  g += text(short(score.bowling, 12), 780, 98, 25, '#fff', 'font-weight="700"');
  for (const [player, x, end] of [[a, 32, 512], [b, 555, 1040]]) {
    g += text(player ? short(player.name, 18) : '—', x, 180, 24, '#d7e7fa');
    g += text(player ? `${player.runs} (${player.balls})` : '—', end, 211, 27, '#fff', 'font-weight="700" text-anchor="end"');
  }
  g += text(bowler ? `${short(bowler.name, 23)}   ${bowler.wickets}-${bowler.runs} (${bowler.overs})` : 'Bowler —', 32, 238, 23, '#d7e7fa');
  g += text('THIS OVER', 32, 271, 20, '#a8bdd7');
  (score.balls || []).slice(-12).forEach((value, i) => {
    const ball = String(value), x = 205 + i * 50, color = ball === '4' ? '#009f84' : ball === '6' ? '#6c49cd' : /^w$/i.test(ball) ? '#cf2449' : '#34465a';
    g += `<circle cx="${x}" cy="264" r="18" fill="${color}"/>` + text(short(ball === '.' ? '0' : ball, 3), x, 271, 20, '#fff', 'text-anchor="middle"');
  });
  return g + '</g>';
}
export function graphicSvg(score, event = null, showScore = true, brandLogo = '', { width = 1920, height = 1080 } = {}) {
  const scale = width / 1920;
  let g = brandLogo ? `<image href="${xml(brandLogo)}" x="${width - 196 * scale}" y="${30 * scale}" width="${150 * scale}" height="${76 * scale}" preserveAspectRatio="xMidYMid slice" opacity="0.94"/>` : '';
  if (showScore && score) {
    const status = score.stale || Date.now() - score.fetchedAt > 30000 ? 'SCORE DELAYED' : score.status === 'complete' ? 'MATCH COMPLETE' : score.superOver ? 'SUPER OVER' : 'LIVE SCORE';
    if (height > width) g += portraitScore(score, status, width, height);
    else {
    g += `<g transform="translate(0 ${height - 1080 * scale}) scale(${scale})"><g transform="translate(0 26)"><rect x="55" y="818" width="350" height="42" rx="5" fill="#0a1018" fill-opacity="0.9"/>` + text(status, 78, 847, 25, '#cce5ff');
    g += '<path d="M55 860 H722 L806 964 H30 Z" fill="#0055bb"/><path d="M722 860 H1330 L1268 964 H806 Z" fill="#f5f6fa"/><path d="M1330 860 H1840 L1890 964 H1268 Z" fill="#111924" stroke="#ea8c24" stroke-width="3"/>';
    g += text(short(score.batting, 18), 100, 897, 30) + text(`${score.runs}/${score.wickets}`, 100, 948, 58, '#fff', 'font-weight="700"') + text(`(${score.overs})`, 342, 943, 30);
    g += text(`CRR  ${score.runRate || '—'}     RRR  ${score.requiredRate && score.requiredRate !== '--.--' ? score.requiredRate : '—'}`, 820, 904, 28, '#101827');
    g += text(short(score.result || score.detail || 'CricClubs', 24), 815, 943, 22, '#101827');
    g += text(short(score.bowling, 16), 1375, 925, 29, '#fff', 'font-weight="700"');
    g += '<rect x="30" y="964" width="1860" height="90" fill="#0a1018" fill-opacity="0.94"/>';
    const a = score.batters?.[0], b = score.batters?.[1], bowler = score.bowler;
    for (const [player, x] of [[a, 65], [b, 520]]) {
      g += text(player ? short(player.name, 17) : '—', x, 999, 24, '#d7e7fa');
      g += text(player ? `${player.runs} (${player.balls})` : '—', x, 1036, 29, '#fff', 'font-weight="700"');
    }
    g += text(bowler ? short(bowler.name, 17) : 'BOWLER', 975, 999, 24, '#d7e7fa');
    g += text(bowler ? `${bowler.wickets}-${bowler.runs} (${bowler.overs})` : '—', 975, 1036, 29);
    g += text('THIS OVER', 1450, 990, 19, '#a8bdd7');
    (score.balls || []).slice(-12).forEach((value, i) => {
      const ball = String(value), x = 1465 + i * 34;
      const color = ball === '4' ? '#009f84' : ball === '6' ? '#6c49cd' : /^w$/i.test(ball) ? '#cf2449' : '#34465a';
      g += `<circle cx="${x}" cy="1023" r="15" fill="${color}"/>` + text(short(ball === '.' ? '0' : ball, 3), x, 1030, 17, '#fff', 'text-anchor="middle"');
    });
    g += '</g></g>';
    }
  }

  if (event) g += `<g transform="translate(0 ${(height - 1080 * scale) / 2}) scale(${scale})">`;
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
  if (event) g += '</g>';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><g font-family="Arial,sans-serif">${g}</g></svg>`;
}
