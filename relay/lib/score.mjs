const truth = v => v === true || v === 'true' || v === '1' || v === 1;
export const clean = (value, length = 80) => String(value ?? '')
  .replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'")
  .replace(/&quot;/g, '"').replace(/[\r\n\t\x00-\x1f\x7f]/g, ' ')
  .replace(/\s+/g, ' ').trim().slice(0, length);
const decimal = (value, label) => {
  const s = String(value ?? '').trim();
  if (!/^\d+(?:\.\d+)?$/.test(s)) throw new Error(`Score feed is missing ${label}.`);
  return s;
};
export function validateIds(clubId, matchId) {
  if (!/^[1-9]\d{0,11}$/.test(String(clubId)) || !/^[1-9]\d{0,11}$/.test(String(matchId))) {
    throw new Error('Provide numeric Club ID and Match ID, or paste the full CricClubs scorecard URL.');
  }
  return { clubId: String(clubId), matchId: String(matchId) };
}
export function normalizeScore(raw, ids, now = Date.now()) {
  let s;
  if (raw?.schema === 'boundary.score.v1') {
    s = {
      batting: clean(raw.batting, 28), bowling: clean(raw.bowling, 28),
      runs: decimal(raw.runs, 'runs'), wickets: decimal(raw.wickets, 'wickets'),
      overs: decimal(raw.overs, 'overs'), runRate: clean(raw.runRate, 10),
      target: clean(raw.target, 8), result: clean(raw.result, 100),
      status: ['live', 'complete', 'break', 'scheduled'].includes(raw.status) ? raw.status : 'live',
      balls: Array.isArray(raw.balls) ? raw.balls.slice(-8).map(v => clean(v, 5)) : [],
      detail: clean(raw.detail, 110), source: 'Approved score feed', batters: [], bowler: null,
      series: clean(raw.series, 80), teams: []
    };
  } else {
    const v = raw?.values;
    if (!v || typeof v !== 'object') throw new Error('CricClubs did not return a supported score feed. Check feed access with your league.');
    if (v.matchId && String(v.matchId) !== ids.matchId) throw new Error('Score feed returned a different Match ID.');
    const superOver = truth(raw.isSuperOver);
    const second = superOver ? truth(raw.isSuperOverSecondInningsStarted) : truth(raw.isSecondInningsStarted ?? v.isSecondInningsStarted);
    const bat = second ? 't2' : 't1', bowl = second ? 't1' : 't2';
    const batters = [1, 2].filter(n => v[`batsman${n}Name`]).map(n => ({
      name: clean(v[`batsman${n}Name`], 32), runs: clean(v[`batsman${n}Runs`], 5), balls: clean(v[`batsman${n}Balls`], 5)
    }));
    const bowler = v.bowlerName ? { name: clean(v.bowlerName, 24), overs: clean(v.bowlerOvers, 6),
      runs: clean(v.bowlerRuns, 5), wickets: clean(v.bowlerWickets, 3) } : null;
    s = {
      batting: clean(v[`${bat}Code`] || v[`${bat}Name`], 28),
      bowling: clean(v[`${bowl}Code`] || v[`${bowl}Name`] || 'Opposition', 28),
      runs: decimal(v[`${bat}Total`], 'batting total'), wickets: decimal(v[`${bat}Wickets`], 'wickets'),
      overs: decimal(v[`${bat}Overs`], 'overs'), runRate: clean(v[`${bat}RR`], 10),
      target: clean(v.revisedTarget, 8), result: clean(v.shortResult || v.result, 100),
      status: truth(v.isMatchEnded) ? 'complete' : 'live',
      balls: Array.isArray(raw.balls) ? raw.balls.slice(-8).map(b => clean(b, 5)) : [],
      detail: clean(v.customTextValue || v.showMsgForScoreNeeded || v.seriesName, 110),
      source: 'CricClubs', superOver,
      series: clean(v.seriesName, 80), batters, bowler,
      teams: ['t1', 't2'].filter(t => v[`${t}Name`] && /^\d+$/.test(String(v[`${t}Total`]))).map(t => ({
        name: clean(v[`${t}Name`], 32), code: clean(v[`${t}Code`] || v[`${t}Name`], 12),
        runs: clean(v[`${t}Total`], 6), wickets: clean(v[`${t}Wickets`], 3), overs: clean(v[`${t}Overs`], 6)
      })),
      partialView: ![1, 42, 45, 54].includes(Number(raw.view))
    };
  }
  if (!s.batting) throw new Error('Score feed has no batting team. Wait for live scoring or use an approved feed.');
  if (!/^\d{1,2}$/.test(s.wickets) || Number(s.wickets) > 20) throw new Error('Unsupported wicket value.');
  return { ...s, ...ids, fetchedAt: now, stale: false, error: null };
}
export function scoreLines(score, now = Date.now()) {
  if (!score) return ['BOUNDARY LIVE  |  CRICKET', 'Waiting for score feed'];
  const delayed = score.stale || now - score.fetchedAt > 30000;
  const first = `${score.batting}  ${score.runs}/${score.wickets}    ${score.overs} ov${score.runRate ? `   CRR ${score.runRate}` : ''}`;
  const status = delayed ? 'SCORE DELAYED' : score.status === 'complete' ? 'MATCH COMPLETE' : score.superOver ? 'SUPER OVER' : 'LIVE SCORE';
  const shortName = name => name.length > 18 ? name.slice(0, 17) + '…' : name;
  const players = score.batters?.map(p => `${shortName(p.name)} ${p.runs}(${p.balls})`).join('  ·  ');
  const detail = score.result || players || score.detail || (score.target ? `Target ${score.target}` : score.bowling === 'Opposition' ? '' : `v ${score.bowling}`);
  return [clean(first, 95), clean(`${status}  |  ${detail ? `${detail}  |  ` : ''}${score.source}`, 120)];
}
export class ScoreService {
  constructor({ template, headerName, headerValue, pollSeconds = 10, fetchFn = fetch }) {
    this.template = template || 'https://cricclubs.com/liveScoreOverlayData.do?clubId={clubId}&matchId={matchId}';
    this.headerName = headerName; this.headerValue = headerValue;
    this.pollMs = Math.max(5, Number(pollSeconds) || 10) * 1000;
    this.fetchFn = fetchFn; this.ids = null; this.score = null; this.inflight = null; this.error = null;
    this.lastAttempt = 0; this.generation = 0;
  }
  select(clubId, matchId) {
    const ids = validateIds(clubId, matchId);
    if (!this.ids || this.ids.clubId !== ids.clubId || this.ids.matchId !== ids.matchId) {
      this.ids = ids; this.score = null; this.error = null; this.lastAttempt = 0; this.inflight = null; this.generation++;
    }
  }
  async refresh() {
    if (!this.ids) return null;
    if (this.inflight) return this.inflight;
    if (Date.now() - this.lastAttempt < this.pollMs) return this.snapshot();
    const ids = { ...this.ids }, generation = this.generation;
    this.lastAttempt = Date.now();
    const operation = (async () => {
      try {
        const url = new URL(this.template.replaceAll('{clubId}', ids.clubId).replaceAll('{matchId}', ids.matchId));
        if (url.protocol !== 'https:') throw new Error('Score feed must use HTTPS.');
        const headers = { Accept: 'application/json' };
        if (this.headerName && this.headerValue) headers[this.headerName] = this.headerValue;
        const response = await this.fetchFn(url, { headers, signal: AbortSignal.timeout(8000), redirect: 'error' });
        if (!response.ok) throw new Error(`CricClubs/feed returned HTTP ${response.status}. Ask your league to enable score access.`);
        // Bound upstream responses and never forward raw player data to the phone.
        const reader = response.body.getReader(); let size = 0; const chunks = [];
        while (true) {
          const { done, value } = await reader.read(); if (done) break;
          size += value.length;
          if (size > 2_000_000) { await reader.cancel(); throw new Error('Score feed response exceeds 2 MB.'); }
          chunks.push(Buffer.from(value));
        }
        const raw = JSON.parse(Buffer.concat(chunks).toString());
        const next = normalizeScore(raw, ids);
        if (generation === this.generation) { this.score = next; this.error = null; }
      } catch (error) {
        if (generation === this.generation) {
          this.error = error.name === 'TimeoutError' ? 'Score feed timed out; keeping the last score.'
            : error instanceof SyntaxError ? 'Feed returned a page instead of JSON; score access may be restricted.'
            : clean(error.message, 180);
          if (this.score) this.score = { ...this.score, stale: true, error: this.error };
        }
      }
      return this.snapshot();
    })();
    this.inflight = operation;
    try { return await operation; } finally { if (this.inflight === operation) this.inflight = null; }
  }
  snapshot() {
    return {
      score: this.score ? { ...this.score, stale: this.score.stale || Date.now() - this.score.fetchedAt > 30000 } : null,
      error: this.error, ids: this.ids, pollSeconds: this.pollMs / 1000
    };
  }
}
