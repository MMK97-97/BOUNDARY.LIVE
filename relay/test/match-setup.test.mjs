import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { knownLeague, matchReference } from '../../web/cricclubs-reference.mjs';
const source = fs.readFileSync(new URL('../../web/match-setup.mjs', import.meta.url), 'utf8').replace(/^import[^\n]+\n/, '').replace('export function ', 'function ');
function setup() {
  const fields = new Map();
  const get = id => {
    if (!fields.has(id)) fields.set(id, { value: '', textContent: '', disabled: false, hidden: false, handlers: {},
      addEventListener(type, fn) { this.handlers[type] = fn; }, focus() {}, querySelector() { return get('leagueSummary'); },
      change(value) { this.value = value; this.handlers.change?.(); } });
    return fields.get(id);
  };
  get('clubInput').value = '300'; get('matchInput').value = '986'; get('homeMatchInput').value = '986';
  const state = { session: null, info: null };
  const context = { knownLeague, state, document: { getElementById: get } };
  vm.runInNewContext(source + '\n;globalThis.controller = installMatchSelection({state});', context);
  return { get, state, controller: context.controller };
}
test('league selections fill the matching Club ID and require the user’s own Match ID', () => {
  const h = setup(); h.get('leaguePreset').change('1507');
  assert.equal(h.get('clubInput').value, '1507'); assert.equal(h.get('homeClubInput').value, '1507'); assert.equal(h.get('homeLeaguePreset').value, '1507');
  assert.equal(h.get('matchInput').value, ''); assert.equal(h.get('homeMatchInput').value, ''); assert.match(h.get('leagueSummary').textContent, /Tampa Cricket/);
  h.get('homeLeaguePreset').change('157'); assert.equal(h.get('clubInput').value, '157'); assert.equal(h.get('leaguePreset').value, '157'); assert.match(h.get('leagueSummary').textContent, /TCL/);
});
test('full links including copied separators select the correct league, without relaxing URL validation', () => {
  const h = setup();
  for (const separator of ['&', '&amp;', '\\&']) {
    const ids = matchReference('https://cricclubs.com/TCL/viewScorecard.do?matchId=6098' + separator + 'clubId=157', '300');
    h.controller.accept(ids); assert.equal(h.get('clubInput').value, '157'); assert.equal(h.get('matchInput').value, '6098'); assert.equal(h.get('homeLeaguePreset').value, '157');
  }
  assert.throws(() => matchReference('https://cricclubs.com/TCL/viewScorecard.do?matchId=6098&amp;clubId=157&amp;clubId=300'), /one Club/);
  assert.throws(() => matchReference('https://evil.test/TCL/viewScorecard.do?matchId=6098&amp;clubId=157'), /cricclubs/);
});
test('fetch failures remain visible and a configured custom feed is explained', () => {
  const h = setup(); h.state.scoreError = 'CricClubs/feed returned HTTP 403.'; h.controller.update();
  assert.equal(h.get('matchFailure').hidden, false); assert.match(h.get('matchFailure').textContent, /403/); assert.equal(h.get('matchConnect').hidden, false);
  h.state.session = 'fixture'; h.state.info = { scoreSource: 'configured-feed' }; h.controller.update();
  assert.equal(h.get('matchConnect').hidden, true); assert.match(h.get('matchConnectionHelp').textContent, /SCORE_URL_TEMPLATE/);
  h.state.scoreError = ''; h.controller.update(); assert.equal(h.get('matchFailure').hidden, true);
});
test('a live upload locks league changes and prevents a match from being switched', () => {
  const h = setup(); h.state.live = true; h.controller.update(); assert.equal(h.get('leaguePreset').disabled, true);
  h.get('leaguePreset').change('157'); assert.equal(h.get('clubInput').value, '300');
});
