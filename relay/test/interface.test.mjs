import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { load } from 'cheerio';
import { installInterface, SCREEN_ROUTES } from '../../web/interface.mjs';
const html = fs.readFileSync(new URL('../../web/index.html', import.meta.url), 'utf8');
const contract = JSON.parse(fs.readFileSync(new URL('./fixtures/ui-controls-v18.json', import.meta.url), 'utf8'));

test('the supplied layout retains every previous controller ID, input type, form owner and select choice', () => {
  const $ = load(html), ids = $('[id]').toArray().map(n => $(n).attr('id'));
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(contract.length, 304);
  for (const old of contract) {
    const node = $('#' + old.id); assert.equal(node.length, 1, old.id);
    if ('form' in old || old.tag === 'form') assert.equal(node[0].tagName, old.tag, old.id);
    if ('form' in old) {
      const type = old.tag === 'button' && !old.form ? 'button' : node.attr('type') || '';
      const previousType = old.tag === 'button' && !old.form ? 'button' : old.type;
      assert.equal(type, previousType, old.id + ' type');
      assert.equal(node.closest('form').attr('id') || '', old.form, old.id + ' form');
      if (old.options) assert.deepEqual(node.find('option').toArray().map(n => $(n).attr('value') ?? $(n).text()), old.options, old.id + ' options');
    }
  }
  assert.equal($('[onclick],[onchange],[onsubmit]').length, 0);
});
test('all design routes, resolution choices and visibility buttons resolve to real existing controls', () => {
  const $ = load(html);
  for (const n of $('[data-route]').toArray()) assert.ok(SCREEN_ROUTES[$(n).attr('data-route')], $(n).text());
  for (const route of Object.values(SCREEN_ROUTES)) if (route.panel) {
    assert.equal($(`[data-drawer="${route.panel}"]`).length, 1);
    if (route.target) assert.equal($('#' + route.target).length, 1);
  }
  for (const n of $('[data-panel]').toArray()) assert.equal($(`[data-drawer="${$(n).attr('data-panel')}"]`).length, 1, $(n).text());
  for (const n of $('[data-resolution-proxy]').toArray()) assert.equal($(`#resolutionOptions [data-resolution="${$(n).attr('data-resolution-proxy')}"]`).length, 1);
  for (const n of $('[data-password-toggle]').toArray()) {
    const button = $(n), id = button.attr('data-password-toggle');
    assert.equal(button.attr('type'), 'button'); assert.equal(button.attr('aria-controls'), id); assert.equal($('#' + id).attr('type'), 'password');
  }
});
function harness() {
  const $ = load(html), nodes = new Map(), calls = [], documentHandlers = new Map(); let controller;
  class Element {
    constructor(raw) {
      this.raw = raw; this.id = raw.attribs.id || ''; this.tagName = raw.tagName;
      this.hidden = Object.hasOwn(raw.attribs,'hidden'); this.disabled = Object.hasOwn(raw.attribs,'disabled');
      this.checked = Object.hasOwn(raw.attribs,'checked'); this.type = raw.attribs.type || '';
      this.value = $(raw).val() || ''; this.textContent = $(raw).text(); this.dataset = {};
      for(const [key,value] of Object.entries(raw.attribs)) if(key.startsWith('data-')) this.dataset[key.slice(5).replace(/-([a-z])/g,(_,v)=>v.toUpperCase())]=value;
      this.attrs={...raw.attribs}; this.handlers=new Map(); const classes=new Set((raw.attribs.class||'').split(' '));
      this.classList={toggle(name,enabled){const yes=enabled??!classes.has(name);yes?classes.add(name):classes.delete(name);return yes;},contains:n=>classes.has(n),add:n=>classes.add(n),remove:n=>classes.delete(n)};
    }
    setAttribute(k,v){this.attrs[k]=String(v);} removeAttribute(k){delete this.attrs[k];} getAttribute(k){return this.attrs[k]??null;}
    addEventListener(type,handler){if(!this.handlers.has(type))this.handlers.set(type,[]);this.handlers.get(type).push(handler);}
    dispatchEvent(event){for(const fn of this.handlers.get(event.type)||[])fn(event);return true;}
    click(){if(!this.disabled)this.dispatchEvent({type:'click',target:this,preventDefault(){}});}
    focus(){document.activeElement=this;} append(node){node.parentElement=this;}
    querySelector(selector){const raw=$(this.raw).find(selector)[0];return nodes.get(raw)||null;}
    closest(selector){return nodes.get($(this.raw).closest(selector)[0])||null;}
    removeAttributeNode(){} scrollIntoView(){}
  }
  for(const raw of $('*').toArray())nodes.set(raw,new Element(raw));
  for(const [raw,node] of nodes)node.parentElement=nodes.get(raw.parent)||null;
  const document={body:nodes.get($('body')[0]),activeElement:null,getElementById:id=>nodes.get($('#'+id)[0]),querySelector:selector=>nodes.get($(selector)[0])||null,querySelectorAll:selector=>$(selector).toArray().map(n=>nodes.get(n)),addEventListener(type,handler){if(!documentHandlers.has(type))documentHandlers.set(type,[]);documentHandlers.get(type).push(handler);}};
  globalThis.document=document;
  const e=id=>document.getElementById(id);
  e('qualitySelect').value='balanced';e('accountPanel').hidden=false;e('ytEvent').hidden=true;
  const state={session:null,info:null,captureResolution:'1080',camera:null,score:null};
  const ui={panel:(name,target)=>{calls.push(['panel',name,target]);controller?.opened(name);},closeDrawer:()=>{calls.push(['close']);controller?.closed();}};
  const home={home:()=>{calls.push(['home']);controller?.viewChanged('home');},openStudio:()=>{calls.push(['studio']);ui.closeDrawer();controller?.viewChanged('studio');}};
  for(const button of document.querySelectorAll('#resolutionOptions [data-resolution]'))button.addEventListener('click',()=>{calls.push(['native-resolution',button.dataset.resolution]);state.captureResolution=button.dataset.resolution;});
  e('destinationPlatform').addEventListener('change',()=>calls.push(['platform-changed',e('destinationPlatform').value]));
  controller=installInterface({state,ui,home,notice:m=>calls.push(['notice',m])});
  return{state,controller,e,calls,document,emit(type){for(const h of documentHandlers.get(type)||[])h({type});},button(selector){return document.querySelector(selector);}};
}
test('sign-in navigation shares the original cloud form and account restoration reaches Home',()=>{
  const h=harness();assert.equal(h.controller.view,'auth');assert.equal(h.e('cloudConnectionPanel').parentElement,h.e('authMount'));
  h.e('authUseToken').click();assert.equal(h.e('legacyConnectionDetails').open,true);assert.equal(h.document.activeElement,h.e('relayToken'));
  h.e('authUseAccount').click();assert.equal(h.document.activeElement,h.e('accountEmail'));
  h.state.session='fixture-session';h.state.info={encoder:{ready:true},destinations:[]};h.controller.update();
  assert.equal(h.controller.view,'home');assert.equal(h.e('cloudConnectionPanel').parentElement,h.e('cloudSettingsMount'));
  h.state.session=null;h.controller.update();assert.equal(h.controller.view,'auth');
});
test('nested screens return through Back while Close retains the underlying view',()=>{
  const h=harness();h.controller.viewChanged('home');
  h.controller.navigate('streamSettings');h.controller.navigate('matchEvents');assert.equal(h.controller.panel,'graphics');
  h.controller.back();assert.equal(h.controller.panel,'streamSettings');h.controller.back();assert.equal(h.controller.panel,null);assert.equal(h.controller.view,'home');
  h.controller.navigate('studio');assert.equal(h.controller.view,'studio');
});
test('quality buttons forward to the existing capture controller and lock during upload',()=>{
  const h=harness(),b=h.button('[data-resolution-proxy="720"]');b.click();h.controller.update();
  assert.equal(h.state.captureResolution,'720');assert.ok(h.calls.some(c=>c[0]==='native-resolution'&&c[1]==='720'));assert.equal(b.getAttribute('aria-pressed'),'true');
  assert.match(h.e('qualityActual').textContent,/4\.5 Mbps/);
  h.state.live=true;h.controller.update();const count=h.calls.length;h.button('[data-resolution-proxy="1080"]').click();assert.equal(h.calls.length,count);
});
test('destination arrows configure only the existing supported platforms and preserve live locks',()=>{
  const h=harness();h.button('[data-configure-destination="facebook"]').click();
  assert.equal(h.e('destinationPlatform').value,'facebook');assert.equal(h.e('manualDestinationDetails').open,true);assert.ok(h.calls.some(c=>c[0]==='platform-changed'));
  h.button('[data-configure-destination="youtube"]').click();assert.equal(h.controller.panel,'youtube');
  h.state.live=true;h.controller.update();assert.equal(h.button('[data-configure-destination="facebook"]').disabled,true);assert.equal(h.button('[data-configure-destination="youtube"]').disabled,false);
});
test('visibility controls mask again on submit and panel navigation without changing secret values',()=>{
  const h=harness(),input=h.e('accountPassword'),button=h.button('[data-password-toggle="accountPassword"]');input.value='public test value';
  button.click();assert.equal(input.type,'text');assert.equal(button.getAttribute('aria-label'),'Hide password');h.emit('submit');assert.equal(input.type,'password');assert.equal(input.value,'public test value');
  button.click();h.controller.navigate('match');assert.equal(input.type,'password');
});
test('the graphics preview and match summary show the supplied score without template match data',()=>{
  const h=harness();h.state.score={clubId:'157',matchId:'6098',batting:'Fixture XI',bowling:'Other XI',runs:'77',wickets:'2',overs:'12.1',series:'Source league',status:'live',fetchedAt:Date.now(),batters:[]};h.controller.update();
  assert.equal(h.e('matchIdValue').textContent,'6098');assert.equal(h.e('matchClubValue').textContent,'157');assert.equal(h.e('matchTeamAName').textContent,'Fixture XI');
  assert.ok(h.e('graphicsScorePreview').src.startsWith('data:image/svg+xml'));
  assert.ok(decodeURIComponent(h.e('graphicsScorePreview').src).includes('77/2'));assert.equal(h.e('graphicsPreviewEmpty').hidden,true);
  h.state.score=null;h.controller.update();assert.equal(h.e('graphicsScorePreview').hidden,true);
});
test('successful existing YouTube setup opens its live controls and Back does not resubmit setup',()=>{
  const h=harness();h.controller.navigate('youtubecreate');h.e('ytBroadcastForm').dispatchEvent({type:'submit'});
  h.state.youtubeBusy=true;h.e('ytEvent').hidden=false;h.e('ytCreate').textContent='Setup ready';h.controller.update();assert.equal(h.controller.panel,'youtubecreate');
  h.state.youtubeBusy=false;h.controller.update();assert.equal(h.controller.panel,'events');assert.equal(h.e('eventEmpty').hidden,true);
  h.controller.back();h.controller.update();assert.equal(h.controller.panel,'youtubecreate');
});
