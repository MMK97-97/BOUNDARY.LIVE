import test, {before,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {WebSocket} from 'ws';
import {StudioVault,FileVaultAdapter} from '../lib/vault.mjs';
const origin='https://mk97-saved.fixture.test',master='private-fixture-relay-token-not-a-real-user-secret';
let dir,base,processHandle,phone,tablet,cookiePhone,cookieTablet,phoneId,tabletId;
const headers=(token,cookie)=>({Origin:origin,'X-MK97-Origin':origin,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(cookie?{Cookie:cookie}:{})});
async function request(route,{token,body,cookie}={}){
 const response=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:headers(token,cookie),...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'manual'});
 return{status:response.status,value:await response.json(),cookie:response.headers.get('set-cookie')};
}
async function ok(route,options){const result=await request(route,options);assert.ok(result.status<300,result.value.error);return result;}
async function start(){
 const child=spawn(process.execPath,['--import',pathToFileURL(path.join(dir,'mock.mjs')).href,fileURLToPath(new URL('../server.mjs',import.meta.url))],{env:{...process.env,PORT:'0',HOST:'127.0.0.1',PUBLIC_URL:origin,RENDER_EXTERNAL_URL:'',ALLOWED_ORIGINS:'',RELAY_TOKEN:master,STUDIO_DATA_FILE:path.join(dir,'private','studio.enc'),STUDIO_ENCRYPTION_KEY:(await fs.readFile(path.join(dir,'key'),'utf8')),DATABASE_URL:'',GOOGLE_CLIENT_ID:'test-client.apps.googleusercontent.com',GOOGLE_CLIENT_SECRET:'test-client-secret-not-real',YOUTUBE_REDIRECT_URI:origin+'/youtube-callback.html',CRICCLUBS_SCORECARD_ENABLED:'false',SCORE_URL_TEMPLATE:'https://score.fixture.test/{clubId}/{matchId}',YOUTUBE_SERVER:'',YOUTUBE_KEY:'',FACEBOOK_SERVER:'',FACEBOOK_KEY:'',INSTAGRAM_SERVER:'',INSTAGRAM_KEY:''},stdio:['ignore','pipe','pipe']});
 processHandle=child;base=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Server start timeout')),12000);child.stdout.on('data',v=>{const match=v.toString().match(/MK97 relay: (http:\/\/\S+)/);if(match){clearTimeout(timer);resolve(match[1]);}});child.once('exit',code=>{clearTimeout(timer);reject(new Error('Server exited '+code));});});
}
async function stop(){if(processHandle&&processHandle.exitCode===null){processHandle.kill();await new Promise(resolve=>processHandle.once('exit',resolve));}}
before(async()=>{
 dir=await fs.mkdtemp(path.join(os.tmpdir(),'mk97-saved-http-'));await fs.writeFile(path.join(dir,'key'),randomBytes(32).toString('hex'),{mode:0o600});
 const provider=new URL('../support/youtube-provider.mjs',import.meta.url).href,score=new URL('./fixtures/tcl-6098-normalized.json',import.meta.url).href;
 await fs.writeFile(path.join(dir,'mock.mjs'),`import fs from 'node:fs';import{youtubeProvider}from${JSON.stringify(provider)};const mock=youtubeProvider(),score=JSON.parse(fs.readFileSync(new URL(${JSON.stringify(score)})));globalThis.fetch=async(url,options={})=>{const u=new URL(url);if(['oauth2.googleapis.com','www.googleapis.com'].includes(u.hostname)){fs.appendFileSync(${JSON.stringify(path.join(dir,'google-calls.jsonl'))},JSON.stringify({path:u.pathname,method:options.method||'GET'})+'\\n');return mock.fetchFn(url,options);}if(u.hostname==='score.fixture.test')return new Response(JSON.stringify(score));throw new Error('External requests disabled in integration test.');};`);
 await start();
});
after(async()=>{await stop();if(dir)await fs.rm(dir,{recursive:true,force:true});});
test('first device is remembered with a protected cookie and public config exposes no saved secrets',async()=>{
 const config=await ok('/api/public-config');assert.equal(config.value.savedStudio.configured,true);assert.equal(config.value.savedStudio.backend,'file');
 const first=await ok('/api/session',{token:master,body:{remember:true,deviceName:'My phone'}});phone=first.value.sessionToken;cookiePhone=first.cookie.split(';')[0];
 assert.equal(first.value.remembered,true);assert.match(first.cookie,/HttpOnly/);assert.match(first.cookie,/Secure/);assert.match(first.cookie,/SameSite=Lax/);assert.equal(first.cookie.includes(master),false);
 const info=(await ok('/api/info',{token:phone})).value;assert.equal(info.savedStudio.remembered,true);phoneId=info.savedStudio.device.currentDeviceId;assert.equal(info.savedStudio.device.devices[0].name,'My phone');
 const restore=await ok('/api/device/restore',{body:{},cookie:cookiePhone});assert.equal(restore.value.sessionToken,phone);assert.equal(restore.cookie,null);
 assert.equal(JSON.stringify(config.value).includes(phoneId),false);
});
test('manual keys, capture preferences and selected match are saved without being returned to devices',async()=>{
 await ok('/api/destination',{token:phone,body:{id:'youtube',server:'rtmps://a.rtmps.youtube.com/live2',key:'private-saved-youtube-fixture'}});
 await ok('/api/destination',{token:phone,body:{id:'facebook',server:'rtmps://live-api-s.facebook.com:443/rtmp/',key:'private-saved-facebook-fixture'}});
 await ok('/api/preferences',{token:phone,body:{resolution:'720',quality:'balanced',overlay:true,destinations:['youtube'],milestones:true,cards:false}});
 const match=await ok('/api/match',{token:phone,body:{clubId:'157',matchId:'6098',league:'TCL'}});assert.equal(match.value.score.runs,'79');
 const info=(await ok('/api/info',{token:phone})).value;assert.equal(info.destinations.find(d=>d.id==='youtube').mode,'saved');assert.equal(info.savedStudio.preferences.match.league,'TCL');
 assert.equal(JSON.stringify(info).includes('private-saved-youtube-fixture'),false);assert.equal((await fs.readFile(path.join(dir,'private/studio.enc'),'utf8')).includes('private-saved-facebook-fixture'),false);
});
test('a different device links once without the relay token and receives the same saved setup',async()=>{
 const pair=(await ok('/api/devices/pair',{token:phone,body:{}})).value;const second=await ok('/api/device/link',{body:{code:pair.code,deviceName:'My tablet'}});tablet=second.value.sessionToken;cookieTablet=second.cookie.split(';')[0];
 assert.notEqual(tablet,phone);const info=(await ok('/api/info',{token:tablet})).value;tabletId=info.savedStudio.device.currentDeviceId;
 assert.equal(info.savedStudio.preferences.resolution,'720');assert.equal(info.destinations.find(d=>d.id==='facebook').configured,true);assert.equal(info.savedStudio.device.devices.length,2);
 assert.equal((await request('/api/device/link',{body:{code:pair.code,deviceName:'Intruder'}})).status,401);
 const foreign=await fetch(base+'/api/device/restore',{method:'POST',headers:{...headers(null,cookiePhone),Origin:'https://evil.fixture.test'},body:'{}'});assert.equal(foreign.status,403);
});
test('simultaneous destination edits from linked devices preserve both keys',async()=>{
 await Promise.all([ok('/api/destination',{token:phone,body:{id:'facebook',server:'rtmps://live-api-s.facebook.com:443/rtmp/',key:'updated-facebook-fixture'}}),ok('/api/destination',{token:tablet,body:{id:'instagram',server:'rtmps://live-upload.instagram.com:443/rtmp/',key:'saved-instagram-fixture'}})]);
 const info=(await ok('/api/info',{token:phone})).value;assert.equal(info.destinations.find(d=>d.id==='facebook').configured,true);assert.equal(info.destinations.find(d=>d.id==='instagram').configured,true);
});
test('Google authorization and a ready YouTube setup are shared privately with the linked device',async()=>{
 const flow=(await ok('/api/youtube/auth/start',{token:tablet,body:{}})).value;
 const callback=await fetch(base+'/youtube-callback.html?state='+flow.state+'&code=synthetic-fixture-code',{redirect:'manual'});assert.equal(callback.headers.get('location'),'/youtube-callback.html?result=connected');
 const status=(await ok('/api/youtube/status',{token:phone})).value;assert.equal(status.connected,true);assert.equal(status.channel.title,'Test cricket channel');
 await ok('/api/youtube/setup',{token:phone,body:{requestId:'saved-http-setup-fixture',title:'Saved cricket fixture',privacy:'unlisted',description:'',madeForKids:false,scheduledStartTime:new Date().toISOString()}});
 const info=(await ok('/api/info',{token:tablet})).value;assert.equal(info.youtube.broadcast.keyReady,true);assert.equal(info.destinations.find(d=>d.id==='youtube').mode,'account');
 const raw=await fs.readFile(path.join(dir,'private/studio.enc'),'utf8');for(const secret of [master,'private-access-token','private-refresh-token','private-api-stream-key'])assert.equal(raw.includes(secret),false);
 const temporary=(await ok('/api/session',{token:master,body:{}})).value.sessionToken;assert.equal((await ok('/api/youtube/status',{token:temporary})).value.connected,false);
});
test('after a real server restart both devices restore without credentials and the event is only read, not recreated',async()=>{
 await stop();await fs.writeFile(path.join(dir,'google-calls.jsonl'),'');await start();
 const second=(await ok('/api/device/restore',{body:{},cookie:cookieTablet})).value;tablet=second.sessionToken;assert.equal(second.remembered,true);
 const info=(await ok('/api/info',{token:tablet})).value;assert.equal(info.youtube.connected,true);assert.equal(info.youtube.broadcast.keyReady,true);assert.equal(info.savedStudio.preferences.resolution,'720');assert.equal(info.savedStudio.preferences.match.matchId,'6098');
 assert.equal(info.destinations.find(d=>d.id==='instagram').configured,true);
 const calls=(await fs.readFile(path.join(dir,'google-calls.jsonl'),'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);assert.ok(calls.some(c=>c.path.endsWith('/liveBroadcasts')));assert.equal(calls.some(c=>c.method==='POST'),false);
 const first=(await ok('/api/device/restore',{body:{},cookie:cookiePhone})).value;phone=first.sessionToken;assert.equal(first.remembered,true);
});
test('an expired saved Google access token refreshes after restart without authorization or event creation',async()=>{
 await stop();const vault=new StudioVault({adapter:new FileVaultAdapter(path.join(dir,'private/studio.enc')),key:await fs.readFile(path.join(dir,'key'),'utf8')});
 await vault.mutate(s=>{s.profile.youtube.expires=0;});await vault.close();await fs.writeFile(path.join(dir,'google-calls.jsonl'),'');await start();
 phone=(await ok('/api/device/restore',{body:{},cookie:cookiePhone})).value.sessionToken;
 tablet=(await ok('/api/device/restore',{body:{},cookie:cookieTablet})).value.sessionToken;
 const info=(await ok('/api/info',{token:phone})).value;assert.equal(info.youtube.connected,true);assert.equal(info.youtube.broadcast.keyReady,true);
 const calls=(await fs.readFile(path.join(dir,'google-calls.jsonl'),'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
 assert.equal(calls.filter(c=>c.path==='/token'&&c.method==='POST').length,1);assert.equal(calls.some(c=>c.path.startsWith('/youtube/')&&c.method==='POST'),false);
 const stored=new StudioVault({adapter:new FileVaultAdapter(path.join(dir,'private/studio.enc')),key:await fs.readFile(path.join(dir,'key'),'utf8')});await stored.ready();assert.ok(stored.snapshot().profile.youtube.expires>Date.now());await stored.close();
});
test('revoking a device invalidates its session, cookie and unused streaming ticket',async()=>{
 const ticket=(await ok('/api/ticket',{token:tablet,body:{}})).value.ticket;
 await ok('/api/devices/revoke',{token:phone,body:{deviceId:tabletId}});
 const rejected=await request('/api/info',{token:tablet});assert.equal(rejected.status,401);assert.equal(rejected.value.code,'SESSION_REQUIRED');
 const restored=await ok('/api/device/restore',{body:{},cookie:cookieTablet});assert.equal(restored.value.remembered,false);assert.match(restored.cookie,/Max-Age=0/);
 const message=await new Promise((resolve,reject)=>{const ws=new WebSocket(base.replace('http:','ws:')+'/ingest',{origin});const timer=setTimeout(()=>{ws.terminate();reject(new Error('WS timeout'));},5000);ws.on('open',()=>ws.send(JSON.stringify({type:'start',ticket})));ws.on('message',bytes=>{const v=JSON.parse(bytes);if(v.type==='error'){clearTimeout(timer);ws.close();resolve(v.message);}});ws.on('error',reject);});assert.match(message,/ticket/);
});
test('a signed-out device cannot finish a Google sign-in that it started',async()=>{
 const pair=(await ok('/api/devices/pair',{token:phone,body:{}})).value;const second=await ok('/api/device/link',{body:{code:pair.code,deviceName:'Old phone'}});tablet=second.value.sessionToken;
 const id=(await ok('/api/info',{token:tablet})).value.savedStudio.device.currentDeviceId;const flow=(await ok('/api/youtube/auth/start',{token:tablet,body:{}})).value;
 await ok('/api/devices/revoke',{token:phone,body:{deviceId:id}});const callback=await fetch(base+'/youtube-callback.html?state='+flow.state+'&code=late-fixture',{redirect:'manual'});assert.equal(callback.headers.get('location'),'/youtube-callback.html?result=failed');
 assert.equal((await ok('/api/youtube/status',{token:phone})).value.connected,true);
});
test('signing out removes this device while preserving saved connections for the studio owner',async()=>{
 const result=await ok('/api/logout',{token:phone,body:{}});assert.match(result.cookie,/Max-Age=0/);
 assert.equal((await ok('/api/device/restore',{body:{},cookie:cookiePhone})).value.remembered,false);
 const recovered=await ok('/api/session',{token:master,body:{remember:true,deviceName:'Recovered device'}});phone=recovered.value.sessionToken;
 const info=(await ok('/api/info',{token:phone})).value;assert.equal(info.destinations.find(d=>d.id==='instagram').configured,true);assert.equal(info.youtube.connected,true);
 const noCookie=await ok('/api/device/restore',{body:{}});assert.equal(noCookie.value.remembered,false);
});
test('unsupported preference fields, credential-bearing watch URLs and arbitrary endpoint injection are rejected',async()=>{
 for(const value of [{secret:'must-not-save'},{watchUrl:'https://youtube.com/watch?v=public&access_token=private'},{destinations:['arbitrary']},{match:{clubId:'157',matchId:'6098',league:'../write'}}])assert.equal((await request('/api/preferences',{token:phone,body:value})).status,400);
 assert.equal((await request('/api/devices/revoke',{token:phone,body:{deviceId:'../bad'}})).status,400);
});
