import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import{randomBytes}from'node:crypto';
import{StudioAccount}from'../lib/studio-account.mjs';
import{StudioVault,FileVaultAdapter}from'../lib/vault.mjs';
import{TrustedDevices}from'../lib/trusted-devices.mjs';
const password='fixture-only long password 123';
async function fixture(work){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mk97-account-'));try{const file=path.join(dir,'studio.enc'),key=randomBytes(32),vault=new StudioVault({adapter:new FileVaultAdapter(file),key});await work({vault,file,key});}finally{await fs.rm(dir,{recursive:true,force:true});}}
test('studio account hashes passwords with a random salt and restores the same login from encrypted storage',()=>fixture(async({vault,file,key})=>{
 const account=new StudioAccount({vault});await vault.ready();assert.equal(account.status().configured,false);
 await account.register('OWNER@example.test',password);const saved=vault.snapshot().account;assert.equal(saved.algorithm,'scrypt-131072-8-1');assert.notEqual(saved.digest,password);assert.equal(JSON.stringify(saved).includes(password),false);
 assert.equal(JSON.stringify(account.status()).includes('owner@example.test'),false);
 const raw=await fs.readFile(file,'utf8');assert.equal(raw.includes(password),false);assert.equal(raw.includes(saved.digest),false);
 const reopened=new StudioAccount({vault:new StudioVault({adapter:new FileVaultAdapter(file),key})});assert.equal((await reopened.login('owner@EXAMPLE.test',password)).version,saved.version);
 await assert.rejects(reopened.register('another@example.test',password),e=>e.status===409);
}));
test('wrong passwords and unknown emails have the same result; durable backoff cannot be cleared by reopening',()=>fixture(async({vault,file,key})=>{
 let clock=100000000;const account=new StudioAccount({vault,now:()=>clock});await account.register('owner@example.test',password);
 for(const email of ['owner@example.test','stranger@example.test','owner@example.test'])await assert.rejects(account.login(email,'wrong-password-value'),e=>e.status===401&&e.message==='Email or password is incorrect.');
 const reopened=new StudioAccount({vault:new StudioVault({adapter:new FileVaultAdapter(file),key}),now:()=>clock});await assert.rejects(reopened.login('owner@example.test',password),e=>e.status===429);
 clock+=60001;assert.ok((await reopened.login('owner@example.test',password)).version);assert.equal(reopened.vault.snapshot().account.failedCount,0);
}));
test('password change revokes devices and stale login proofs while preserving the saved platforms',()=>fixture(async({vault})=>{
 const account=new StudioAccount({vault});await account.register('owner@example.test',password);const oldProof=await account.login('owner@example.test',password),devices=new TrustedDevices({vault});
 const phone=await devices.remember('Phone',null,account.guard(oldProof));await vault.mutate(s=>{s.profile.destinations.facebook={key:'private-platform-fixture'};});
 const changed=await account.change(password,password+' changed');assert.deepEqual(changed.revoked,[phone.deviceId]);assert.equal(devices.valid(phone.deviceId),false);assert.equal(vault.snapshot().profile.destinations.facebook.key,'private-platform-fixture');
 await assert.rejects(devices.remember('Late device',null,account.guard(oldProof)),e=>e.status===401);assert.ok((await account.login('owner@example.test',password+' changed')).version);
}));
test('authenticated account login can replace the oldest of twelve remembered devices without exceeding the limit',()=>fixture(async({vault})=>{
 let clock=100000000;const account=new StudioAccount({vault,now:()=>clock});const proof=await account.register('owner@example.test',password),devices=new TrustedDevices({vault,now:()=>clock});let first;
 for(let i=0;i<12;i++){clock+=1000;const d=await devices.remember('Device '+i,null,account.guard(proof));first||=d;}
 const next=await devices.remember('New phone',null,account.guard(proof),true);assert.equal(next.evictedDeviceId,first.deviceId);assert.equal(devices.valid(first.deviceId),false);assert.equal(vault.snapshot().devices.length,12);
}));
test('account validation and recovery never overwrite platform settings or require a new database key',()=>fixture(async({vault})=>{
 const account=new StudioAccount({vault});await assert.rejects(account.register('invalid','short'),/email/);await assert.rejects(account.register('owner@example.test','short'),/15/);
 await account.register('owner@example.test',password);await vault.mutate(s=>{s.profile.preferences.resolution='720';s.account.digest='damaged';});
 assert.throws(()=>account.status(),/cannot be read/);const recovered=await account.reset('recovered@example.test',password+' recovered');assert.ok(recovered.version);assert.equal((await account.login('recovered@example.test',password+' recovered')).email,'recovered@example.test');assert.equal(vault.snapshot().profile.preferences.resolution,'720');
}));
