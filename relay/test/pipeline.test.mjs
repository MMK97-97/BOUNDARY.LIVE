import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { WebSocket } from 'ws';
import { findFont, probeEncoder } from '../lib/encoder.mjs';
const available = process.platform !== 'win32' && probeEncoder('ffmpeg', findFont()).ready;
test('real WebSocket upload fans out to two FFmpeg writers and stops cleanly without external broadcasting', { skip: !available, timeout: 60000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'boundary-pipeline-'));
  let relay, ws;
  try {
    const clip = path.join(dir, 'camera.mp4');
    const generated = spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=0x19523b:s=1920x1080:r=30',
      '-f', 'lavfi', '-i', 'sine=sample_rate=44100', '-t', '5', '-c:v', 'libx264', '-threads', '2', '-preset', 'ultrafast',
      '-g', '30', '-c:a', 'aac', '-movflags', 'frag_keyframe+empty_moov+default_base_moof', clip], { timeout: 15000 });
    assert.equal(generated.status, 0, generated.stderr?.toString());
    // This temporary test wrapper redirects only the test's fake RTMPS targets
    // to local files. It is not a runtime option in the application.
    const wrapper = path.join(dir, 'ffmpeg-test-wrapper.mjs');
    fs.writeFileSync(wrapper, `#!${process.execPath}\nimport {spawn} from 'node:child_process';\nimport path from 'node:path';\nconst args=process.argv.slice(2);\nconst last=args.at(-1)||'';\nif(last.startsWith('rtmps://')) {\n if(!process.env.BOUNDARY_TEST_DIR) process.exit(90);\n const name=last.includes('youtube.com')?'youtube.flv':'facebook.flv';\n args[args.length-1]=path.join(process.env.BOUNDARY_TEST_DIR,name);\n}\nconst stdio=['inherit','inherit','inherit']; if(args.includes('pipe:3'))stdio.push(3); if(args.includes('pipe:4'))stdio.push(4); const p=spawn('ffmpeg',args,{stdio});\np.on('error',()=>process.exit(91));\np.on('exit',code=>process.exit(code??1));\nprocess.on('SIGTERM',()=>p.kill());\n`, { mode: 0o700 });
    const googleMock = path.join(dir, 'google-test-provider.mjs');
    const selectedMatch = { clubId: '300', matchId: '987' };
    const testScore = { schema: 'mk97.score.v1', ...selectedMatch, batting: 'Dynamic XI', bowling: 'Another XI', runs: 63, wickets: 2, overs: '10.2', status: 'live' };
    fs.writeFileSync(googleMock, `import {youtubeProvider} from ${JSON.stringify(new URL('../support/youtube-provider.mjs', import.meta.url).href)};\nconst mock=youtubeProvider(), native=globalThis.fetch, score=${JSON.stringify(testScore)}; globalThis.fetch=(url,options)=>new URL(url).hostname==='score.example.test'?Promise.resolve(new Response(JSON.stringify(score))):['oauth2.googleapis.com','www.googleapis.com'].includes(new URL(url).hostname)?mock.fetchFn(url,options):native(url,options);\n`);
    const origin = 'https://example.github.io', token = 'pipeline-test-secret-longer-than-32-characters';
    relay = spawn(process.execPath, ['--import', googleMock, fileURLToPath(new URL('../server.mjs', import.meta.url))], { env: {
      ...process.env, PORT: '0', HOST: '127.0.0.1', RELAY_TOKEN: token, ALLOWED_ORIGINS: origin,
      FFMPEG_PATH: wrapper, BOUNDARY_TEST_DIR: dir,
      SCORE_URL_TEMPLATE: 'https://score.example.test/{clubId}/{matchId}',
      YOUTUBE_SERVER: '', YOUTUBE_KEY: '', GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'test-client-secret-not-real', YOUTUBE_REDIRECT_URI: origin + '/youtube-callback.html',
      FACEBOOK_SERVER: 'rtmps://live-api-s.facebook.com/rtmp', FACEBOOK_KEY: 'local-test-only', INSTAGRAM_KEY: '', INSTAGRAM_SERVER: ''
    }, stdio: ['ignore', 'pipe', 'pipe'] });
    const base = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Startup timeout')), 10000);
      relay.stdout.on('data', c => { const m = c.toString().match(/MK97 relay: (http:\/\/[^\s]+)/); if (m) { clearTimeout(timer); resolve(m[1]); } });
    });
    const call = async (route, credential, value = {}) => {
      const r = await fetch(base + route, { method: 'POST', headers: { Origin: origin, Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
      assert.ok(r.ok); return r.json();
    };
    const { sessionToken } = await call('/api/session', token);
    const loaded = await call('/api/match', sessionToken, selectedMatch); assert.equal(loaded.score.matchId, '987'); assert.equal(loaded.score.batting, 'Dynamic XI');
    const flow = await call('/api/youtube/auth/start', sessionToken);
    await call('/api/youtube/auth/complete', sessionToken, { state: flow.state, code: 'test-authorization-code' });
    const setup = await call('/api/youtube/setup', sessionToken, { requestId: 'pipeline-setup-request-123', title: 'Cricket test', privacy: 'unlisted', description: 'Local pipeline test', madeForKids: false, scheduledStartTime: new Date(Date.now() + 300000).toISOString() });
    assert.equal(setup.broadcast.keyReady, true); assert.equal(JSON.stringify(setup).includes('private-api-stream-key'), false);
    const { ticket } = await call('/api/ticket', sessionToken);
    ws = new WebSocket(base.replace('http:', 'ws:') + '/ingest', { origin });
    const errors = [], sending = new Set(); let lastStats = null;
    await new Promise((resolve, reject) => {
      // Allow shared CI machines time to encode/export the local test video.
      // Production ingest and shutdown deadlines are unchanged.
      const timer = setTimeout(() => reject(new Error('Pipeline did not stop')), 30000);
      ws.on('error', reject);
      ws.on('open', () => ws.send(JSON.stringify({ type: 'start', ticket, width: 1920, height: 1080, mimeType: 'video/mp4', overlay: true, match: selectedMatch, destinations: ['youtube', 'facebook'] })));
      ws.on('message', async data => {
        const m = JSON.parse(data.toString());
        if (m.type === 'stats') lastStats = m;
        if (m.type === 'destination' && m.state === 'sending') sending.add(m.id);
        if (m.type === 'error') errors.push(m.message);
        if (m.type === 'ready') {
          try {
            const change = await fetch(base + '/api/match', { method: 'POST', headers: { Origin: origin, Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ clubId: '300', matchId: '988' }) });
            assert.equal(change.status, 409, 'A live upload must keep its selected match identity');
            const bytes = fs.readFileSync(clip);
            for (let i = 0; i < bytes.length; i += 16000) ws.send(bytes.subarray(i, i + 16000));
            const authHeaders = { Origin: origin, Authorization: `Bearer ${sessionToken}` };
            let snapshot;
            for (let i = 0; i < 100; i++) {
              snapshot = await (await fetch(base + '/api/automation', { headers: authHeaders })).json();
              if (snapshot.bufferSeconds >= 1.6) break;
              await new Promise(resolve => setTimeout(resolve, 50));
            }
            assert.ok(snapshot.bufferSeconds >= 1.6, 'Private replay buffer should warm up during upload: ' + JSON.stringify(snapshot));
            const selected = await call('/api/clip/select', sessionToken); assert.match(selected.id, /^[a-f0-9]{16}$/);
            const thumbnail = await fetch(base + `/api/clips/${selected.id}.jpg`, { headers: authHeaders }); assert.equal(thumbnail.status, 200); assert.equal(thumbnail.headers.get('content-type'), 'image/jpeg');
            const image = Buffer.from(await thumbnail.arrayBuffer()); assert.equal(image.readUInt16BE(0), 0xffd8);
            const second = await call('/api/session', token);
            const denied = await fetch(base + `/api/clips/${selected.id}.mp4`, { headers: { Origin: origin, Authorization: `Bearer ${second.sessionToken}` } });
            assert.equal(denied.status, 409, 'Another authenticated operator cannot read the active owner’s clips');
            const exported = await fetch(base + `/api/clips/${selected.id}.mp4`, { headers: authHeaders });
            assert.equal(exported.status, 200); assert.equal(exported.headers.get('cache-control'), 'no-store');
            const exportedFile = path.join(dir, 'exported.mp4'); fs.writeFileSync(exportedFile, Buffer.from(await exported.arrayBuffer()));
            const probe = spawnSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', exportedFile], { timeout: 5000, encoding: 'utf8' });
            assert.equal(probe.status, 0, probe.stderr); const streams = JSON.parse(probe.stdout).streams;
            assert.equal(streams[0].width, 1920); assert.ok(streams.some(s => s.codec_name === 'aac'));
            for (let i = 0; i < 100 && sending.size < 2; i++) await new Promise(resolve => setTimeout(resolve, 50));
            assert.equal(sending.size, 2, 'Both real writers must send video before simulating YouTube live status: ' + JSON.stringify(lastStats));
            await call('/api/youtube/transition', sessionToken, { state: 'testing' });
            await call('/api/youtube/transition', sessionToken, { state: 'live' });
            await call('/api/youtube/transition', sessionToken, { state: 'complete' });
            const stillRunning = await fetch(base + '/api/info', { headers: authHeaders }); assert.equal((await stillRunning.json()).busy, true, 'Facebook keeps streaming after YouTube ends');
            ws.send(JSON.stringify({ type: 'stop' }));
          } catch (e) { clearTimeout(timer); reject(e); }
        }
        if (m.type === 'stopped') { clearTimeout(timer); resolve(); }
      });
    });
    assert.deepEqual(errors, []);
    for (const name of ['youtube.flv', 'facebook.flv']) {
      const p = spawnSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', path.join(dir, name)], { timeout: 5000, encoding: 'utf8' });
      assert.equal(p.status, 0, p.stderr); const streams = JSON.parse(p.stdout).streams;
      assert.equal(streams[0].width, 1920); assert.equal(streams[0].height, 1080);
      assert.ok(streams.some(s => s.codec_name === 'aac'));
      const pixel = spawnSync('ffmpeg', ['-v', 'error', '-i', path.join(dir, name), '-vf', 'crop=2:2:80:910,scale=1:1', '-frames:v', '1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], { timeout: 5000 });
      assert.equal(pixel.status, 0, pixel.stderr?.toString()); assert.ok(pixel.stdout[2] > 125 && pixel.stdout[0] < 80, 'The selected-match score graphic must be burned into both platform outputs');
    }
    const r = await fetch(base + '/api/info', { headers: { Origin: origin, Authorization: `Bearer ${sessionToken}` } });
    assert.equal((await r.json()).busy, false);
  } finally {
    ws?.terminate();
    if (relay && relay.exitCode === null) { relay.kill(); await new Promise(resolve => relay.once('exit', resolve)); }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
