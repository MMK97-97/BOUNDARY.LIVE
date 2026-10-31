import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { rootCertificates } from 'node:tls';
import { PGlite } from '@electric-sql/pglite';
import { PostgresVaultAdapter, StudioVault, postgresOptions, seal } from '../lib/vault.mjs';

function poolFor(db) {
  return { async query(sql, values) { const r=await db.query(sql,values);return {rows:r.rows,rowCount:r.affectedRows}; }, async end(){await db.close();} };
}

test('Supabase session-pooler settings retain the project CA and verify TLS even with conflicting URL flags',()=>{
  const url='postgresql://postgres.fixture:nonfunctional-test-password@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=no-verify&sslrootcert=/ignored/unsafe-file&channel_binding=disable';
  const ca=rootCertificates[0], options=postgresOptions(url,ca.replace(/\n/g,'\\n'));
  assert.equal(new URL(options.connectionString).port,'5432');assert.equal(options.ssl.rejectUnauthorized,true);assert.equal(options.ssl.ca.at(-1),ca.trim()+'\n');assert.equal(options.enableChannelBinding,true);
  assert.equal(new URL(options.connectionString).searchParams.has('sslrootcert'),false);assert.ok(options.ssl.ca.length>1);
  assert.throws(()=>postgresOptions(url,'not a certificate; never echo this value'),e=>e.status===503&&!e.message.includes('never echo'));
  assert.throws(()=>postgresOptions(url,'-----BEGIN PRIVATE KEY-----\nnot-a-certificate\n-----END PRIVATE KEY-----'),/PEM root certificate/);
});

test('a legacy saved row moves atomically into a private schema and Supabase API roles cannot read or modify it',async()=>{
  const db=new PGlite();
  try {
    for (const role of ['anon','authenticated','service_role']) await db.query(`CREATE ROLE ${role}${role==='service_role'?' BYPASSRLS':''}`);
    await db.query('CREATE TABLE public.mk97_private_state(slot TEXT PRIMARY KEY,revision BIGINT NOT NULL,sealed TEXT NOT NULL)');
    await db.query('GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role');
    await db.query('GRANT ALL ON TABLE public.mk97_private_state TO anon,authenticated,service_role');
    const key=randomBytes(32), state={schema:1,devices:[],pairing:null,profile:{destinations:{facebook:{key:'old-encrypted-fixture-key'}},youtube:null,preferences:{resolution:'720'}}}, ciphertext=seal(state,key);
    await db.query('INSERT INTO public.mk97_private_state VALUES($1,$2,$3)',['studio',7,ciphertext]);
    const vault=new StudioVault({adapter:new PostgresVaultAdapter(poolFor(db)),key});await vault.ready();
    assert.equal(vault.snapshot().profile.preferences.resolution,'720');assert.equal(vault.revision,7);
    const row=await db.query('SELECT sealed FROM mk97_private.studio_state');assert.equal(row.rows[0].sealed,ciphertext);
    assert.equal((await db.query("SELECT to_regclass('public.mk97_private_state') AS old")).rows[0].old,null);
    assert.equal((await db.query("SELECT relrowsecurity FROM pg_class WHERE oid='mk97_private.studio_state'::regclass")).rows[0].relrowsecurity,true);
    for (const role of ['anon','authenticated','service_role']) {
      const privileges=(await db.query("SELECT has_schema_privilege($1,'mk97_private','USAGE') AS schema,has_table_privilege($1,'mk97_private.studio_state','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') AS table",[role])).rows[0];
      assert.equal(privileges.schema,false);assert.equal(privileges.table,false);
      await db.query('SET ROLE '+role);
      try { await assert.rejects(db.query('SELECT * FROM mk97_private.studio_state'),e=>e.code==='42501'); }
      finally { await db.query('RESET ROLE'); }
    }
    // RLS remains a second boundary if an API role is accidentally granted read.
    await db.query('GRANT USAGE ON SCHEMA mk97_private TO authenticated');await db.query('GRANT SELECT ON mk97_private.studio_state TO authenticated');
    await db.query('SET ROLE authenticated');
    try { assert.equal((await db.query('SELECT * FROM mk97_private.studio_state')).rows.length,0); }
    finally {await db.query('RESET ROLE');}
    await vault.mutate(s=>{s.profile.preferences.resolution='1080';});assert.equal(vault.revision,8);
  } finally {await db.close();}
});

test('conflicting legacy and private tables stop migration without discarding either encrypted record',async()=>{
  const db=new PGlite();
  try {
    await db.query('CREATE TABLE public.mk97_private_state(slot TEXT PRIMARY KEY,revision BIGINT NOT NULL,sealed TEXT NOT NULL)');
    await db.query('CREATE SCHEMA mk97_private');await db.query('CREATE TABLE mk97_private.studio_state(slot TEXT PRIMARY KEY,revision BIGINT NOT NULL,sealed TEXT NOT NULL)');
    await db.query("INSERT INTO public.mk97_private_state VALUES('studio',1,'old-ciphertext')");await db.query("INSERT INTO mk97_private.studio_state VALUES('studio',2,'new-ciphertext')");
    const vault=new StudioVault({adapter:new PostgresVaultAdapter(poolFor(db)),key:randomBytes(32)});
    await assert.rejects(vault.ready(),e=>e.status===503);
    assert.equal((await db.query('SELECT sealed FROM public.mk97_private_state')).rows[0].sealed,'old-ciphertext');
    assert.equal((await db.query('SELECT sealed FROM mk97_private.studio_state')).rows[0].sealed,'new-ciphertext');
  } finally {await db.close();}
});
