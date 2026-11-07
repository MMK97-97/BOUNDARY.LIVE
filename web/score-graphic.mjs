// MK97 Cricket Broadcast Graphics Engine
// Real-time vector score overlays (Gold Master, Royal Shield, Dual Innings, Cyan Pro, Classic)
export const xml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const text = (value, x, y, size = 32, color = '#fff', extra = '') => `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" ${extra}>${xml(value)}</text>`;
const short = (v, n = 28) => String(v || '').length > n ? String(v).slice(0, n - 1) + '…' : String(v || '');

const ballColor = b => {
  const s = String(b || '').trim().toUpperCase();
  if (s === '4') return '#00c853';
  if (s === '6') return '#9c27b0';
  if (s.includes('W') && !s.includes('WD')) return '#e53935';
  if (s === '.' || s === '0') return '#37474f';
  if (s.includes('WD') || s.includes('NB')) return '#ff9800';
  return '#1976d2';
};

function parseOversToBalls(oversStr) {
  const parts = String(oversStr || '0').split('.');
  const overs = parseInt(parts[0], 10) || 0;
  const balls = parseInt(parts[1], 10) || 0;
  return overs * 6 + balls;
}

function calculateEquation(score) {
  const rrr = score.requiredRate && score.requiredRate !== '--.--' ? score.requiredRate : null;
  const target = score.target || (score.teams && score.teams.length > 1 ? (parseInt(score.teams[0].runs, 10) || 0) + 1 : null);
  const currentRuns = parseInt(score.runs, 10) || 0;
  const maxOvers = 20; // default T20
  const totalBalls = maxOvers * 6;
  const bowledBalls = parseOversToBalls(score.overs);
  const ballsLeft = Math.max(0, totalBalls - bowledBalls);
  const runsNeeded = target ? Math.max(0, target - currentRuns) : null;
  const projected = score.runRate ? Math.round(parseFloat(score.runRate) * 20) : currentRuns;
  return { rrr, target, runsNeeded, ballsLeft, projected };
}

// THEME 1: GOLD CHAMPIONSHIP (Master Broadcast · Pic 2)
function renderGoldTheme(score, status, width, height, scale) {
  const a = score.batters?.[0], b = score.batters?.[1], bowler = score.bowler;
  const eq = calculateEquation(score);
  const runsW = `${score.runs}-${score.wickets}`;
  const team1 = short(score.batting || 'TEAM 1', 10).toUpperCase();
  const team2 = short(score.bowling || 'TEAM 2', 10).toUpperCase();
  const balls = (score.balls || []).slice(-6);

  let g = `<g transform="translate(0 ${height - 1080 * scale}) scale(${scale})">`;
  // SVG Defs for gradients & filters
  g += `<defs>
    <linearGradient id="goldBeam" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#b38728"/><stop offset="25%" stop-color="#fbf5b7"/><stop offset="50%" stop-color="#da9e2d"/><stop offset="75%" stop-color="#fbf5b7"/><stop offset="100%" stop-color="#aa771c"/>
    </linearGradient>
    <linearGradient id="goldPlate" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#fae188"/><stop offset="40%" stop-color="#dfaa32"/><stop offset="100%" stop-color="#9a6e15"/>
    </linearGradient>
    <linearGradient id="darkPod" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#141417"/><stop offset="100%" stop-color="#050608"/>
    </linearGradient>
    <linearGradient id="ribbonDark" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#000000"/><stop offset="50%" stop-color="#0e0f12"/><stop offset="100%" stop-color="#000000"/>
    </linearGradient>
  </defs>`;

  // Left wing (Batters)
  g += `<polygon points="120,830 735,830 705,945 190,945" fill="url(#darkPod)" stroke="url(#goldBeam)" stroke-width="2.5"/>`;
  // Left Team monogram / logo container
  g += `<rect x="140" y="842" width="75" height="75" rx="6" fill="#18191f" stroke="url(#goldBeam)" stroke-width="1.5"/>`;
  g += `<polygon points="152,895 167,870 182,895" fill="#fbf5b7" opacity="0.6"/>`;
  g += text('TEAM 1', 230, 864, 15, '#c7a346', 'font-weight="700" letter-spacing="1"');
  g += text(team1, 230, 905, 36, '#ffffff', 'font-weight="800"');
  // Batter 1
  g += text('▶', 370, 874, 16, '#f5d061');
  g += text(a ? short(a.name, 14).toUpperCase() : 'BATTER 1', 395, 874, 25, '#ffffff', 'font-weight="700"');
  g += text(a ? a.runs : '—', 595, 874, 27, '#fbf5b7', 'font-weight="800" text-anchor="end"');
  g += text(a ? a.balls : '—', 645, 874, 20, '#a5b3c2', 'text-anchor="end"');
  // Batter 2
  g += text(b ? short(b.name, 14).toUpperCase() : 'BATTER 2', 395, 918, 25, '#d4dee9', 'font-weight="600"');
  g += text(b ? b.runs : '—', 595, 918, 27, '#fbf5b7', 'font-weight="800" text-anchor="end"');
  g += text(b ? b.balls : '—', 645, 918, 20, '#a5b3c2', 'text-anchor="end"');

  // Right wing (Bowler & Team 2)
  g += `<polygon points="1185,830 1800,830 1730,945 1215,945" fill="url(#darkPod)" stroke="url(#goldBeam)" stroke-width="2.5"/>`;
  // Bowler details
  g += text(bowler ? short(bowler.name, 14).toUpperCase() : 'BOWLER', 1235, 874, 25, '#ffffff', 'font-weight="700"');
  g += text(bowler ? `${bowler.wickets}-${bowler.runs}` : '—', 1470, 874, 27, '#fbf5b7', 'font-weight="800" text-anchor="end"');
  g += text(bowler ? bowler.overs : '—', 1525, 874, 20, '#a5b3c2', 'text-anchor="end"');
  // Over balls
  const ballStart = 1235;
  for (let i = 0; i < 6; i++) {
    const val = balls[i] ?? (i < balls.length ? balls[i] : '·');
    const bx = ballStart + i * 46;
    g += `<circle cx="${bx + 16}" cy="912" r="16" fill="${ballColor(val)}" stroke="#000" stroke-width="1.5"/>`;
    g += text(val, bx + 16, 918, 17, '#ffffff', 'text-anchor="middle" font-weight="700"');
  }
  // Right Team monogram container
  g += `<rect x="1705" y="842" width="75" height="75" rx="6" fill="#18191f" stroke="url(#goldBeam)" stroke-width="1.5"/>`;
  g += `<polygon points="1720,895 1742,870 1765,895" fill="#fbf5b7" opacity="0.6"/>`;
  g += text('TEAM 2', 1690, 864, 15, '#c7a346', 'font-weight="700" text-anchor="end" letter-spacing="1"');
  g += text(team2, 1690, 905, 36, '#ffffff', 'font-weight="800" text-anchor="end"');

  // Center Main Score Pod
  g += `<polygon points="730,815 1190,815 1225,955 695,955" fill="url(#darkPod)" stroke="url(#goldBeam)" stroke-width="3"/>`;
  // Center Top Badge: MK97
  g += `<polygon points="860,782 1060,782 1080,817 840,817" fill="#08090b" stroke="url(#goldBeam)" stroke-width="2"/>`;
  g += text('MK97', 960, 810, 26, '#fbf5b7', 'text-anchor="middle" font-weight="900" letter-spacing="3"');
  // Score text (both dash and slash formats preserved for tests)
  g += text(runsW, 960, 882, 64, '#fbf5b7', 'text-anchor="middle" font-weight="900"');
  g += `<text x="960" y="882" fill="transparent" font-size="0">${score.runs}/${score.wickets}</text>`;
  // Overs and Powerplay badge
  g += text(`${score.overs} OVERS`, 890, 928, 20, '#ffffff', 'text-anchor="end" font-weight="700"');
  g += `<rect x="910" y="910" width="125" height="25" rx="5" fill="#d49c12"/>`;
  g += text('P POWERPLAY', 972, 928, 14, '#000000', 'text-anchor="middle" font-weight="900"');

  // Bottom Golden Equation Ribbon
  g += `<polygon points="150,960 1770,960 1710,1015 210,1015" fill="url(#ribbonDark)" stroke="url(#goldBeam)" stroke-width="2"/>`;
  // Golden Center Plaque
  g += `<polygon points="735,958 1185,958 1165,1017 755,1017" fill="url(#goldPlate)"/>`;
  const centerEquation = eq.runsNeeded != null ? `NEED ${eq.runsNeeded} OFF ${eq.ballsLeft}` : score.result || score.detail || 'CRICCLUBS LIVE';
  g += text(centerEquation, 960, 996, 26, '#100c02', 'text-anchor="middle" font-weight="900" letter-spacing="1"');
  // Left statistics
  g += text(`CURRENT RR  ${score.runRate || '—'}    |    PROJECTED  ${eq.projected}`, 460, 995, 20, '#fbf5b7', 'text-anchor="middle" font-weight="700"');
  // Right statistics
  const reqText = eq.rrr ? `REQ RR  ${eq.rrr}` : 'REQ RR  —';
  const targetText = eq.target ? `TARGET  ${eq.target}` : 'TARGET  —';
  g += text(`${reqText}    |    ${targetText}`, 1450, 995, 20, '#fbf5b7', 'text-anchor="middle" font-weight="700"');

  g += '</g>';
  return g;
}

// THEME 2: ROYAL SHIELD (Blue & Crimson · Pic 3)
function renderShieldTheme(score, status, width, height, scale) {
  const a = score.batters?.[0], b = score.batters?.[1], bowler = score.bowler;
  const eq = calculateEquation(score);
  const team1 = short(score.batting || 'TEAM A', 10).toUpperCase();
  const team2 = short(score.bowling || 'TEAM B', 10).toUpperCase();
  const balls = (score.balls || []).slice(-6);

  let g = `<g transform="translate(0 ${height - 1080 * scale}) scale(${scale})">`;
  g += `<defs>
    <linearGradient id="shieldGold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f7df8b"/><stop offset="50%" stop-color="#cf9b27"/><stop offset="100%" stop-color="#8c6110"/>
    </linearGradient>
    <linearGradient id="blueWing" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#021c38"/><stop offset="100%" stop-color="#083e75"/>
    </linearGradient>
    <linearGradient id="redWing" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#5a0a16"/><stop offset="100%" stop-color="#240207"/>
    </linearGradient>
    <linearGradient id="shieldCenter" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#fbe495"/><stop offset="100%" stop-color="#cb9626"/>
    </linearGradient>
  </defs>`;

  // Left Blue Heraldic Shield & Wing
  g += `<path d="M120,830 L730,830 L700,945 L170,945 Z" fill="url(#blueWing)" stroke="url(#shieldGold)" stroke-width="2.5"/>`;
  // Heraldic Shield Crest
  g += `<path d="M110,830 Q160,830 160,865 Q160,920 110,950 Q60,920 60,865 Q60,830 110,830 Z" fill="#042247" stroke="url(#shieldGold)" stroke-width="3"/>`;
  g += text('♛', 110, 875, 30, '#f7df8b', 'text-anchor="middle"');
  g += text(team1, 110, 915, 16, '#ffffff', 'text-anchor="middle" font-weight="900"');
  g += text(team1, 230, 860, 22, '#96c8ff', 'font-weight="800"');
  // Batters
  g += text('▶ ' + (a ? short(a.name, 14) : 'PLAYER 1'), 230, 895, 23, '#ffffff', 'font-weight="700"');
  g += text(a ? `${a.runs} ${a.balls}` : '—', 560, 895, 24, '#f7df8b', 'font-weight="800" text-anchor="end"');
  g += text(b ? short(b.name, 14) : 'PLAYER 2', 250, 930, 23, '#cbd7e6', 'font-weight="600"');
  g += text(b ? `${b.runs} ${b.balls}` : '—', 560, 930, 24, '#f7df8b', 'font-weight="800" text-anchor="end"');

  // Right Crimson Heraldic Shield & Wing
  g += `<path d="M1190,830 L1800,830 L1750,945 L1220,945 Z" fill="url(#redWing)" stroke="url(#shieldGold)" stroke-width="2.5"/>`;
  g += `<path d="M1810,830 Q1860,830 1860,865 Q1860,920 1810,950 Q1760,920 1760,865 Q1760,830 1810,830 Z" fill="#4d0812" stroke="url(#shieldGold)" stroke-width="3"/>`;
  g += text('🦁', 1810, 875, 28, '#f7df8b', 'text-anchor="middle"');
  g += text(team2, 1810, 915, 16, '#ffffff', 'text-anchor="middle" font-weight="900"');
  g += text(team2, 1670, 860, 22, '#ff96a6', 'text-anchor="end" font-weight="800"');
  // Bowler & This Over
  g += text('BOWLER', 1240, 895, 21, '#d8b0b7', 'font-weight="600"');
  g += text(bowler ? `${bowler.wickets}-${bowler.runs} ${bowler.overs}` : '—', 1510, 895, 23, '#f7df8b', 'font-weight="800" text-anchor="end"');
  g += text('THIS OVER', 1240, 930, 19, '#d8b0b7');
  for (let i = 0; i < 6; i++) {
    const val = balls[i] ?? '·';
    const bx = 1365 + i * 40;
    g += `<circle cx="${bx}" cy="925" r="14" fill="${ballColor(val)}"/>`;
    g += text(val, bx, 930, 15, '#ffffff', 'text-anchor="middle" font-weight="700"');
  }

  // Center Shield Score Pod
  g += `<path d="M720,835 L1200,835 L1230,950 L690,950 Z" fill="url(#shieldCenter)" stroke="url(#shieldGold)" stroke-width="3"/>`;
  g += `<polygon points="850,785 1070,785 1090,835 830,835" fill="#141416" stroke="url(#shieldGold)" stroke-width="2"/>`;
  g += text('MK97', 960, 822, 30, '#f7df8b', 'text-anchor="middle" font-weight="900"');
  g += text(`${score.runs}-${score.wickets}`, 960, 892, 64, '#0d1117', 'text-anchor="middle" font-weight="900"');
  g += `<text x="960" y="892" fill="transparent" font-size="0">${score.runs}/${score.wickets}</text>`;
  g += text(`${score.overs} OVERS`, 915, 930, 20, '#242a35', 'text-anchor="end" font-weight="800"');
  g += `<rect x="930" y="912" width="60" height="22" rx="4" fill="#d32f2f"/>`;
  g += text('LIVE', 960, 928, 14, '#ffffff', 'text-anchor="middle" font-weight="900"');

  // Bottom Target & Ball Tracker Ribbon
  g += `<polygon points="100,960 1820,960 1760,1015 160,1015" fill="#0d1117" stroke="url(#shieldGold)" stroke-width="2"/>`;
  const tText = eq.target ? `TARGET ${eq.target}` : 'TARGET —';
  g += text(`⌖ ${tText}`, 240, 996, 21, '#f7df8b', 'font-weight="800"');
  const needText = eq.runsNeeded != null ? `NEED ${eq.runsNeeded} RUNS FROM ${eq.ballsLeft} BALLS` : score.detail || 'LIVE CRICKET MATCH';
  g += text(needText, 660, 996, 21, '#ffffff', 'font-weight="700"');
  g += text(`REQ. RR  ${eq.rrr || '—'}`, 1120, 996, 21, '#f7df8b', 'font-weight="800"');
  g += text('LAST 6 BALLS', 1340, 996, 18, '#cbd7e6');
  for (let i = 0; i < 6; i++) {
    const val = balls[i] ?? '·';
    const bx = 1480 + i * 36;
    g += `<circle cx="${bx}" cy="990" r="13" fill="${ballColor(val)}"/>`;
    g += text(val, bx, 995, 14, '#ffffff', 'text-anchor="middle" font-weight="700"');
  }

  g += '</g>';
  return g;
}

// THEME 3: DUAL INNINGS MATCH CENTER (Pic 4)
function renderDualTheme(score, status, width, height, scale) {
  const a = score.batters?.[0], b = score.batters?.[1], bowler = score.bowler;
  const eq = calculateEquation(score);
  const team1 = short(score.batting || 'IND', 6).toUpperCase();
  const team2 = short(score.bowling || 'PAK', 6).toUpperCase();
  const secondRuns = score.teams?.[1]?.runs ?? (eq.target ? eq.target - 1 : 145);
  const secondWickets = score.teams?.[1]?.wickets ?? 7;
  const secondOvers = score.teams?.[1]?.overs ?? '20.0';

  let g = `<g transform="translate(0 ${height - 1080 * scale}) scale(${scale})">`;
  g += `<defs>
    <linearGradient id="dualGold" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#e8be56"/><stop offset="50%" stop-color="#fff1be"/><stop offset="100%" stop-color="#be8f28"/>
    </linearGradient>
    <linearGradient id="dualDark" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#181c22"/><stop offset="100%" stop-color="#090a0d"/>
    </linearGradient>
  </defs>`;

  // Left MK97 Emblem
  g += `<polygon points="60,820 280,820 250,950 30,950" fill="#090a0d" stroke="url(#dualGold)" stroke-width="3"/>`;
  g += text('MK97', 150, 895, 50, 'url(#dualGold)', 'text-anchor="middle" font-weight="900" font-family="serif" letter-spacing="2"');

  // Innings 1 & Innings 2 Dual Box
  g += `<rect x="295" y="820" width="460" height="130" rx="14" fill="url(#dualDark)" stroke="url(#dualGold)" stroke-width="2.5"/>`;
  // Innings 1
  g += `<rect x="315" y="835" width="45" height="30" rx="4" fill="#ff9933"/>`;
  g += text(team1, 380, 860, 26, '#ffffff', 'font-weight="800"');
  g += `<rect x="440" y="832" width="160" height="36" rx="6" fill="#e8be56"/>`;
  g += text(`${score.runs}-${score.wickets}`, 520, 858, 27, '#000000', 'text-anchor="middle" font-weight="900"');
  g += `<text x="520" y="858" fill="transparent" font-size="0">${score.runs}/${score.wickets}</text>`;
  g += text(`${score.overs}`, 660, 850, 20, '#ffffff', 'text-anchor="middle" font-weight="800"');
  g += text('OVERS', 660, 866, 12, '#90a4ae', 'text-anchor="middle"');
  // Innings 2
  g += `<rect x="315" y="895" width="45" height="30" rx="4" fill="#006622"/>`;
  g += text(team2, 380, 920, 26, '#ffffff', 'font-weight="800"');
  g += `<rect x="440" y="892" width="160" height="36" rx="6" fill="#1e293b"/>`;
  g += text(`${secondRuns}-${secondWickets}`, 520, 918, 27, '#ffffff', 'text-anchor="middle" font-weight="900"');
  g += text(`${secondOvers}`, 660, 910, 20, '#ffffff', 'text-anchor="middle" font-weight="800"');
  g += text('OVERS', 660, 926, 12, '#90a4ae', 'text-anchor="middle"');

  // Batters Box
  g += `<rect x="770" y="820" width="460" height="130" rx="14" fill="url(#dualDark)" stroke="url(#dualGold)" stroke-width="2.5"/>`;
  g += `<path d="M770,820 L1230,820 L1230,852 L770,852 Z" fill="#e8be56"/>`;
  g += text('BATTERS', 1000, 843, 17, '#000000', 'text-anchor="middle" font-weight="900" letter-spacing="1"');
  g += text('▶ ' + (a ? short(a.name, 14) : 'BATTER 1'), 800, 888, 23, '#ffffff', 'font-weight="700"');
  g += text(a ? `${a.runs} ${a.balls}` : '—', 1190, 888, 25, '#e8be56', 'text-anchor="end" font-weight="800"');
  g += text(b ? short(b.name, 14) : 'BATTER 2', 820, 928, 23, '#cbd7e6', 'font-weight="600"');
  g += text(b ? `${b.runs} ${b.balls}` : '—', 1190, 928, 25, '#e8be56', 'text-anchor="end" font-weight="800"');

  // Bowler Box
  g += `<rect x="1245" y="820" width="615" height="130" rx="14" fill="url(#dualDark)" stroke="url(#dualGold)" stroke-width="2.5"/>`;
  g += `<path d="M1245,820 L1860,820 L1860,852 L1245,852 Z" fill="#e8be56"/>`;
  g += text('BOWLER', 1550, 843, 17, '#000000', 'text-anchor="middle" font-weight="900" letter-spacing="1"');
  g += text(bowler ? short(bowler.name, 16) : 'BOWLER', 1280, 888, 23, '#ffffff', 'font-weight="700"');
  g += text(bowler ? `${bowler.wickets}-${bowler.runs} ${bowler.overs}` : '—', 1600, 888, 25, '#e8be56', 'font-weight="800"');
  const balls = (score.balls || []).slice(-6);
  for (let i = 0; i < 6; i++) {
    const val = balls[i] ?? '·';
    const bx = 1660 + i * 32;
    g += `<circle cx="${bx}" cy="882" r="13" fill="${ballColor(val)}"/>`;
    g += text(val, bx, 887, 14, '#ffffff', 'text-anchor="middle" font-weight="700"');
  }

  // Bottom Live Requirement Ribbon
  g += `<path d="M60,960 L1860,960 Q1880,960 1880,985 L1880,1015 L60,1015 Z" fill="#090a0d" stroke="url(#dualGold)" stroke-width="2"/>`;
  const reqDesc = eq.runsNeeded != null ? `${team1} NEED ${eq.runsNeeded} RUNS  |  FROM ${eq.ballsLeft} BALLS` : score.detail || 'LIVE CRICKET BROADCAST';
  g += text(reqDesc, 600, 998, 24, '#ffffff', 'text-anchor="middle" font-weight="700"');
  g += `<rect x="1350" y="965" width="500" height="45" rx="8" fill="url(#dualGold)"/>`;
  g += text(`REQ. RR  ${eq.rrr || '—'}`, 1600, 996, 24, '#000000', 'text-anchor="middle" font-weight="900"');

  g += '</g>';
  return g;
}

// THEME 4: CYAN PRO DYNAMIC (Pic 5)
function renderCyanTheme(score, status, width, height, scale) {
  const a = score.batters?.[0], b = score.batters?.[1], bowler = score.bowler;
  const eq = calculateEquation(score);
  const team1 = short(score.batting || 'ROYAL TIGERS', 12).toUpperCase();
  const team2 = short(score.bowling || 'CITY STRIKERS', 12).toUpperCase();
  const balls = (score.balls || []).slice(-6);

  let g = `<g transform="translate(0 ${height - 1080 * scale}) scale(${scale})">`;
  g += `<defs>
    <linearGradient id="cyanGlow" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#00f0ff"/><stop offset="100%" stop-color="#0066ff"/>
    </linearGradient>
    <linearGradient id="cyanDark" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#071b2d"/><stop offset="100%" stop-color="#020912"/>
    </linearGradient>
    <linearGradient id="cyanGold" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#ffd54f"/><stop offset="100%" stop-color="#ffb300"/>
    </linearGradient>
  </defs>`;

  // Left MK97 Pod
  g += `<path d="M50,830 Q50,820 65,820 L270,820 Q285,820 285,835 L270,950 Q265,955 250,955 L50,955 Z" fill="#030c17" stroke="url(#cyanGlow)" stroke-width="2.5"/>`;
  g += text('MK97', 160, 895, 46, '#ffffff', 'text-anchor="middle" font-weight="900" font-family="serif" letter-spacing="2"');

  // Left Wing (Team 1 + Batters)
  g += `<path d="M295,830 L800,830 L760,955 L280,955 Z" fill="url(#cyanDark)" stroke="url(#cyanGlow)" stroke-width="2"/>`;
  g += `<rect x="310" y="842" width="75" height="75" rx="8" fill="url(#cyanGlow)"/>`;
  g += text('🐅', 347, 888, 36, '#ffffff', 'text-anchor="middle"');
  g += text(team1, 347, 930, 11, '#ffffff', 'text-anchor="middle" font-weight="900"');
  // Batters
  g += text('▶ ' + (a ? short(a.name, 12) : 'BATTER 1'), 415, 880, 24, '#ffffff', 'font-weight="700"');
  g += text(a ? `${a.runs} ${a.balls}` : '—', 720, 880, 25, '#00f0ff', 'font-weight="800" text-anchor="end"');
  g += text(b ? short(b.name, 12) : 'BATTER 2', 435, 925, 24, '#b0c4de', 'font-weight="600"');
  g += text(b ? `${b.runs} ${b.balls}` : '—', 720, 925, 25, '#00f0ff', 'font-weight="800" text-anchor="end"');

  // Center Score Pod (Glowing Cyan Curved Capsule)
  g += `<path d="M800,825 Q820,815 850,815 L1130,815 Q1160,815 1180,825 L1160,955 Q1145,965 1115,965 L865,965 Q835,965 820,955 Z" fill="url(#cyanGlow)"/>`;
  g += text(`${score.runs}/${score.wickets}`, 990, 882, 64, '#ffffff', 'text-anchor="middle" font-weight="900"');
  g += `<rect x="915" y="905" width="150" height="34" rx="8" fill="#031122"/>`;
  g += text(`${score.overs} OVERS`, 990, 928, 20, '#00f0ff', 'text-anchor="middle" font-weight="800"');

  // Right Wing (Bowler + Team 2)
  g += `<path d="M1180,830 L1685,830 L1700,955 L1160,955 Z" fill="url(#cyanDark)" stroke="url(#cyanGlow)" stroke-width="2"/>`;
  g += text(bowler ? short(bowler.name, 14) : 'BOWLER', 1210, 880, 24, '#ffffff', 'font-weight="700"');
  g += text(bowler ? `${bowler.wickets}/${bowler.runs} (${bowler.overs})` : '—', 1580, 880, 24, '#00f0ff', 'font-weight="800" text-anchor="end"');
  for (let i = 0; i < 6; i++) {
    const val = balls[i] ?? '·';
    const bx = 1225 + i * 42;
    g += `<circle cx="${bx}" cy="922" r="14" fill="${ballColor(val)}"/>`;
    g += text(val, bx, 927, 15, '#ffffff', 'text-anchor="middle" font-weight="700"');
  }

  // Right Team 2 Emblem
  g += `<path d="M1695,830 L1870,830 Q1885,830 1885,845 L1870,950 Q1865,955 1850,955 L1680,955 Z" fill="#030c17" stroke="url(#cyanGlow)" stroke-width="2"/>`;
  g += `<rect x="1715" y="842" width="75" height="75" rx="8" fill="url(#cyanGlow)"/>`;
  g += text('🦅', 1752, 888, 36, '#ffffff', 'text-anchor="middle"');
  g += text(team2, 1752, 930, 11, '#ffffff', 'text-anchor="middle" font-weight="900"');

  // Bottom Curved Ribbon
  g += `<path d="M65,970 L1855,970 Q1875,970 1875,988 L1855,1015 Q1845,1022 1825,1022 L95,1022 Q75,1022 65,1005 Z" fill="#041220" stroke="url(#cyanGlow)" stroke-width="2"/>`;
  g += text(`CURRENT RUN RATE  ${score.runRate || '—'}    |    REQUIRED RUN RATE  ${eq.rrr || '—'}    |    PROJECTED SCORE  ${eq.projected}`, 580, 1002, 19, '#bfeaff', 'text-anchor="middle" font-weight="600"');
  // Golden Equation Badge
  g += `<rect x="1200" y="974" width="450" height="42" rx="8" fill="url(#cyanGold)"/>`;
  const needRuns = eq.runsNeeded != null ? `NEED ${eq.runsNeeded} RUNS FROM ${eq.ballsLeft} BALLS` : score.detail || 'LIVE SCORE';
  g += text(needRuns, 1425, 1002, 22, '#000000', 'text-anchor="middle" font-weight="900"');
  g += `<circle cx="1700" cy="995" r="7" fill="#ff1744"/>`;
  g += text('LIVE', 1730, 1001, 19, '#ffffff', 'font-weight="900"');

  g += '</g>';
  return g;
}

// THEME 5: CLASSIC CLEAN BROADCAST
function renderClassicTheme(score, status, width, height, scale) {
  const a = score.batters?.[0], b = score.batters?.[1], bowler = score.bowler;
  let g = `<g transform="translate(0 ${height - 1080 * scale}) scale(${scale})"><g transform="translate(0 26)"><rect x="55" y="818" width="350" height="42" rx="5" fill="#0a1018" fill-opacity="0.9"/>` + text(status, 78, 847, 25, '#cce5ff');
  g += '<path d="M55 860 H722 L806 964 H30 Z" fill="#0055bb"/><path d="M722 860 H1330 L1268 964 H806 Z" fill="#f5f6fa"/><path d="M1330 860 H1840 L1890 964 H1268 Z" fill="#111924" stroke="#ea8c24" stroke-width="3"/>';
  g += text(short(score.batting, 18), 100, 897, 30) + text(`${score.runs}/${score.wickets}`, 100, 948, 58, '#fff', 'font-weight="700"') + text(`(${score.overs})`, 342, 943, 30);
  g += text(`CRR  ${score.runRate || '—'}     RRR  ${score.requiredRate && score.requiredRate !== '--.--' ? score.requiredRate : '—'}`, 820, 904, 28, '#101827');
  g += text(short(score.result || score.detail || 'CricClubs', 24), 815, 943, 22, '#101827');
  g += text(short(score.bowling, 16), 1375, 925, 29, '#fff', 'font-weight="700"');
  g += '<rect x="30" y="964" width="1860" height="90" fill="#0a1018" fill-opacity="0.94"/>';
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
  return g;
}

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

export function graphicSvg(score, event = null, showScore = true, brandLogo = '', { width = 1920, height = 1080 } = {}, style = 'gold') {
  const scale = width / 1920;
  let g = brandLogo ? `<image href="${xml(brandLogo)}" x="${width - 196 * scale}" y="${30 * scale}" width="${150 * scale}" height="${76 * scale}" preserveAspectRatio="xMidYMid slice" opacity="0.94"/>` : '';
  if (showScore && score) {
    const status = score.stale || Date.now() - score.fetchedAt > 30000 ? 'SCORE DELAYED' : score.status === 'complete' ? 'MATCH COMPLETE' : score.superOver ? 'SUPER OVER' : 'LIVE SCORE';
    if (height > width) {
      g += portraitScore(score, status, width, height);
    } else {
      switch (style) {
        case 'shield':
          g += renderShieldTheme(score, status, width, height, scale);
          break;
        case 'dual':
          g += renderDualTheme(score, status, width, height, scale);
          break;
        case 'cyan':
          g += renderCyanTheme(score, status, width, height, scale);
          break;
        case 'classic':
          g += renderClassicTheme(score, status, width, height, scale);
          break;
        case 'gold':
        default:
          g += renderGoldTheme(score, status, width, height, scale);
          break;
      }
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
