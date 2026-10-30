import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../../web/youtube-callback.mjs', import.meta.url), 'utf8');
function run(query) {
  const sent = [], history = [], status = {};
  vm.runInNewContext(source, { URLSearchParams, location: { search: query, pathname: '/youtube-callback.html', origin: 'https://example.github.io' }, history: { replaceState: (...args) => history.push(args) },
    window: { opener: null, close() {} }, document: { getElementById: id => id === 'oauthReturnStatus' ? status : { addEventListener() {} } },
    BroadcastChannel: class { constructor(name) { this.name = name; } postMessage(message) { sent.push({ name: this.name, message }); } close() {} } });
  return { sent, history, status };
}
test('OAuth callback uses a one-use named channel if browser isolation removes the opener', () => {
  const state = 's'.repeat(43), result = run('?state=' + state + '&code=synthetic-one-use-code');
  assert.equal(result.sent[0].name, 'boundary.youtube.' + state); assert.equal(result.sent[0].message.code, 'synthetic-one-use-code');
  assert.equal(result.history[0][2], '/youtube-callback.html'); assert.equal(JSON.stringify(result.history).includes('code='), false);
});
test('OAuth callback rejects malformed state and sends no credentials or raw provider error text', () => {
  assert.equal(run('?state=wrong&code=code').sent.length, 0);
  const result = run('?state=' + 's'.repeat(43) + '&error=untrusted-provider-message');
  assert.equal(result.sent[0].message.error, 'denied'); assert.equal(JSON.stringify(result.sent).includes('untrusted-provider-message'), false);
});
test('cloud return pages show only a generic result and do not publish authorization codes', () => {
  const result = run('?result=connected'); assert.match(result.status.textContent, /YouTube connected securely/); assert.equal(result.sent.length, 0);
  const failed = run('?result=failed'); assert.match(failed.status.textContent, /original MK97 tab/); assert.equal(failed.sent.length, 0);
  assert.equal(run('?state=' + 's'.repeat(43) + '&state=' + 's'.repeat(43) + '&code=code').sent.length, 0);
  assert.equal(run('?state=' + 's'.repeat(43) + '&error=denied&code=code').sent.length, 0);
});
