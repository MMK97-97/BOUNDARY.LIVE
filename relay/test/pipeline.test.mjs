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
test('real WebSocket upload fans out to two FFmpeg writers and stops cleanly without external broadcasting', { skip: !available, timeout: 35000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'boundary-pipeline-'));
  let relay, ws;
  try {
    const clip = path.join(dir, 'camera.mp4');
    const generated = spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=0x19523b:s=1920x1080:r=30',
      '-f', 'lavfi', '-i', 'sine=sample_rate=44100', '-t', '5', '-c:v', 'libx264', '-threads', '2', '-preset', 'ultrafast',
      '-g', '30', '-c:a', 'aac', '-movflags', 'frag_keyframe+empty_moov+default_base_moof', clip], { timeout: 10000 });
    assert.equal(generated.status, 0, generated.stderr?.toString());
    // This temporary test wrapper redirects only the test's fake RTMPS targets
    // to local files. It is not a runtime option in the application.
    const wrapper = path.join(dir, 'ffmpeg-test-wrapper.mjs');
    fs.writeFileSync(wrapper, `#!${process.execPath}\nimport {spawn} from 'node:child_process';\nimport path from 'node:path';\nconst args=process.argv.slice(2);\nconst last=args.at(-1)||'';\nif(last.startsWith('rtmps://')) {\n if(!process.env.BOUNDARY_TEST_DIR) process.exit(90);\n const name=last.includes('youtube.com')?'youtube.flv':'facebook.flv';\n args[args.length-1]=path.join(process.env.BOUNDARY_TEST_DIR,name);\n}\nconst stdio=['inherit','inherit','inherit']; if(args.includes('pipe:3'))stdio.push(3); if(args.includes('pipe:4'))stdio.push(4); const p=spawn('ffmpeg',args,{stdio});\np.on('error',()=>process.exit(91));\np.on('exit',code=>process.exit(code??1));\nprocess.on('SIGTERM',()=>p.kill());\n`, { mode: 0o700 });
    const origin = 'https://example.github.io', token = 'pipeline-test-secret-longer-than-32-characters';
    relay = spawn(process.execPath, [fileURLToPath(new URL('../server.mjs', import.meta.url))], { env: {
      ...process.env, PORT: '0', HOST: '127.0.0.1', RELAY_TOKEN: token, ALLOWED_ORIGINS: origin,
      FFMPEG_PATH: wrapper, BOUNDARY_TEST_DIR: dir,
      YOUTUBE_SERVER: 'rtmps://a.rtmps.youtube.com/live2', YOUTUBE_KEY: 'local-test-only',
      FACEBOOK_SERVER: 'rtmps://live-api-s.facebook.com/rtmp', FACEBOOK_KEY: 'local-test-only', INSTAGRAM_KEY: '', INSTAGRAM_SERVER: ''
    }, stdio: ['ignore', 'pipe', 'pipe'] });
    const base = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Startup timeout')), 10000);
      relay.stdout.on('data', c => { const m = c.toString().match(/Boundary relay: (http:\/\/[^\s]+)/); if (m) { clearTimeout(timer); resolve(m[1]); } });
    });
    const call = async (route, credential) => {
      const r = await fetch(base + route, { method: 'POST', headers: { Origin: origin, Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json' }, body: '{}' });
      assert.ok(r.ok); return r.json();
    };
    const { sessionToken } = await call('/api/session', token), { ticket } = await call('/api/ticket', sessionToken);
    ws = new WebSocket(base.replace('http:', 'ws:') + '/ingest', { origin });
    const errors = [];
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Pipeline did not stop')), 16000);
      ws.on('error', reject);
      ws.on('open', () => ws.send(JSON.stringify({ type: 'start', ticket, width: 1920, height: 1080, mimeType: 'video/mp4', overlay: false, destinations: ['youtube', 'facebook'] })));
      ws.on('message', async data => {
        const m = JSON.parse(data.toString());
        if (m.type === 'error') errors.push(m.message);
        if (m.type === 'ready') {
          try {
            const bytes = fs.readFileSync(clip);
            for (let i = 0; i < bytes.length; i += 16000) ws.send(bytes.subarray(i, i + 16000));
            const authHeaders = { Origin: origin, Authorization: `Bearer ${sessionToken}` };
            let snapshot;
            for (let i = 0; i < 100; i++) {
              snapshot = await (await fetch(base + '/api/automation', { headers: authHeaders })).json();
              if (snapshot.bufferSeconds >= 1) break;
              await new Promise(resolve => setTimeout(resolve, 50));
            }
            assert.ok(snapshot.bufferSeconds >= 1, 'Private replay buffer should warm up during upload');
            const selected = await call('/api/clip/select', sessionToken); assert.match(selected.id, /^[a-f0-9]{16}$/);
            const second = await call('/api/session', token);
            const denied = await fetch(base + `/api/clips/${selected.id}.mp4`, { headers: { Origin: origin, Authorization: `Bearer ${second.sessionToken}` } });
            assert.equal(denied.status, 409, 'Another authenticated operator cannot read the active owner’s clips');
            const exported = await fetch(base + `/api/clips/${selected.id}.mp4`, { headers: authHeaders });
            assert.equal(exported.status, 200); assert.equal(exported.headers.get('cache-control'), 'no-store');
            const exportedFile = path.join(dir, 'exported.mp4'); fs.writeFileSync(exportedFile, Buffer.from(await exported.arrayBuffer()));
            const probe = spawnSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', exportedFile], { timeout: 5000, encoding: 'utf8' });
            assert.equal(probe.status, 0, probe.stderr); const streams = JSON.parse(probe.stdout).streams;
            assert.equal(streams[0].width, 1920); assert.ok(streams.some(s => s.codec_name === 'aac'));
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
    }
    const r = await fetch(base + '/api/info', { headers: { Origin: origin, Authorization: `Bearer ${sessionToken}` } });
    assert.equal((await r.json()).busy, false);
  } finally {
    ws?.terminate();
    if (relay && relay.exitCode === null) { relay.kill(); await new Promise(resolve => relay.once('exit', resolve)); }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
