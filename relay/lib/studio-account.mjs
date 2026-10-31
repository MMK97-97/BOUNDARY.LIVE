import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { storageError } from './vault.mjs';

const derive = promisify(scrypt);
const ALGORITHM = 'scrypt-131072-8-1';
export const PASSWORD_MIN = 15;
const fail = (message, status=400) => Object.assign(new Error(message),{status});
const denied = () => fail('Email or password is incorrect.',401);
function emailAddress(value) {
  if(typeof value!=='string'||value.length>254||!/^[^\s@\x00-\x1f\x7f]+@[^\s@\x00-\x1f\x7f]+\.[^\s@\x00-\x1f\x7f]+$/.test(value.trim())) throw fail('Enter your account email address.');
  return value.trim().toLowerCase();
}
function passwordValue(value) {
  if(typeof value!=='string'||value.length<PASSWORD_MIN||value.length>128||!value.trim()) throw fail('Use a password of 15–128 characters. Spaces are allowed.');
  return value;
}
function recordOf(state) {
  const account=state.account;if(!account)return null;
  if(account.schema!==1||account.algorithm!==ALGORITHM||typeof account.email!=='string'||!/^[a-f0-9]{32}$/.test(account.version)||
    !/^[a-f0-9]{32}$/.test(account.salt)||!/^[a-f0-9]{64}$/.test(account.digest)) throw storageError('The saved studio account cannot be read. Restore its private backup or recover it using the studio token.');
  return account;
}
export class StudioAccount {
  constructor({vault,now=Date.now}) {this.vault=vault;this.now=now;this.hashing=false;}
  status(privateView=false) {
    const account=recordOf(this.vault.snapshot());
    return {configured:Boolean(account),passwordMinLength:PASSWORD_MIN,...(privateView&&account?{email:account.email,createdAt:account.createdAt,updatedAt:account.updatedAt}:{})};
  }
  async hash(password,salt) {
    if(this.hashing)throw fail('Another sign-in is being checked. Try again shortly.',429);
    this.hashing=true;
    try {return await derive(password,Buffer.from(salt,'hex'),32,{N:131072,r:8,p:1,maxmem:160*1024*1024});}
    catch {throw fail('Account sign-in is temporarily unavailable. Try again.',503);}
    finally {this.hashing=false;}
  }
  async newRecord(email,password,previous) {
    email=emailAddress(email);passwordValue(password);const salt=randomBytes(16).toString('hex'),digest=await this.hash(password,salt),now=this.now();
    try {return {schema:1,algorithm:ALGORITHM,email,salt,digest:digest.toString('hex'),version:randomBytes(16).toString('hex'),createdAt:previous?.createdAt||now,updatedAt:now,failedCount:0,nextAttemptAt:0,lastFailureAt:0};}
    finally {digest.fill(0);}
  }
  guard(proof) {
    return state=>{if(recordOf(state)?.version!==proof.version)throw denied();};
  }
  async register(email,password,importProfile=null) {
    await this.vault.ready();if(recordOf(this.vault.snapshot()))throw fail('This studio already has an account. Sign in or use account recovery.',409);
    const account=await this.newRecord(email,password);
    await this.vault.mutate(state=>{
      if(recordOf(state))throw fail('This studio already has an account.',409);
      if(importProfile){state.profile.destinations={...importProfile.destinations,...state.profile.destinations};if(!state.profile.youtube&&importProfile.youtube)state.profile.youtube=importProfile.youtube;}
      state.account=account;
    });
    return {version:account.version,email:account.email};
  }
  async login(email,password) {
    await this.vault.ready();const account=recordOf(this.vault.snapshot());if(!account)throw fail('Create the studio account on an authorized device first.',409);
    if(this.now()<(account.nextAttemptAt||0))throw fail('Sign-in attempts are temporarily limited. Wait a moment and try again.',429);
    let normalized='';try {normalized=emailAddress(email);}catch{}
    // Hash even an unknown email to avoid revealing the studio's email by timing.
    const bounded=typeof password==='string'&&password.length<=128?password:'',digest=await this.hash(bounded,account.salt);
    let correct;try {correct=timingSafeEqual(digest,Buffer.from(account.digest,'hex'))&&normalized===account.email&&bounded.length>=PASSWORD_MIN;}finally{digest.fill(0);}
    const proof={version:account.version,email:account.email};
    await this.vault.mutate(state=>{
      this.guard(proof)(state);const current=state.account,now=this.now();
      if(correct){current.failedCount=0;current.nextAttemptAt=0;current.lastFailureAt=0;}
      else {const count=now-(current.lastFailureAt||0)>15*60000?1:Math.min(20,(current.failedCount||0)+1);current.failedCount=count;current.lastFailureAt=now;current.nextAttemptAt=now+(count<3?0:Math.min(60000,1000*2**(count-3)));}
    });
    if(!correct)throw denied();return proof;
  }
  async reset(email,password,proof=null) {
    await this.vault.ready();const snapshot=this.vault.snapshot(),previous=proof?recordOf(snapshot):snapshot.account;
    if(!previous)throw fail('Create a studio account first.',409);
    const account=await this.newRecord(email,password,previous);
    const revoked=await this.vault.mutate(state=>{
      if(proof)this.guard(proof)(state);
      const ids=state.devices.map(d=>d.id);state.account=account;state.devices=[];state.pairing=null;return ids;
    });
    return {version:account.version,email:account.email,revoked};
  }
  async change(currentPassword,newPassword) {
    await this.vault.ready();const account=recordOf(this.vault.snapshot());if(!account)throw fail('Create a studio account first.',409);
    const proof=await this.login(account.email,currentPassword);return this.reset(account.email,newPassword,proof);
  }
}
