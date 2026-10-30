// Browser-side CricClubs feed. Polls the public live score endpoint directly (CricClubs sends CORS
// headers for it), folds every snapshot into the shared match model, keeps a local history per match,
// and merges the GitHub Actions archive (data branch) so late joiners see the full innings.
import { SCHEMA, overlayUrl, parseSnapshot, applySnapshot, emptyModel, mergeModels } from './match-model.mjs';

const storeKey = ids => `boundary.match.${ids.clubId}-${ids.matchId}`;
const load = ids => { try { const m = JSON.parse(localStorage.getItem(storeKey(ids)) || 'null'); return m?.schema === SCHEMA ? m : null; } catch { return null; } };
const persist = model => { try { localStorage.setItem(storeKey(model), JSON.stringify(model)); } catch { /* storage full or disabled */ } };

/** GitHub Pages project URL -> raw archive URL on the data branch written by .github/workflows/match-archive.yml */
export function archiveBase(loc = globalThis.location) {
  const m = /^([a-z0-9-]+)\.github\.io$/i.exec(loc?.hostname || '');
  const repo = (loc?.pathname || '/').split('/').filter(Boolean)[0];
  return m && repo ? `https://raw.githubusercontent.com/${m[1]}/${repo}/data/matches` : '';
}

export function createFeed({ onUpdate, onStatus }) {
  const f = { ids: null, model: null, timer: null, archiveTimer: null, busy: false, seconds: 10, archive: '', lastOk: 0, error: '', archiveAt: 0, generation: 0 };
  const status = () => onStatus?.({ ok: Boolean(f.lastOk) && !f.error, error: f.error, lastOk: f.lastOk, archiveAt: f.archiveAt, seconds: f.seconds, ids: f.ids });
  async function poll() {
    if (!f.ids || f.busy) return;
    const gen = f.generation; f.busy = true;
    try {
      const r = await fetch(overlayUrl(f.ids), { cache: 'no-store', credentials: 'omit', mode: 'cors', redirect: 'error', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(12000) });
      if (!r.ok) throw new Error(`CricClubs responded ${r.status}.`);
      const text = await r.text();
      if (text.length > 2_000_000) throw new Error('CricClubs response was unexpectedly large.');
      let raw; try { raw = JSON.parse(text); } catch { throw new Error('CricClubs did not return score data (the feed may be temporarily blocked).'); }
      const snap = parseSnapshot(raw, f.ids);
      if (gen !== f.generation) return;
      applySnapshot(f.model, snap); persist(f.model);
      f.lastOk = Date.now(); f.error = '';
      onUpdate?.(f.model, snap);
    } catch (e) {
      if (gen !== f.generation) return;
      f.error = e.name === 'TimeoutError' ? 'CricClubs did not respond in time.' : e.name === 'TypeError' ? 'CricClubs is unreachable from this network.' : e.message;
    } finally { if (gen === f.generation) f.busy = false; status(); }
  }
  async function pullArchive() {
    if (!f.ids || !f.archive) return;
    const gen = f.generation;
    try {
      const r = await fetch(`${f.archive}/${f.ids.clubId}-${f.ids.matchId}.json?t=${Math.floor(Date.now() / 60000)}`, { cache: 'no-store', credentials: 'omit', redirect: 'follow', signal: AbortSignal.timeout(12000) });
      if (!r.ok) return;
      const archived = await r.json();
      if (gen !== f.generation || archived?.schema !== SCHEMA || archived.clubId !== f.ids.clubId || archived.matchId !== f.ids.matchId) return;
      f.model = mergeModels(f.model, archived); f.archiveAt = archived.updatedAt || Date.now(); persist(f.model);
      onUpdate?.(f.model, null); status();
    } catch { /* archive optional */ }
  }
  function schedule() {
    clearInterval(f.timer); clearInterval(f.archiveTimer);
    if (!f.ids) return;
    f.timer = setInterval(poll, f.seconds * 1000);
    f.archiveTimer = setInterval(pullArchive, 120000);
  }
  return {
    get model() { return f.model; }, get ids() { return f.ids; },
    start(ids, { archive = archiveBase() } = {}) {
      f.generation++; f.busy = false; f.ids = { clubId: String(ids.clubId), matchId: String(ids.matchId), league: ids.league || '' };
      f.archive = archive; f.lastOk = 0; f.error = ''; f.archiveAt = 0;
      f.model = load(f.ids) || emptyModel(f.ids); f.model.league = f.ids.league || f.model.league;
      if (f.model.polls) onUpdate?.(f.model, null);
      schedule(); poll(); pullArchive();
    },
    stop() { f.generation++; clearInterval(f.timer); clearInterval(f.archiveTimer); f.ids = null; },
    refresh: poll,
    setSeconds(s) { f.seconds = Math.max(5, Math.min(60, Number(s) || 10)); schedule(); },
    setArchive(url) { f.archive = url || ''; if (f.archive) pullArchive(); },
    clear() { if (!f.ids) return; try { localStorage.removeItem(storeKey(f.ids)); } catch {} f.model = emptyModel(f.ids); onUpdate?.(f.model, null); poll(); }
  };
}
