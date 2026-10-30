import { normalizeScore, validateIds } from './score-data.mjs';
import { selectedReference } from './cricclubs-reference.mjs';

export const overlayUrl = ids => {
  const valid = validateIds(ids.clubId, ids.matchId);
  return `https://cricclubs.com/liveScoreOverlayData.do?clubId=${valid.clubId}&matchId=${valid.matchId}`;
};
export async function fetchPublicScore(ids, { fetchFn = fetch, signal } = {}) {
  const response = await fetchFn(overlayUrl(ids), { cache: 'no-store', credentials: 'omit', mode: 'cors', redirect: 'error', referrerPolicy: 'no-referrer', signal });
  if (!response.ok) throw new Error(`CricClubs returned HTTP ${response.status}. Connect the relay or ask your league for feed access.`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error('The browser could not read the score response.');
  const chunks = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > 2_000_000) { await reader.cancel(); throw new Error('CricClubs response exceeds 2 MB.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let at = 0;
  for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.byteLength; }
  let raw;
  try { raw = JSON.parse(new TextDecoder().decode(bytes).replace(/^\uFEFF/, '')); }
  catch { throw new Error('CricClubs returned a page instead of score JSON. Feed access may be restricted; no verification screen is bypassed.'); }
  return { score: normalizeScore(raw, ids), ids, error: null, pollSeconds: 5, transport: 'direct' };
}

// One read stream per studio. After relay connection the phone reads the same
// normalized snapshot used by the encoder; it stops polling CricClubs directly.
export function createFeed({ onUpdate, getRelay = () => null, visible = () => true, fetchFn = fetch, auto = true }) {
  let ids = null, generation = 0, pending = null, timer = null, binding = '', last = null;
  let stream = null, streamReady = false, streamRetryAt = 0;
  function schedule() {
    clearTimeout(timer);
    if (auto && ids && visible() && !streamReady) timer = setTimeout(() => { poll().catch(() => {}); }, 5000);
  }
  function closeStream() { const old = stream; stream = null; streamReady = false; old?.close(); }
  function cancel() { generation++; pending?.controller.abort(); pending = null; clearTimeout(timer); closeStream(); streamRetryAt = 0; }
  function accept(result, selected) {
    if (result.ids && (String(result.ids.clubId) !== selected.clubId || String(result.ids.matchId) !== selected.matchId) ||
      result.score && (String(result.score.clubId) !== selected.clubId || String(result.score.matchId) !== selected.matchId)) throw new Error('The feed returned a different match. Reload your selected Match ID.');
    if (Number.isSafeInteger(last?.revision) && Number.isSafeInteger(result.revision) && result.revision < last.revision) return last;
    last = result; onUpdate?.(result); return result;
  }
  function connectStream(relay, selected, gen) {
    if (!relay?.subscribe || stream || Date.now() < streamRetryAt || !visible()) return;
    const owner = { close() {} }; stream = owner;
    const current = () => gen === generation && stream === owner && getRelay()?.session === relay.session;
    const callbacks = {
      onSnapshot: value => {
        if (!current()) return;
        if (!visible()) { closeStream(); return; }
        accept({ ...value, transport: 'relay', delivery: 'push' }, selected);
        streamReady = true; clearTimeout(timer);
      },
      onFreshness: value => {
        if (!current() || !last?.score) return;
        if (!visible()) { closeStream(); return; }
        accept({ ...last, ids: value.ids, revision: value.revision, pollSeconds: value.pollSeconds, score: { ...last.score, fetchedAt: value.fetchedAt }, delivery: 'push' }, selected);
        streamReady = true; clearTimeout(timer);
      },
      onEnd: error => {
        if (!current()) return;
        stream = null; streamReady = false; streamRetryAt = Date.now() + 30000;
        if (error.status === 401) {
          last = { ...last, status: 401, error: error.message, score: last?.score ? { ...last.score, stale: true } : null }; onUpdate?.(last);
        }
        schedule();
      }
    };
    try { const connection = relay.subscribe(selected, callbacks); owner.close = () => connection.close(); }
    catch (error) { callbacks.onEnd(error); }
  }
  async function poll(force = false) {
    if (!ids) return null;
    if (pending) return pending.promise;
    if (!force && !visible()) { schedule(); return last; }
    const selected = { ...ids }, gen = generation, relay = getRelay();
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 12000);
    const operation = { controller, promise: null }; pending = operation;
    operation.promise = (async () => {
      try {
        let result;
        if (relay?.session) {
          const key = `${relay.session}:${selected.clubId}:${selected.matchId}:${selected.league || ''}`;
          result = binding === key ? await relay.request('/api/score')
            : await relay.request('/api/match', { method: 'POST', body: JSON.stringify(selected) });
          if (gen === generation) binding = key;
          result = { ...result, transport: 'relay', delivery: 'poll' };
        } else result = await fetchPublicScore(selected, { fetchFn, signal: controller.signal });
        if (gen !== generation || getRelay()?.session !== relay?.session) return null;
        accept(result, selected);
        if (relay?.session) connectStream(relay, selected, gen);
        return last;
      } catch (error) {
        if (gen !== generation) return null;
        const message = controller.signal.aborted ? 'Score request timed out. Keeping the last verified score.'
          : error.name === 'TypeError' ? 'CricClubs cannot be reached directly from this browser. Connect the cloud studio in Stream setup.' : error.message;
        last = { ...last, ids: selected, score: last?.score ? { ...last.score, stale: true, error: message } : null, error: message, status: error.status, pollSeconds: 5 };
        onUpdate?.(last); return last;
      } finally { clearTimeout(timeout); if (pending === operation) { pending = null; schedule(); } }
    })();
    return operation.promise;
  }
  return {
    get ids() { return ids; }, get snapshot() { return last; },
    select(value) { const next = selectedReference(value); cancel(); ids = next; binding = ''; last = null; onUpdate?.({ ids, score: null, error: null }); return poll(true); },
    changeSource() { cancel(); binding = ''; if (last?.score) last = { ...last, revision: undefined, score: { ...last.score, stale: true } }; return poll(true); },
    refresh() { return poll(true); },
    visibilityChanged() { if (!visible()) { cancel(); return Promise.resolve(last); } return poll(true); },
    pause() { cancel(); },
    stop() { cancel(); ids = null; last = null; binding = ''; }
  };
}
