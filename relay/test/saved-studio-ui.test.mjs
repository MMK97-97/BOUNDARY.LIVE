import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../../web/saved-studio.mjs',import.meta.url),'utf8').replace('export function installSavedStudio','function installSavedStudio');
const origin='https://studio.fixture.test';
const flush=async()=>{for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve));};
function fixture({configured=true,restoreIdentity={remembered:true,sessionToken:'private-test-session',expiresAt:Date.now()+3600000,deviceExpiresAt:Date.now()+86400000},apiOverride}={}){
 const fields=new Map(),timers=new Map(),calls=[],notices=[];let serial=0,controller;
 const get=id=>{if(!fields.has(id))fields.set(id,node());return fields.get(id);};
 function node(){return{value:'',checked:false,disabled:false,hidden:false,textContent:'',children:[],handlers:{},className:'',addEventListener(type,fn){this.handlers[type]=fn;},emit(type){return this.handlers[type]?.({preventDefault(){}});},append(...children){this.children.push(...children);},replaceChildren(...children){this.children=children;},setAttribute(name,value){this[name]=value;},querySelectorAll(){return this.children.flatMap(c=>[...c.children.filter(x=>x.handlers?.click)]);}};}
 get('rememberDevice').checked=true;get('qualitySelect').value='balanced';get('overlayToggle').checked=true;get('autoMilestones').checked=true;get('autoCards').checked=true;
 const state={session:null,relay:'',info:null,connecting:false,captureResolution:'1080'};
 const info={savedStudio:{remembered:true,configured:true,device:{devices:[{id:'phone',name:'My phone',current:true,expiresAt:Date.now()+86400000}]},preferences:{}},destinations:[]};
 const api=async(path,options={},token)=>{
  const body=options.body?JSON.parse(options.body):null;calls.push({path,body,token});
  if(apiOverride){const result=await apiOverride(path,body,state);if(result!==undefined)return result;}
  if(path==='/api/device/restore'||path==='/api/device/link')return restoreIdentity;
  if(path==='/api/devices/pair')return{code:'ABCD-1234-ABCD-1234',expiresAt:Date.now()+300000};
  return{ok:true};
 };
 const context={Date,URL,Promise,JSON,location:{origin,protocol:'https:',hostname:'studio.fixture.test'},document:{baseURI:origin+'/',hidden:false,getElementById:get,createElement:node,addEventListener(){}},crypto:{getRandomValues(bytes){bytes.fill(0x73);return bytes;}},Uint8Array,navigator:{clipboard:{async writeText(value){calls.push({path:'clipboard',value});}}},AbortSignal,
  fetch:async()=>new Response(JSON.stringify({product:'mk97',sameOrigin:true,savedStudio:{configured,message:configured?null:'Configure durable storage once.'}})),
  setTimeout(fn,ms){const id=++serial;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);},setInterval(fn,ms){const id=++serial;timers.set(id,{fn,ms});return id;},clearInterval(id){timers.delete(id);}};
 context.install={state,api,notice:(...value)=>notices.push(value),updateControls(){controller?.update();},async connectIdentity(identity){state.session=identity.sessionToken;state.info=info;controller.accept(info);controller.synced();},async clearConnection(){state.session=null;state.info=null;controller.update();},async refreshInfo(){await api('/api/info');controller.accept(state.info);}};
 vm.runInNewContext(source+'\n;globalThis.controller=installSavedStudio(install);',context);controller=context.controller;
 return{controller,state,info,get,calls,notices,async tick(ms){for(const[id,timer]of[...timers])if(timer.ms===ms){if(ms!==30000)timers.delete(id);await timer.fn();}await flush();},timers};
}
test('remembered sessions restore on page open without reading or submitting the relay token',async()=>{
 const h=fixture();h.get('relayToken').value='must-never-be-sent';await h.controller.discover();
 assert.equal(h.state.session,'private-test-session');assert.equal(h.state.relay,origin);assert.equal(h.get('relayUrl').value,origin);assert.match(h.get('savedConnectionState').textContent,/remembered/);
 const request=h.calls.find(c=>c.path==='/api/device/restore');assert.equal(request.token,null);assert.deepEqual(request.body,{});assert.equal(JSON.stringify(h.calls).includes('must-never-be-sent'),false);h.controller.destroy();
});
test('missing durable storage remains explicit and does not claim the device is remembered',async()=>{
 const h=fixture({configured:false});await h.controller.discover();assert.equal(h.state.session,null);assert.equal(h.get('rememberDevice').disabled,true);assert.equal(h.get('rememberDevice').checked,false);assert.match(h.get('rememberHelp').textContent,/durable storage/);assert.equal(h.calls.length,0);h.controller.destroy();
});
test('a new device can submit a one-time code without the master token and clears the code afterwards',async()=>{
 const linked=fixture({apiOverride(path){if(path==='/api/device/restore')return{remembered:false};if(path==='/api/device/link')return{remembered:true,sessionToken:'tablet-session'};}});await linked.controller.discover();linked.get('linkDeviceCode').value='ABCD-1234-ABCD-1234';linked.get('linkDeviceName').value='Tablet';await linked.get('linkDeviceForm').emit('submit');
 assert.equal(linked.state.session,'tablet-session');assert.equal(linked.get('linkDeviceCode').value,'');assert.equal(linked.calls.find(c=>c.path==='/api/device/link').token,null);assert.match(linked.notices.at(-1)[0],/Device linked/);linked.controller.destroy();
});
test('saved preference changes include only public settings and never copy credential fields',async()=>{
 const h=fixture();await h.controller.discover();h.get('relayToken').value='private-master-must-not-save';h.get('destinationKey').value='private-key-must-not-save';h.get('dest-youtube').checked=true;h.state.captureResolution='720';h.get('autoCards').checked=false;await h.get('autoCards').emit('change');await h.tick(500);
 const call=h.calls.find(c=>c.path==='/api/preferences');assert.ok(call);assert.equal(call.body.resolution,'720');assert.equal(call.body.cards,false);assert.deepEqual(call.body.destinations,['youtube']);assert.equal(JSON.stringify(call.body).includes('private'),false);h.controller.destroy();
});
test('an expired short session reconnects with the remembered cookie without asking for credentials',async()=>{
 let first=true;const h=fixture({apiOverride(path){if(path==='/api/info'&&first){first=false;throw Object.assign(new Error('Expired'),{status:401,payload:{code:'SESSION_REQUIRED'}});}}});await h.controller.discover();await h.tick(30000);
 assert.equal(h.calls.filter(c=>c.path==='/api/device/restore').length,2);assert.equal(h.state.session,'private-test-session');assert.equal(h.state.connecting,false);h.controller.destroy();
});
test('a revoked remembered device returns to the signed-out view and never silently resubmits a master token',async()=>{
 let valid=true;const h=fixture({apiOverride(path){if(path==='/api/info'&&!valid)throw Object.assign(new Error('Revoked'),{status:401,payload:{code:'SESSION_REQUIRED'}});if(path==='/api/device/restore'&&!valid)return{remembered:false};}});await h.controller.discover();valid=false;await h.tick(30000);
 assert.equal(h.state.session,null);assert.equal(h.get('savedDevicePanel').hidden,true);assert.equal(h.calls.some(c=>c.path==='/api/session'),false);h.controller.destroy();
});

test('private encryption key generation stays out of saved preferences and clears when destroyed',async()=>{
 const h=fixture({configured:false});await h.controller.discover();await h.get('generateEncryptionKey').emit('click');
 const key=h.get('newEncryptionKey').textContent;assert.match(key,/^[a-f0-9]{64}$/);assert.equal(h.get('newEncryptionKeyPanel').hidden,false);assert.equal(h.calls.length,0);
 h.controller.destroy();assert.equal(h.get('newEncryptionKey').textContent,'');assert.equal(h.get('newEncryptionKeyPanel').hidden,true);
});
