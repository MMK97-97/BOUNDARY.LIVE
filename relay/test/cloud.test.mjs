import test from 'node:test';
import assert from 'node:assert/strict';
import { cloudConfig } from '../lib/cloud.mjs';
import { SessionDestinations } from '../lib/destinations.mjs';
import { destinationConfig } from '../lib/encoder.mjs';

test('cloud service trusts only the configured HTTPS origin, plus explicit website origins', () => {
  const config = cloudConfig({ RENDER_EXTERNAL_URL: 'https://mk97.onrender.com', ALLOWED_ORIGINS: 'https://example.github.io' });
  assert.equal(config.publicOrigin, 'https://mk97.onrender.com');
  assert.deepEqual([...config.origins], ['https://example.github.io', 'https://mk97.onrender.com']);
  assert.equal(config.origins.has('https://attacker.example'), false);
  assert.equal(cloudConfig({ PUBLIC_URL: 'https://own.example/', RENDER_EXTERNAL_URL: 'https://ignored.example' }).publicOrigin, 'https://own.example');
});
test('cloud configuration rejects wildcard, credential-bearing, non-HTTPS and path origins', () => {
  for (const value of ['http://public.example', 'https://user:password@example.com', 'https://example.com/app', 'https://example.com/?token=private', 'https://example.com/#key', 'not-a-url']) assert.throws(() => cloudConfig({ PUBLIC_URL: value }));
  for (const value of ['*', 'https://example.com/path', 'https://user:pass@example.com', 'https://example.com/']) assert.throws(() => cloudConfig({ ALLOWED_ORIGINS: value }));
  assert.ok(cloudConfig({ PORT: '8787' }).origins.has('http://localhost:8787'));
});
test('manual platform keys are isolated by session and removed on expiry/logout', () => {
  const owners = new Map([['a', 'https://mk97.example'], ['b', 'https://mk97.example']]);
  const store = new SessionDestinations({ validSession: (id, origin) => owners.get(id) === origin });
  store.set('a', owners.get('a'), { id: 'facebook', server: 'rtmps://live-api-s.facebook.com:443/rtmp/', key: 'fixture-private-key-a' });
  assert.equal(store.get('a').facebook.configured, true); assert.equal(store.get('b').facebook, undefined);
  assert.throws(() => store.set('b', 'https://evil.example', { id: 'youtube', server: 'rtmps://a.rtmps.youtube.com/live2', key: 'private' }), /Session expired/);
  store.set('b', owners.get('b'), { id: 'youtube', server: 'rtmps://a.rtmps.youtube.com/live2', key: 'fixture-private-key-b' });
  owners.delete('a'); store.prune(); assert.deepEqual(store.get('a'), {}); assert.equal(store.get('b').youtube.configured, true);
  store.forget('b'); assert.equal(store.owners.size, 0);
});
test('destination validation rejects private hosts, protocol confusion, unsafe keys and oversized fields', () => {
  const store = new SessionDestinations({ validSession: () => true });
  const good = { id: 'youtube', server: 'rtmps://a.rtmps.youtube.com/live2', key: 'fixture-key' };
  for (const change of [
    { server: 'rtmp://a.rtmps.youtube.com/live2' }, { server: 'rtmps://127.0.0.1/live' },
    { server: 'rtmps://a.youtube.com.evil.example/live' }, { server: 'rtmps://user:pass@a.youtube.com/live' },
    { server: 'rtmps://a.youtube.com:444/live' }, { server: 'rtmps://a.youtube.com/live?redirect=evil' },
    { key: 'unsafe\nsecret' }, { key: 'unsafe|tee' }, { key: 'a'.repeat(2049) }, { key: '' },
    { server: 'rtmps://a.youtube.com/' + 'x'.repeat(1100) }, { arbitrary: 'field' }, { id: '__proto__' }
  ]) assert.throws(() => store.set('a', 'https://mk97.example', { ...good, ...change }));
  assert.equal(store.owners.size, 0);
  for (const [id, server] of [['youtube','rtmps://a.rtmps.youtube.com/live2'], ['facebook','rtmps://live-api-s.facebook.com:443/rtmp/'], ['instagram','rtmps://live-upload.instagram.com:443/rtmp/']]) {
    assert.equal(destinationConfig({ [id.toUpperCase()+'_SERVER']: server, [id.toUpperCase()+'_KEY']: 'fixture-123' })[id].configured, true);
  }
});
test('removing a session key affects only that destination and owner', () => {
  const store = new SessionDestinations({ validSession: () => true });
  for (const id of ['youtube', 'facebook']) store.set('a', 'origin', { id, server: id === 'youtube' ? 'rtmps://a.youtube.com/live' : 'rtmps://live.facebook.com/live', key: 'fixture' });
  store.clear('a','youtube'); assert.equal(store.get('a').youtube, undefined); assert.equal(store.get('a').facebook.configured,true);
  store.clear('a','facebook'); assert.equal(store.owners.size, 0); assert.throws(() => store.clear('a','unknown'));
});

test('cloud configuration generator writes private secrets without printing or overwriting them', async () => {
  const fs = await import('node:fs'), os = await import('node:os'), path = await import('node:path');
  const { spawnSync } = await import('node:child_process');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'mk97-cloud-config-'));
  try {
    fs.mkdirSync(path.join(dir,'scripts')); fs.mkdirSync(path.join(dir,'deploy/cloud'),{recursive:true});
    const script=path.join(dir,'scripts/cloud-env.mjs');fs.copyFileSync(new URL('../../scripts/cloud-env.mjs',import.meta.url),script);
    const bad=spawnSync(process.execPath,[script,'bad.example/;echo'],{encoding:'utf8'});assert.equal(bad.status,1);
    assert.equal(fs.existsSync(path.join(dir,'deploy/cloud/.env')),false);
    const first=spawnSync(process.execPath,[script,'Example.duckdns.org'],{encoding:'utf8'});assert.equal(first.status,0,first.stderr);
    const file=path.join(dir,'deploy/cloud/.env'), content=fs.readFileSync(file,'utf8');
    const token=content.match(/RELAY_TOKEN=([a-f0-9]{64})/)[1];assert.ok(content.startsWith('PUBLIC_HOST=example.duckdns.org\n'));
    assert.equal((first.stdout+first.stderr).includes(token),false);
    const encryptionKey=content.match(/STUDIO_ENCRYPTION_KEY=([a-f0-9]{64})/)[1];assert.notEqual(encryptionKey,token);
    assert.equal((first.stdout+first.stderr).includes(encryptionKey),false);
    if(process.platform!=='win32')assert.equal(fs.statSync(file).mode&0o777,0o600);
    const again=spawnSync(process.execPath,[script,'different.example.org'],{encoding:'utf8'});assert.equal(again.status,1);
    assert.equal(fs.readFileSync(file,'utf8'),content);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
