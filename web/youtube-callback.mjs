const params = new URLSearchParams(location.search);
const state = params.get('state'), code = params.get('code'), error = params.get('error'), result = params.get('result');
history.replaceState(null, '', location.pathname);
const status = document.getElementById('oauthReturnStatus');
document.getElementById('oauthClose').addEventListener('click', () => window.close());
if (['connected', 'failed'].includes(result) && !state && !code && !error) {
  status.textContent = result === 'connected' ? 'YouTube connected securely. Return to your original MK97 tab to create the broadcast. You can close this tab.' : 'Google sign-in could not be completed. Return to your original MK97 tab to see the reason and reconnect.';
} else if (params.getAll('state').length === 1 && params.getAll('code').length <= 1 && params.getAll('error').length <= 1 &&
  /^[A-Za-z0-9_-]{43}$/.test(state || '') && Boolean(error) !== Boolean(code) && (error || code.length <= 4096)) {
  const message = { type: 'boundary:youtube-oauth', state, ...(error ? { error: 'denied' } : { code }) }; let delivered = false;
  try { if (window.opener) { window.opener.postMessage(message, location.origin); delivered = true; } } catch {}
  if (typeof BroadcastChannel === 'function') { const channel = new BroadcastChannel('boundary.youtube.' + state); channel.postMessage(message); channel.close(); delivered = true; }
  status.textContent = delivered ? error ? 'Google sign-in was cancelled. Return to the original studio.' : 'Authorization returned. Your original studio will finish connecting securely.' : 'Return to the original studio and retry with a browser that supports popup communication.';
} else status.textContent = 'The original studio could not be reached. Close this window, return to the studio and start sign-in again with popups allowed.';
