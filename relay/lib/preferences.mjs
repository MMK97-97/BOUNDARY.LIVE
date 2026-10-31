import { selectedReference } from '../../web/cricclubs-reference.mjs';
const allowed = new Set(['match', 'destinations', 'resolution', 'quality', 'overlay', 'milestones', 'cards', 'watchUrl']);
export function validatePreferences(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !allowed.has(key))) throw new Error('Unsupported saved studio preference.');
  const result = {};
  if (Object.hasOwn(value, 'match')) result.match = value.match === null ? null : selectedReference(value.match);
  if (Object.hasOwn(value, 'destinations')) {
    if (!Array.isArray(value.destinations) || value.destinations.length > 3 || value.destinations.some(id => !['youtube', 'facebook', 'instagram'].includes(id))) throw new Error('Choose supported destinations.');
    result.destinations = [...new Set(value.destinations)];
  }
  if (Object.hasOwn(value, 'resolution')) { if (!['auto', '1080', '720', '480'].includes(value.resolution)) throw new Error('Unsupported capture resolution.'); result.resolution = value.resolution; }
  if (Object.hasOwn(value, 'quality')) { if (!['balanced', 'detail'].includes(value.quality)) throw new Error('Unsupported quality profile.'); result.quality = value.quality; }
  for (const name of ['overlay', 'milestones', 'cards']) if (Object.hasOwn(value, name)) { if (typeof value[name] !== 'boolean') throw new Error('Use a boolean preference.'); result[name] = value[name]; }
  if (Object.hasOwn(value, 'watchUrl')) {
    if (value.watchUrl === '') result.watchUrl = '';
    else {
      let url; try { url = new URL(value.watchUrl); } catch { throw new Error('Enter a public platform watch URL.'); }
      if (typeof value.watchUrl !== 'string' || value.watchUrl.length > 1024 || url.protocol !== 'https:' || url.username || url.password || url.hash ||
        !['youtube.com', 'youtu.be', 'facebook.com', 'fb.watch', 'instagram.com'].some(h => url.hostname === h || url.hostname.endsWith('.' + h)) ||
        [...url.searchParams.keys()].some(key => /token|key|secret|auth|password|code/i.test(key))) throw new Error('Save only a public platform watch URL without credentials.');
      result.watchUrl = url.href;
    }
  }
  return result;
}
