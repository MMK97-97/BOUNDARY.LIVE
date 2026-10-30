export const testGoogleEnv = { GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'test-client-secret-not-real', YOUTUBE_REDIRECT_URI: 'https://example.github.io/youtube-callback.html' };
export function youtubeProvider() {
  const log = [], control = { streamStatus: 'active', broadcastState: 'ready', failResource: '', failStatus: 403, failReason: 'liveStreamingNotEnabled', timeoutResource: '', binding: 'stream_test', refreshes: 0 };
  const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
  const broadcast = () => ({ id: 'event_test', snippet: { title: 'Cricket test', scheduledStartTime: '2026-10-29T20:00:00.000Z' }, status: { lifeCycleStatus: control.broadcastState, privacyStatus: 'unlisted' }, contentDetails: { boundStreamId: control.binding } });
  const fetchFn = async (url, options = {}) => {
    const u = new URL(url), resource = u.pathname.split('/').slice(3).join('/'), method = options.method || 'GET'; log.push({ url: u.href, ...options });
    if (u.hostname === 'oauth2.googleapis.com') {
      if (u.pathname === '/revoke') return new Response('', { status: 200 });
      const p = new URLSearchParams(options.body); if (p.get('grant_type') === 'refresh_token') control.refreshes++;
      return json({ access_token: 'private-access-token', refresh_token: 'private-refresh-token', expires_in: 3600, scope: 'https://www.googleapis.com/auth/youtube.force-ssl' });
    }
    if (control.timeoutResource === resource && method === 'POST') throw new Error('simulated network loss');
    if (control.failResource === resource) return json({ error: { message: 'SECRET MUST NOT BE ECHOED', errors: [{ reason: control.failReason }] } }, control.failStatus);
    if (resource === 'channels') return json({ items: [{ id: 'channel_test', snippet: { title: 'Test cricket channel' } }] });
    if (resource === 'liveStreams') {
      const s = { id: 'stream_test', cdn: { ingestionInfo: { rtmpsIngestionAddress: 'rtmps://a.rtmps.youtube.com/live2', streamName: 'private-api-stream-key' } }, status: { streamStatus: control.streamStatus, healthStatus: { status: 'good' } } };
      return json(method === 'POST' ? s : { items: [s] });
    }
    if (resource === 'liveBroadcasts/transition') control.broadcastState = u.searchParams.get('broadcastStatus');
    if (resource.startsWith('liveBroadcasts')) return json(method === 'POST' ? broadcast() : { items: [broadcast()] });
    throw new Error('Unexpected mock request: ' + u.pathname);
  };
  return { fetchFn, log, control };
}
