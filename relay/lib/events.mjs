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
export function automationOptions(value = {}, env = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) value = {};
  const number = (v, fallback, min, max) => Number.isFinite(Number(v)) ? Math.max(min, Math.min(max, Number(v))) : fallback;
  return {
    replay: value.replay !== false, milestones: value.milestones !== false, cards: value.cards !== false,
    scorerDelay: number(value.scorerDelay ?? env.SCORER_DELAY_SECONDS, 6, 0, 30),
    replaySeconds: 8, popupFrames: 60, cardFrames: 60,
    bufferSeconds: Math.round(number(env.REPLAY_BUFFER_SECONDS, 30, 12, 45)),
    memoryBytes: Math.round(number(env.REPLAY_MEMORY_MB, 192, 64, 512) * 1024 * 1024),
    clipBytes: 64 * 1024 * 1024
  };
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
      for (const d of score.deliveries || []) if (d.id) this.seen.add(`ball:${d.id}`);
      for (const n of TEAM_MILESTONES) if (Number(score.runs) >= n) this.seen.add(`team:${n}`);
      for (const p of score.batters || []) for (const n of PLAYER_MILESTONES) if (countKnown(p.runs) && Number(p.runs) >= n) this.seen.add(`player:${identity(p)}:${n}`);
      this.highestOver = Math.floor((legalBalls(score.overs) || 0) / 6);
      return [];
    }
    const result = [];
    const once = (id, event) => { if (this.seen.has(id)) return; this.seen.add(id); result.push({ ...event, id: `${this.key}:${id}` }); };
    const oldBalls = legalBalls(old.overs), balls = legalBalls(score.overs), delta = Number(score.runs) - Number(old.runs);
    const changed = delta !== 0 || old.wickets !== score.wickets || old.overs !== score.overs;
    const deliveryId = `${score.overs}:${score.runs}:${score.wickets}:${(score.balls || []).join(',')}`;
    const explicit = (score.deliveries || []).filter(d => d.id && [4, 6].includes(Number(d.batRuns)) && Number.isFinite(d.occurredAt));
    if (explicit.length) {
      // Baseline history is filtered by the previous fetch, not replayed on reconnect.
      for (const d of explicit) if (d.occurredAt > old.fetchedAt - 15000 && d.occurredAt <= score.fetchedAt + 2000) {
        once(`ball:${d.id}`, { type: 'boundary', runs: Number(d.batRuns), name: d.batterName || '', occurredAt: d.occurredAt, deliveryId: d.id, timing: 'provider' });
      }
    } else if (changed && delta >= 0 && balls !== null && oldBalls !== null && balls >= oldBalls) {
      const oldPlayers = new Map((old.batters || []).map(p => [identity(p), p]));
      const hits = (score.batters || []).flatMap(p => {
        const before = oldPlayers.get(identity(p)); if (!before || ![p.runs, p.fours, p.sixes, before.runs, before.fours, before.sixes].every(countKnown)) return [];
        const four = Number(p.fours) - Number(before.fours), six = Number(p.sixes) - Number(before.sixes);
        const n = four === 1 && six === 0 ? 4 : six === 1 && four === 0 ? 6 : 0;
        return n && Number(p.runs) - Number(before.runs) === n ? [{ runs: n, name: p.name }] : [];
      });
      const boundary = hits.length === 1 && balls - oldBalls <= 1 && delta >= hits[0].runs && delta <= hits[0].runs + 2 ? hits[0] : null;
      if (boundary) once(`ball:${deliveryId}`, { type: 'boundary', ...boundary, deliveryId, timing: 'calibrated' });
      else if (Number(score.wickets) - Number(old.wickets) === 1 && balls - oldBalls <= 1) once(`wicket:${deliveryId}`, { type: 'wicket', name: '', timing: 'calibrated' });
      else result.push({ type: 'delivery', id: `${this.key}:${deliveryId}` });
    }
    // Crossings include 49→53 and 99→105. Score corrections cannot replay a milestone.
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
