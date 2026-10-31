// Shared native capture rules. Orientation changes do not change pixel quality.
export const SIZES = Object.freeze({ '1080': { width: 1920, height: 1080 }, '720': { width: 1280, height: 720 }, '480': { width: 854, height: 480 } });
export function captureProfile(settings) {
  const w = Number(settings?.width), h = Number(settings?.height);
  if (![w, h].every(Number.isInteger) || Math.min(w, h) < 480 || Math.max(w, h) > 4096 || Math.min(w, h) > 2160) return null;
  return ['1080', '720', '480'].find(size => Math.max(w, h) >= SIZES[size].width && Math.min(w, h) >= SIZES[size].height) || null;
}
export function captureReady(settings, resolution = '1080') {
  const profile = captureProfile(settings);
  return Boolean(profile && (resolution === 'auto' || SIZES[resolution] && Number(profile) >= Number(resolution)));
}
export async function openNativeCamera(media, resolution = '1080', deviceId = '', portrait = false) {
  const sizes = resolution === 'auto' ? ['1080', '720', '480'] : SIZES[resolution] ? [resolution] : [];
  const audio = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
  let lastError;
  for (const size of sizes) {
    const target = SIZES[size];
    const orientations = portrait ? [[target.height, target.width], [target.width, target.height]] : [[target.width, target.height], [target.height, target.width]];
    // Some cameras expose a larger sensor mode rather than an exact 16:9 mode.
    for (const [w, h, exact] of [...orientations.map(pair => [...pair, true]), [...orientations[0], false]]) {
      const video = { width: { [exact ? 'exact' : 'ideal']: w }, height: { [exact ? 'exact' : 'ideal']: h }, frameRate: { ideal: 30, max: 30 },
        ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } }) };
      if (media.getSupportedConstraints?.().resizeMode) video.resizeMode = 'none';
      let stream;
      try {
        stream = await media.getUserMedia({ video, audio });
        if (!captureReady(stream.getVideoTracks()[0]?.getSettings(), size)) {
          const error = new Error('The camera cannot provide the selected native resolution. Choose Auto or a supported resolution.');
          error.name = 'OverconstrainedError'; throw error;
        }
        return stream;
      } catch (error) {
        stream?.getTracks().forEach(track => track.stop()); lastError = error;
        if (error.name !== 'OverconstrainedError') throw error;
      }
    }
  }
  throw lastError || new Error('Choose a supported capture resolution.');
}
export function programSize(settings) {
  const profile = captureProfile(settings) || '1080', size = SIZES[profile];
  return Number(settings?.height) > Number(settings?.width) ? { width: size.height, height: size.width } : { ...size };
}
// The monitor fits the same program canvas that is sent to the encoder.
export function programRect(width, height, canvasWidth = 1920, canvasHeight = 1080) {
  if (!(width > 0 && height > 0) || !Number.isFinite(width + height)) return { width: 0, height: 0 };
  const scale = Math.min(width / canvasWidth, height / canvasHeight);
  return { width: canvasWidth * scale, height: canvasHeight * scale };
}
