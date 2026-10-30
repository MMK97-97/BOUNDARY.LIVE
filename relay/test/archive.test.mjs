import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { archiveMatch, parseArgs } from '../../scripts/archive-match.mjs';

test('snapshot arguments reject path-like IDs and unbounded polling', () => {
  for (const args of [['--club', '../300'], ['--match', 'x'], ['--iterations', '121'], ['--interval', '0'], ['--unknown', 'value']]) assert.throws(() => parseArgs(args));
  assert.equal(parseArgs(['--club', '300', '--match', '986']).matchId, '986');
});

test('saved snapshots contain source fields only and an outage does not overwrite them', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mk97-snapshot-test-'));
  try {
    const options = { clubId: '300', matchId: '986', outDir: dir, iterations: 1, interval: 5 };
    const raw = { schema: 'mk97.score.v1', batting: 'ICAT', bowling: 'Royal Bulls CC', runs: 208, wickets: 5, overs: '30.5',
      status: 'complete', commentary: [], privateEmail: 'do-not-store@example.test' };
    await archiveMatch(options, async () => new Response(JSON.stringify(raw)));
    const target = path.join(dir, '300-986.json'), saved = fs.readFileSync(target, 'utf8');
    assert.equal(JSON.parse(saved).score.runs, '208'); assert.equal(saved.includes('do-not-store'), false);
    assert.deepEqual(JSON.parse(saved).score.commentary, []);
    await assert.rejects(archiveMatch(options, async () => new Response('<html>Restricted</html>')));
    assert.equal(fs.readFileSync(target, 'utf8'), saved);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
