// Cloud origin is configured by the operator/provider, never inferred from Host
// or forwarded headers supplied by an incoming request.
export function cloudConfig(env = {}) {
  const value = env.PUBLIC_URL || env.RENDER_EXTERNAL_URL || '';
  let publicOrigin = null;
  if (value) {
    let u;
    try { u = new URL(value); } catch { throw new Error('PUBLIC_URL must be a valid HTTPS origin.'); }
    if (u.protocol !== 'https:' || u.username || u.password || u.pathname !== '/' || u.search || u.hash) {
      throw new Error('PUBLIC_URL must be an HTTPS origin without credentials, a path, query or fragment.');
    }
    publicOrigin = u.origin;
  }
  const explicit = String(env.ALLOWED_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean);
  const defaults = publicOrigin ? [] : [`http://localhost:${env.PORT || 8787}`, `http://127.0.0.1:${env.PORT || 8787}`];
  const origins = new Set([...defaults, ...explicit, ...(publicOrigin ? [publicOrigin] : [])]);
  for (const origin of origins) {
    let u;
    try { u = new URL(origin); } catch { throw new Error('ALLOWED_ORIGINS must contain exact browser origins.'); }
    if (u.origin !== origin || !['https:', 'http:'].includes(u.protocol) || u.username || u.password) throw new Error('ALLOWED_ORIGINS must contain exact browser origins; wildcards and paths are not allowed.');
  }
  return { publicOrigin, origins };
}
