import { relayOrigin } from './core.mjs';
import { validateIds, clean } from './score-data.mjs';

// Fetch carries the session in a header. Native EventSource cannot do this;
// bearer tokens must never be added to a URL or persisted in browser storage.
export function subscribeRelayScores({ relay, session, ids, origin, onSnapshot, onFreshness, onEnd, fetchFn = fetch }) {
  ids = validateIds(ids.clubId, ids.matchId);
  const url = new URL('/api/score/stream', relayOrigin(relay));
  url.searchParams.set('clubId', ids.clubId); url.searchParams.set('matchId', ids.matchId);
  const controller = new AbortController(); let closed = false, reader, idle;
  const connect = setTimeout(() => controller.abort(), 12000);
  const touch = () => { clearTimeout(idle); idle = setTimeout(() => controller.abort(), 35000); };
  const sameIds = value => value && String(value.clubId) === ids.clubId && String(value.matchId) === ids.matchId;
  function event(block) {
    let name = 'message'; const data = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('event:')) name = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
    }
    if (!data.length) return;
    const value = JSON.parse(data.join('\n'));
    if (name === 'end') { const error = new Error(clean(value.error, 180) || 'Score connection closed.'); error.status = value.code === 'AUTH_EXPIRED' ? 401 : 409; throw error; }
    if (!['score', 'freshness'].includes(name)) return;
    if (!sameIds(value.ids) || value.score && !sameIds(value.score)) throw new Error('Live score connection returned a different match.');
    if (!Number.isSafeInteger(value.revision) || value.revision < 0) throw new Error('Invalid live score revision.');
    if (name === 'score') onSnapshot?.(value);
    else if (Number.isFinite(value.fetchedAt)) onFreshness?.(value);
  }
  const done = (async () => {
    try {
      const response = await fetchFn(url.href, { method: 'GET', cache: 'no-store', credentials: 'omit', redirect: 'error', signal: controller.signal,
        headers: { Accept: 'text/event-stream', Authorization: `Bearer ${session}`, 'X-MK97-Origin': origin } });
      clearTimeout(connect);
      if (!response.ok) { await response.body?.cancel(); const error = new Error('Live score link unavailable; using score refresh.'); error.status = response.status; throw error; }
      if (!response.headers.get('content-type')?.toLowerCase().startsWith('text/event-stream') || !response.body) {
        await response.body?.cancel(); throw new Error('Relay did not return a live score connection.');
      }
      reader = response.body.getReader(); const decoder = new TextDecoder();
      let lineParts = [], lineSize = 0, blockLines = [], blockSize = 0;
      touch();
      while (!closed) {
        const { done, value } = await reader.read();
        if (done) throw new Error('Live score link closed; using score refresh.');
        touch(); const lines = decoder.decode(value, { stream: true }).split('\n');
        for (let i = 0; i < lines.length; i++) {
          lineParts.push(lines[i]); lineSize += lines[i].length;
          if (lineSize + blockSize > 524288) throw new Error('Live score message exceeds the size limit.');
          if (i === lines.length - 1) continue;
          const line = lineParts.join('').replace(/\r$/, ''); lineParts = []; lineSize = 0;
          if (!line) {
            const block = blockLines.join('\n'); blockLines = []; blockSize = 0;
            if (closed) break; event(block);
          } else { blockLines.push(line); blockSize += line.length + 1; }
        }
      }
    } catch (error) { if (!closed) onEnd?.(error); }
    finally { clearTimeout(connect); clearTimeout(idle); try { await reader?.cancel(); } catch {} }
  })();
  return { done, close() { closed = true; controller.abort(); clearTimeout(connect); clearTimeout(idle); reader?.cancel().catch(() => {}); } };
}
