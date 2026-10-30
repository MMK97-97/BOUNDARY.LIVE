import robotsParser from 'robots-parser';
import { CricClubsError, cricclubsReference, parseCricClubsScorecard } from './cricclubs-parser.mjs';
export { CricClubsError, cricclubsReference, parseCricClubsScorecard, enrichCricClubsScore } from './cricclubs-parser.mjs';

const AGENT = 'MK97Scorecard';
const USER_AGENT = `${AGENT}/1.0 (+https://github.com/MMK97-97/BOUNDARY.LIVE)`;
const ROBOTS_URL = 'https://cricclubs.com/robots.txt';
const message = error => error instanceof CricClubsError ? error : new CricClubsError('NETWORK_ERROR',
  error?.name === 'TimeoutError' ? 'CricClubs scorecard request timed out.' : 'Could not retrieve the CricClubs scorecard.');

async function readBounded(response, maxBytes) {
  if (Number(response.headers.get('content-length')) > maxBytes) {
    await response.body?.cancel(); throw new CricClubsError('TOO_LARGE', 'CricClubs response exceeds the size limit.');
  }
  if (!response.body) throw new CricClubsError('EMPTY_RESPONSE', 'CricClubs returned an empty response.');
  const reader = response.body.getReader(), chunks = []; let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      bytes += value.length;
      if (bytes > maxBytes) throw new CricClubsError('TOO_LARGE', 'CricClubs response exceeds the size limit.');
      chunks.push(Buffer.from(value));
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}

export class CricClubsScraper {
  constructor({ fetchFn = fetch, now = Date.now, cacheMs = 15000, timeoutMs = 8000 } = {}) {
    this.fetchFn = fetchFn; this.now = now;
    this.cacheMs = Math.min(300000, Math.max(15000, Number(cacheMs) || 15000));
    this.timeoutMs = Math.min(15000, Math.max(1000, Number(timeoutMs) || 8000));
    this.cache = new Map(); this.inflight = new Map(); this.robots = null; this.robotsPending = null;
    this.blocked = null; this.nextAllowed = 0; this.intervalMs = 5000;
  }
  async request(url, accept, maxBytes) {
    // No cookies, credentials, proxy rotation, redirected hosts or write endpoints.
    // URLs are constructed internally, never from a browser-supplied fetch host.
    let response;
    try {
      response = await this.fetchFn(url, { method: 'GET', redirect: 'manual', credentials: 'omit',
        headers: { Accept: accept, 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(this.timeoutMs) });
    } catch (error) { throw message(error); }
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel(); throw new CricClubsError('REDIRECT_REFUSED', 'CricClubs redirected the request; scraping stopped.');
    }
    if ([401, 403, 429, 503].includes(response.status)) {
      const code = response.status === 429 ? 'RATE_LIMITED' : response.status === 503 ? 'UPSTREAM_UNAVAILABLE' : 'ACCESS_BLOCKED';
      const retry = response.headers.get('retry-after'), seconds = /^\d+$/.test(retry || '') ? Number(retry) : (Date.parse(retry) - this.now()) / 1000;
      const delay = Math.max(300000, Number.isFinite(seconds) ? Math.min(seconds * 1000, 86400000) : 0);
      this.blocked = { until: code === 'ACCESS_BLOCKED' ? Infinity : this.now() + delay, code, message: response.status === 429 ? 'CricClubs rate-limited scorecard requests; automatic requests are paused.' :
        code === 'ACCESS_BLOCKED' ? `CricClubs returned HTTP ${response.status}; scorecard scraping stopped for this relay session.` : 'CricClubs is temporarily unavailable; scorecard requests are paused.' };
      await response.body?.cancel(); throw new CricClubsError(code, this.blocked.message);
    }
    if (!response.ok && !(url === ROBOTS_URL && response.status === 404)) {
      await response.body?.cancel(); throw new CricClubsError('UPSTREAM_ERROR', `CricClubs returned HTTP ${response.status}.`);
    }
    if (url === ROBOTS_URL && response.status === 404) { await response.body?.cancel(); return { body: Buffer.from(''), type: 'text/plain' }; }
    const type = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    return { body: await readBounded(response, maxBytes), type };
  }
  async policy() {
    if (this.robots && this.robots.expires > this.now()) return this.robots.parser;
    if (this.robotsPending) return this.robotsPending;
    this.robotsPending = (async () => {
      const { body, type } = await this.request(ROBOTS_URL, 'text/plain', 512000);
      const text = body.toString('utf8');
      if (type && type !== 'text/plain' || /<(?:!doctype|html|script)\b/i.test(text)) throw new CricClubsError('ROBOTS_UNAVAILABLE', 'A usable robots.txt was not returned; scorecard scraping stopped.');
      const parser = robotsParser(ROBOTS_URL, text), crawlDelay = Number(parser.getCrawlDelay(AGENT));
      this.intervalMs = Math.max(5000, Number.isFinite(crawlDelay) ? crawlDelay * 1000 : 0);
      this.robots = { parser, expires: this.now() + 3600000 }; return parser;
    })();
    try { return await this.robotsPending; } finally { this.robotsPending = null; }
  }
  async scrape(input) {
    const ref = cricclubsReference(input), cacheKey = ref.url, cached = this.cache.get(cacheKey);
    if (cached && cached.expires > this.now()) return structuredClone(cached.document);
    if (this.inflight.has(cacheKey)) return structuredClone(await this.inflight.get(cacheKey));
    if (this.inflight.size >= 4) throw new CricClubsError('BUSY', 'Too many pending scorecard requests.');
    const operation = (async () => {
      try {
        if (this.blocked?.until > this.now()) throw new CricClubsError(this.blocked.code, this.blocked.message);
        this.blocked = null;
        if (this.now() < this.nextAllowed) throw new CricClubsError('COOLDOWN', 'Waiting for the CricClubs scorecard request interval.');
        const policy = await this.policy();
        if (policy.isAllowed(ref.url, AGENT) === false) throw new CricClubsError('ROBOTS_DENIED', 'CricClubs robots.txt disallows this scorecard path.');
        if (this.now() < this.nextAllowed) throw new CricClubsError('COOLDOWN', 'Waiting for the CricClubs scorecard request interval.');
        this.nextAllowed = this.now() + this.intervalMs;
        const { body, type } = await this.request(ref.url, 'text/html,application/xhtml+xml', 2000000);
        if (type && !['text/html', 'application/xhtml+xml'].includes(type)) throw new CricClubsError('UNSUPPORTED_TYPE', 'CricClubs did not return an HTML scorecard.');
        const document = { ...parseCricClubsScorecard(body, ref), fetchedAt: this.now() };
        if (this.cache.size >= 16 && !this.cache.has(cacheKey)) this.cache.delete(this.cache.keys().next().value);
        this.cache.set(cacheKey, { expires: this.now() + Math.max(this.cacheMs, this.intervalMs), document });
        return document;
      } catch (error) {
        error = message(error);
        if (['ACCESS_BLOCKED', 'ROBOTS_DENIED', 'ROBOTS_UNAVAILABLE'].includes(error.code) && !this.blocked) {
          this.blocked = { until: error.code === 'ACCESS_BLOCKED' ? Infinity : error.code === 'ROBOTS_DENIED' ? this.robots?.expires || this.now() + 3600000 : this.now() + 300000, code: error.code, message: error.message };
        }
        // Failed parses and network failures also get a bounded cooldown. There is
        // no retry loop, alternate endpoint or fallback to an old match.
        // Reading an existing backoff must not extend it on every studio poll.
        if (!['COOLDOWN', 'BUSY'].includes(error.code) && !(this.blocked?.until > this.now())) this.nextAllowed = Math.max(this.nextAllowed, this.now() + 60000);
        throw error;
      }
    })();
    this.inflight.set(cacheKey, operation);
    try { return structuredClone(await operation); } finally { this.inflight.delete(cacheKey); }
  }
}
