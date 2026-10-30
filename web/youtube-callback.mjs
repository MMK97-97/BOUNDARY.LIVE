const params = new URLSearchParams(location.search);
const state = params.get('state'), code = params.get('code'), error = params.get('error');
history.replaceState(null, '', location.pathname);
const status = document.getElementById('oauthReturnStatus');
document.getElementById('oauthClose').addEventListener('click', () => window.close());
if (/^[A-Za-z0-9_-]{43}$/.test(state || '') && (error || code && code.length <= 4096)) {
  const message = { type: 'boundary:youtube-oauth', state, ...(error ? { error: 'denied' } : { code }) }; let delivered = false;
  try { if (window.opener) { window.opener.postMessage(message, location.origin); delivered = true; } } catch {}
  if (typeof BroadcastChannel === 'function') { const channel = new BroadcastChannel('boundary.youtube.' + state); channel.postMessage(message); channel.close(); delivered = true; }
  status.textContent = delivered ? error ? 'Google sign-in was cancelled. Return to the original studio.' : 'Authorization returned. Your original studio will finish connecting securely.' : 'Return to the original studio and retry with a browser that supports popup communication.';
} else status.textContent = 'The original studio could not be reached. Close this window, return to the studio and start sign-in again with popups allowed.';
