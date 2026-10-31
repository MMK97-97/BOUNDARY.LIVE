import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import { randomBytes } from 'node:crypto';
import { StudioVault, FileVaultAdapter, PostgresVaultAdapter, postgresOptions, configuredVault, encryptionKey } from '../lib/vault.mjs';
import { TrustedDevices } from '../lib/trusted-devices.mjs';
import { PGlite } from '@electric-sql/pglite';
const key = randomBytes(32);
async function fixture(fn) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'mk97-vault-'));
  try { await fn(path.join(directory,'studio.enc')); } finally { await fs.rm(directory,{recursive:true,force:true}); }
}
test('encrypted saved state survives reopening; plaintext credentials are absent from the file',()=>fixture(async file=>{
  const first=new StudioVault({adapter:new FileVaultAdapter(file),key});
  await first.mutate(state=>{state.profile.destinations.youtube={server:'rtmps://a.rtmps.youtube.com/live2',key:'private-fixture-stream-key'};});
  const raw=await fs.readFile(file,'utf8');assert.equal(raw.includes('private-fixture-stream-key'),false);assert.equal((await fs.stat(file)).mode&0o777,0o600);
  const restored=new StudioVault({adapter:new FileVaultAdapter(file),key});await restored.ready();assert.equal(restored.snapshot().profile.destinations.youtube.key,'private-fixture-stream-key');
}));
test('a wrong encryption key or modified ciphertext fails without replacing saved data',()=>fixture(async file=>{
  const first=new StudioVault({adapter:new FileVaultAdapter(file),key});await first.mutate(state=>{state.profile.youtube={refreshToken:'private-google-fixture'};});
  const original=await fs.readFile(file,'utf8');const wrong=new StudioVault({adapter:new FileVaultAdapter(file),key:randomBytes(32)});
  await assert.rejects(wrong.ready(),/original STUDIO_ENCRYPTION_KEY/);assert.equal(await fs.readFile(file,'utf8'),original);
  const row=JSON.parse(original),envelope=JSON.parse(row.sealed);envelope.data=(envelope.data[0]==='A'?'B':'A')+envelope.data.slice(1);row.sealed=JSON.stringify(envelope);await fs.writeFile(file,JSON.stringify(row));
  await assert.rejects(new StudioVault({adapter:new FileVaultAdapter(file),key}).ready(),/cannot be unlocked/);
}));
test('concurrent saved preference/device writes cannot overwrite each other',()=>fixture(async file=>{
  const a=new StudioVault({adapter:new FileVaultAdapter(file),key}),b=new StudioVault({adapter:new FileVaultAdapter(file),key});await Promise.all([a.ready(),b.ready()]);
  await Promise.all([a.mutate(s=>{s.profile.preferences.quality='detail';}),b.mutate(s=>{s.profile.preferences.overlay=false;})]);
  const fresh=new StudioVault({adapter:new FileVaultAdapter(file),key});await fresh.ready();assert.equal(fresh.snapshot().profile.preferences.quality,'detail');assert.equal(fresh.snapshot().profile.preferences.overlay,false);
}));
test('SQL persistence runs against the local PostgreSQL engine and resolves revision conflicts',async()=>{
  const db=new PGlite();const queries=[];
  const pool={async query(sql,params){queries.push({sql,params});const result=await db.query(sql,params);return{rows:result.rows,rowCount:result.affectedRows};},async end(){await db.close();}};
  const a=new StudioVault({adapter:new PostgresVaultAdapter(pool),key}),b=new StudioVault({adapter:new PostgresVaultAdapter(pool),key});await a.ready();await b.ready();
  await a.mutate(s=>{s.profile.youtube={refreshToken:'pg-private-refresh-fixture'};});await b.mutate(s=>{s.profile.preferences.resolution='720';});
  const c=new StudioVault({adapter:new PostgresVaultAdapter(pool),key});await c.ready();assert.equal(c.snapshot().profile.youtube.refreshToken,'pg-private-refresh-fixture');assert.equal(c.snapshot().profile.preferences.resolution,'720');
  const row=await db.query('SELECT sealed FROM mk97_private.studio_state');assert.equal(row.rows[0].sealed.includes('pg-private-refresh-fixture'),false);assert.ok(queries.some(q=>q.sql.includes('revision = $3')));await db.close();
});
test('database URL flags cannot turn off verified TLS and database failures do not echo credentials',async()=>{
  const options=postgresOptions('postgresql://fixture:private-password@db.example.test/studio?sslmode=no-verify&ssl=true&channel_binding=disable');
  assert.deepEqual(options.ssl,{rejectUnauthorized:true});assert.equal(options.enableChannelBinding,true);assert.equal(new URL(options.connectionString).searchParams.has('sslmode'),false);assert.equal(new URL(options.connectionString).searchParams.has('ssl'),false);
  const vault=new StudioVault({adapter:{async read(){throw new Error('private-password db connection failed');}},key});
  await assert.rejects(vault.ready(),e=>e.status===503&&!e.message.includes('private-password'));
  assert.throws(()=>encryptionKey('weak'),/32 random bytes/);assert.deepEqual(encryptionKey(key.toString('base64')),key);
  const empty=await configuredVault({});assert.equal(empty.configured,false);
  await assert.rejects(configuredVault({STUDIO_DATA_FILE:fileURLToPath(new URL('../../web/forbidden.enc',import.meta.url)),STUDIO_ENCRYPTION_KEY:key.toString('hex')}),/outside the public web/);
  await assert.rejects(configuredVault({STUDIO_DATA_FILE:'/tmp/mk97-test.enc',STUDIO_ENCRYPTION_KEY:key.toString('hex'),RENDER_EXTERNAL_URL:'https://fixture.onrender.com'}),/temporary/);
});
test('trusted device cookies survive server-state reopening without storing the relay token',()=>fixture(async file=>{
  let clock=Date.now();const first=new StudioVault({adapter:new FileVaultAdapter(file),key});const devices=new TrustedDevices({vault:first,now:()=>clock});
  const created=await devices.remember('My phone');assert.match(created.cookie,/__Host-mk97_device=/);assert.match(created.cookie,/HttpOnly/);assert.match(created.cookie,/SameSite=Lax/);assert.match(created.cookie,/Secure/);assert.match(created.cookie,/Max-Age=2592000/);
  assert.equal(JSON.stringify(first.snapshot()).includes(created.cookie.split('.')[1]?.split(';')[0]),false);
  const second=new StudioVault({adapter:new FileVaultAdapter(file),key}),restored=new TrustedDevices({vault:second,now:()=>clock});
  const identity=await restored.authenticate(created.cookie);assert.equal(identity.deviceId,created.deviceId);assert.equal(identity.name,'My phone');
  assert.equal(await restored.authenticate(created.cookie.replace(/=./,'=X')),null);
  clock+=31*86400000;assert.equal(await restored.authenticate(created.cookie),null);
}));
test('a second device links once and shares its studio; replay, expired codes and revoked devices fail',()=>fixture(async file=>{
  let clock=Date.now();const vault=new StudioVault({adapter:new FileVaultAdapter(file),key}),devices=new TrustedDevices({vault,now:()=>clock});
  const phone=await devices.remember('Phone');const pair=await devices.pairing(phone.deviceId),tablet=await devices.link(pair.code,'Tablet');assert.equal(phone.owner,tablet.owner);assert.equal(devices.status(phone.deviceId).devices.length,2);
  await assert.rejects(devices.link(pair.code,'Attacker'),/already used/);await devices.remove(tablet.deviceId);assert.equal(await devices.authenticate(tablet.cookie),null);
  const expired=await devices.pairing(phone.deviceId);clock+=300001;await assert.rejects(devices.link(expired.code,'late'),/expired/);
  const fresh=await devices.pairing(phone.deviceId);await devices.remove(phone.deviceId);await assert.rejects(devices.link(fresh.code,'late'),/expired/);
  assert.equal(JSON.stringify(devices.status()).includes('hash'),false);
}));
test('a device code has exactly one winner even when two requests race',()=>fixture(async file=>{
  const vault=new StudioVault({adapter:new FileVaultAdapter(file),key}),devices=new TrustedDevices({vault});const phone=await devices.remember('Phone'),pair=await devices.pairing(phone.deviceId);
  const results=await Promise.allSettled([devices.link(pair.code,'First'),devices.link(pair.code,'Second')]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(devices.status().devices.length,2);
}));
