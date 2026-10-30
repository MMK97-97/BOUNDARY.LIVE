import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
export const DESTINATIONS = ['youtube', 'facebook', 'instagram'];
export function findFont(override) {
  const fonts = [override, 'C:/Windows/Fonts/arial.ttf', '/System/Library/Fonts/Supplemental/Arial.ttf',
    '/System/Library/Fonts/Helvetica.ttc', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf'].filter(Boolean);
  return fonts.find(p => fs.existsSync(p));
}
export function probeEncoder(binary = 'ffmpeg', font) {
  const v = spawnSync(binary, ['-hide_banner', '-encoders'], { encoding: 'utf8', timeout: 10000, windowsHide: true });
  if (v.error || v.status !== 0) return { ready: false, error: 'FFmpeg not found. Install FFmpeg, then restart the relay.' };
  if (!v.stdout.includes('libx264')) return { ready: false, error: 'FFmpeg needs the libx264 encoder.' };
  const f = spawnSync(binary, ['-hide_banner', '-filters'], { encoding: 'utf8', timeout: 10000, windowsHide: true });
  if (!f.stdout?.includes('drawtext')) return { ready: false, error: 'FFmpeg needs the drawtext filter (font support).' };
  if (!font) return { ready: false, error: 'No font found. Set FONT_FILE in relay/.env.' };
  return { ready: true, error: null };
}
export function destinationConfig(env) {
  return Object.fromEntries(DESTINATIONS.map(id => {
    const prefix = id.toUpperCase(), server = env[`${prefix}_SERVER`]?.trim(), key = env[`${prefix}_KEY`]?.trim();
    let url = null, error = null;
    if (server && key) {
      try {
        const u = new URL(server);
        const host = u.hostname.toLowerCase();
        const allowed = id === 'youtube' ? host.endsWith('.youtube.com')
          : id === 'facebook' ? host.endsWith('.facebook.com')
            : ['.instagram.com', '.facebook.com', '.fbcdn.net'].some(suffix => host.endsWith(suffix));
        if (!allowed || u.protocol !== 'rtmps:' || u.username || u.password || u.search || u.hash || /[\r\n|\[\]]/.test(server + key)) throw new Error();
        url = server.replace(/\/$/, '') + '/' + key;
      } catch { error = 'Invalid server URL or stream key in relay/.env.'; }
    }
    return [id, { id, url, configured: Boolean(url), error }];
  }));
}
const escapeFilterPath = v => v.replaceAll('\\', '/').replaceAll(':', '\\:').replaceAll("'", "'\\''");
export function overlayFilter(font, enabled) {
  const base = 'scale=w=min(iw\\,1920):h=min(ih\\,1080):force_original_aspect_ratio=decrease:force_divisible_by=2,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=30,format=yuv420p';
  if (!enabled) return base;
  const file = escapeFilterPath(path.resolve(font));
  return `${base},drawbox=x=44:y=880:w=1832:h=152:color=0x0b1527@0.92:t=fill,drawbox=x=44:y=880:w=8:h=152:color=0xb9f669:t=fill,` +
    `drawtext=fontfile='${file}':textfile=score-main.txt:reload=1:expansion=none:fontcolor=white:fontsize=49:x=78:y=901,` +
    `drawtext=fontfile='${file}':textfile=score-detail.txt:reload=1:expansion=none:fontcolor=0xb9c8d9:fontsize=29:x=78:y=977`;
}
export function ingestArgs({ font, overlay = true, bitrateKbps = 6000, mimeType = 'video/mp4' }) {
  const kbps = Math.max(4000, Math.min(14000, Number(bitrateKbps) || 6000));
  return ['-hide_banner', '-loglevel', 'warning', '-nostats', '-progress', 'pipe:2',
    '-probesize', '3000000', '-analyzeduration', '2000000', '-thread_queue_size', '128', '-protocol_whitelist', 'pipe',
    '-f', mimeType.toLowerCase().startsWith('video/webm') ? 'matroska' : 'mov', '-i', 'pipe:0',
    '-map', '0:v:0', '-map', '0:a:0?', '-vf', overlayFilter(font, overlay),
    '-c:v', 'libx264', '-threads', String(Math.min(8, os.availableParallelism())), '-preset', 'veryfast', '-tune', 'zerolatency',
    '-profile:v', 'high', '-level:v', '4.1', '-pix_fmt', 'yuv420p', '-g', '60', '-keyint_min', '60', '-sc_threshold', '0',
    '-b:v', `${kbps}k`, '-minrate', `${kbps}k`, '-maxrate', `${kbps}k`, '-bufsize', `${kbps * 2}k`,
    '-x264-params', 'nal-hrd=cbr:force-cfr=1', '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2',
    '-af', 'aresample=async=1000:first_pts=0', '-flvflags', 'no_duration_filesize', '-flush_packets', '1', '-f', 'flv', 'pipe:1'];
}
export function outputArgs(destination, env = {}) {
  const base = ['-hide_banner', '-loglevel', 'warning', '-nostats', '-progress', 'pipe:2',
    '-probesize', '1000000', '-analyzeduration', '1000000', '-i', 'pipe:0', '-map', '0:v:0', '-map', '0:a:0?'];
  if (destination.id === 'instagram') {
    const h = Number(env.INSTAGRAM_HEIGHT) === 1920 ? 1920 : 1280, w = h === 1920 ? 1080 : 720;
    const bitrate = Math.max(2250, Math.min(6000, Number(env.INSTAGRAM_VIDEO_KBPS) || 3500));
    base.push('-vf', `scale=${w}:-2,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=0x0b1527,setsar=1`,
      '-c:v', 'libx264', '-threads', '4', '-preset', 'veryfast', '-tune', 'zerolatency', '-profile:v', 'high',
      '-pix_fmt', 'yuv420p', '-g', '60', '-keyint_min', '60', '-sc_threshold', '0',
      '-b:v', `${bitrate}k`, '-maxrate', `${bitrate}k`, '-minrate', `${bitrate}k`, '-bufsize', `${bitrate * 2}k`,
      '-x264-params', 'nal-hrd=cbr:force-cfr=1', '-c:a', 'copy');
  } else base.push('-c', 'copy');
  if (destination.url.startsWith('rtmps:')) {
    base.push('-tls_verify', '1');
    if (env.TLS_CA_FILE) base.push('-ca_file', env.TLS_CA_FILE);
  }
  base.push('-rw_timeout', '15000000', '-flvflags', 'no_duration_filesize', '-flush_packets', '1', '-f', 'flv', destination.url);
  return base;
}
