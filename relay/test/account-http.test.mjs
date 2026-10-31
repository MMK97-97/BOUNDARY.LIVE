import test,{before,after}from'node:test';
import assert from'node:assert/strict';
import fs from'node:fs/promises';
import os from'node:os';
import path from'node:path';
import{randomBytes}from'node:crypto';
import{spawn}from'node:child_process';
import{fileURLToPath,pathToFileURL}from'node:url';
import{WebSocket}from'ws';
const origin='https://mk97-account.fixture.test',master='account-http-fixture-owner-token-never-a-real-secret',email='owner@example.test',password='fixture account password 12345';
let dir,base,child,phone,tablet,cookiePhone,cookieTablet;
async function request(route,{token,body,cookie,foreign=false}={}){const response=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{Origin:foreign?'https://untrusted.fixture.test':origin,'X-MK97-Origin':origin,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(cookie?{Cookie:cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return{status:response.status,value:await response.json(),cookie:response.headers.get('set-cookie')};}
async function ok(route,options){const r=await request(route,options);assert.ok(r.status<300,r.value.error);return r;}
async function start(){child=spawn(process.execPath,['--import',pathToFileURL(path.join(dir,'mock.mjs')).href,fileURLToPath(new URL('../server.mjs',import.meta.url))],{env:{...process.env,PORT:'0',HOST:'127.0.0.1',PUBLIC_URL:origin,RENDER_EXTERNAL_URL:'',ALLOWED_ORIGINS:'',RELAY_TOKEN:master,STUDIO_DATA_FILE:path.join(dir,'studio.enc'),STUDIO_ENCRYPTION_KEY:await fs.readFile(path.join(dir,'key'),'utf8'),DATABASE_URL:'',GOOGLE_CLIENT_ID:'test-client.apps.googleusercontent.com',GOOGLE_CLIENT_SECRET:'test-client-secret-not-real',YOUTUBE_REDIRECT_URI:origin+'/youtube-callback.html',CRICCLUBS_SCORECARD_ENABLED:'false',SCORE_URL_TEMPLATE:'https://score.fixture.test/{clubId}/{matchId}',YOUTUBE_SERVER:'',YOUTUBE_KEY:'',FACEBOOK_SERVER:'',FACEBOOK_KEY:'',INSTAGRAM_SERVER:'',INSTAGRAM_KEY:''},stdio:['ignore','pipe','pipe']});base=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Start timeout')),12000);child.stdout.on('data',v=>{const m=v.toString().match(/MK97 relay: (http:\/\/\S+)/);if(m){clearTimeout(timer);resolve(m[1]);}});child.once('exit',code=>{clearTimeout(timer);reject(new Error('Server exited '+code));});});}
async function stop(){if(child?.exitCode===null){child.kill();await new Promise(resolve=>child.once('exit',resolve));}}
before(async()=>{dir=await fs.mkdtemp(path.join(os.tmpdir(),'mk97-account-http-'));await fs.writeFile(path.join(dir,'key'),randomBytes(32).toString('hex'),{mode:0o600});const provider=new URL('../support/youtube-provider.mjs',import.meta.url).href;await fs.writeFile(path.join(dir,'mock.mjs'),`import{youtubeProvider}from${JSON.stringify(provider)};const mock=youtubeProvider();globalThis.fetch=async(url,options={})=>{const u=new URL(url);if(['oauth2.googleapis.com','www.googleapis.com'].includes(u.hostname))return mock.fetchFn(url,options);throw new Error('External network disabled in account test.');};`);await start();});
after(async()=>{await stop();if(dir)await fs.rm(dir,{recursive:true,force:true});});
test('creating or recovering the private studio account needs owner authorization and the canonical origin',async()=>{
 assert.deepEqual((await ok('/api/account/status')).value,{configured:false,passwordMinLength:15});
 for(const body of [null,[], 'unexpected']){const result=await request('/api/account/register',{token:master,body});assert.equal(result.status,400);assert.equal(result.value.error,'Send account details as a JSON object.');}
 assert.equal((await request('/api/account/register',{body:{email,password}})).status,401);
 assert.equal((await request('/api/account/recover',{body:{email,password}})).status,401);
 assert.equal((await request('/api/account/register',{token:master,body:{email,password},foreign:true})).status,403);
});
test('a temporary operator can create the account once and promote its platform connections into saved storage',async()=>{
 const temporary=(await ok('/api/session',{token:master,body:{}})).value.sessionToken;
 await ok('/api/destination',{token:temporary,body:{id:'facebook',server:'rtmps://live-api-s.facebook.com:443/rtmp/',key:'account-http-platform-fixture'}});
 const flow=(await ok('/api/youtube/auth/start',{token:temporary,body:{}})).value;const callback=await fetch(base+'/youtube-callback.html?state='+flow.state+'&code=fixture',{redirect:'manual'});assert.match(callback.headers.get('location'),/connected/);
 await ok('/api/youtube/setup',{token:temporary,body:{requestId:'account-http-event-fixture',title:'Account test',description:'',privacy:'private',madeForKids:false,scheduledStartTime:new Date().toISOString()}});
 const result=await ok('/api/account/register',{token:temporary,body:{email,password,deviceName:'Match phone'}});phone=result.value.sessionToken;cookiePhone=result.cookie.split(';')[0];
 assert.equal(result.value.remembered,true);assert.match(result.cookie,/HttpOnly/);assert.match(result.cookie,/Secure/);assert.equal(JSON.stringify(result.value).includes(password),false);
 const info=(await ok('/api/info',{token:phone})).value;assert.equal(info.savedStudio.account.email,email);assert.equal(info.destinations.find(d=>d.id==='facebook').mode,'saved');assert.equal(info.youtube.connected,true);assert.equal(info.youtube.broadcast.keyReady,true);
 await ok('/api/preferences',{token:phone,body:{resolution:'720',destinations:['youtube','facebook']}});
 assert.equal((await request('/api/account/register',{token:master,body:{email:'other@example.test',password}})).status,409);
});
test('another device signs in using email and password without a relay token or pairing code',async()=>{
 const result=await ok('/api/account/login',{body:{email:'OWNER@example.test',password,deviceName:'Tablet'}});tablet=result.value.sessionToken;cookieTablet=result.cookie.split(';')[0];assert.notEqual(tablet,phone);
 const info=(await ok('/api/info',{token:tablet})).value;assert.equal(info.savedStudio.preferences.resolution,'720');assert.equal(info.youtube.channel.title,'Test cricket channel');assert.equal(info.savedStudio.device.devices.length,2);
 const publicStatus=(await ok('/api/account/status')).value;assert.equal(publicStatus.configured,true);assert.equal(JSON.stringify(publicStatus).includes(email),false);
 const raw=await fs.readFile(path.join(dir,'studio.enc'),'utf8');for(const value of [password,email,'account-http-platform-fixture','private-refresh-token'])assert.equal(raw.includes(value),false);
});
test('wrong credentials never create a remembered cookie or reveal whether the email exists',async()=>{
 const known=await request('/api/account/login',{body:{email,password:'incorrect passphrase fixture'}}),unknown=await request('/api/account/login',{body:{email:'stranger@example.test',password}});assert.equal(known.status,401);assert.equal(unknown.status,401);assert.deepEqual(known.value,unknown.value);assert.equal(known.cookie,null);assert.equal(unknown.cookie,null);
 const good=await ok('/api/account/login',{body:{email,password},cookie:cookiePhone});assert.equal(good.value.sessionToken,phone);
});
test('account and both remembered devices survive an actual server restart',async()=>{
 await stop();await start();assert.equal((await ok('/api/account/status')).value.configured,true);
 phone=(await ok('/api/device/restore',{body:{},cookie:cookiePhone})).value.sessionToken;tablet=(await ok('/api/device/restore',{body:{},cookie:cookieTablet})).value.sessionToken;
 const info=(await ok('/api/info',{token:tablet})).value;assert.equal(info.savedStudio.account.email,email);assert.equal(info.youtube.broadcast.keyReady,true);assert.equal(info.destinations.find(d=>d.id==='facebook').configured,true);
});
test('password change signs out the other device, invalidates its ticket and preserves shared credentials',async()=>{
 const ticket=(await ok('/api/ticket',{token:tablet,body:{}})).value.ticket;
 const changed=await ok('/api/account/password',{token:phone,body:{currentPassword:password,password:password+' changed',deviceName:'Match phone'}});phone=changed.value.sessionToken;cookiePhone=changed.cookie.split(';')[0];
 assert.equal((await request('/api/info',{token:tablet})).status,401);assert.equal((await ok('/api/device/restore',{body:{},cookie:cookieTablet})).value.remembered,false);
 assert.equal((await request('/api/account/login',{body:{email,password}})).status,401);
 const current=await ok('/api/account/login',{body:{email,password:password+' changed',deviceName:'Tablet'}});tablet=current.value.sessionToken;cookieTablet=current.cookie.split(';')[0];
 const info=(await ok('/api/info',{token:phone})).value;assert.equal(info.youtube.connected,true);assert.equal(info.destinations.find(d=>d.id==='facebook').configured,true);
 const rejected=await new Promise((resolve,reject)=>{const ws=new WebSocket(base.replace('http:','ws:')+'/ingest',{origin});const timer=setTimeout(()=>{ws.terminate();reject(new Error('Ticket check timed out'));},5000);ws.on('open',()=>ws.send(JSON.stringify({type:'start',ticket})));ws.on('message',bytes=>{const v=JSON.parse(bytes);if(v.type==='error'){clearTimeout(timer);ws.close();resolve(v.message);}});ws.on('error',reject);});assert.match(rejected,/ticket/);
});
test('owner recovery replaces the password and remembered devices without deleting the studio',async()=>{
 const recovered=await ok('/api/account/recover',{token:master,body:{email,password:password+' recovered',deviceName:'Recovered phone'}});const previous=phone;phone=recovered.value.sessionToken;cookiePhone=recovered.cookie.split(';')[0];
 assert.equal((await request('/api/info',{token:previous})).status,401);assert.equal((await request('/api/info',{token:tablet})).status,401);
 const result=await ok('/api/account/login',{body:{email,password:password+' recovered',deviceName:'Another phone'}});const info=(await ok('/api/info',{token:result.value.sessionToken})).value;assert.equal(info.youtube.connected,true);assert.equal(info.savedStudio.preferences.resolution,'720');
});
