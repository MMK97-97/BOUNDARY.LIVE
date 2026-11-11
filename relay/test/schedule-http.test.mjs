import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const origin = 'https://mk97-fixture.onrender.com';
const secret = 'synthetic-schedule-http-test-token-value';
const headers = bearer => ({
  Origin: origin,
  'X-MK97-Origin': origin,
  Authorization: `Bearer ${bearer}`,
  'Content-Type': 'application/json'
});

let relay, base, owner, directory;

async function call(route, value, bearer = owner) {
  const r = await fetch(base + route, {
    method: value === undefined ? 'GET' : 'POST',
    headers: headers(bearer),
    ...(value === undefined ? {} : { body: JSON.stringify(value) })
  });
  const data = await r.json();
  assert.ok(r.ok, data.error);
  return data;
}

before(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mk97-schedule-http-'));
  const mock = path.join(directory, 'cricclubs-mock.mjs');
  fs.writeFileSync(mock, `
const fixtures = {
  '300:994': { view: 1, values: { clubId: '300', matchId: '994', t1Name: 'FWCWL Live', t2Name: 'Rivals', t1Total: '88', t1Wickets: '1', t1Overs: '9.4', isMatchEnded: '0', batsman1Name: 'Opener' } },
  '300:995': { view: 1, values: { clubId: '300', matchId: '995', t1Name: 'Super Kings', t2Name: 'Chargers', t1Total: '0', t1Wickets: '0', t1Overs: '0.0', isMatchEnded: '0', matchDate: 'Nov 15 · 09:00 AM' } }
};
let polls1050 = 0;
globalThis.fetch = async url => {
  const u = new URL(url);
  const clubId = u.searchParams.get('clubId');
  const matchId = u.searchParams.get('matchId');
  if (matchId === '1050') {
    if (polls1050++ === 0) {
      return new Response('{}', { status: 200 });
    }
    return new Response(JSON.stringify({ view: 1, values: { clubId: '300', matchId: '1050', t1Name: 'Alpha XI', t2Name: 'Beta XI', t1Total: '6', t1Wickets: '0', t1Overs: '0.1', isMatchEnded: '0' }, balls: ['6'] }), { status: 200 });
  }
  return new Response(JSON.stringify(fixtures[clubId + ':' + matchId] || {}), { status: 200 });
};
`);
  relay = spawn(process.execPath, ['--import', pathToFileURL(mock).href, fileURLToPath(new URL('../server.mjs', import.meta.url))], {
    env: {
      ...process.env,
      PORT: '0',
      HOST: '127.0.0.1',
      RELAY_TOKEN: secret,
      RENDER_EXTERNAL_URL: origin,
      PUBLIC_URL: '',
      ALLOWED_ORIGINS: '',
      CRICCLUBS_SCORECARD_ENABLED: 'false'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  base = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Relay startup timeout')), 12000);
    relay.stdout.on('data', bytes => {
      const match = bytes.toString().match(/MK97 relay: (http:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
    relay.once('exit', code => {
      clearTimeout(timer);
      reject(new Error('Relay exited ' + code));
    });
  });
  owner = (await call('/api/session', {}, secret)).sessionToken;
});

after(async () => {
  if (relay && relay.exitCode === null) {
    relay.kill();
    await new Promise(resolve => relay.once('exit', resolve));
  }
  if (directory) fs.rmSync(directory, { recursive: true, force: true });
});

test('POST /api/league/schedule discovers live & scheduled matches and /api/match transitions scheduled -> live', async () => {
  const sched = await call('/api/league/schedule', { clubId: '300', league: 'FWCWL', force: true });
  assert.equal(sched.clubId, '300');
  assert.deepEqual(sched.matches.map(m => [m.matchId, m.status]), [
    ['994', 'live'],
    ['995', 'scheduled']
  ]);

  const initial = await call('/api/match', {
    clubId: '300',
    matchId: '1050',
    league: 'FWCWL',
    allowScheduled: true,
    scheduleHint: { team1: 'Alpha XI', team2: 'Beta XI', date: 'Nov 16 · 10:00 AM' }
  });
  assert.equal(initial.score.status, 'scheduled');
  assert.equal(initial.score.batting, 'Alpha XI');
  assert.equal(initial.pollSeconds, 3);

  await new Promise(resolve => setTimeout(resolve, 3100));
  const next = await call('/api/score');
  assert.equal(next.score.status, 'live');
  assert.equal(next.score.runs, '6');
  assert.equal(next.pollSeconds, 5);
});
