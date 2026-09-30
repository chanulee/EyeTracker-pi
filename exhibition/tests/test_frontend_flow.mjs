import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {draftPosition,smoothPosition,viewportMatches,runCalibration}=await import(pathToFileURL(process.argv[2]));
const reference=[0,-.5,-Math.sqrt(.75)];
const gaze={tracking:true,direction_frame:'eye_camera',direction:reference};
assert.deepEqual(draftPosition(gaze,reference),[.5,.5]);
assert.equal(draftPosition({...gaze,tracking:false},reference),null);
assert.equal(draftPosition({...gaze,direction:[NaN,0,0]},reference),null);
assert.deepEqual(draftPosition({...gaze,relative_angles:{yaw:10,pitch:7}},reference),[.7,.3]);
assert.equal(viewportMatches({width:1200,height:800},1200,800),true);
assert.equal(viewportMatches({width:1200,height:800},1100,800),false);
let slow=[0,0],fast=[0,0];for(let i=0;i<10;i++)slow=smoothPosition(slow,[1,1],100);for(let i=0;i<60;i++)fast=smoothPosition(fast,[1,1],1000/60);
assert.ok(Math.abs(slow[0]-fast[0])<1e-10);
const points=Array.from({length:9},(_,i)=>[.1+(i%3)*.4,.1+Math.floor(i/3)*.4]),validation=[[.3,.35],[.7,.65],[.5,.5]];
const calls=[],views=[],actions=[];let warm=0,failed=false,session;
const hooks={
 check(){},viewport:()=>({width:1200,height:800}),pause:async()=>{warm++;},
 read:()=>({g:{ready:warm>=2},stats:{tracker_details:{engine:'pupil'}}}),
 setSession:value=>session=value,show:value=>views.push(value),action:async kind=>actions.push(kind),
 api:async(resource,data)=>{
  if(resource==='plan')return {points,validation_points:validation};calls.push(data);
  if(data.action==='begin')return {session_id:'test-session'};
  if(data.action==='sample'&&data.index===2&&!failed){failed=true;throw Error('unstable input');}
  if(data.action==='validate')return {calibrated:data.validation_index===2,validation_error:.02};
  return {};
 }
};
assert.equal((await runCalibration(hooks)).calibrated,true);
assert.equal(session,'test-session');assert.deepEqual(actions,['fit','retry']);
assert.deepEqual(calls.filter(c=>c.action==='sample').map(c=>c.index),[0,1,2,2,3,4,5,6,7,8]);
assert.deepEqual(calls.filter(c=>c.action==='validate').map(c=>c.validation_index),[0,1,2]);
assert.ok(calls.some(c=>c.action==='neutral'&&c.session_id===session));
assert.deepEqual(calls.find(c=>c.action==='begin').viewport,{width:1200,height:800});
assert.equal(views.filter(v=>v.phase==='validate').length,3);
let cancelled=false,lateCalls=0;
await assert.rejects(runCalibration({...hooks,check(){if(cancelled)throw Error('cancelled');},api:async(resource,data)=>{if(resource==='plan')return {points,validation_points:validation};lateCalls++;return {};},action:async()=>{cancelled=true;}}),/cancelled/);
assert.equal(lateCalls,1); // Cancellation at fitting cannot start capture or fit a model.
console.log('cursor, multi-point calibration, retry and cancellation: OK');
