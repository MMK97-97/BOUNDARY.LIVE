#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { knownLeague } from '../web/cricclubs-reference.mjs';
import { CricClubsScraper, cricclubsReference, parseCricClubsScorecard } from '../relay/lib/cricclubs.mjs';

export function parseScrapeArgs(args) {
  const o = {}, flags = { '--url': 'url', '--club': 'clubId', '--match': 'matchId', '--league': 'league', '--out': 'out', '--html': 'html' };
  for (let i = 0; i < args.length; i++) {
    const name = flags[args[i]], value = args[++i];
    if (!name || !value || value.startsWith('--') || o[name] != null) throw new Error('Use --url, or --club / --match / --league, with optional --html and --out.');
    o[name] = value;
  }
  if (o.url && (o.clubId || o.matchId || o.league)) throw new Error('Provide --url or separate match identifiers, not both.');
  const ref = cricclubsReference(o.url || { clubId: o.clubId || '300', matchId: o.matchId, league: o.league || knownLeague(o.clubId || '300')?.league });
  return { ...o, ref };
}
export async function scrapeMatch(options, scraper = new CricClubsScraper()) {
  let document;
  if (options.html) {
    const stat = fs.statSync(options.html);
    if (!stat.isFile() || stat.size > 2000000) throw new Error('Saved HTML must be a file of at most 2 MB.');
    document = { ...parseCricClubsScorecard(fs.readFileSync(options.html), options.ref), origin: 'saved-html', parsedAt: Date.now() };
  } else document = await scraper.scrape(options.ref);
  const output = JSON.stringify(document, null, 2) + '\n';
  if (options.out) {
    const target = path.resolve(options.out); fs.mkdirSync(path.dirname(target), { recursive: true });
    const temporary = `${target}.${randomBytes(6).toString('hex')}.next`;
    try { fs.writeFileSync(temporary, output, { mode: 0o600, flag: 'wx' }); fs.renameSync(temporary, target); }
    finally { fs.rmSync(temporary, { force: true }); }
  }
  return { document, output };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseScrapeArgs(process.argv.slice(2));
    const { document, output } = await scrapeMatch(options);
    if (!options.out) process.stdout.write(output);
    else console.log(`Saved ${document.inningsCards.length} innings (${document.coverage.reconciledInnings} reconciled) for Club ${document.clubId} / Match ${document.matchId}.`);
  } catch (error) {
    console.error(JSON.stringify({ ok: false, code: error.code || 'SCRAPE_FAILED', error: error.message })); process.exitCode = 2;
  }
}
