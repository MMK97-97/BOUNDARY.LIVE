import { FPS } from './events.mjs';
export const AUDIO_BYTES_PER_FRAME = 44100 * 2 * 2 / FPS;
export class JpegFrames {
  constructor(onFrame) { this.pending = Buffer.alloc(0); this.onFrame = onFrame; }
  push(chunk) {
    this.pending = Buffer.concat([this.pending, chunk]);
    if (this.pending.length > 6 * 1024 * 1024) throw new Error('Decoded camera frame exceeds the replay limit.');
    while (this.pending.length) {
      const start = this.pending.indexOf(Buffer.from([0xff, 0xd8]));
      if (start < 0) { this.pending = this.pending.subarray(Math.max(0, this.pending.length - 1)); return; }
      const end = this.pending.indexOf(Buffer.from([0xff, 0xd9]), start + 2); if (end < 0) return;
      this.onFrame(Buffer.from(this.pending.subarray(start, end + 2)));
      this.pending = this.pending.subarray(end + 2);
    }
  }
}
export class ReplayRing {
  constructor({ seconds = 30, maxBytes = 192 * 1024 * 1024 } = {}) {
    this.maxFrames = seconds * FPS; this.maxBytes = maxBytes;
    this.frames = new Map(); this.audio = new Map(); this.bytes = 0; this.next = 0; this.audioNext = 0;
    this.audioPending = Buffer.alloc(0); this.origin = null;
  }
  video(jpeg, now = Date.now()) {
    if (jpeg.length > 4 * 1024 * 1024) throw new Error('Replay camera frame is too large.');
    const index = this.next++; if (this.origin === null) this.origin = now;
    this.frames.set(index, { index, jpeg }); this.bytes += jpeg.length;
    while (this.frames.size > this.maxFrames || this.bytes > this.maxBytes) {
      const [key, old] = this.frames.entries().next().value; this.frames.delete(key); this.bytes -= old.jpeg.length;
    }
    this.pruneAudio(); return index;
  }
  pcm(chunk) {
    this.audioPending = Buffer.concat([this.audioPending, chunk]);
    while (this.audioPending.length >= AUDIO_BYTES_PER_FRAME) {
      this.audio.set(this.audioNext++, Buffer.from(this.audioPending.subarray(0, AUDIO_BYTES_PER_FRAME)));
      this.audioPending = this.audioPending.subarray(AUDIO_BYTES_PER_FRAME);
    }
    while (this.audio.size > this.maxFrames + 120) this.audio.delete(this.audio.keys().next().value);
    this.pruneAudio();
  }
  pruneAudio() { const first = this.first; for (const key of this.audio.keys()) { if (key >= first) break; this.audio.delete(key); } }
  get first() { return this.frames.size ? this.frames.keys().next().value : this.next; }
  get latest() { return Math.min(this.next - 1, this.audioNext - 1); }
  get seconds() { return Math.max(0, (this.latest - this.first + 1) / FPS); }
  get(index) { const f = this.frames.get(index), audio = this.audio.get(index); return f && audio ? { ...f, audio } : null; }
  window(start, count) {
    if (!Number.isInteger(start) || !Number.isInteger(count) || start < this.first || count < 1 || count > 12 * FPS) return null;
    const frames = []; for (let i = 0; i < count; i++) { const frame = this.get(start + i); if (!frame) return null; frames.push(frame); }
    return frames;
  }
  clear() { this.frames.clear(); this.audio.clear(); this.bytes = 0; this.audioPending = Buffer.alloc(0); }
}
