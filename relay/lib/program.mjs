import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { ReplayRing, JpegFrames, AUDIO_BYTES_PER_FRAME } from './replay-ring.mjs';
import { CricketEvents, FPS } from './events.mjs';
import { GraphicRenderer } from './graphics.mjs';

export function cameraArgs(mimeType, width = 1920, height = 1080) {
  return ['-hide_banner', '-loglevel', 'warning', '-protocol_whitelist', 'pipe', '-probesize', '3000000', '-analyzeduration', '1000000',
    '-f', mimeType.toLowerCase().startsWith('video/webm') ? 'matroska' : 'mov', '-i', 'pipe:0',
    '-map', '0:v:0', '-vf', `scale=w=min(iw\\,${width}):h=min(ih\\,${height}):force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,fps=30:start_time=0`,
    '-c:v', 'mjpeg', '-q:v', '2', '-pix_fmt', 'yuvj420p', '-threads', '2', '-f', 'image2pipe', 'pipe:1',
    '-map', '0:a:0', '-c:a', 'pcm_s16le', '-ar', '44100', '-ac', '2', '-af', 'aresample=async=1000:first_pts=0', '-f', 's16le', 'pipe:3'];
}
export function programArgs({ bitrateKbps = 6000, width = 1920, height = 1080, mp4 = false, preset = 'veryfast' } = {}) {
  if (!['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium'].includes(preset)) preset = 'veryfast';
  const input = (codec, fd) => ['-thread_queue_size', '64', '-probesize', '32', '-analyzeduration', '1', '-f', 'image2pipe', '-framerate', '30', '-c:v', codec, '-i', `pipe:${fd}`];
  const args = ['-hide_banner', '-loglevel', 'warning', '-nostats', '-progress', 'pipe:2',
    ...input('mjpeg', 0), '-thread_queue_size', '128', '-probesize', '32', '-analyzeduration', '1', '-f', 's16le', '-ar', '44100', '-ac', '2', '-i', 'pipe:3', ...input('png', 4),
    '-filter_complex', `[0:v]scale=${width}:${height}:flags=fast_bilinear,setsar=1[cam];[2:v]scale=${width}:${height}[graphic];[cam][graphic]overlay=shortest=1:format=auto,format=yuv420p[out]`,
    '-map', '[out]', '-map', '1:a:0', '-c:v', 'libx264', '-threads', '4', '-preset', preset, '-tune', 'zerolatency',
    '-profile:v', 'high', '-level:v', '4.1', '-pix_fmt', 'yuv420p', '-g', '60', '-keyint_min', '60', '-sc_threshold', '0',
    '-b:v', `${bitrateKbps}k`, '-maxrate', `${bitrateKbps}k`, '-bufsize', `${bitrateKbps * 2}k`,
    '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2', '-shortest'];
  return mp4 ? [...args, '-movflags', 'frag_keyframe+empty_moov+default_base_moof', '-f', 'mp4', 'pipe:1']
    : [...args, '-minrate', `${bitrateKbps}k`, '-x264-params', 'nal-hrd=cbr:force-cfr=1', '-flvflags', 'no_duration_filesize', '-f', 'flv', 'pipe:1'];
}
const clipPublic = c => ({ id: c.id, title: c.title, duration: c.frames.length / FPS, createdAt: c.createdAt, timing: c.timing });
export class BroadcastProgram extends EventEmitter {
  constructor({ binary, font, dir, mimeType, options, bitrateKbps, score, overlay = true, width = 1920, height = 1080, realtime = true, preset }) {
    super(); this.options = options; this.binary = binary; this.renderer = new GraphicRenderer(font); this.detector = new CricketEvents();
    this.ring = new ReplayRing({ seconds: options.bufferSeconds, maxBytes: options.memoryBytes }); this.clips = new Map(); this.pending = []; this.queue = [];
    this.width = width; this.height = height; this.score = score; this.showOverlay = overlay; this.cursor = null; this.current = null;
    this.outputFrames = 0; this.firstOutputAt = null; this.cameraDone = false; this.closing = false; this.dead = false; this.blocked = false; this.realtime = realtime; this.mark = null;
    if (score) this.detector.update(score);
    this.encoder = spawn(binary, programArgs({ bitrateKbps, width, height, preset }), { cwd: dir, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe', 'pipe', 'pipe'] });
    this.camera = spawn(binary, cameraArgs(mimeType, width, height), { cwd: dir, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe', 'pipe'] });
    for (const p of [this.camera, this.encoder]) { p.on('error', () => this.fail('A broadcast processing component could not start.')); p.stdin.on('error', () => {}); }
    for (const fd of [3, 4]) this.encoder.stdio[fd].on('error', () => {});
    const jpeg = new JpegFrames(frame => { this.ring.video(frame); });
    this.camera.stdout.on('data', chunk => { try { jpeg.push(chunk); } catch (e) { this.fail(e.message); } });
    this.camera.stdio[3].on('data', chunk => this.ring.pcm(chunk));
    this.camera.stderr.on('data', () => {}); // may contain media metadata; not forwarded
    this.encoder.stderr.on('data', c => { const m = [...c.toString().matchAll(/frame=(\d+)/g)].at(-1); if (m) this.emit('progress', Number(m[1])); });
    this.camera.on('close', code => { this.cameraDone = true; if (code && !this.closing && !this.dead) this.fail('Camera data could not be decoded for replay. Try a supported camera/browser.'); });
    this.encoder.on('close', code => { if (!this.inputsEnded && !this.closing && !this.dead) this.fail(code ? 'Broadcast encoder stopped. Check laptop performance.' : 'Broadcast output ended unexpectedly.'); this.dispose(); });
    this.timer = setInterval(() => { try { this.pump(); } catch (e) { this.fail(e.message); } }, 8);
  }
  fail(message) { if (this.dead) return; this.emit('failure', message); this.stop(false); }
  setScore(score) {
    if (!score) return;
    if (this.score && (this.score.clubId !== score.clubId || this.score.matchId !== score.matchId || this.score.innings !== score.innings || this.score.batting !== score.batting)) {
      this.pending = []; this.queue = []; this.mark = null;
      if (this.current) { this.current = null; this.emit('graphic', null); }
    }
    const events = this.detector.update(score); this.score = score;
    for (const event of events.filter(e => ['team', 'player'].includes(e.type))) if (this.options.milestones) this.enqueue({ ...event, frames: 60 });
    for (const event of events.filter(e => ['boundary', 'delivery'].includes(e.type))) {
      const mark = this.mark; this.mark = null;
      if (event.type !== 'boundary' || !this.options.replay) continue;
      const at = mark && Date.now() - mark.at < 25000 ? mark.index
        : event.timing === 'provider' && this.ring.origin !== null ? Math.round((event.occurredAt - this.ring.origin) * FPS / 1000)
          : this.ring.latest - Math.round(this.options.scorerDelay * FPS);
      this.pending.push({ event, score: structuredClone(score), start: at - 4 * FPS, end: at + 4 * FPS - 1, deadline: Date.now() + 10000,
        timing: mark ? 'ball mark' : event.timing === 'provider' ? 'provider timestamp' : 'calibrated scoring delay' });
      if (this.pending.length > 2) this.pending.shift();
    }
    for (const event of events.filter(e => e.type === 'over')) if (this.options.cards) {
      this.enqueue({ ...event, type: 'batting', frames: 60 }); this.enqueue({ ...event, type: 'bowling', frames: 60 });
    }
  }
  enqueue(event) { if (this.queue.length >= 12 || this.closing) return false; this.queue.push({ ...event, queuedAt: Date.now() }); return true; }
  cards(kind) {
    if (!['batting', 'bowling'].includes(kind) || !this.score) throw new Error('Load a scorecard first.');
    return this.enqueue({ type: kind, id: `manual:${randomBytes(6).toString('hex')}`, frames: 60, over: Math.floor(Number(this.score.overs)), cards: this.detector.cards(this.score) });
  }
  markBall() { this.mark = { index: this.ring.latest, at: Date.now() }; return this.mark.index; }
  snapshot() { return { bufferSeconds: Number(this.ring.seconds.toFixed(1)), memoryMB: Math.round(this.ring.bytes / 1048576), clips: [...this.clips.values()].map(clipPublic).reverse(), cards: this.score ? this.detector.cards(this.score) : null,
    current: this.current ? { type: this.current.type, title: this.current.title || this.current.type, remaining: Math.max(0, (this.current.frames - this.current.position) / FPS) } : null }; }
  storeClip(frames, title, score, timing) {
    const bytes = frames.reduce((n, f) => n + f.jpeg.length + f.audio.length, 0);
    if (bytes > this.options.clipBytes) throw new Error('This clip exceeds the replay memory limit.');
    let used = [...this.clips.values()].reduce((n, c) => n + c.bytes, 0);
    while ((used + bytes > this.options.clipBytes || this.clips.size >= 3) && this.clips.size) {
      const removable = [...this.clips.values()].find(c => c.id !== this.current?.clipId); if (!removable) throw new Error('Replay memory is busy. Try again after the current replay.');
      this.clips.delete(removable.id); used -= removable.bytes;
    }
    const clip = { id: randomBytes(8).toString('hex'), frames, title, score, timing, bytes, createdAt: Date.now() };
    this.clips.set(clip.id, clip); this.emit('clips', this.snapshot()); return clip;
  }
  selectClip(behind = 0) {
    if (!Number.isFinite(behind) || behind < 0 || behind > this.options.bufferSeconds) throw new Error('Replay position is outside the current buffer.');
    const end = Math.max(this.ring.first + FPS - 1, this.ring.latest - Math.round(behind * FPS)), count = Math.min(8 * FPS, end - this.ring.first + 1);
    if (count < FPS) throw new Error('Replay buffer is still warming up.');
    const frames = this.ring.window(end - count + 1, count); if (!frames) throw new Error('That footage is no longer buffered.');
    return this.storeClip(frames, 'Selected ball clip', structuredClone(this.score), 'manual selection');
  }
  replay(id) {
    const clip = this.clips.get(id); if (!clip) throw new Error('Clip expired from the private buffer.');
    if (this.current?.type === 'replay' || this.queue.some(q => q.type === 'replay')) throw new Error('A replay is already queued or on air.');
    return this.enqueue({ type: 'replay', id: `replay:${id}`, clipId: id, title: clip.title, frames: clip.frames.length });
  }
  servicePending() {
    this.pending = this.pending.filter(p => {
      if (p.deadline < Date.now() || p.start < this.ring.first) { this.emit('warning', 'Boundary detected, but its complete ball clip is outside the replay buffer. Adjust scoring delay or use Mark ball.'); return false; }
      if (p.end > this.ring.latest) return true;
      const frames = this.ring.window(p.start, p.end - p.start + 1); if (!frames) return false;
      try { const clip = this.storeClip(frames, `${p.event.runs === 4 ? 'FOUR' : 'SIX'} · ${p.event.name || 'Boundary'}`, p.score, p.timing); this.replay(clip.id); }
      catch (e) { this.emit('warning', e.message); }
      return false;
    });
  }
  pump() {
    if (this.dead || this.inputsEnded || this.blocked) return;
    this.servicePending();
    if (this.cursor === null) {
      if (!this.cameraDone && this.ring.seconds < 1.5) return;
      this.cursor = this.ring.first; this.firstOutputAt = Date.now();
    }
    const target = this.realtime ? Math.floor((Date.now() - this.firstOutputAt) * FPS / 1000) : this.outputFrames + 2;
    if (this.outputFrames > target) return;
    if (!this.current && !this.closing) {
      while (this.queue.length) {
        const job = this.queue.shift(); if (Date.now() - job.queuedAt > 30000 || (job.type === 'replay' && !this.clips.has(job.clipId))) continue;
        this.current = { ...job, position: 0 }; break;
      }
    }
    const replay = this.current?.type === 'replay', clip = replay ? this.clips.get(this.current.clipId) : null;
    if (this.cursor < this.ring.first) { this.cursor = Math.max(this.ring.first, this.ring.latest - 45); this.emit('warning', 'Live monitor caught up with the replay buffer; check laptop processing performance.'); }
    const frame = replay ? clip?.frames[this.current.position] : this.ring.get(this.cursor);
    if (!frame) {
      if (this.cameraDone && !replay) this.endInputs();
      return;
    }
    const event = replay ? null : this.current, score = replay ? clip.score : this.score;
    const png = this.renderer.frame(score, event, replay, this.showOverlay);
    if (this.current?.position === 0) this.emit('graphic', { type: this.current.type, title: this.current.title || this.current.type, duration: this.current.frames / FPS, png: png.toString('base64') });
    this.write(frame, png); this.emit('frame', { output: this.outputFrames, source: frame.index, graphic: this.current?.type || null }); this.outputFrames++; this.cursor++;
    if (this.current && ++this.current.position >= this.current.frames) {
      if (replay) this.cursor = Math.max(this.ring.first, this.ring.latest - 45);
      this.current = null; this.emit('graphic', null);
    }
  }
  write(frame, png) {
    const streams = [this.encoder.stdin, this.encoder.stdio[3], this.encoder.stdio[4]], data = [frame.jpeg, frame.audio, png];
    const waiting = [];
    for (let i = 0; i < streams.length; i++) if (!streams[i].destroyed && !streams[i].write(data[i])) waiting.push(streams[i]);
    if (waiting.length) { this.blocked = true; let n = waiting.length; for (const s of waiting) s.once('drain', () => { if (!--n) this.blocked = false; }); }
  }
  endInputs() { if (this.inputsEnded) return; this.inputsEnded = true; clearInterval(this.timer); for (const fd of [0, 3, 4]) { const stream = fd === 0 ? this.encoder.stdin : this.encoder.stdio[fd]; if (!stream.destroyed) stream.end(); } }
  stop(graceful) {
    this.closing = true; this.queue = []; this.pending = []; this.current = null;
    if (graceful) this.camera.stdin.end(); else {
      this.dead = true;
      for (const p of [this.camera, this.encoder]) { for (const s of p.stdio) if (s && !s.destroyed) s.destroy(); p.kill(); const timeout = setTimeout(() => { if (p.exitCode === null) p.kill('SIGKILL'); }, 500); timeout.unref(); }
      this.dispose();
    }
  }
  dispose() { clearInterval(this.timer); this.ring.clear(); this.clips.clear(); this.renderer.cache.clear(); }
  exportClip(id) {
    const clip = this.clips.get(id); if (!clip) throw new Error('Clip expired from the private buffer.');
    const child = spawn(this.binary, programArgs({ mp4: true, width: this.width, height: this.height }), { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe', 'pipe', 'pipe'] });
    for (const fd of [0, 3, 4]) (fd === 0 ? child.stdin : child.stdio[fd]).on('error', () => {});
    child.stderr.on('data', () => {});
    const png = this.renderer.frame(clip.score, null, true, this.showOverlay);
    const feed = async () => {
      for (const frame of clip.frames) {
        if (child.killed) break;
        const streams = [child.stdin, child.stdio[3], child.stdio[4]], data = [frame.jpeg, frame.audio, png], waits = [];
        for (let i = 0; i < streams.length; i++) if (!streams[i].destroyed && !streams[i].write(data[i])) waits.push(new Promise(resolve => { streams[i].once('drain', resolve); streams[i].once('close', resolve); }));
        await Promise.all(waits);
      }
      for (const fd of [0, 3, 4]) { const s = fd === 0 ? child.stdin : child.stdio[fd]; if (!s.destroyed) s.end(); }
    };
    return { child, feed };
  }
}
