import { clean, validateIds } from './score-data.mjs';
import { knownLeague, validateLeague } from './cricclubs-reference.mjs';

export const KNOWN_FRONTIERS = Object.freeze({
  '300': 994,
  '1507': 3905,
  '157': 6135
});

const STATUS_RANK = Object.freeze({ live: 0, scheduled: 1, complete: 2 });
const CACHE_TTL_MS = 20_000;
const scheduleCache = new Map();

const truth = v => v === true || v === 'true' || v === '1' || v === 1;

export function clearScheduleCache(clubId) {
  if (clubId) scheduleCache.delete(String(clubId));
  else scheduleCache.clear();
}

function normalizeOverlayItem(raw, { clubId, matchId, league }, now = Date.now()) {
  const v = raw?.values;
  if (!v || typeof v !== 'object') return null;
  if (v.clubId && String(v.clubId) !== String(clubId)) return null;
  const resolvedMatchId = String(v.matchId || matchId);
  if (resolvedMatchId !== String(matchId)) return null;
  if (!v.t1Name && !v.t2Name && !v.t1Code && !v.t2Code) return null;

  const t1Runs = Number(v.t1Total) || 0;
  const t1Wkts = Number(v.t1Wickets) || 0;
  const t1Ov = parseFloat(v.t1Overs) || 0;
  const t2Runs = Number(v.t2Total) || 0;
  const t2Wkts = Number(v.t2Wickets) || 0;
  const t2Ov = parseFloat(v.t2Overs) || 0;
  const second = truth(raw.isSecondInningsStarted ?? v.isSecondInningsStarted) || truth(raw.isSuperOverSecondInningsStarted);
  const ended = truth(v.isMatchEnded);
  const hasPlayersOrToss = Boolean(v.batsman1Name || v.bowlerName || v.toss);

  let status = 'live';
  if (ended) status = 'complete';
  else if (t1Runs === 0 && t1Wkts === 0 && t1Ov === 0 && t2Runs === 0 && t2Wkts === 0 && t2Ov === 0 && !second && !hasPlayersOrToss) {
    status = 'scheduled';
  }

  const t1Started = t1Runs > 0 || t1Wkts > 0 || t1Ov > 0;
  const t2Started = t2Runs > 0 || t2Wkts > 0 || t2Ov > 0;

  return {
    clubId: String(clubId),
    matchId: resolvedMatchId,
    league: clean(league || knownLeague(clubId)?.league || 'FWCWL', 80),
    team1: clean(v.t1Name || v.t1Code || 'Team 1', 60),
    team2: clean(v.t2Name || v.t2Code || 'Team 2', 60),
    t1Code: clean(v.t1Code || v.t1Name || 'T1', 12),
    t2Code: clean(v.t2Code || v.t2Name || 'T2', 12),
    t1Score: t1Started ? `${clean(v.t1Total || '0', 6)}/${clean(v.t1Wickets || '0', 3)} (${clean(v.t1Overs || '0', 6)})` : '',
    t2Score: t2Started ? `${clean(v.t2Total || '0', 6)}/${clean(v.t2Wickets || '0', 3)} (${clean(v.t2Overs || '0', 6)})` : '',
    status,
    series: clean(v.seriesName, 100),
    ground: clean(v.groundName, 80),
    result: clean(v.shortResult || v.result, 100),
    date: clean(v.matchDate || v.date || v.matchDateTime || v.gameDate || v.dateStr, 60),
    fetchedAt: now
  };
}

export function sortScheduleMatches(list) {
  return [...list].sort((a, b) => {
    const rankDiff = (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9);
    if (rankDiff !== 0) return rankDiff;
    return (Number(b.matchId) || 0) - (Number(a.matchId) || 0);
  });
}

async function fetchOverlayRaw(clubId, matchId, fetchFn, timeoutMs = 6000) {
  const valid = validateIds(clubId, matchId);
  const url = `https://cricclubs.com/liveScoreOverlayData.do?clubId=${valid.clubId}&matchId=${valid.matchId}`;
  const response = await fetchFn(url, {
    cache: 'no-store',
    credentials: 'omit',
    mode: 'cors',
    redirect: 'error',
    referrerPolicy: 'no-referrer',
    signal: AbortSignal.timeout(timeoutMs)
  });
  if ([401, 403, 429].includes(response.status)) {
    await response.body?.cancel().catch(() => {});
    const err = new Error(`CricClubs returned HTTP ${response.status} while discovering league matches. Enter the Match ID manually or paste schedule text below.`);
    err.code = 'BLOCKED_BY_UPSTREAM';
    err.status = response.status;
    throw err;
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    return { kind: 'error', status: response.status, raw: null };
  }
  const reader = response.body?.getReader?.();
  let text;
  if (reader) {
    const chunks = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2_000_000) {
        await reader.cancel().catch(() => {});
        throw new Error('CricClubs schedule probe response exceeded 2 MB.');
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let at = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, at);
      at += chunk.byteLength;
    }
    text = new TextDecoder().decode(bytes).replace(/^\uFEFF/, '');
  } else {
    text = (await response.text()).slice(0, 2_000_000).replace(/^\uFEFF/, '');
  }
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    const err = new Error('CricClubs returned an HTML verification page instead of schedule JSON. Enter the Match ID manually or paste your schedule.');
    err.code = 'BLOCKED_BY_UPSTREAM';
    throw err;
  }
  const hasValues = Boolean(raw && typeof raw === 'object' && raw.values && (raw.values.t1Name || raw.values.t2Name || raw.values.t1Code || raw.values.t2Code || raw.values.matchId));
  return { kind: hasValues ? 'data' : 'empty', raw };
}

export async function discoverLeagueSchedule({ clubId, league, seedMatchId, fetchFn = fetch, limit = 16, cacheMs = CACHE_TTL_MS, force = false, now = Date.now } = {}) {
  const validClubId = validateIds(clubId, '1').clubId;
  const resolvedLeague = validateLeague(league) || knownLeague(validClubId)?.league || 'FWCWL';
  const targetLimit = Math.max(4, Math.min(24, Number(limit) || 16));
  const useCache = !force && fetchFn === fetch && cacheMs > 0 && !seedMatchId;

  if (useCache) {
    const cached = scheduleCache.get(validClubId);
    if (cached && cached.expires > now()) {
      return structuredClone(cached.result);
    }
  }

  const fetched = new Map();
  let requestCount = 0;
  const MAX_REQUESTS = 44;

  const loadOne = async idNum => {
    const id = Math.floor(Number(idNum));
    if (id < 1) return null;
    const key = String(id);
    if (fetched.has(key)) return fetched.get(key);
    if (requestCount >= MAX_REQUESTS) return null;
    requestCount++;
    const res = await fetchOverlayRaw(validClubId, key, fetchFn);
    if (res.kind === 'data') {
      const item = normalizeOverlayItem(res.raw, { clubId: validClubId, matchId: key, league: resolvedLeague }, now());
      fetched.set(key, item);
      return item;
    }
    fetched.set(key, null);
    return null;
  };

  // Probe candidate and a +1/+2 offset so a single skipped match ID doesn't prematurely look like the end.
  const probeCluster = async startId => {
    for (const offset of [0, 1, 2]) {
      const candidate = startId + offset;
      if (candidate < 1) continue;
      const item = await loadOne(candidate);
      if (item) return candidate;
      if (requestCount >= MAX_REQUESTS) break;
    }
    return 0;
  };

  let frontier = 0;
  const seed = Math.max(Number(seedMatchId) || 0, KNOWN_FRONTIERS[validClubId] || 0);

  if (seed > 0) {
    let highestHit = await probeCluster(seed);
    if (highestHit > 0) {
      let step = 8;
      let upperBound = 0;
      while (requestCount < MAX_REQUESTS) {
        const testId = highestHit + step;
        const hit = await probeCluster(testId);
        if (hit > 0) {
          highestHit = hit;
          step = Math.min(512, step * 2);
        } else {
          upperBound = testId;
          break;
        }
      }
      if (upperBound > highestHit) {
        let lo = highestHit;
        let hi = upperBound - 1;
        while (lo < hi && requestCount < MAX_REQUESTS) {
          const mid = Math.ceil((lo + hi) / 2);
          const hit = await loadOne(mid);
          if (hit) lo = mid;
          else hi = mid - 1;
        }
        frontier = lo;
      } else {
        frontier = highestHit;
      }
    } else {
      // Seed missed: walk downward by doubling step, then binary search.
      let lowHit = 0;
      let step = 16;
      let missedCeiling = seed;
      while (seed - step >= 1 && requestCount < MAX_REQUESTS) {
        const probeId = Math.max(1, seed - step);
        const hit = await probeCluster(probeId);
        if (hit > 0) {
          lowHit = hit;
          break;
        }
        missedCeiling = probeId;
        step *= 2;
      }
      if (lowHit === 0 && seed > 1 && requestCount < MAX_REQUESTS) {
        for (const anchor of [1, 10, 50, 200]) {
          if (anchor >= seed) break;
          const hit = await probeCluster(anchor);
          if (hit > lowHit) lowHit = hit;
        }
      }
      if (lowHit > 0) {
        let lo = lowHit;
        let hi = missedCeiling - 1;
        while (lo < hi && requestCount < MAX_REQUESTS) {
          const mid = Math.ceil((lo + hi) / 2);
          const hit = await loadOne(mid);
          if (hit) lo = mid;
          else hi = mid - 1;
        }
        frontier = lo;
      }
    }
  } else {
    // Unknown custom club: probe geometric anchors up to 8000.
    let bestAnchor = 0;
    let firstMiss = 0;
    for (const anchor of [1, 15, 60, 250, 750, 1500, 3000, 6000, 10000]) {
      const hit = await probeCluster(anchor);
      if (hit > 0) {
        bestAnchor = hit;
      } else if (bestAnchor > 0) {
        firstMiss = anchor;
        break;
      }
    }
    if (bestAnchor > 0) {
      let lo = bestAnchor;
      let hi = (firstMiss || bestAnchor + 64) - 1;
      while (lo < hi && requestCount < MAX_REQUESTS) {
        const mid = Math.ceil((lo + hi) / 2);
        const hit = await loadOne(mid);
        if (hit) lo = mid;
        else hi = mid - 1;
      }
      frontier = lo;
    }
  }

  // Also check 1..2 IDs just above frontier for newly created scheduled matches.
  if (frontier > 0) {
    await loadOne(frontier + 1);
    if (fetched.get(String(frontier + 1))) frontier += 1;
  }

  // Collect recent matches backward from frontier in bounded batches.
  if (frontier > 0) {
    const startFrom = frontier;
    const minId = Math.max(1, startFrom - Math.max(targetLimit + 4, 20));
    const pendingIds = [];
    for (let idNum = startFrom; idNum >= minId; idNum--) {
      if (!fetched.has(String(idNum))) pendingIds.push(idNum);
    }
    const BATCH = 4;
    for (let i = 0; i < pendingIds.length && requestCount < MAX_REQUESTS; i += BATCH) {
      const batch = pendingIds.slice(i, i + BATCH);
      await Promise.all(batch.map(idNum => loadOne(idNum)));
      const foundCount = [...fetched.values()].filter(Boolean).length;
      if (foundCount >= targetLimit) break;
    }
  }

  const matches = sortScheduleMatches([...fetched.values()].filter(Boolean)).slice(0, targetLimit);
  const result = {
    clubId: validClubId,
    league: resolvedLeague,
    frontier,
    nextCandidateMatchId: frontier > 0 ? String(frontier + 1) : '',
    matches,
    scannedAt: now()
  };

  if (useCache && matches.length) {
    scheduleCache.set(validClubId, { expires: now() + cacheMs, result: structuredClone(result) });
  }
  return result;
}

export function parseLeagueScheduleInput(rawText, { clubId, league } = {}) {
  const input = String(rawText ?? '');
  if (!input.trim()) throw new Error('Paste CricClubs fixture text, scorecard URLs, or schedule HTML first.');
  if (input.length > 512_000) throw new Error('Pasted schedule text is too large (limit 512 KB).');

  const defaultClubId = /^[1-9]\d{0,11}$/.test(String(clubId || '').trim()) ? String(clubId).trim() : '';
  const defaultLeague = validateLeague(league) || knownLeague(defaultClubId)?.league || 'FWCWL';
  const items = new Map();

  const upsert = item => {
    if (!item || !/^[1-9]\d{0,11}$/.test(item.matchId)) return;
    const prev = items.get(item.matchId);
    items.set(item.matchId, {
      clubId: item.clubId || prev?.clubId || defaultClubId,
      matchId: item.matchId,
      league: item.league || prev?.league || defaultLeague,
      team1: item.team1 || prev?.team1 || 'Team A',
      team2: item.team2 || prev?.team2 || 'Team B',
      t1Code: clean((item.team1 || prev?.team1 || 'TM1').slice(0, 8), 12),
      t2Code: clean((item.team2 || prev?.team2 || 'TM2').slice(0, 8), 12),
      t1Score: prev?.t1Score || '',
      t2Score: prev?.t2Score || '',
      status: 'scheduled',
      series: clean(item.series || prev?.series || '', 100),
      ground: clean(item.ground || prev?.ground || '', 80),
      result: '',
      date: clean(item.date || prev?.date || '', 60),
      fetchedAt: Date.now()
    });
  };

  // Extract explicit CricClubs scorecard/fixture URLs or anchor context line by line.
  const lines = input.replace(/\\&/g, '&').replace(/&amp;/gi, '&').split(/\r?\n|(?=<tr\b|<a\b)/i);
  for (const rawLine of lines) {
    const plain = clean(rawLine, 400);
    const idMatch = rawLine.match(/matchId=(\d{1,12})/i) || plain.match(/\bMatch\s*(?:ID|#)?\s*[:#-]?\s*(\d{2,10})\b/i);
    const clubMatch = rawLine.match(/clubId=(\d{1,12})/i);
    const leagueMatch = rawLine.match(/cricclubs\.com\/([A-Za-z0-9_-]{1,80})\//i);
    if (!idMatch) continue;
    const matchId = idMatch[1];
    const resolvedClub = clubMatch?.[1] || defaultClubId;
    if (!/^[1-9]\d{0,11}$/.test(resolvedClub)) continue;
    const resolvedLeague = (() => {
      try { return validateLeague(leagueMatch?.[1]) || defaultLeague; } catch { return defaultLeague; }
    })();

    // Look for "Team A vs Team B" or "Team A v Team B" near the line
    let team1 = '', team2 = '', date = '', ground = '';
    const vsMatch = plain.match(/([A-Za-z0-9][A-Za-z0-9 '&.-]{1,40}?)\s+(?:vs\.?|v)\s+([A-Za-z0-9][A-Za-z0-9 '&.-]{1,40}?)(?=\s*(?:\||·|,|@|on|\d{1,2}\/\d{1,2}|$))/i);
    if (vsMatch) {
      team1 = clean(vsMatch[1], 45);
      team2 = clean(vsMatch[2], 45);
    }
    const dateMatch = plain.match(/\b(\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?(?:\s+\d{1,2}:\d{2}\s*(?:AM|PM)?)?|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:,\s*\d{4})?)\b/i);
    if (dateMatch) date = clean(dateMatch[1], 40);

    upsert({ clubId: resolvedClub, matchId, league: resolvedLeague, team1, team2, date, ground });
  }

  // Fallback URL sweep in case multiple match URLs share one line without tags
  for (const m of input.replace(/&amp;/gi, '&').matchAll(/matchId=(\d{1,12})(?:[^0-9]{1,30}clubId=(\d{1,12}))?/gi)) {
    const resolvedClub = m[2] || defaultClubId;
    if (/^[1-9]\d{0,11}$/.test(resolvedClub) && !items.has(m[1])) {
      upsert({ clubId: resolvedClub, matchId: m[1], league: defaultLeague });
    }
  }

  const parsed = sortScheduleMatches([...items.values()]);
  if (!parsed.length) {
    throw new Error('Could not find any CricClubs Match IDs or fixture URLs in the pasted text.');
  }
  return parsed;
}

export function filterScheduleMatches(matches = [], { filter = 'all', query = '' } = {}) {
  const list = Array.isArray(matches) ? matches : [];
  const f = ['live', 'scheduled', 'complete'].includes(filter) ? filter : 'all';
  const q = String(query || '').trim().toLowerCase();
  return list.filter(m => {
    if (f !== 'all' && (m?.status || 'scheduled') !== f) return false;
    if (!q) return true;
    const hay = [m.matchId, m.clubId, m.team1, m.team2, m.ground, m.series, m.date, m.result, m.league].filter(Boolean).join(' ').toLowerCase();
    return hay.includes(q);
  });
}
