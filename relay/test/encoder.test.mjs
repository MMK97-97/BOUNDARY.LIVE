import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { findFont, probeEncoder, ingestArgs, outputArgs } from '../lib/encoder.mjs';
import { normalizeScore } from '../lib/score.mjs';
const font = findFont();
const ready = probeEncoder('ffmpeg', font).ready;
test('real FWCWL match 986 regression: correct teams, innings, total and completed status', () => {
  const raw = JSON.parse(fs.readFileSync(new URL('./fixtures/fwcwl-986.json', import.meta.url)));
  const score = normalizeScore(raw, { clubId: '300', matchId: '986' });
  assert.equal(score.batting, 'ICAT'); assert.equal(score.runs, '208'); assert.equal(score.wickets, '5');
  assert.equal(score.overs, '30.5'); assert.equal(score.status, 'complete');
  assert.equal(score.result, 'ICAT won by 5 Wickets'); assert.equal(score.series, 'FWCWL 2026-27 Season');
  assert.equal(score.teams[0].runs, '207'); assert.equal(score.teams[0].code, 'RBCC');
});
test('real FFmpeg accepts the VP8/Opus WebM fallback used by Android browsers', { skip: !ready, timeout: 30000 }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'boundary-webm-test-'));
  try {
    const source = spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=0x19523b:s=1920x1080:r=30',
      '-f', 'lavfi', '-i', 'sine=sample_rate=48000', '-t', '0.7', '-c:v', 'libvpx', '-deadline', 'realtime', '-cpu-used', '8',
      '-threads', '2', '-b:v', '1000k', '-c:a', 'libopus', '-f', 'webm', 'pipe:1'], { maxBuffer: 10_000_000, timeout: 15000 });
    assert.equal(source.status, 0, source.stderr?.toString());
    const encoded = spawnSync('ffmpeg', ingestArgs({ font, overlay: false, mimeType: 'video/webm;codecs=vp8,opus' }),
      { cwd: dir, input: source.stdout, maxBuffer: 10_000_000, timeout: 15000 });
    assert.equal(encoded.status, 0, encoded.stderr?.toString()); assert.ok(encoded.stdout.length > 1000);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('real FFmpeg: fragmented AVC input → burned score at 1080p30 → portrait → copy output', { skip: !ready, timeout: 60000 }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'boundary-encoder-test-'));
  try {
    fs.writeFileSync(path.join(dir, 'score-main.txt'), 'ICAT 208/5    30.5 ov   CRR 6.75');
    fs.writeFileSync(path.join(dir, 'score-detail.txt'), 'MATCH COMPLETE | ICAT won by 5 Wickets | CricClubs');
    const input = path.join(dir, 'phone.mp4'), landscape = path.join(dir, 'landscape.flv'), portrait = path.join(dir, 'portrait.flv'), copy = path.join(dir, 'copy.flv');
    function run(binary, args, options = {}) {
      const r = spawnSync(binary, args, { cwd: dir, maxBuffer: 30 * 1024 * 1024, timeout: 20000, ...options });
      assert.equal(r.status, 0, r.stderr?.toString().slice(-1600) || r.error?.message); return r;
    }
    run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=0x19523b:s=1920x1080:r=30',
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100', '-t', '1.5', '-c:v', 'libx264', '-threads', '2', '-preset', 'ultrafast',
      '-pix_fmt', 'yuv420p', '-g', '30', '-c:a', 'aac', '-movflags', 'frag_keyframe+empty_moov+default_base_moof', input]);
    const encoded = run('ffmpeg', ingestArgs({ font }), { input: fs.readFileSync(input) }); fs.writeFileSync(landscape, encoded.stdout);
    run('ffmpeg', outputArgs({ id: 'instagram', url: portrait }), { input: encoded.stdout });
    run('ffmpeg', outputArgs({ id: 'youtube', url: copy }), { input: encoded.stdout });
    function probe(file) { return JSON.parse(run('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', file]).stdout).streams; }
    const l = probe(landscape), p = probe(portrait), c = probe(copy);
    assert.equal(l[0].width, 1920); assert.equal(l[0].height, 1080); assert.equal(l[0].codec_name, 'h264');
    assert.equal(l[0].r_frame_rate, '30/1'); assert.ok(l.some(s => s.codec_name === 'aac'));
    assert.equal(p[0].width, 720); assert.equal(p[0].height, 1280); assert.equal(c[0].width, 1920);
    // A decoded pixel in the overlay area must differ from the green camera source.
    const pixel = run('ffmpeg', ['-v', 'error', '-i', landscape, '-vf', 'crop=2:2:60:890,format=rgb24', '-frames:v', '1', '-f', 'rawvideo', 'pipe:1']).stdout;
    assert.ok(pixel.length >= 3); assert.ok(pixel[1] < 65, `Overlay bar was not burned in: ${[...pixel.slice(0, 3)]}`);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
