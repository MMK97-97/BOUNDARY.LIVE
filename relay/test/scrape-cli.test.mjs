import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseScrapeArgs, scrapeMatch } from '../../scripts/scrape-cricclubs.mjs';

test('scrape CLI requires an explicit match and rejects conflicting or repeated arguments', () => {
  for (const args of [[], ['--match', '../986'], ['--match'], ['--unknown', 'x'], ['--match', '986', '--match', '985'],
    ['--url', 'https://evil.test', '--match', '986'], ['--league', '../FWCWL', '--match', '986']]) assert.throws(() => parseScrapeArgs(args));
  assert.equal(parseScrapeArgs(['--match', '985']).ref.matchId, '985');
});

test('offline HTML output is whitelisted, labelled offline and not overwritten on parse or network failure', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mk97-scrape-'));
  try {
    const target = path.join(dir, 'card.json'), input = fileURLToPath(new URL('./fixtures/scorecard-layout.html', import.meta.url));
    const args = ['--club', '123', '--match', '456', '--league', 'TestLeague', '--html', input, '--out', target];
    const { document } = await scrapeMatch(parseScrapeArgs(args), { scrape: () => { throw new Error('No network request is permitted in offline mode.'); } });
    const saved = fs.readFileSync(target, 'utf8');
    assert.equal(document.origin, 'saved-html'); assert.equal(document.fetchedAt, undefined); assert.ok(document.parsedAt);
    assert.equal(document.coverage.reconciledInnings, 2); assert.equal(saved.includes('private@example.test'), false);
    const blocked = path.join(dir, 'blocked.html'); fs.writeFileSync(blocked, '<title>Just a moment</title>');
    await assert.rejects(scrapeMatch(parseScrapeArgs(args.map(v => v === input ? blocked : v))));
    assert.equal(fs.readFileSync(target, 'utf8'), saved);
    await assert.rejects(scrapeMatch(parseScrapeArgs(['--club', '123', '--match', '456', '--league', 'TestLeague', '--out', target]), { scrape: async () => { throw new Error('offline'); } }));
    assert.equal(fs.readFileSync(target, 'utf8'), saved); assert.deepEqual(fs.readdirSync(dir).sort(), ['blocked.html', 'card.json']);
    if (process.platform !== 'win32') assert.equal(fs.statSync(target).mode & 0o777, 0o600);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
