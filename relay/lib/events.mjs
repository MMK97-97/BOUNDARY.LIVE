export const FPS = 30;
export const TEAM_MILESTONES = [50, 100, 150, 200, 250, 300, 350];
export const PLAYER_MILESTONES = [50, 100, 150, 200];
export const legalBalls = overs => {
  const m = String(overs ?? '').match(/^(\d+)(?:\.([0-5]))?$/);
  return m ? Number(m[1]) * 6 + Number(m[2] || 0) : null;
};
const identity = p => String(p.id || p.name || '').trim();
const countKnown = v => /^\d+$/.test(String(v ?? ''));
const inningsKey = s => `${s.clubId}:${s.matchId}:${s.innings || s.batting}`;
export function automationOptions(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) value = {};
  return { milestones: value.milestones !== false, cards: value.cards !== false, popupFrames: 60, cardFrames: 60 };
}
export class CricketEvents {
  constructor() { this.key = null; this.previous = null; this.seen = new Set(); this.batters = new Map(); this.bowlers = new Map(); this.fullCards = false; this.highestOver = 0; this.lastMoments = []; }
  reset(score) {
    this.key = inningsKey(score); this.previous = null; this.seen.clear(); this.batters.clear(); this.bowlers.clear(); this.fullCards = false; this.highestOver = 0; this.lastMoments = [];
  }
  remember(score) {
    for (const p of [...(score.cards?.batting || []), ...(score.batters || []), ...(score.lastOut ? [score.lastOut] : [])]) if (identity(p)) this.batters.set(identity(p), { ...p });
    for (const p of [...(score.cards?.bowling || []), ...(score.bowler ? [score.bowler] : [])]) if (identity(p)) this.bowlers.set(identity(p), { ...p });
    if (score.cards?.complete) this.fullCards = true;
  }
  cards(score) {
    return { batting: [...this.batters.values()].slice(0, 15), bowling: [...this.bowlers.values()].slice(0, 15),
      complete: this.fullCards, battingTeam: score.batting, bowlingTeam: score.bowling };
  }
  detectMoments(old, score) {
    if (!old || !score || score.stale || score.status === 'scheduled' || old.status === 'complete' || old.status === 'scheduled') return [];
    const oldBalls = legalBalls(old.overs), balls = legalBalls(score.overs);
    const deltaRuns = Number(score.runs) - Number(old.runs);
    const deltaWickets = Number(score.wickets) - Number(old.wickets);
    const deltaBalls = (balls !== null && oldBalls !== null) ? balls - oldBalls : 0;
    if (deltaRuns < 0 || deltaWickets < 0 || deltaBalls < 0) return [];
    const moments = [];
    const onceMoment = (id, event) => { if (this.seen.has(id)) return; this.seen.add(id); moments.push({ ...event, id: `${this.key}:${id}` }); };
    const oldPlayers = new Map((old.batters || []).map(p => [identity(p), p]));
    if (deltaWickets > 0 && countKnown(score.wickets) && Number(score.wickets) <= 10) {
      const out = score.lastOut;
      const outLine = out?.name ? `${out.name}${countKnown(out.runs) ? ` ${out.runs}(${out.balls ?? '—'})` : ''}${out.status ? ` · ${out.status}` : ''}` : `${score.batting || 'BATTING'} ${score.runs}/${score.wickets} (${score.overs})`;
      onceMoment(`wicket:${score.wickets}`, { type: 'wicket', milestone: Number(score.wickets), title: out?.name || score.batting || 'WICKET', subtitle: outLine });
      return moments;
    }
    const newBalls = Array.isArray(score.balls) ? score.balls : [];
    const oldBallList = Array.isArray(old.balls) ? old.balls : [];
    const lastBall = newBalls.length ? String(newBalls[newBalls.length - 1]).trim().toUpperCase() : '';
    const appendedBall = newBalls.length > oldBallList.length || (newBalls.length && deltaBalls > 0);
    const sixBatter = (score.batters || []).find(p => {
      const b = oldPlayers.get(identity(p));
      return b && countKnown(b.sixes) && countKnown(p.sixes) && Number(p.sixes) > Number(b.sixes);
    });
    if (sixBatter || (appendedBall && deltaBalls <= 2 && deltaRuns >= 6 && lastBall === '6')) {
      const batter = sixBatter || score.batters?.[0];
      const sub = batter ? `${batter.name} · ${batter.runs ?? '—'}${batter.balls != null ? ` (${batter.balls})` : ''}` : `${score.batting || ''} ${score.runs}/${score.wickets} (${score.overs})`;
      onceMoment(`six:${balls ?? score.overs}:${score.runs}`, { type: 'six', milestone: 6, title: batter?.name || score.batting || 'MAXIMUM', subtitle: sub });
      return moments;
    }
    const fourBatter = (score.batters || []).find(p => {
      const b = oldPlayers.get(identity(p));
      return b && countKnown(b.fours) && countKnown(p.fours) && Number(p.fours) > Number(b.fours);
    });
    if (fourBatter || (appendedBall && deltaBalls <= 2 && deltaRuns >= 4 && deltaRuns < 6 && lastBall === '4')) {
      const batter = fourBatter || score.batters?.[0];
      const sub = batter ? `${batter.name} · ${batter.runs ?? '—'}${batter.balls != null ? ` (${batter.balls})` : ''}` : `${score.batting || ''} ${score.runs}/${score.wickets} (${score.overs})`;
      onceMoment(`four:${balls ?? score.overs}:${score.runs}`, { type: 'four', milestone: 4, title: batter?.name || score.batting || 'BOUNDARY', subtitle: sub });
    }
    return moments;
  }
  update(score) {
    if (!score || score.stale || score.status === 'scheduled') { this.lastMoments = []; return []; }
    if (this.key !== inningsKey(score)) this.reset(score);
    const old = this.previous; this.remember(score); this.previous = structuredClone(score);
    // Joining an innings or loading completed match 986 never plays old celebrations.
    if (!old || old.status === 'complete' || old.status === 'scheduled') {
      this.lastMoments = [];
      for (const n of TEAM_MILESTONES) if (Number(score.runs) >= n) this.seen.add(`team:${n}`);
      for (const p of score.batters || []) for (const n of PLAYER_MILESTONES) if (countKnown(p.runs) && Number(p.runs) >= n) this.seen.add(`player:${identity(p)}:${n}`);
      this.highestOver = Math.floor((legalBalls(score.overs) || 0) / 6);
      return [];
    }
    const result = [];
    const once = (id, event) => { if (this.seen.has(id)) return; this.seen.add(id); result.push({ ...event, id: `${this.key}:${id}` }); };
    const oldBalls = legalBalls(old.overs), balls = legalBalls(score.overs), delta = Number(score.runs) - Number(old.runs);
    // Crossings include 49→53 and 99→105. Score corrections cannot repeat a milestone.
    if (delta >= 0) for (const n of TEAM_MILESTONES) if (Number(old.runs) < n && Number(score.runs) >= n) once(`team:${n}`, { type: 'team', title: score.batting, milestone: n });
    const oldPlayers = new Map((old.batters || []).map(p => [identity(p), p]));
    for (const p of score.batters || []) {
      const before = oldPlayers.get(identity(p)); if (!before || !countKnown(before.runs) || !countKnown(p.runs)) continue;
      for (const n of PLAYER_MILESTONES) if (Number(before.runs) < n && Number(p.runs) >= n) once(`player:${identity(p)}:${n}`, { type: 'player', title: p.name, milestone: n });
    }
    if (balls !== null && oldBalls !== null && balls >= oldBalls && Math.floor(balls / 6) > this.highestOver) {
      const over = Math.floor(balls / 6);
      this.highestOver = over;
      once(`over:${over}`, { type: 'over', over, cards: this.cards(score) });
    }
    this.lastMoments = this.detectMoments(old, score);
    return result;
  }
}
