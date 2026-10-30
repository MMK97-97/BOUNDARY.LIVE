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
  constructor() { this.key = null; this.previous = null; this.seen = new Set(); this.batters = new Map(); this.bowlers = new Map(); this.fullCards = false; this.highestOver = 0; }
  reset(score) {
    this.key = inningsKey(score); this.previous = null; this.seen.clear(); this.batters.clear(); this.bowlers.clear(); this.fullCards = false; this.highestOver = 0;
  }
  remember(score) {
    for (const p of [...(score.cards?.batting || []), ...(score.batters || [])]) if (identity(p)) this.batters.set(identity(p), { ...p });
    for (const p of [...(score.cards?.bowling || []), ...(score.bowler ? [score.bowler] : [])]) if (identity(p)) this.bowlers.set(identity(p), { ...p });
    if (score.cards?.complete) this.fullCards = true;
  }
  cards(score) {
    return { batting: [...this.batters.values()].slice(0, 15), bowling: [...this.bowlers.values()].slice(0, 15),
      complete: this.fullCards, battingTeam: score.batting, bowlingTeam: score.bowling };
  }
  update(score) {
    if (!score || score.stale) return [];
    if (this.key !== inningsKey(score)) this.reset(score);
    const old = this.previous; this.remember(score); this.previous = structuredClone(score);
    // Joining an innings or loading completed match 986 never plays old celebrations.
    if (!old || old.status === 'complete') {
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
    return result;
  }
}
