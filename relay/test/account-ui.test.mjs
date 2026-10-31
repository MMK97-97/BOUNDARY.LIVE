import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import vm from'node:vm';
const source=fs.readFileSync(new URL('../../web/studio-account.mjs',import.meta.url),'utf8').replace('export function installStudioAccount','function installStudioAccount');
const password='fixture account password 12345';
function fixture({registered=true,override}={}){const fields=new Map(),calls=[],notices=[];let controller;
 const get=id=>{if(!fields.has(id))fields.set(id,{value:'',textContent:'',hidden:false,disabled:false,required:false,open:false,handlers:{},addEventListener(type,fn){this.handlers[type]=fn;},emit(type){return this.handlers[type]?.({preventDefault(){}});},focus(){}});return fields.get(id);};
 const state={session:null,connecting:false,info:null};
 const api=async(path,options={},token)=>{const value=options.body?JSON.parse(options.body):null;calls.push({path,value,token});if(override){const result=await override(path,value,state);if(result!==undefined)return result;}if(path==='/api/account/status')return{configured:registered};return{sessionToken:'new-private-test-session',remembered:true};};
 const context={document:{getElementById:get},install:{state,api,notice:(...v)=>notices.push(v),updateControls(){controller?.update();},async connectIdentity(identity){state.session=identity.sessionToken;state.info={savedStudio:{remembered:true,account:{configured:true,email:'owner@example.test'}}};controller.accept(state.info);}}};
 vm.runInNewContext(source+'\n;globalThis.account=installStudioAccount(install);',context);controller=context.account;return{controller,state,get,calls,notices,async configure(){await controller.configure({},true);}};
}
test('ordinary sign-in never reads or submits a relay token and clears the password after connecting',async()=>{
 const h=fixture();await h.configure();assert.equal(h.get('accountLoginForm').hidden,false);assert.equal(h.get('accountCreateForm').hidden,true);
 Object.defineProperty(h.get('accountSetupToken'),'value',{get(){throw new Error('Master token must not be read');},set(){}});
 h.get('accountEmail').value='owner@example.test';h.get('accountPassword').value=password;h.get('accountDeviceName').value='Phone';await h.get('accountLoginForm').emit('submit');
 const login=h.calls.find(c=>c.path==='/api/account/login');assert.equal(login.token,null);assert.equal(login.value.email,'owner@example.test');assert.equal(h.get('accountPassword').value,'');assert.equal(h.state.session,'new-private-test-session');assert.equal(h.get('accountLoginForm').hidden,true);assert.match(h.get('accountIdentity').textContent,/owner@example/);
});
test('first account setup reuses an authorized operator session instead of asking for the token again',async()=>{
 const h=fixture({registered:false});h.state.session='authorized-fixture-session';await h.configure();assert.equal(h.get('accountSetupTokenRow').hidden,true);
 Object.defineProperty(h.get('accountSetupToken'),'value',{get(){throw new Error('Unneeded token read');},set(){}});
 h.get('accountCreateEmail').value='owner@example.test';h.get('accountCreatePassword').value=password;h.get('accountConfirmPassword').value=password;await h.get('accountCreateForm').emit('submit');
 assert.equal(h.calls.find(c=>c.path==='/api/account/register').token,'authorized-fixture-session');assert.equal(h.get('accountCreatePassword').value,'');assert.equal(h.get('accountConfirmPassword').value,'');
});
test('a first unauthenticated setup requires a one-time owner token; mismatched passwords make no request',async()=>{
 const h=fixture({registered:false});await h.configure();assert.equal(h.get('accountSetupToken').required,true);h.get('accountCreateEmail').value='owner@example.test';h.get('accountSetupToken').value='nonfunctional-fixture-owner-token';h.get('accountCreatePassword').value=password;h.get('accountConfirmPassword').value='different';await h.get('accountCreateForm').emit('submit');assert.equal(h.calls.length,1);assert.match(h.get('accountMessage').textContent,/do not match/);
 h.get('accountConfirmPassword').value=password;await h.get('accountCreateForm').emit('submit');assert.equal(h.calls.find(c=>c.path==='/api/account/register').token,'nonfunctional-fixture-owner-token');assert.equal(h.get('accountSetupToken').value,'');
});
test('failed sign-in clears the password and keeps a useful error without claiming a connection',async()=>{
 const h=fixture({override(path){if(path==='/api/account/login')throw new Error('Email or password is incorrect.');}});await h.configure();h.get('accountEmail').value='owner@example.test';h.get('accountPassword').value=password;await h.get('accountLoginForm').emit('submit');assert.equal(h.state.session,null);assert.equal(h.get('accountPassword').value,'');assert.match(h.get('accountMessage').textContent,/incorrect/);assert.equal(h.state.connecting,false);
});
test('double submissions and delayed responses cannot replace a newer session',async()=>{
 let release;const waiting=new Promise(resolve=>{release=resolve;});const h=fixture({override:async(path)=>{if(path==='/api/account/login'){await waiting;return{sessionToken:'late-session',remembered:true};}}});await h.configure();h.get('accountEmail').value='owner@example.test';h.get('accountPassword').value=password;const first=h.get('accountLoginForm').emit('submit');await h.get('accountLoginForm').emit('submit');assert.equal(h.calls.filter(c=>c.path==='/api/account/login').length,1);h.state.session='newer-session';release();await first;assert.equal(h.state.session,'newer-session');assert.equal(h.get('accountPassword').value,'');
});
test('recovery and password change clear every secret input and use the expected authorization',async()=>{
 const h=fixture();await h.configure();h.get('accountRecoveryEmail').value='owner@example.test';h.get('accountRecoveryPassword').value=password;h.get('accountRecoveryConfirm').value=password;h.get('accountRecoveryToken').value='nonfunctional-recovery-fixture';await h.get('accountRecoveryForm').emit('submit');assert.equal(h.calls.find(c=>c.path==='/api/account/recover').token,'nonfunctional-recovery-fixture');assert.equal(h.get('accountRecoveryToken').value,'');
 h.get('accountCurrentPassword').value=password;h.get('accountNewPassword').value=password+' changed';h.get('accountNewConfirm').value=password+' changed';await h.get('accountPasswordForm').emit('submit');assert.equal(h.calls.find(c=>c.path==='/api/account/password').token,'new-private-test-session');assert.equal(h.get('accountCurrentPassword').value,'');assert.equal(h.get('accountNewPassword').value,'');assert.equal(h.get('accountNewConfirm').value,'');
});
