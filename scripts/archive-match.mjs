#!/usr/bin/env node
// GitHub Actions CricClubs Match Archiver.
// Scrapes the exact data from CricClubs liveScoreOverlayData.do, folds every delivery
// into the shared match-model (commentary, batting/bowling cards, stats, partnerships),
// and persists the archive to data/matches/<clubId>-<matchId>.json.

import fs from 'node:fs';
import path from 'node:path';
import { parseSnapshot, applySnapshot, emptyModel, mergeModels, SCHEMA, overlayUrl } from '../web/match-model.mjs';

function parseArgs(args) {
  const options = {
    clubId: process.env.BOUNDARY_CLUB_ID || '300',
    matchId: process.env.BOUNDARY_MATCH_ID || '986',
    league: process.env.BOUNDARY_LEAGUE || 'FWCWL',
    outDir: process.env.BOUNDARY_DATA_DIR || 'data/matches',
    iterations: Number(process.env.ARCHIVE_ITERATIONS || 1),
    interval: Number(process.env.ARCHIVE_INTERVAL_SEC || 10)
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--club' && args[i + 1]) options.clubId = args[++i];
    else if (a === '--match' && args[i + 1]) options.matchId = args[++i];
    else if (a === '--league' && args[i + 1]) options.league = args[++i];
    else if (a === '--out' && args[i + 1]) options.outDir = args[++i];
    else if (a === '--iterations' && args[i + 1]) options.iterations = Number(args[++i]);
    else if (a === '--interval' && args[i + 1]) options.interval = Number(args[++i]);
  }
  return options;
}

const sleep = ms => new Promise(res => setTimeout(res, ms));

async function fetchCricClubsOverlay(clubId, matchId) {
  const url = overlayUrl({ clubId, matchId });
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'Origin': 'https://cricclubs.com'
  };
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`CricClubs responded HTTP ${res.status}: ${res.statusText}`);
  const text = await res.text();
  if (!text || text.trim() === '' || text.trim() === '{}') {
    throw new Error(`CricClubs returned empty payload for match ${matchId} (club ${clubId})`);
  }
  const cleanJson = text.replace(/^\uFEFF/, '').trim();
  return JSON.parse(cleanJson);
}

export async function archiveMatch(opts) {
  const { clubId, matchId, league, outDir, iterations, interval } = opts;
  const ids = { clubId, matchId, league };
  fs.mkdirSync(outDir, { recursive: true });
  const filePath = path.join(outDir, `${clubId}-${matchId}.json`);

  let model = emptyModel(ids);
  if (fs.existsSync(filePath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (existing.schema === SCHEMA) {
        model = existing;
        console.log(`Loaded existing archive for match ${matchId} (${model.order.length} innings, ${model.polls} polls)`);
      }
    } catch (e) {
      console.warn(`Could not parse existing archive at ${filePath}:`, e.message);
    }
  }

  console.log(`Scraping CricClubs match ${matchId} (club ${clubId})...`);

  for (let i = 0; i < iterations; i++) {
    try {
      const raw = await fetchCricClubsOverlay(clubId, matchId);
      const snap = parseSnapshot(raw, ids);
      applySnapshot(model, snap);
      fs.writeFileSync(filePath, JSON.stringify(model, null, 2), 'utf8');
      console.log(`[${new Date().toISOString()}] Poll ${i + 1}/${iterations}: ${model.meta.series || 'Match'} | ` +
        `Batting: ${snap.batting} ${snap.runs}/${snap.wickets} (${snap.overs} ov) | Status: ${snap.status}`);
      if (snap.status === 'complete' && iterations > 1) {
        console.log('Match is complete. Finished archiving.');
        break;
      }
    } catch (err) {
      console.error(`Error fetching CricClubs data:`, err.message);
      if (iterations === 1) throw err;
    }
    if (i < iterations - 1) {
      await sleep(interval * 1000);
    }
  }

  return model;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'))) {
  const opts = parseArgs(process.argv.slice(2));
  archiveMatch(opts).then(
    () => {
      console.log('Archiving complete.');
      process.exit(0);
    },
    err => {
      console.error('Archiving failed:', err);
      process.exit(1);
    }
  );
}
