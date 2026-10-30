import { clean, validateIds, normalizeScore } from '../../web/score-data.mjs';
export { clean, validateIds, normalizeScore, scoreLines } from '../../web/score-data.mjs';
export class ScoreService {
  constructor({ template, headerName, headerValue, pollSeconds = 5, fetchFn = fetch }) {
    this.template = template || 'https://cricclubs.com/liveScoreOverlayData.do?clubId={clubId}&matchId={matchId}';
    this.headerName = headerName; this.headerValue = headerValue;
    this.pollMs = Math.max(5, Number(pollSeconds) || 5) * 1000;
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
        const raw = JSON.parse(Buffer.concat(chunks).toString().replace(/^\uFEFF/, ''));
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
