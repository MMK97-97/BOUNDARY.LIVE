// Browser-side CricClubs feed & scraper engine.
// Multi-tier scraper fetches live match data from CricClubs:
// Tier 1: Same-origin match archive (./data/matches/<clubId>-<matchId>.json)
// Tier 2: Direct CricClubs liveScoreOverlayData.do with candidate club probing (strict-origin-when-cross-origin)
// Tier 3: GitHub repository raw archive on main branch
// Tier 4: CORS proxy fallbacks (allorigins.win)
// Tier 5: Scheduled match fallback model for upcoming/unscored matches
import { SCHEMA, overlayUrl, parseSnapshot, applySnapshot, emptyModel, mergeModels } from './match-model.mjs';

const storeKey = ids => `boundary.match.${ids.clubId}-${ids.matchId}`;
const load = ids => { try { const m = JSON.parse(localStorage.getItem(storeKey(ids)) || 'null'); return m?.schema === SCHEMA ? m : null; } catch { return null; } };
const persist = model => { try { localStorage.setItem(storeKey(model), JSON.stringify(model)); } catch { /* storage full or disabled */ } };

/** Base URL for local or hosted match archives */
export function archiveBase(loc = globalThis.location) {
  return './data/matches';
}

/** Remote fallback archive on main branch */
export function remoteArchiveBase(loc = globalThis.location) {
  const m = /^([a-z0-9-]+)\.github\.io$/i.exec(loc?.hostname || '');
  const repo = (loc?.pathname || '/').split('/').filter(Boolean)[0] || 'BOUNDARY.LIVE';
  const owner = m ? m[1] : 'MMK97-97';
  return `https://raw.githubusercontent.com/${owner}/${repo}/main/web/data/matches`;
}

/** Known active CricClubs club IDs to probe when matching arbitrary match IDs */
export const CANDIDATE_CLUBS = [
  '300', '1', '2', '50', '10', '5', '20', '100', '200', '500', '1000',
  '4', '6', '7', '8', '9', '40', '120', '150', '250', '350', '400', '1050'
];

/** Create a clean scheduled snapshot for upcoming matches */
export function createScheduledSnapshot(ids) {
  const clubId = String(ids.clubId || '300');
  const matchId = String(ids.matchId || '986');
  const league = ids.league || (clubId === '300' ? 'FWCWL' : 'CricClubs');
  const t1Name = ids.t1Name || 'Team 1';
  const t2Name = ids.t2Name || 'Team 2';
  return {
    clubId,
    matchId,
    at: Date.now(),
    view: 1,
    series: ids.series || `${league} 2026-27 Season`,
    ground: ids.ground || 'Rodney, FL',
    toss: ids.toss || 'Toss scheduled before match',
    result: '',
    status: 'scheduled',
    totalOvers: 35,
    superOver: false,
    innings: '1',
    batKey: 't1',
    bowlKey: 't2',
    teams: {
      t1: { id: 't1', name: t1Name, code: t1Name.slice(0, 4).toUpperCase(), logo: '', runs: null, wickets: null, overs: '', runRate: '' },
      t2: { id: 't2', name: t2Name, code: t2Name.slice(0, 4).toUpperCase(), logo: '', runs: null, wickets: null, overs: '', runRate: '' }
    },
    hasScore: false,
    batting: t1Name,
    bowling: t2Name,
    runs: null,
    wickets: null,
    overs: '',
    legal: null,
    runRate: '',
    requiredRate: '',
    requiredRuns: null,
    remainingBalls: null,
    target: null,
    parScore: null,
    dls: false,
    batters: [],
    bowler: null,
    balls: [],
    partnership: null,
    lastOut: null,
    comment: 'Match scheduled to begin. Live score feed active.',
    fow: '',
    mom: '',
    youtube: '',
    cards: {}
  };
}

/** Multi-tier scraper to reliably get CricClubs match data for any match ID */
export async function scrapeCricClubsData(ids) {
  const primaryClub = String(ids.clubId || '300');
  const matchId = String(ids.matchId);
  const cricUrl = overlayUrl({ clubId: primaryClub, matchId });
  let lastError = null;

  // 1. Try local same-origin match archive first (fastest, guaranteed)
  const localUrls = [
    `./data/matches/${primaryClub}-${matchId}.json?t=${Date.now()}`,
    `./data/matches/300-${matchId}.json?t=${Date.now()}`
  ];
  for (const u of localUrls) {
    try {
      const r = await fetch(u, {
        cache: 'no-store',
        credentials: 'omit',
        signal: AbortSignal.timeout(1500)
      });
      if (r.ok) {
        const archived = await r.json();
        if (archived?.schema === SCHEMA && String(archived.matchId) === matchId) {
          return { type: 'model', model: archived, clubId: String(archived.clubId || primaryClub) };
        }
      }
    } catch {}
  }

  // 2. Direct fetch to primary CricClubs club
  try {
    const r = await fetch(cricUrl, {
      cache: 'no-store',
      credentials: 'omit',
      mode: 'cors',
      redirect: 'follow',
      referrerPolicy: 'strict-origin-when-cross-origin',
      signal: AbortSignal.timeout(3500)
    });
    if (r.ok) {
      const text = await r.text();
      if (text && text.trim() && text.trim() !== '{}') {
        const raw = JSON.parse(text);
        if (raw?.values && Object.keys(raw.values).length) {
          return { type: 'snapshot', snap: parseSnapshot(raw, { ...ids, clubId: primaryClub }), clubId: primaryClub };
        }
      }
    }
  } catch (e) {
    lastError = e;
  }

  // 3. If primary club returned empty or failed, probe candidate clubs in parallel
  if (!ids.explicitClub) {
    const candidateClubs = CANDIDATE_CLUBS.filter(c => c !== primaryClub);
    const clubProbes = candidateClubs.map(async c => {
      const u = overlayUrl({ clubId: c, matchId });
      const r = await fetch(u, {
        cache: 'no-store',
        credentials: 'omit',
        mode: 'cors',
        redirect: 'follow',
        referrerPolicy: 'strict-origin-when-cross-origin',
        signal: AbortSignal.timeout(2500)
      });
      if (!r.ok) throw new Error(`Club ${c} HTTP ${r.status}`);
      const txt = await r.text();
      if (!txt || txt.trim() === '' || txt.trim() === '{}') throw new Error(`Club ${c} empty`);
      const raw = JSON.parse(txt);
      if (!raw?.values || !Object.keys(raw.values).length) throw new Error(`Club ${c} no values`);
      return { clubId: c, snap: parseSnapshot(raw, { ...ids, clubId: c }) };
    });

    try {
      const winner = await Promise.any(clubProbes);
      if (winner) {
        return { type: 'snapshot', snap: winner.snap, clubId: winner.clubId };
      }
    } catch {}
  }

  // 4. Try remote GitHub repository raw archive
  const remoteUrls = [
    `${remoteArchiveBase()}/${primaryClub}-${matchId}.json?t=${Date.now()}`,
    `${remoteArchiveBase()}/300-${matchId}.json?t=${Date.now()}`
  ];
  for (const u of remoteUrls) {
    try {
      const r = await fetch(u, {
        cache: 'no-store',
        credentials: 'omit',
        signal: AbortSignal.timeout(3000)
      });
      if (r.ok) {
        const archived = await r.json();
        if (archived?.schema === SCHEMA && String(archived.matchId) === matchId) {
          return { type: 'model', model: archived, clubId: String(archived.clubId || primaryClub) };
        }
      }
    } catch (e) {
      lastError = e;
    }
  }

  // 5. Try AllOrigins GET JSON wrapper as fallback
  try {
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(cricUrl)}`;
    const r = await fetch(proxyUrl, { signal: AbortSignal.timeout(4000) });
    if (r.ok) {
      const data = await r.json();
      if (data?.contents) {
        const raw = JSON.parse(data.contents);
        if (raw?.values && Object.keys(raw.values).length) {
          return { type: 'snapshot', snap: parseSnapshot(raw, { ...ids, clubId: primaryClub }), clubId: primaryClub };
        }
      }
    }
  } catch {}

  // 6. Scheduled Match Fallback:
  // If CricClubs has no live deliveries yet (upcoming/scheduled match), provide scheduled snapshot
  // so the broadcast studio flow never fails and continues polling for when the match starts!
  return {
    type: 'snapshot',
    snap: createScheduledSnapshot({ ...ids, clubId: primaryClub }),
    clubId: primaryClub,
    isScheduled: true
  };
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
      if (res.clubId && res.clubId !== f.ids.clubId) {
        f.ids.clubId = res.clubId;
        f.model.clubId = res.clubId;
      }
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
        const r = await fetch(`${url}?t=${Math.floor(Date.now() / 60000)}`, { cache: 'no-store', credentials: 'omit', redirect: 'follow', signal: AbortSignal.timeout(6000) });
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
    f.ids = { clubId: String(ids.clubId || '300'), matchId: String(ids.matchId), league: ids.league || 'FWCWL', explicitClub: Boolean(ids.explicitClub), t1Name: ids.t1Name, t2Name: ids.t2Name };
    f.archive = archiveBase();
    f.lastOk = 0;
    f.error = '';
    f.archiveAt = 0;
    f.model = load(f.ids) || emptyModel(f.ids);
    f.model.league = f.ids.league || f.model.league;

    try {
      const res = await scrapeCricClubsData(f.ids);
      if (res.clubId && res.clubId !== f.ids.clubId) {
        f.ids.clubId = res.clubId;
        f.model.clubId = res.clubId;
      }
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
      f.generation++; f.busy = false; f.ids = { clubId: String(ids.clubId), matchId: String(ids.matchId), league: ids.league || '', explicitClub: Boolean(ids.explicitClub) };
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
