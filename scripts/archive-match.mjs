#!/usr/bin/env node
// Optional operator-run source snapshots. No inferred commentary or player history.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ScoreService, validateIds } from '../relay/lib/score.mjs';

export function parseArgs(args = []) {
  const o = { clubId: process.env.MK97_CLUB_ID || '300', matchId: process.env.MK97_MATCH_ID || '986',
    outDir: process.env.MK97_DATA_DIR || 'data/matches', iterations: process.env.ARCHIVE_ITERATIONS || 1, interval: process.env.ARCHIVE_INTERVAL_SEC || 10 };
  const flags = { '--club': 'clubId', '--match': 'matchId', '--out': 'outDir', '--iterations': 'iterations', '--interval': 'interval' };
  for (let i = 0; i < args.length; i++) {
    if (!flags[args[i]] || args[i + 1] == null) throw new Error('Use --club, --match, --out, --iterations or --interval with a value.');
    o[flags[args[i]]] = args[++i];
  }
  Object.assign(o, validateIds(o.clubId, o.matchId)); o.iterations = Number(o.iterations); o.interval = Number(o.interval);
  if (!Number.isInteger(o.iterations) || o.iterations < 1 || o.iterations > 120) throw new Error('Iterations must be 1–120.');
  if (!Number.isInteger(o.interval) || o.interval < 5 || o.interval > 60) throw new Error('Interval must be 5–60 seconds.');
  return o;
}
export async function archiveMatch(options, fetchFn = fetch) {
  const o = parseArgs(['--club', String(options.clubId), '--match', String(options.matchId), '--out', options.outDir,
    '--iterations', String(options.iterations ?? 1), '--interval', String(options.interval ?? 10)]);
  const service = new ScoreService({ fetchFn, pollSeconds: o.interval }); service.select(o.clubId, o.matchId);
  let last = null;
  for (let n = 0; n < o.iterations; n++) {
    const result = await service.refresh();
    if (!result.score || result.error) throw new Error(result.error || 'No source data returned.');
    const target = path.resolve(o.outDir, `${o.clubId}-${o.matchId}.json`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const next = target + '.next';
    fs.writeFileSync(next, JSON.stringify({ schema: 'mk97.source-snapshot.v1', score: result.score }, null, 2) + '\n', { mode: 0o600 });
    fs.renameSync(next, target); last = result.score;
    console.log(`Saved Club ${o.clubId} / Match ${o.matchId}: ${last.batting} ${last.runs}/${last.wickets} (${last.overs})`);
    if (last.status === 'complete') break;
    if (n + 1 < o.iterations) await new Promise(resolve => setTimeout(resolve, o.interval * 1000));
  }
  return last;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await archiveMatch(parseArgs(process.argv.slice(2))); }
  catch (error) { console.error('Snapshot failed:', error.message); process.exitCode = 1; }
}
