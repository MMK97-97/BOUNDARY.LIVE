import { matchReference } from './cricclubs-reference.mjs';
export const PROFILES = Object.freeze({ balanced: { bitrate: 8_000_000, fps: 30 }, detail: { bitrate: 14_000_000, fps: 30 } });
import { captureReady } from './capture.mjs';
export { SIZES, captureReady } from './capture.mjs';
export function parseMatch(input, savedClub, savedLeague) { return matchReference(input, savedClub, savedLeague); }
export function relayOrigin(value) {
  const u = new URL(value);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  if (!(u.protocol === 'https:' || (u.protocol === 'http:' && local)) || u.username || u.password || u.search || u.hash || u.pathname !== '/') throw new Error('Use the relay’s HTTPS origin only, without a path. HTTP is allowed only on localhost.');
  return u.origin;
}
export function chooseMime(Recorder) {
  if (!Recorder?.isTypeSupported) throw new Error('This browser does not support MediaRecorder. Try current Chrome on Android or Safari on iPhone.');
  // Prefer AVC when available; browser hardware acceleration is not guaranteed.
  const candidates = ['video/mp4;codecs=avc1.42E028,mp4a.40.2', 'video/webm;codecs=h264,opus',
    'video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm'];
  const mime = candidates.find(m => Recorder.isTypeSupported(m));
  if (!mime) throw new Error('No compatible camera encoding format is available in this browser.');
  return mime;
}
export function clampZoom(value, range) {
  const min = Number(range.min), max = Number(range.max), step = Number(range.step) || 0.1;
  const v = Math.min(max, Math.max(min, Number(value) || min));
  return Number(Math.min(max, Math.max(min, min + Math.round((v - min) / step) * step)).toFixed(4));
}
export const is1080Landscape = s => Number(s.width) >= 1920 && Number(s.height) >= 1080 && Number(s.width) >= Number(s.height);
export function duration(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map(v => String(v).padStart(2, '0')).join(':');
}
export function preflight({ connected, encoderReady, camera, destinations, overlay, score, resolution = '1080' }) {
  if (!connected) return 'Connect your cloud studio first.';
  if (!encoderReady) return 'The relay needs FFmpeg and a font. Check its setup.';
  if (!camera) return 'Open the camera to continue.';
  if (!captureReady(camera, resolution)) return `${resolution === 'auto' ? 'At least 480p native capture' : resolution + 'p native capture'} is required. Choose Auto or a supported camera resolution.`;
  if (!destinations.length) return 'Select at least one configured destination.';
  if (overlay && !score) return 'Load a scorecard, or turn off the score overlay.';
  return null;
}
