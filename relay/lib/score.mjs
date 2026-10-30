import { clean, validateIds, normalizeScore } from '../../web/score-data.mjs';
import { enrichCricClubsScore } from './cricclubs-parser.mjs';
import { CRICCLUBS_LEAGUES, validateLeague } from '../../web/cricclubs-reference.mjs';
export { clean, validateIds, normalizeScore, scoreLines } from '../../web/score-data.mjs';
export class ScoreService {
  constructor({ template, headerName, headerValue, pollSeconds = 5, fetchFn = fetch, scorecardScraper = null, scorecardClubId = '300', scorecardLeague = 'FWCWL' } = {}) {
    this.template = template || 'https://cricclubs.com/liveScoreOverlayData.do?clubId={clubId}&matchId={matchId}';
    this.headerName = headerName; this.headerValue = headerValue;
    this.pollMs = Math.max(5, Number(pollSeconds) || 5) * 1000;
    this.fetchFn = fetchFn; this.ids = null; this.score = null; this.inflight = null; this.error = null;
    this.lastAttempt = 0; this.generation = 0;
    this.scorecardScraper = template ? null : scorecardScraper;
    this.scorecardClubId = String(scorecardClubId); this.scorecardLeague = scorecardLeague;
    this.leagues = new Map(CRICCLUBS_LEAGUES.map(item => [item.clubId, item.league]));
    if (scorecardClubId && scorecardLeague) this.leagues.set(validateIds(scorecardClubId, '1').clubId, validateLeague(scorecardLeague));
    this.league = null;
    this.scorecardDocument = null; this.scorecardTask = null;
    this.revision = 0; this.listeners = new Set(); this.retryAt = 0;
  }
  select(clubId, matchId, league) {
    const ids = validateIds(clubId, matchId);
    const path = validateLeague(league) || this.leagues.get(ids.clubId) || (this.ids?.clubId === ids.clubId ? this.league : null);
    if (!this.ids || this.ids.clubId !== ids.clubId || this.ids.matchId !== ids.matchId || this.league !== path) {
      this.ids = ids; this.score = null; this.error = null; this.lastAttempt = 0; this.inflight = null; this.generation++;
      this.league = path;
      this.scorecardDocument = null; this.scorecardTask = null;
      this.retryAt = 0; this.notify();
    }
  }
  async refresh() {
    if (!this.ids) return null;
    if (this.inflight) return this.inflight;
    if (Date.now() < this.nextAttemptAt) return this.snapshot();
    const ids = { ...this.ids }, generation = this.generation;
    this.lastAttempt = Date.now();
    const operation = (async () => {
      try {
        const url = new URL(this.template.replaceAll('{clubId}', ids.clubId).replaceAll('{matchId}', ids.matchId));
        if (url.protocol !== 'https:') throw new Error('Score feed must use HTTPS.');
        const headers = { Accept: 'application/json' };
        if (this.headerName && this.headerValue) headers[this.headerName] = this.headerValue;
        const response = await this.fetchFn(url, { headers, cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(8000), redirect: 'error' });
        if (!response.ok) {
          if (response.status === 429) {
            const retry = response.headers.get('retry-after');
            const seconds = /^\d+$/.test(retry || '') ? Number(retry) : (Date.parse(retry) - Date.now()) / 1000;
            if (generation === this.generation) this.retryAt = Date.now() + Math.max(this.pollMs, Math.min(86400000, Number.isFinite(seconds) ? seconds * 1000 : 60000));
          }
          await response.body?.cancel();
          throw new Error(`CricClubs/feed returned HTTP ${response.status}. Ask your league to enable score access.`);
        }
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
        if (generation === this.generation) {
          this.score = next; this.error = null; this.retryAt = 0;
          // HTML scraping runs independently; a slow or blocked scorecard must
          // not hold up live totals, camera upload or the encoder.
          this.enrich(ids, generation);
          this.notify();
        }
      } catch (error) {
        if (generation === this.generation) {
          this.error = error.name === 'TimeoutError' ? 'Score feed timed out; keeping the last score.'
            : error instanceof SyntaxError ? 'Feed returned a page instead of JSON; score access may be restricted.'
            : clean(error.message, 180);
          if (this.score) this.score = { ...this.score, stale: true, error: this.error };
          this.retryAt = Math.max(this.retryAt, Date.now() + this.pollMs);
          this.notify();
        }
      }
      return this.snapshot();
    })();
    this.inflight = operation;
    try { return await operation; } finally { if (this.inflight === operation) this.inflight = null; }
  }
  get nextAttemptAt() { return Math.max(this.lastAttempt + this.pollMs, this.retryAt); }
  subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  notify() {
    this.revision++;
    const snapshot = this.snapshot();
    // A disconnected viewer must never turn a successful source read into a failure.
    for (const listener of this.listeners) { try { listener(snapshot); } catch {} }
  }
  enrich(ids, generation) {
    if (!this.scorecardScraper) return;
    const league = this.league;
    if (!league) {
      this.score.scorecard = { state: 'unavailable', message: 'Paste this league’s full CricClubs scorecard URL to enable full-card reading.' }; return;
    }
    if (this.scorecardDocument && Date.now() - this.scorecardDocument.fetchedAt < 120000) {
      try { this.score = enrichCricClubsScore(this.score, this.scorecardDocument); } catch { this.scorecardDocument = null; }
    }
    if (!this.score.scorecard) this.score.scorecard = { state: 'loading', message: 'Reading full innings tables on the relay.' };
    if (this.scorecardTask) return;
    const task = (async () => {
      try {
        const document = await this.scorecardScraper.scrape({ ...ids, league });
        if (generation !== this.generation || !this.score) return;
        this.score = enrichCricClubsScore(this.score, document); this.scorecardDocument = document;
        this.notify();
      } catch (error) {
        if (generation !== this.generation || !this.score) return;
        if (error.code === 'COOLDOWN' && this.scorecardDocument) return;
        this.scorecardDocument = null;
        this.score = { ...this.score, scorecard: { state: ['ACCESS_BLOCKED', 'ROBOTS_DENIED'].includes(error.code) ? 'blocked' : error.code === 'RATE_LIMITED' ? 'rate_limited' : 'unavailable',
          code: clean(error.code, 40), message: clean(error.message, 220) } };
        this.notify();
      }
    })();
    this.scorecardTask = task;
    task.finally(() => { if (this.scorecardTask === task) this.scorecardTask = null; });
  }
  snapshot() {
    return {
      score: this.score ? { ...this.score, stale: this.score.stale || Date.now() - this.score.fetchedAt > 30000 } : null,
      error: this.error, ids: this.ids, league: this.league, pollSeconds: this.pollMs / 1000, revision: this.revision
    };
  }
}

// One source request stream, scheduled from its actual deadline rather than a
// second independent interval. HTML enrichment is already asynchronous above.
export function startScorePolling(service, { enabled = () => true, setTimer = setTimeout, clearTimer = clearTimeout, now = Date.now } = {}) {
  let stopped = false, timer;
  async function tick() {
    if (stopped) return;
    if (enabled() && service.ids) await service.refresh();
    if (stopped) return;
    const delay = enabled() && service.ids ? Math.max(50, service.nextAttemptAt - now()) : 1000;
    timer = setTimer(tick, delay); timer?.unref?.();
  }
  tick();
  return () => { stopped = true; clearTimer(timer); };
}
