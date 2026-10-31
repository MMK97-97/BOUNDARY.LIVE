import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { CricketEvents, FPS } from './events.mjs';
import { GraphicRenderer } from './graphics.mjs';

// A single encoder reads the original camera/audio plus transparent graphics.
// No camera frames, PCM history, highlights or exports are retained.
export function liveProgramArgs({ mimeType = 'video/mp4', bitrateKbps = 6000, width = 1920, height = 1080, preset = 'veryfast', framing = 'fit' } = {}) {
  if (!['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium'].includes(preset)) preset = 'veryfast';
  const cameraFilter = framing === 'fill'
    ? `scale=${width}:${height}:force_original_aspect_ratio=increase:force_divisible_by=2,crop=${width}:${height}`
    : `scale=w=min(iw\\,${width}):h=min(ih\\,${height}):force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`;
  return ['-hide_banner', '-loglevel', 'warning', '-nostats', '-progress', 'pipe:2',
    '-protocol_whitelist', 'pipe', '-probesize', '3000000', '-analyzeduration', '1000000',
    '-f', mimeType.toLowerCase().startsWith('video/webm') ? 'matroska' : 'mov', '-i', 'pipe:0',
    '-thread_queue_size', '32', '-probesize', '32', '-analyzeduration', '1', '-f', 'image2pipe', '-framerate', '30', '-c:v', 'png', '-i', 'pipe:3',
    '-filter_complex', `[0:v]setpts=PTS-STARTPTS,${cameraFilter},setsar=1,fps=30[cam];[1:v]scale=${width}:${height}[graphic];[cam][graphic]overlay=shortest=1:format=auto,format=yuv420p[out]`,
    '-map', '[out]', '-map', '0:a:0?', '-c:v', 'libx264', '-threads', '4', '-filter_complex_threads', '2', '-preset', preset, '-tune', 'zerolatency',
    '-profile:v', 'high', '-level:v', '4.1', '-pix_fmt', 'yuv420p', '-g', '60', '-keyint_min', '60', '-sc_threshold', '0',
    '-b:v', `${bitrateKbps}k`, '-maxrate', `${bitrateKbps}k`, '-minrate', `${bitrateKbps}k`, '-bufsize', `${bitrateKbps * 2}k`,
    '-x264-params', 'nal-hrd=cbr:force-cfr=1', '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2', '-af', 'aresample=async=1000:first_pts=0',
    '-shortest', '-flvflags', 'no_duration_filesize', '-flush_packets', '1', '-f', 'flv', 'pipe:1'];
}
export class LiveProgram extends EventEmitter {
  constructor({ binary, font, dir, mimeType, options, bitrateKbps, score, overlay = true, width = 1920, height = 1080, realtime = true, preset, framing }) {
    super(); this.options = options; this.renderer = new GraphicRenderer(font, { width, height }); this.detector = new CricketEvents();
    this.score = score; this.showOverlay = overlay; this.queue = []; this.current = null; this.outputFrames = 0;
    this.startedAt = null; this.realtime = realtime; this.blocked = false; this.closing = false; this.dead = false;
    if (score) this.detector.update(score);
    this.encoder = spawn(binary, liveProgramArgs({ mimeType, bitrateKbps, width, height, preset, framing }), { cwd: dir, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe', 'pipe'] });
    this.encoder.on('error', () => this.fail('The live encoder could not start.'));
    this.encoder.stdin.on('error', () => {}); this.encoder.stdio[3].on('error', () => {});
    this.encoder.on('close', () => this.dispose());
    this.timer = setInterval(() => { try { this.pump(); } catch { this.fail('Live graphics could not be processed. Reconnect and try again.'); } }, 16);
  }
  startFrames() { if (this.startedAt === null) this.startedAt = Date.now(); }
  fail(message) { if (this.dead) return; this.emit('failure', message); this.stop(false); }
  setScore(score) {
    if (score && this.score && (score.clubId !== this.score.clubId || score.matchId !== this.score.matchId || score.innings !== this.score.innings || score.batting !== this.score.batting)) {
      this.queue = []; this.current = null; this.emit('graphic', null);
    }
    const events = this.detector.update(score); this.score = score;
    for (const event of events) {
      if (['team', 'player'].includes(event.type) && this.options.milestones) this.enqueue({ ...event, frames: 60 });
      if (event.type === 'over' && this.options.cards) { this.enqueue({ ...event, type: 'batting', frames: 60 }); this.enqueue({ ...event, type: 'bowling', frames: 60 }); }
    }
  }
  enqueue(event) {
    if (!['team', 'player', 'batting', 'bowling'].includes(event.type) || this.queue.length >= 12 || this.closing) return false;
    this.queue.push({ ...event, frames: 60, queuedAt: Date.now() }); return true;
  }
  cards(kind) {
    if (!['batting', 'bowling'].includes(kind) || !this.score) throw new Error('Load a scorecard first.');
    return this.enqueue({ type: kind, id: `manual:${randomBytes(6).toString('hex')}`, over: Math.floor(Number(this.score.overs)), cards: this.detector.cards(this.score) });
  }
  snapshot() { return { cards: this.score ? this.detector.cards(this.score) : null, current: this.current ? { type: this.current.type, remaining: Math.max(0, (60 - this.current.position) / FPS) } : null }; }
  pump() {
    if (this.dead || this.startedAt === null || this.blocked || this.encoder.stdio[3].destroyed) return;
    const target = this.realtime ? Math.floor((Date.now() - this.startedAt) * FPS / 1000) : this.outputFrames + 3;
    for (let i = 0; i < 4 && this.outputFrames <= target && !this.blocked; i++) {
      if (!this.current && !this.closing) {
        while (this.queue.length) { const job = this.queue.shift(); if (Date.now() - job.queuedAt > 30000) continue; this.current = { ...job, position: 0 }; break; }
      }
      const png = this.renderer.frame(this.score, this.current, this.showOverlay);
      if (this.current?.position === 0) this.emit('graphic', { type: this.current.type, duration: 2, png: png.toString('base64') });
      if (!this.encoder.stdio[3].write(png)) { this.blocked = true; this.encoder.stdio[3].once('drain', () => { this.blocked = false; }); }
      this.outputFrames++;
      if (this.current && ++this.current.position === 60) { this.current = null; this.emit('graphic', null); }
    }
  }
  stop(graceful) {
    if (this.dead) return;
    this.closing = true; this.queue = []; this.current = null;
    if (graceful) { if (!this.encoder.stdin.destroyed) this.encoder.stdin.end(); }
    else {
      this.dispose();
      for (const stream of this.encoder.stdio) if (stream && !stream.destroyed) stream.destroy();
      this.encoder.kill(); const timer = setTimeout(() => { if (this.encoder.exitCode === null) this.encoder.kill('SIGKILL'); }, 500); timer.unref();
    }
  }
  dispose() { this.dead = true; clearInterval(this.timer); this.queue = []; this.current = null; this.renderer.cache.clear(); }
}
