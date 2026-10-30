// Browser-side CricClubs feed & scraper engine.
// Multi-tier scraper fetches live match data from CricClubs:
// Tier 1: Real-time CORS proxy (allorigins) for live updates in browsers
// Tier 2: Same-origin match archive (./data/matches/<clubId>-<matchId>.json)
// Tier 3: GitHub repository raw fallback on main branch
// Tier 4: Direct CricClubs liveScoreOverlayData.do (when CORS is permitted)
import { SCHEMA, overlayUrl, parseSnapshot, applySnapshot, emptyModel, mergeModels } from './match-model.mjs';

const storeKey = ids => `boundary.match.${ids.clubId}-${ids.matchId}`;
const load = ids => { try { const m = JSON.parse(localStorage.getItem(storeKey(ids)) || 'null'); return m?.schema === SCHEMA ? m : null; } catch { return null; } };
const persist = model => { try { localStorage.setItem(storeKey(model), JSON.stringify(model)); } catch { /* storage full or disabled */ } };

/** Base URL for local or hosted match archives */
export function archiveBase(loc = globalThis.location) {
  // Same-origin relative path works directly on GitHub Pages and local servers
  return './data/matches';
}

/** Remote fallback archive on main branch */
export function remoteArchiveBase(loc = globalThis.location) {
  const m = /^([a-z0-9-]+)\.github\.io$/i.exec(loc?.hostname || '');
  const repo = (loc?.pathname || '/').split('/').filter(Boolean)[0] || 'BOUNDARY.LIVE';
  const owner = m ? m[1] : 'MMK97-97';
  return `https://raw.githubusercontent.com/${owner}/${repo}/main/web/data/matches`;
}

/** Multi-tier scraper to reliably get CricClubs match data */
export async function scrapeCricClubsData(ids) {
  const cricUrl = overlayUrl(ids);
  let lastError = null;

  // 1. Try real-time CORS proxy (AllOrigins) for live match data
  try {
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(cricUrl)}`;
    const r = await fetch(proxyUrl, {
      cache: 'no-store',
      credentials: 'omit',
      signal: AbortSignal.timeout(9000)
    });
    if (r.ok) {
      const text = await r.text();
      if (text && text.length < 2_000_000) {
        const raw = JSON.parse(text);
        if (raw?.values && Object.keys(raw.values).length) {
          return { type: 'snapshot', snap: parseSnapshot(raw, ids) };
        }
      }
    }
  } catch (e) {
    lastError = e;
  }

  // 2. Try direct fetch (works if CricClubs sends CORS or in native webviews)
  try {
    const r = await fetch(cricUrl, {
      cache: 'no-store',
      credentials: 'omit',
      mode: 'cors',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      signal: AbortSignal.timeout(5000)
    });
    if (r.ok) {
      const text = await r.text();
      const raw = JSON.parse(text);
      if (raw?.values && Object.keys(raw.values).length) {
        return { type: 'snapshot', snap: parseSnapshot(raw, ids) };
      }
    }
  } catch (e) {
    lastError = e;
  }

  // 3. Try local / same-origin match archive
  try {
    const r = await fetch(`./data/matches/${ids.clubId}-${ids.matchId}.json?t=${Date.now()}`, {
      cache: 'no-store',
      credentials: 'omit',
      signal: AbortSignal.timeout(6000)
    });
    if (r.ok) {
      const archived = await r.json();
      if (archived?.schema === SCHEMA && String(archived.matchId) === String(ids.matchId)) {
        return { type: 'model', model: archived };
      }
    }
  } catch (e) {
    lastError = e;
  }

  // 4. Try remote GitHub repository raw archive
  try {
    const r = await fetch(`${remoteArchiveBase()}/${ids.clubId}-${ids.matchId}.json?t=${Date.now()}`, {
      cache: 'no-store',
      credentials: 'omit',
      signal: AbortSignal.timeout(6000)
    });
    if (r.ok) {
      const archived = await r.json();
      if (archived?.schema === SCHEMA && String(archived.matchId) === String(ids.matchId)) {
        return { type: 'model', model: archived };
      }
    }
  } catch (e) {
    lastError = e;
  }

  throw lastError || new Error(`Could not fetch CricClubs match ${ids.matchId}`);
}

export function createFeed({ onUpdate, onStatus }) {
  const f = { ids: null, model: null, timer: null, archiveTimer: null, busy: false, seconds: 10, archive: '', lastOk: 0, error: '', archiveAt: 0, generation: 0 };
  const status = () => onStatus?.({ ok: Boolean(f.lastOk) && !f.error, error: f.error, lastOk: f.lastOk, archiveAt: f.archiveAt, seconds: f.seconds, ids: f.ids });

  async function poll() {
    if (!f.ids || f.busy) return;
    const gen = f.generation; f.busy = true;
    try {
      const res = await scrapeCricClubsData(f.ids);
      if (gen !== f.generation) return;
      if (res.type === 'snapshot') {
        applySnapshot(f.model, res.snap);
        f.lastOk = Date.now(); f.error = '';
        persist(f.model);
        onUpdate?.(f.model, res.snap);
      } else if (res.type === 'model') {
        f.model = mergeModels(f.model, res.model);
        f.lastOk = Date.now(); f.error = '';
        persist(f.model);
        onUpdate?.(f.model, f.model.latest || null);
      }
    } catch (e) {
      if (gen !== f.generation) return;
      f.error = e.name === 'TimeoutError' ? 'CricClubs did not respond in time.' : e.name === 'TypeError' ? 'CricClubs is unreachable from this network.' : e.message;
    } finally { if (gen === f.generation) f.busy = false; status(); }
  }

  async function pullArchive() {
    if (!f.ids) return;
    const gen = f.generation;
    const urls = [
      `${f.archive || archiveBase()}/${f.ids.clubId}-${f.ids.matchId}.json`,
      `${remoteArchiveBase()}/${f.ids.clubId}-${f.ids.matchId}.json`
    ];
    for (const url of urls) {
      try {
        const r = await fetch(`${url}?t=${Math.floor(Date.now() / 60000)}`, { cache: 'no-store', credentials: 'omit', redirect: 'follow', signal: AbortSignal.timeout(8000) });
        if (!r.ok) continue;
        const archived = await r.json();
        if (gen !== f.generation || archived?.schema !== SCHEMA || archived.matchId !== f.ids.matchId) continue;
        f.model = mergeModels(f.model, archived);
        f.archiveAt = archived.updatedAt || Date.now();
        f.lastOk = Date.now();
        persist(f.model);
        onUpdate?.(f.model, f.model.latest || null);
        status();
        break;
      } catch { /* try next url */ }
    }
  }

  function schedule() {
    clearInterval(f.timer); clearInterval(f.archiveTimer);
    if (!f.ids) return;
    f.timer = setInterval(poll, f.seconds * 1000);
    f.archiveTimer = setInterval(pullArchive, 120000);
  }

  async function fetchMatch(ids) {
    f.generation++;
    f.busy = false;
    f.ids = { clubId: String(ids.clubId || '300'), matchId: String(ids.matchId), league: ids.league || 'FWCWL' };
    f.archive = archiveBase();
    f.lastOk = 0;
    f.error = '';
    f.archiveAt = 0;
    f.model = load(f.ids) || emptyModel(f.ids);
    f.model.league = f.ids.league || f.model.league;

    try {
      const res = await scrapeCricClubsData(f.ids);
      if (res.type === 'snapshot') {
        applySnapshot(f.model, res.snap);
        f.lastOk = Date.now();
        persist(f.model);
        onUpdate?.(f.model, res.snap);
      } else if (res.type === 'model') {
        f.model = mergeModels(f.model, res.model);
        f.lastOk = Date.now();
        persist(f.model);
        onUpdate?.(f.model, f.model.latest || null);
      }
    } catch (e) {
      if (!f.model.polls && !f.model.latest) {
        throw e;
      }
    }
    schedule();
    status();
    return f.model;
  }

  return {
    get model() { return f.model; }, get ids() { return f.ids; },
    start(ids, { archive = archiveBase() } = {}) {
      f.generation++; f.busy = false; f.ids = { clubId: String(ids.clubId), matchId: String(ids.matchId), league: ids.league || '' };
      f.archive = archive; f.lastOk = 0; f.error = ''; f.archiveAt = 0;
      f.model = load(f.ids) || emptyModel(f.ids); f.model.league = f.ids.league || f.model.league;
      if (f.model.polls) onUpdate?.(f.model, f.model.latest || null);
      schedule(); poll(); pullArchive();
    },
    fetchMatch,
    stop() { f.generation++; clearInterval(f.timer); clearInterval(f.archiveTimer); f.ids = null; },
    refresh: poll,
    setSeconds(s) { f.seconds = Math.max(5, Math.min(60, Number(s) || 10)); schedule(); },
    setArchive(url) { f.archive = url || ''; if (f.archive) pullArchive(); },
    clear() { if (!f.ids) return; try { localStorage.removeItem(storeKey(f.ids)); } catch {} f.model = emptyModel(f.ids); onUpdate?.(f.model, null); poll(); }
  };
}
