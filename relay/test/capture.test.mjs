import test from 'node:test';
import assert from 'node:assert/strict';
import { captureProfile, captureReady, openNativeCamera, programRect, programSize } from '../../web/capture.mjs';
import { preflight } from '../../web/core.mjs';
const stream = (width, height) => {
  const track = { stopped: false, stop() { this.stopped = true; }, getSettings: () => ({ width, height }) };
  return { track, getVideoTracks: () => [track], getTracks: () => [track] };
};
test('native quality is invariant to portrait orientation without accepting fewer pixels', () => {
  for (const [w, h, p] of [[1920,1080,'1080'],[1280,720,'720'],[854,480,'480'],[1920,1440,'1080']]) {
    for (const [width, height] of [[w,h],[h,w]]) {
      assert.equal(captureProfile({width,height}),p);
      assert.equal(captureReady({width,height},p),true);
      if(p !== '1080') assert.equal(captureReady({width,height},'1080'),false);
    }
  }
  for(const [width,height] of [[800,600],[0,1080],[NaN,1080],[Infinity,1080],[1080,8192],[1920.1,1080]]) assert.equal(captureProfile({width,height}),null);
  assert.equal(captureReady({width:1920,height:720},'1080'),false);
  assert.equal(captureReady({width:1920,height:1080},'unknown'),false);
  assert.equal(preflight({connected:true,encoderReady:true,camera:{width:1080,height:1920},destinations:['youtube'],overlay:false}),null);
});
test('portrait request can open a portrait sensor and keeps microphone options',async()=>{
  const requests=[], expected=stream(1080,1920);
  const media={getSupportedConstraints:()=>({resizeMode:true}),getUserMedia:async value=>{requests.push(value);return expected;}};
  assert.equal(await openNativeCamera(media,'1080','rear-lens',true),expected);
  assert.deepEqual(requests[0].video.width,{exact:1080});assert.deepEqual(requests[0].video.height,{exact:1920});
  assert.deepEqual(requests[0].video.deviceId,{exact:'rear-lens'});assert.equal(requests[0].audio.autoGainControl,false);
});
test('portrait request retries landscape dimensions on a landscape-only camera',async()=>{
  const requests=[],expected=stream(1920,1080),error=Object.assign(new Error('unsupported size'),{name:'OverconstrainedError'});
  const media={getUserMedia:async value=>{requests.push(value);if(requests.length===1)throw error;return expected;}};
  assert.equal(await openNativeCamera(media,'1080','',true),expected);assert.equal(requests.length,2);
  assert.deepEqual(requests[1].video.height,{exact:1080});assert.deepEqual(requests[1].video.facingMode,{ideal:'environment'});
});
test('larger sensor modes are accepted only after checking real native settings',async()=>{
  const low=[],requests=[];const media={getUserMedia:async value=>{requests.push(value);if(requests.length<3){const s=stream(1280,720);low.push(s);return s;}return stream(1920,1440);}};
  const result=await openNativeCamera(media,'1080');assert.equal(result.track.getSettings().height,1440);
  assert.ok(low.every(s=>s.track.stopped));assert.deepEqual(requests[2].video.width,{ideal:1920});
});
test('explicit 1080p never silently opens 720p; Auto may choose it',async()=>{
  let calls=0;const opened=[];const media={getUserMedia:async()=>{calls++;const s=stream(720,1280);opened.push(s);return s;}};
  await assert.rejects(openNativeCamera(media,'1080'),{name:'OverconstrainedError'});assert.equal(calls,3);assert.ok(opened.every(s=>s.track.stopped));
  calls=0;await openNativeCamera(media,'auto');assert.equal(calls,4);assert.equal(opened.at(-1).track.stopped,false);
});
test('permission denial stops immediately without repeated permission requests',async()=>{
  let calls=0;const media={getUserMedia:async()=>{calls++;throw Object.assign(new Error('denied'),{name:'NotAllowedError'});}};
  await assert.rejects(openNativeCamera(media,'auto'),{name:'NotAllowedError'});assert.equal(calls,1);
});
test('one program frame fits short landscape and portrait monitors without clipping the bottom overlay',()=>{
  for(const [width,height] of [[390,490],[320,200],[760,185],[1280,720],[844,290]]){
    const rect=programRect(width,height);assert.ok(rect.width<=width+.0001);assert.ok(rect.height<=height+.0001);
    assert.ok(Math.abs(rect.width/rect.height-16/9)<.0001);
    // SVG bottom y=1080 maps exactly to the bottom of the program frame.
    assert.ok(Math.abs(1080*rect.width/1920-rect.height)<.0001);
  }
  assert.deepEqual(programRect(0,10),{width:0,height:0});
  const portrait=programSize({width:1080,height:1920});assert.deepEqual(portrait,{width:1080,height:1920});
  const rect=programRect(390,490,portrait.width,portrait.height);assert.ok(Math.abs(rect.height-490)<.0001);assert.ok(rect.width<390);
});
