import { clean, validateIds, normalizeScore, scheduledScore } from '../../web/score-data.mjs';
import { enrichCricClubsScore, parseCricClubsScorecard } from './cricclubs-parser.mjs';
import { CRICCLUBS_LEAGUES, validateLeague } from '../../web/cricclubs-reference.mjs';
export { clean, validateIds, normalizeScore, scheduledScore, scoreLines } from '../../web/score-data.mjs';
export class ScoreService {
  constructor({ template, headerName, headerValue, pollSeconds = 5, fetchFn = fetch, scorecardScraper = null, scorecardClubId = '300', scorecardLeague = 'FWCWL' } = {}) {
    this.template = template || 'https://cricclubs.com/liveScoreOverlayData.do?clubId={clubId}&matchId={matchId}';
    this.headerName = headerName; this.headerValue = headerValue;
    this.pollMs = Math.max(5, Number(pollSeconds) || 5) * 1000;
    this.fetchFn = fetchFn; this.ids = null; this.score = null; this.inflight = null; this.error = null;
    this.lastAttempt = 0; this.generation = 0;
    this.allowScheduled = false; this.scheduleHint = null;
    this.scorecardScraper = template ? null : scorecardScraper;
    this.scorecardClubId = String(scorecardClubId); this.scorecardLeague = scorecardLeague;
    this.leagues = new Map(CRICCLUBS_LEAGUES.map(item => [item.clubId, item.league]));
    if (scorecardClubId && scorecardLeague) this.leagues.set(validateIds(scorecardClubId, '1').clubId, validateLeague(scorecardLeague));
    this.league = null;
    this.scorecardDocument = null; this.scorecardTask = null;
    this.revision = 0; this.listeners = new Set(); this.retryAt = 0;
  }
  select(clubId, matchId, league, options = {}) {
    const ids = validateIds(clubId, matchId);
    const path = validateLeague(league) || this.leagues.get(ids.clubId) || (this.ids?.clubId === ids.clubId ? this.league : null);
    const hint = options?.scheduleHint && typeof options.scheduleHint === 'object' ? {
      team1: clean(options.scheduleHint.team1, 40),
      team2: clean(options.scheduleHint.team2, 40),
      t1Code: clean(options.scheduleHint.t1Code, 12),
      t2Code: clean(options.scheduleHint.t2Code, 12),
      date: clean(options.scheduleHint.date, 60),
      ground: clean(options.scheduleHint.ground, 60),
      series: clean(options.scheduleHint.series, 80)
    } : null;
    const prevAllow = this.allowScheduled;
    this.allowScheduled = Boolean(options?.allowScheduled);
    this.scheduleHint = hint;
    if (!this.ids || this.ids.clubId !== ids.clubId || this.ids.matchId !== ids.matchId || this.league !== path) {
      this.ids = ids; this.score = null; this.error = null; this.lastAttempt = 0; this.inflight = null; this.generation++;
      this.league = path;
      this.scorecardDocument = null; this.scorecardTask = null;
      this.retryAt = 0; this.notify();
    } else if (prevAllow !== this.allowScheduled && (!this.score || this.score.status === 'scheduled')) {
      this.lastAttempt = 0; this.retryAt = 0;
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
        const emptyScheduled = this.allowScheduled && raw && typeof raw === 'object' && !Array.isArray(raw) && !raw.values && !raw.schema && Object.keys(raw).length === 0;
        const next = emptyScheduled ? scheduledScore(ids, this.scheduleHint) : normalizeScore(raw, ids);
        if (generation === this.generation) {
          this.score = next; this.error = null; this.retryAt = 0;
          // HTML scraping runs independently; skip pre-match scraping until live scoring begins.
          if (next.status !== 'scheduled') this.enrich(ids, generation);
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
  get nextAttemptAt() {
    const effectivePollMs = this.score?.status === 'scheduled' ? Math.min(this.pollMs, 3000) : this.pollMs;
    return Math.max(this.lastAttempt + effectivePollMs, this.retryAt);
  }
  subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  notify() {
    this.revision++;
    const snapshot = this.snapshot();
    // A disconnected viewer must never turn a successful source read into a failure.
    for (const listener of this.listeners) { try { listener(snapshot); } catch {} }
  }
  async scrapeScorecard({ force = false } = {}) {
    if (!this.ids || !this.score) throw new Error('Load a match first before scraping its full scorecard.');
    if (!this.scorecardScraper) throw new Error('Full scorecard scraping is disabled on this server.');
    if (force) {
      this.scorecardScraper.blocked = null;
      this.scorecardScraper.nextAllowed = 0;
      this.scorecardScraper.cache?.clear?.();
      this.scorecardDocument = null;
    }
    this.enrich(this.ids, this.generation);
    if (this.scorecardTask) await this.scorecardTask;
    return this.snapshot();
  }
  importScorecard(input = {}) {
    if (!this.ids || !this.score) throw new Error('Load a match first before importing its full scorecard.');
    const league = validateLeague(input.league) || this.league || 'FWCWL';
    let document;
    if (typeof input.html === 'string' && input.html.trim()) {
      document = { ...parseCricClubsScorecard(input.html, { ...this.ids, league }), origin: 'imported-html', fetchedAt: Date.now() };
    } else if (input.document && typeof input.document === 'object' && input.document.schema === 'mk97.cricclubs.scorecard.v1') {
      document = { ...input.document, origin: input.document.origin || 'imported-json', fetchedAt: input.document.fetchedAt || Date.now() };
    } else {
      throw new Error('Provide scorecard HTML or a valid mk97.cricclubs.scorecard.v1 JSON document.');
    }
    this.score = enrichCricClubsScore(this.score, document);
    this.scorecardDocument = document;
    this.notify();
    return this.snapshot();
  }
  enrich(ids, generation) {
    if (this.scorecardDocument && (['imported-html', 'imported-json'].includes(this.scorecardDocument.origin) || Date.now() - this.scorecardDocument.fetchedAt < 120000)) {
      try { this.score = enrichCricClubsScore(this.score, this.scorecardDocument); } catch { this.scorecardDocument = null; }
      if (['imported-html', 'imported-json'].includes(this.scorecardDocument?.origin) && this.score.scorecard?.state === 'complete') return;
    }
    if (!this.scorecardScraper) return;
    const league = this.league || (this.score?.source === 'CricClubs' ? (this.leagues.get(ids.clubId) || this.scorecardLeague || 'FWCWL') : null);
    if (!league) {
      this.score.scorecard = { state: 'unavailable', message: 'Full scorecard scraping is not configured for this feed.' }; return;
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
        if (['imported-html', 'imported-json'].includes(this.scorecardDocument?.origin)) return;
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
    const effectivePollMs = this.score?.status === 'scheduled' ? Math.min(this.pollMs, 3000) : this.pollMs;
    return {
      score: this.score ? { ...this.score, stale: this.score.stale || Date.now() - this.score.fetchedAt > 30000 } : null,
      error: this.error, ids: this.ids, league: this.league, pollSeconds: effectivePollMs / 1000, revision: this.revision
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
