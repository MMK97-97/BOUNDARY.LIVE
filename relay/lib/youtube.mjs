import { createHash, randomBytes } from 'node:crypto';
import { destinationConfig } from './encoder.mjs';
import { cloudConfig } from './cloud.mjs';

export const YOUTUBE_SCOPE = 'https://www.googleapis.com/auth/youtube.force-ssl';
const API = 'https://www.googleapis.com/youtube/v3/';
const id = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const text = (v, max = 100) => String(v ?? '').replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, max);
const hash = value => createHash('sha256').update(value).digest('base64url');
const error = (message, status = 400, uncertain = false) => Object.assign(new Error(message), { status, uncertain });
const reasons = {
  liveStreamingNotEnabled: 'Enable live streaming for this YouTube channel first, then retry. YouTube may require channel verification and an activation wait.',
  livePermissionBlocked: 'YouTube has blocked live streaming for this channel. Check its channel eligibility in YouTube Studio.',
  insufficientLivePermissions: 'This Google account does not have the required live permissions for the channel.',
  insufficientPermissions: 'Grant the requested YouTube management permission when connecting the account.',
  quotaExceeded: 'The Google project has exhausted its YouTube API quota. Check quota in Google Cloud and try later.',
  userRequestsExceedRateLimit: 'YouTube has rate limited this account. Wait before trying again.',
  invalidTransition: 'YouTube cannot make that status change yet. Refresh the event and check its stream health.',
  redundantTransition: 'YouTube is already in that state. Refresh the event.',
  errorStreamInactive: 'YouTube is not receiving an active video stream. Start the camera upload and wait for stream status Active.',
  liveBroadcastNotFound: 'The broadcast is no longer available in this channel.',
  liveStreamNotFound: 'The YouTube ingestion stream is no longer available.',
  invalidScheduledStartTime: 'YouTube rejected the scheduled time. Choose a current or future start time.',
  invalidTitle: 'YouTube rejected the title. Use 1–100 characters without angle brackets.',
  accessNotConfigured: 'Enable YouTube Data API v3 in the Google Cloud project that owns this OAuth client, then reconnect YouTube.',
  youtubeSignupRequired: 'Create a YouTube channel for this Google account first, then connect that channel.',
  authError: 'Google authorization expired or was revoked. Stop the upload and reconnect YouTube.',
  forbidden: 'YouTube denied this operation. Check channel permissions, live eligibility and the Google project’s API access.'
};
export function youtubeConfig(env = {}) {
  const clientId = typeof env.GOOGLE_CLIENT_ID === 'string' ? env.GOOGLE_CLIENT_ID.trim() : '',
    clientSecret = typeof env.GOOGLE_CLIENT_SECRET === 'string' ? env.GOOGLE_CLIENT_SECRET.trim() : '';
  try {
    const publicOrigin = cloudConfig(env).publicOrigin;
    const redirect = (typeof env.YOUTUBE_REDIRECT_URI === 'string' ? env.YOUTUBE_REDIRECT_URI.trim() : '') ||
      (publicOrigin ? publicOrigin + '/youtube-callback.html' : '');
    if (!redirect) return { configured: false, error: 'Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and the exact YOUTUBE_REDIRECT_URI to your cloud service. See docs/YOUTUBE.md.' };
    const u = new URL(redirect);
    if (u.username || u.password || u.search || u.hash || !u.pathname.endsWith('/youtube-callback.html') ||
      !(u.protocol === 'https:' || u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname))) throw new Error();
    const callbackMode = u.pathname === '/youtube-callback.html' &&
      (u.origin === publicOrigin || u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname)) ? 'server' : 'browser';
    const callback = { redirectUri: u.href, origin: u.origin, callbackMode };
    if (!/^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId) || !clientSecret || clientSecret.length > 512 || /[\x00-\x1f\x7f]/.test(clientSecret)) {
      return { ...callback, configured: false, error: 'Add a valid Google Web application client ID and client secret to your cloud service, enable YouTube Data API v3, and register the callback shown below in Google Cloud.' };
    }
    return { ...callback, configured: true, clientId, clientSecret };
  } catch { return { configured: false, error: 'Google OAuth configuration is incomplete or invalid. Use a Web application client and the exact HTTPS website /youtube-callback.html URI. See docs/YOUTUBE.md.' }; }
}
export function broadcastDetails(value, now = Date.now()) {
  const title = String(value.title || '').trim(), description = String(value.description || '').trim();
  if (!title || title.length > 100 || /[<>\x00-\x1f\x7f]/.test(title)) throw error('Enter a YouTube title of 1–100 characters without angle brackets.');
  if (description.length > 2000 || /[<>\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(description)) throw error('Description must be at most 2,000 characters without angle brackets.');
  if (!['private', 'unlisted', 'public'].includes(value.privacy)) throw error('Choose Private, Unlisted or Public.');
  if (typeof value.madeForKids !== 'boolean') throw error('Choose whether this broadcast is made for kids.');
  const at = Date.parse(value.scheduledStartTime);
  if (!Number.isFinite(at) || at < now - 5 * 60000 || at > now + 366 * 86400000) throw error('Choose a scheduled start time within the next year.');
  return { title, description, privacy: value.privacy, madeForKids: value.madeForKids, scheduledStartTime: new Date(at).toISOString() };
}

/** Grants stay private; a saved studio may checkpoint them to its encrypted vault. */
export class YouTubeService {
  constructor({ env = {}, fetchFn = fetch, now = Date.now, validSession = () => true, validFlow, saveConnection = async () => {} } = {}) {
    this.config = youtubeConfig(env); this.fetch = fetchFn; this.now = now; this.validSession = validSession;
    this.validFlow = validFlow || validSession; this.saveConnection = saveConnection;
    this.flows = new Map(); this.connections = new Map(); this.completing = new Map(); this.authorizations = new Map();
  }
  prune() {
    for (const [key, flow] of this.flows) if (flow.expires <= this.now() || !this.validSession(flow.owner, flow.origin) || !this.validFlow(flow.binding || flow.owner, flow.origin)) this.flows.delete(key);
    for (const [owner, c] of this.connections) if (!this.validSession(owner, c.origin)) this.forget(owner);
    for (const [owner, result] of this.authorizations) if (result.expires <= this.now() || !this.validSession(owner, result.origin)) this.authorizations.delete(owner);
  }
  authorizing(owner) { return this.completing.has(owner) || [...this.flows.values()].some(f => f.owner === owner); }
  cancelAuth(owner) {
    if (this.completing.has(owner)) this.completing.get(owner).cancelled = true;
    this.completing.delete(owner);
    for (const [key, flow] of this.flows) if (flow.owner === owner) this.flows.delete(key);
    this.authorizations.delete(owner);
    return this.status(owner);
  }
  start(owner, origin, binding = owner) {
    this.prune();
    if (this.connections.get(owner)?.busy) throw error('Wait for the current YouTube operation to finish.', 409);
    if (!this.config.configured) throw error(this.config.error, 409);
    if (origin !== this.config.origin) throw error('The YouTube callback origin does not match this studio. In Render set YOUTUBE_REDIRECT_URI to this studio’s exact /youtube-callback.html URL and register the same URL in Google Cloud.', 409);
    if (!this.validSession(owner, origin)) throw error('Reconnect the relay before signing in.', 401);
    for (const [key, f] of this.flows) if (f.owner === owner) this.flows.delete(key);
    if (this.completing.has(owner)) this.completing.get(owner).cancelled = true;
    if (this.flows.size >= 24) throw error('Too many pending Google sign-ins. Try again later.', 429);
    const state = randomBytes(32).toString('base64url'), verifier = randomBytes(48).toString('base64url');
    if (!this.validFlow(binding, origin)) throw error('Reconnect this device before Google sign-in.', 401);
    this.flows.set(state, { owner, origin, binding, verifier, expires: this.now() + 5 * 60000 });
    this.authorizations.set(owner, { state, origin, status: 'pending', expires: this.now() + 5 * 60000 });
    const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    u.search = new URLSearchParams({ client_id: this.config.clientId, redirect_uri: this.config.redirectUri, response_type: 'code',
      scope: YOUTUBE_SCOPE, access_type: 'offline', prompt: 'consent select_account', state,
      code_challenge: hash(verifier), code_challenge_method: 'S256' }).toString();
    return { authorizationUrl: u.href, state, expiresIn: 300, callbackMode: this.config.callbackMode };
  }
  async callback(value) {
    this.prune();
    const flow = this.flows.get(value?.state);
    if (this.config.callbackMode !== 'server' || !flow) throw error('Google sign-in state expired. Return to MK97 and connect again.', 401);
    return this.complete(flow.owner, flow.origin, value);
  }
  async bounded(url, options, mutation = false) {
    let r;
    try { r = await this.fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(12000) }); }
    catch { throw error(mutation ? 'The Google request could not be confirmed. It may have succeeded. Check YouTube Studio before creating another setup.' : 'Google could not be reached. Check the relay connection and try again.', 502, mutation); }
    let raw;
    try {
      const reader = r.body.getReader(), chunks = []; let size = 0;
      while (true) { const v = await reader.read(); if (v.done) break; size += v.value.length; if (size > 1_000_000) { await reader.cancel(); throw new Error(); } chunks.push(Buffer.from(v.value)); }
      raw = JSON.parse(Buffer.concat(chunks).toString());
    } catch { throw error('Google returned an unsupported response. Check YouTube Studio before retrying a setup.', 502, mutation); }
    return { response: r, data: raw };
  }
  async token(fields) {
    const { response, data } = await this.bounded('https://oauth2.googleapis.com/token', { method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: this.config.clientId,
        client_secret: this.config.clientSecret, ...fields }).toString() });
    if (!response.ok || typeof data.access_token !== 'string' || !data.access_token || data.access_token.length > 8192) throw error(data.error === 'invalid_client' ?
      'Google rejected the OAuth client ID or secret. Check both values in Render’s private Environment settings and redeploy.' :
      'Google authorization expired or was rejected. Check the OAuth client configuration and connect YouTube again.', 401);
    return data;
  }
  async complete(owner, origin, value) {
    const flow = this.flows.get(value.state);
    if (!flow || flow.owner !== owner || flow.origin !== origin || flow.expires <= this.now() || !this.validSession(owner, origin) || !this.validFlow(flow.binding || owner, origin)) throw error('Google sign-in state expired or does not belong to this session. Start sign-in again.', 401);
    this.flows.delete(value.state); // one use, including rejected/failed exchanges
    this.completing.set(owner, flow);
    const authorization = this.authorizations.get(owner);
    if (authorization?.state === value.state) authorization.status = 'exchanging';
    try {
    if (value.error) throw error('Google sign-in was cancelled or the requested YouTube permission was not granted.');
    if (typeof value.code !== 'string' || !value.code || value.code.length > 4096) throw error('Google did not return a valid authorization code.');
    const t = await this.token({ code: value.code, code_verifier: flow.verifier, redirect_uri: this.config.redirectUri, grant_type: 'authorization_code' });
    const granted = String(t.scope || '').split(' ');
    if (!granted.includes(YOUTUBE_SCOPE) && !granted.includes('https://www.googleapis.com/auth/youtube')) throw error('The required YouTube management permission was not granted.', 403);
    const c = { owner, origin, accessToken: t.access_token, refreshToken: typeof t.refresh_token === 'string' && t.refresh_token.length < 8192 ? t.refresh_token : null,
      expires: this.now() + Math.max(60, Math.min(86400, Number(t.expires_in) || 3600)) * 1000, created: this.now(), lastRefresh: 0 };
    const channels = await this.request(c, 'channels', { part: 'id,snippet', mine: 'true', maxResults: '2' });
    if (channels.items?.length !== 1 || !id(channels.items[0].id)) throw error('Choose a Google/Brand Account with exactly one YouTube channel. Create or select that channel in YouTube first.', 409);
    c.channel = { id: channels.items[0].id, title: text(channels.items[0].snippet?.title) };
    if (!this.validSession(owner, origin) || !this.validFlow(flow.binding || owner, origin)) throw error('Relay session ended during Google sign-in. Reconnect.', 401);
    // A newer authorization request or disconnect invalidates this in-flight callback.
    if (flow.cancelled) throw error('Google sign-in was cancelled.', 401);
    const stillAuthorized = () => !flow.cancelled && this.validSession(owner, origin) && this.validFlow(flow.binding || owner, origin);
    // Do not expose a connected account until its private grant is committed.
    // The durable adapter rechecks authorization when its write queue runs.
    await this.saveConnection(owner, this.exportPrivate(owner, c), stillAuthorized);
    if (!stillAuthorized()) throw error('Relay session ended during Google sign-in. Reconnect.', 401);
    this.connections.set(owner, c);
    if (this.authorizations.get(owner) === authorization) { authorization.status = 'connected'; authorization.error = null; }
    if (this.completing.get(owner) === flow) this.completing.delete(owner); return this.status(owner);
    } catch (e) {
      if (this.authorizations.get(owner) === authorization && !flow.cancelled && this.validSession(owner, origin)) { authorization.status = 'failed'; authorization.error = e.message; }
      throw e;
    } finally { if (this.completing.get(owner) === flow) this.completing.delete(owner); }
  }
  async access(c) {
    if (this.now() < c.expires - 60000) return c.accessToken;
    if (!c.refreshToken) throw error('Google authorization needs refreshing. Connect YouTube again.', 401);
    if (!c.refreshingToken) c.refreshingToken = this.token({ refresh_token: c.refreshToken, grant_type: 'refresh_token' }).then(async t => {
      c.accessToken = t.access_token; c.expires = this.now() + Math.max(60, Math.min(86400, Number(t.expires_in) || 3600)) * 1000;
      if (typeof t.refresh_token === 'string' && t.refresh_token.length < 8192) c.refreshToken = t.refresh_token;
      if (c.owner && this.connections.get(c.owner) === c) await this.persist(c.owner);
      return c.accessToken;
    }).finally(() => { c.refreshingToken = null; });
    return c.refreshingToken;
  }
  async request(c, resource, params = {}, method = 'GET', payload, retry = true) {
    const access = await this.access(c), u = new URL(resource, API); u.search = new URLSearchParams(params).toString();
    const { response, data } = await this.bounded(u, { method, headers: { Authorization: `Bearer ${access}`, ...(payload ? { 'Content-Type': 'application/json' } : {}) }, ...(payload ? { body: JSON.stringify(payload) } : {}) }, method !== 'GET');
    if (response.status === 401 && retry && c.refreshToken) { c.expires = 0; return this.request(c, resource, params, method, payload, false); }
    if (!response.ok) {
      const reason = data.error?.errors?.[0]?.reason;
      throw error(reasons[reason] || `YouTube rejected the request (HTTP ${response.status}). Check the channel, API access and event in YouTube Studio.`, response.status === 401 ? 401 : 502, method !== 'GET' && response.status >= 500);
    }
    return data;
  }
  connection(owner) { if (this.authorizing(owner)) throw error('Finish or cancel Google sign-in before changing the YouTube event.', 409); const c = this.connections.get(owner); if (!c) throw error('Connect your YouTube account first.', 409); return c; }
  checkCurrent(owner, c) { if (this.connections.get(owner) !== c || !this.validSession(owner, c.origin)) throw error('YouTube connection changed or the session ended.', 401); }
  status(owner) {
    const c = this.connections.get(owner), op = c?.operation, b = c?.broadcast, authorization = this.authorizations.get(owner);
    return { configured: this.config.configured, configurationError: this.config.error || null, connected: Boolean(c), channel: c?.channel || null,
      redirectUri: this.config.redirectUri || null, callbackMode: this.config.callbackMode || null,
      authorization: authorization ? { state: authorization.state, status: authorization.status, error: authorization.error || null } : null,
      busy: Boolean(c?.busy), authorizing: this.authorizing(owner), error: authorization?.error || c?.error || null,
      setup: op ? { requestId: op.requestId, stage: op.stage, uncertain: Boolean(op.uncertain), details: op.details } : null,
      broadcast: b ? { id: b.id, title: b.title, privacy: b.privacy, scheduledStartTime: b.scheduledStartTime, state: b.state,
        streamStatus: b.streamStatus || 'ready', health: b.health || 'noData', issues: b.issues || [], keyReady: Boolean(c.ready && !c.authError && !c.needsVerification && !['complete', 'revoked'].includes(b.state)),
        watchUrl: `https://www.youtube.com/watch?v=${b.id}`, studioUrl: `https://studio.youtube.com/video/${b.id}/livestreaming` } : null };
  }
  destination(owner) {
    if (this.authorizing(owner)) return { id: 'youtube', configured: false, url: null, error: 'Finish or cancel Google sign-in before starting a YouTube upload.' };
    const c = this.connections.get(owner);
    return c ? c.ready && !c.authError && !c.needsVerification && c.broadcast && !['complete', 'revoked'].includes(c.broadcast.state) ? c.destination : { id: 'youtube', configured: false, url: null, error: c.needsVerification ? 'Checking the saved YouTube event before upload. Refresh status.' : 'Create a YouTube live setup for the connected account before starting.' } : null;
  }
  async prepare(owner, value) {
    const c = this.connection(owner); if (c.busy) throw error('A YouTube operation is already running.', 409);
    if (!/^[A-Za-z0-9_-]{16,80}$/.test(value.requestId || '')) throw error('A setup request ID is required.');
    const details = broadcastDetails(value, c.operation?.createdAt ?? this.now()), fingerprint = hash(JSON.stringify(details));
    if (c.operation && (c.operation.requestId !== value.requestId || c.operation.fingerprint !== fingerprint)) throw error('A setup already exists. Use New setup before changing these details.', 409);
    if (c.operation?.uncertain) throw error('A previous Google write could not be confirmed. Review YouTube Studio before choosing New setup.', 409);
    if (c.ready) return this.status(owner);
    const op = c.operation ||= { requestId: value.requestId, fingerprint, details, createdAt: this.now(), stage: 'stream' }; c.busy = true; c.error = null;
    try {
      if (!op.stream) {
        op.stage = 'stream'; op.uncertain = true; await this.persist(owner);
        const stream = await this.request(c, 'liveStreams', { part: 'id,snippet,cdn,contentDetails,status' }, 'POST', {
          snippet: { title: details.title }, cdn: { ingestionType: 'rtmp', resolution: 'variable', frameRate: 'variable' }, contentDetails: { isReusable: false } });
        this.checkCurrent(owner, c); if (!id(stream.id)) throw error('YouTube returned an invalid stream ID.', 502, true);
        op.stream = stream; op.uncertain = false; await this.persist(owner);
      }
      if (!op.destination) {
        op.stage = 'endpoint';
        const destination = stream => destinationConfig({ YOUTUBE_SERVER: stream.cdn?.ingestionInfo?.rtmpsIngestionAddress,
          YOUTUBE_KEY: stream.cdn?.ingestionInfo?.streamName }).youtube;
        let d = destination(op.stream);
        if (!d.configured) {
          const streams = await this.request(c, 'liveStreams', { part: 'id,cdn,status', id: op.stream.id });
          this.checkCurrent(owner, c);
          const stream = streams.items?.find(s => s.id === op.stream.id);
          if (stream) { op.stream = stream; d = destination(stream); }
        }
        if (!d.configured) throw error('YouTube has not supplied a valid RTMPS endpoint. Retry setup to read this stream again, or inspect it in YouTube Studio. No unencrypted connection will be used.', 409);
        op.destination = d;
      }
      if (!op.broadcast) {
        op.stage = 'broadcast'; op.uncertain = true; await this.persist(owner);
        const b = await this.request(c, 'liveBroadcasts', { part: 'id,snippet,status,contentDetails' }, 'POST', {
          snippet: { title: details.title, description: details.description, scheduledStartTime: details.scheduledStartTime },
          status: { privacyStatus: details.privacy, selfDeclaredMadeForKids: details.madeForKids },
          contentDetails: { enableAutoStart: false, enableAutoStop: false, enableDvr: true, enableEmbed: false, recordFromStart: true,
            monitorStream: { enableMonitorStream: true, broadcastStreamDelayMs: 0 } } });
        this.checkCurrent(owner, c); if (!id(b.id)) throw error('YouTube returned an invalid broadcast ID.', 502, true); op.broadcast = b; op.uncertain = false; await this.persist(owner);
      }
      op.stage = 'binding'; op.uncertain = true; await this.persist(owner);
      const b = await this.request(c, 'liveBroadcasts/bind', { part: 'id,snippet,status,contentDetails', id: op.broadcast.id, streamId: op.stream.id }, 'POST');
      this.checkCurrent(owner, c);
      if (b.id !== op.broadcast.id || b.contentDetails?.boundStreamId !== op.stream.id) throw error('YouTube did not confirm the event-to-stream binding. Review Studio before retrying.', 502, true);
      c.destination = op.destination; c.ready = true; c.authError = false; c.needsVerification = false; c.broadcast = this.publicBroadcast(b, op.stream, details); op.stage = 'ready'; op.uncertain = false; c.lastRefresh = this.now();
      await this.persist(owner);
      c.busy = false;
      return this.status(owner);
    } catch (e) { op.uncertain = Boolean(e.uncertain); c.error = e.message; try { await this.persist(owner); } catch {} throw e; }
    finally { c.busy = false; }
  }
  publicBroadcast(b, stream, fallback) {
    return { id: b.id, title: text(b.snippet?.title || fallback.title), privacy: ['private', 'unlisted', 'public'].includes(b.status?.privacyStatus) ? b.status.privacyStatus : fallback.privacy,
      scheduledStartTime: b.snippet?.scheduledStartTime || fallback.scheduledStartTime, state: text(b.status?.lifeCycleStatus || 'ready', 32),
      streamStatus: text(stream.status?.streamStatus || 'ready', 32), health: text(stream.status?.healthStatus?.status || 'noData', 32),
      issues: (stream.status?.healthStatus?.configurationIssues || []).slice(0, 10).map(i => text(i.type, 80)).filter(v => /^[A-Za-z0-9]+$/.test(v)) };
  }
  async refresh(owner, force = false, ownsOperation = false) {
    const c = this.connections.get(owner); if (!c?.ready || c.busy && !ownsOperation || !force && this.now() - c.lastRefresh < 15000) return this.status(owner);
    const op = c.operation;
    if (!c.refreshing) c.refreshing = (async () => {
      try {
        const [broadcasts, streams] = await Promise.all([
          this.request(c, 'liveBroadcasts', { part: 'id,snippet,status,contentDetails', id: op.broadcast.id }),
          this.request(c, 'liveStreams', { part: 'id,status', id: op.stream.id })]);
        this.checkCurrent(owner, c); const b = broadcasts.items?.[0], s = streams.items?.[0];
        if (c.operation !== op) return this.status(owner);
        if (b?.id !== op.broadcast.id || s?.id !== op.stream.id || b.contentDetails?.boundStreamId !== s.id) { c.ready = false; throw error('The YouTube event or its binding changed. Review Studio and create a new setup.', 409); }
        const previous = JSON.stringify(c.broadcast);
        c.broadcast = this.publicBroadcast(b, s, op.details); c.error = null; c.authError = false; c.needsVerification = false;
        if (JSON.stringify(c.broadcast) !== previous) await this.persist(owner);
      } catch (e) { c.error = e.message; if (e.status === 401) c.authError = true; throw e; }
      finally { c.lastRefresh = this.now(); c.refreshing = null; }
      return this.status(owner);
    })();
    return c.refreshing;
  }
  async transition(owner, target) {
    if (!['testing', 'live', 'complete'].includes(target)) throw error('Unsupported YouTube broadcast state.');
    const c = this.connection(owner); if (!c.ready || c.busy) throw error('Finish creating the YouTube setup first.', 409);
    c.busy = true;
    try {
      await this.refresh(owner, true, true); this.checkCurrent(owner, c);
      if (!c.ready) throw error('The YouTube event is no longer ready. Review it in Studio.', 409);
      if (c.broadcast.state === target || target === 'testing' && c.broadcast.state === 'testStarting' || target === 'live' && c.broadcast.state === 'liveStarting') { c.busy = false; return this.status(owner); }
      if (target !== 'complete' && c.broadcast.streamStatus !== 'active') throw error(reasons.errorStreamInactive, 409);
      if (target === 'testing' && !['created', 'ready'].includes(c.broadcast.state) || target === 'live' && !['ready', 'testing'].includes(c.broadcast.state)) throw error('Wait for the current YouTube state change to finish, then refresh the event.', 409);
      if (target === 'complete' && !['testing', 'live', 'testStarting', 'liveStarting'].includes(c.broadcast.state)) throw error('This YouTube event is not testing or live. Review it in Studio.', 409);
      const b = await this.request(c, 'liveBroadcasts/transition', { part: 'id,snippet,status,contentDetails', id: c.broadcast.id, broadcastStatus: target }, 'POST');
      this.checkCurrent(owner, c); if (b.id !== c.broadcast.id) throw error('YouTube did not confirm the status change. Refresh the event.', 502);
      c.broadcast.state = text(b.status?.lifeCycleStatus || target, 32); c.lastRefresh = 0; c.error = null;
      await this.persist(owner); c.busy = false; return this.status(owner);
    } catch (e) { c.error = e.message; throw e; } finally { c.busy = false; }
  }
  resetSetup(owner) {
    const c = this.connection(owner); if (c.busy || c.refreshing) throw error('Wait for the current YouTube operation to finish.', 409);
    if (['testing', 'live', 'testStarting', 'liveStarting'].includes(c.broadcast?.state)) throw error('End the current YouTube broadcast before starting another setup.', 409);
    c.operation = null; c.broadcast = null; c.destination = null; c.ready = false; c.error = null; return this.status(owner);
  }
  forget(owner) {
    this.connections.delete(owner);
    this.cancelAuth(owner);
  }
  forgetBinding(binding) {
    for (const [owner, flow] of this.completing) if ((flow.binding || flow.owner) === binding) { flow.cancelled = true; this.completing.delete(owner); this.authorizations.delete(owner); }
    for (const [state, flow] of this.flows) if ((flow.binding || flow.owner) === binding) { this.flows.delete(state); this.authorizations.delete(flow.owner); }
  }
  exportPrivate(owner, c = this.connections.get(owner)) {
    if (!c) return null;
    const op = c.operation;
    const operation = op ? { requestId: op.requestId, fingerprint: op.fingerprint, details: op.details, createdAt: op.createdAt,
      stage: op.stage, uncertain: Boolean(op.uncertain), ...(op.stream ? { stream: { id: op.stream.id, cdn: { ingestionInfo: {
        rtmpsIngestionAddress: op.stream.cdn?.ingestionInfo?.rtmpsIngestionAddress, streamName: op.stream.cdn?.ingestionInfo?.streamName } }, status: op.stream.status } } : {}),
      ...(op.broadcast ? { broadcast: { id: op.broadcast.id } } : {}), ...(op.destination ? { destination: op.destination } : {}) } : null;
    return structuredClone({ schema: 1, clientId: this.config.clientId, origin: c.origin, accessToken: c.accessToken, refreshToken: c.refreshToken,
      expires: c.expires, created: c.created, channel: c.channel, operation, broadcast: c.broadcast, ready: Boolean(c.ready) });
  }
  async persist(owner) { await this.saveConnection(owner, this.exportPrivate(owner)); }
  restorePrivate(owner, value) {
    if (!value) return false;
    if (!this.config.configured || value.schema !== 1 || value.clientId !== this.config.clientId || value.origin !== this.config.origin) return false;
    if (!id(value.channel?.id) || typeof value.accessToken !== 'string' || value.accessToken.length > 8192 || !Number.isFinite(value.expires)) throw error('Saved YouTube connection is invalid. Connect the account again.', 409);
    const c = { owner, origin: value.origin, accessToken: value.accessToken, refreshToken: typeof value.refreshToken === 'string' && value.refreshToken.length < 8192 ? value.refreshToken : null,
      expires: value.expires, created: value.created, channel: { id: value.channel.id, title: text(value.channel.title) }, lastRefresh: 0, ready: false };
    if (value.operation) {
      const op = value.operation;
      if (!/^[A-Za-z0-9_-]{16,80}$/.test(op.requestId || '') || !Number.isFinite(op.createdAt)) throw error('Saved YouTube setup is invalid. Review it in YouTube Studio.', 409);
      const details = broadcastDetails(op.details, op.createdAt);
      if (op.fingerprint !== hash(JSON.stringify(details)) || op.stream && !id(op.stream.id) || op.broadcast && !id(op.broadcast.id)) throw error('Saved YouTube setup does not match its confirmed resources.', 409);
      c.operation = structuredClone(op); c.operation.details = details;
      const ingestion = op.stream?.cdn?.ingestionInfo, d = destinationConfig({ YOUTUBE_SERVER: ingestion?.rtmpsIngestionAddress, YOUTUBE_KEY: ingestion?.streamName }).youtube;
      if (d.configured) { c.operation.destination = d; c.destination = d; }
      if (value.broadcast && value.broadcast.id === op.broadcast?.id && d.configured && value.ready) {
        c.broadcast = { ...value.broadcast, title: text(value.broadcast.title), issues: [] }; c.ready = true; c.needsVerification = true;
      }
    }
    this.connections.set(owner, c); return true;
  }
  async disconnect(owner) {
    const c = this.connections.get(owner); if (c?.busy) throw error('Wait for the current YouTube operation to finish before disconnecting.', 409);
    await this.saveConnection(owner, null); this.forget(owner);
    if (!c) return { revoked: true };
    try {
      const r = await this.fetch('https://oauth2.googleapis.com/revoke', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: c.refreshToken || c.accessToken }).toString() });
      return { revoked: r.ok };
    } catch { return { revoked: false }; }
  }
}
