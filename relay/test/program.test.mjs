import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { BroadcastProgram } from '../lib/program.mjs';
import { automationOptions } from '../lib/events.mjs';
import { findFont, probeEncoder } from '../lib/encoder.mjs';
const font = findFont(), ready = probeEncoder('ffmpeg', font).ready;
test('real encoded popups and consecutive scorecards each occupy exactly 60 frames', { skip: !ready, timeout: 45000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'boundary-program-test-')); let p;
  try {
    const source = spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=0x19523b:s=1920x1080:r=30',
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100', '-t', '7', '-c:v', 'libx264', '-threads', '2', '-preset', 'ultrafast', '-g', '30',
      '-c:a', 'aac', '-movflags', 'frag_keyframe+empty_moov+default_base_moof', '-f', 'mp4', 'pipe:1'], { maxBuffer: 15_000_000, timeout: 10000 });
    assert.equal(source.status, 0, source.stderr.toString());
    const score = { clubId: '300', matchId: '986', innings: '1', batting: 'ICAT', bowling: 'RBCC', runs: '100', wickets: '3', overs: '10', status: 'live', fetchedAt: Date.now(), batters: [] };
    p = new BroadcastProgram({ binary: 'ffmpeg', font, dir, mimeType: 'video/mp4', options: automationOptions(), bitrateKbps: 5000, score, overlay: false, realtime: false });
    const phases = [], failures = [], output = [];
    p.on('graphic', g => phases.push({ frame: p.outputFrames, type: g?.type || null })); p.on('failure', m => failures.push(m)); p.encoder.stdout.on('data', b => output.push(b));
    const cards = { batting: [{ name: 'Batter A', runs: '50', balls: '35', fours: '5', sixes: '1' }], bowling: [{ name: 'Bowler B', overs: '2', runs: '14', wickets: '1' }], complete: true, battingTeam: 'ICAT', bowlingTeam: 'RBCC' };
    p.enqueue({ type: 'team', milestone: 100, title: 'ICAT', frames: 60 });
    p.enqueue({ type: 'batting', cards, over: 10, frames: 60 }); p.enqueue({ type: 'bowling', cards, over: 10, frames: 60 });
    const closed = new Promise(resolve => p.encoder.once('close', resolve)); p.camera.stdin.end(source.stdout);
    const timeout = setTimeout(() => p.stop(false), 28000); await closed; clearTimeout(timeout);
    assert.deepEqual(failures, []);
    assert.deepEqual(phases.slice(0, 6), [{ frame: 0, type: 'team' }, { frame: 60, type: null }, { frame: 60, type: 'batting' }, { frame: 120, type: null }, { frame: 120, type: 'bowling' }, { frame: 180, type: null }]);
    const file = path.join(dir, 'program.flv'); fs.writeFileSync(file, Buffer.concat(output));
    const probe = spawnSync('ffprobe', ['-v', 'error', '-count_frames', '-show_streams', '-of', 'json', file], { encoding: 'utf8', timeout: 10000 });
    assert.equal(probe.status, 0, probe.stderr); const streams = JSON.parse(probe.stdout).streams;
    assert.equal(Number(streams[0].nb_read_frames), p.outputFrames); assert.equal(streams[0].r_frame_rate, '30/1');
    assert.equal(streams[0].width, 1920); assert.equal(streams[0].height, 1080); assert.ok(streams.some(s => s.codec_name === 'aac'));
    // Camera green at this coordinate, milestone panel blue for exactly the first 60 encoded frames.
    const pixels = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', 'crop=2:2:600:450,scale=1:1,format=rgb24', '-fps_mode', 'passthrough', '-f', 'rawvideo', 'pipe:1'], { timeout: 10000 });
    assert.equal(pixels.status, 0); const greens = [...pixels.stdout].filter((_, i) => i % 3 === 1);
    assert.equal(greens.length, p.outputFrames);
    assert.ok(greens.slice(0, 180).every(g => g < 60)); assert.ok(greens[180] > 60, `Live camera should return after the cards: ${greens[180]}`);
  } finally { p?.stop(false); fs.rmSync(dir, { recursive: true, force: true }); }
});
test('replaying a buffered ball changes source frames without resetting program timestamps', { skip: !ready, timeout: 35000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'boundary-replay-test-')); let p;
  try {
    const source = spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=0x19523b:s=1920x1080:r=30', '-f', 'lavfi', '-i', 'sine=sample_rate=44100', '-t', '4', '-c:v', 'libx264', '-threads', '2', '-preset', 'ultrafast', '-c:a', 'aac', '-movflags', 'frag_keyframe+empty_moov+default_base_moof', '-f', 'mp4', 'pipe:1'], { maxBuffer: 15_000_000, timeout: 10000 });
    assert.equal(source.status, 0);
    p = new BroadcastProgram({ binary: 'ffmpeg', font, dir, mimeType: 'video/mp4', options: automationOptions(), bitrateKbps: 4500, overlay: false, realtime: false });
    const frames = [], output = []; p.encoder.stdout.on('data', b => output.push(b)); p.on('failure', m => assert.fail(m));
    p.on('frame', f => { frames.push(f); if (f.output === 45) { const clip = p.storeClip(p.ring.window(0, 30), 'Test ball', null, 'manual mark'); p.replay(clip.id); } });
    const closed = new Promise(resolve => p.encoder.once('close', resolve)); p.camera.stdin.end(source.stdout); const timer = setTimeout(() => p.stop(false), 22000); await closed; clearTimeout(timer);
    const replay = frames.filter(f => f.graphic === 'replay'); assert.equal(replay.length, 30); assert.deepEqual(replay.map(f => f.source), Array.from({ length: 30 }, (_, i) => i));
    const file = path.join(dir, 'replay.flv'); fs.writeFileSync(file, Buffer.concat(output));
    const result = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_packets', '-show_entries', 'packet=pts_time', '-of', 'json', file], { encoding: 'utf8', timeout: 10000 });
    assert.equal(result.status, 0); const pts = JSON.parse(result.stdout).packets.map(p => Number(p.pts_time));
    assert.ok(pts.every((t, i) => i === 0 || t > pts[i - 1])); assert.ok(pts.every((t, i) => i === 0 || Math.abs(t - pts[i - 1] - 1 / 30) < .002));
  } finally { p?.stop(false); fs.rmSync(dir, { recursive: true, force: true }); }
});
