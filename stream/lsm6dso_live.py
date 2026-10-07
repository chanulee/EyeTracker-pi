#!/usr/bin/env python3
"""Auto-detect LSM6DSO / BNO086: python lsm6dso_live.py [--port 8090] [--mock].

Requires sparkfun-qwiic-lsm6dso, adafruit-blinka, adafruit-circuitpython-bno08x,
adafruit-extended-bus. Default IMU bus: 3, SDA GPIO23 / SCL GPIO24.
Camera requires opencv-python-headless. Deploy imu_init.py, audio_stream.py and
camera_device.py alongside this file. This folder has no parent-repository dependency.
"""
import argparse
import array
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import math
import multiprocessing
import os
from pathlib import Path
import sys
import queue
import re
import select
import signal
import subprocess
import tempfile
import threading
import time
from urllib.parse import urlsplit

from audio_stream import AudioBus, pcm16

PAGE = r'''<!doctype html><html lang="ko"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>IMU Live Motion</title>
<style>
*{box-sizing:border-box}[hidden]{display:none!important}body{margin:0;background:#0b1420;color:#edf5ff;font:16px system-ui}main{max-width:1060px;margin:auto;padding:32px}h1{font-size:30px;margin:0 0 8px}p{color:#a7b9cd;line-height:1.6}.badge{color:#5ddfc2;min-height:26px}canvas{width:100%;height:430px;background:#111f30;border:1px solid #283b51;border-radius:20px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:18px 0}.card{background:#152437;padding:18px;border-radius:14px}.value{font-size:27px;margin-top:8px}.small{font-size:14px;color:#a7b9cd}button{background:#4bd9bd;border:0;border-radius:10px;padding:12px 18px;cursor:pointer;font:inherit;color:#09251f}.panel{background:#152437;padding:20px;border-radius:14px;margin-top:18px;overflow:auto}table{width:100%;border-collapse:collapse;text-align:right;font-variant-numeric:tabular-nums}th,td{padding:12px 8px;border-bottom:1px solid #293c52;white-space:nowrap}th:first-child,td:first-child{text-align:left}th{color:#a7b9cd;font-weight:500}h2{font-size:18px;margin:0 0 12px}.warning{color:#ffbd72}#diagnostics{white-space:pre-wrap;overflow-wrap:anywhere}#quat{font-family:monospace;line-height:1.8}#age{float:right}@media(max-width:650px){main{padding:20px}.grid{grid-template-columns:repeat(2,1fr)}canvas{height:330px}.value{font-size:23px}}
#mic-wave{height:120px;border-radius:10px;margin:12px 0}.meter{height:12px;background:#0b1420;border-radius:8px;overflow:hidden;margin:14px 0}.meter span{display:block;height:100%;background:#4bd9bd;width:0;transition:width .1s}#mic-level{font-variant-numeric:tabular-nums}#listen-status{margin-left:12px}label{display:inline-block;margin:12px 16px 0 0}
#camera-view{display:block;width:100%;max-height:480px;object-fit:contain;background:#0b1420;border-radius:12px;margin-top:14px}#camera-status{overflow-wrap:anywhere}
.connections{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:16px 0}.connection{background:#0b1420;padding:14px;border-radius:10px;overflow-wrap:anywhere}.connection strong{display:block;margin-bottom:8px}.connection .small{white-space:pre-wrap}#controls button{margin:5px 6px 5px 0}button:disabled{opacity:.45;cursor:wait}#control-message{min-height:24px;margin-top:8px}@media(max-width:650px){.connections{grid-template-columns:1fr}}
</style>
<main><h1 id="heading">IMU · Live Motion</h1><p id="status" class="badge">센서 연결 중…</p>
<section class="panel"><h2>피드 제어</h2>
<button id="capture-toggle" disabled>센서 읽기 켜기</button>
<button id="receive-toggle" disabled>피드 받아오기</button>
<p id="feed-status" class="small" role="status">서버 상태 확인 중…</p>
<p class="small">센서 읽기를 끄면 Pi의 IMU·마이크·카메라 읽기 작업이 중지됩니다. 전원은 유지됩니다.<br>피드 수신만 중지하면 Pi는 계속 읽고, 이 브라우저의 측정값·영상·오디오 수신을 멈춥니다.</p></section>
<section class="panel" id="controls"><h2>연결 관리</h2><div class="connections">
<div class="connection"><strong id="imu-connection">IMU · 연결 대기</strong><div id="imu-detail" class="small"></div></div>
<div class="connection"><strong id="mic-connection">마이크 · 연결 대기</strong><div id="mic-detail" class="small"></div></div>
<div class="connection"><strong id="camera-connection">카메라 · 연결 대기</strong><div id="camera-detail" class="small"></div></div></div>
<button data-control="imu">IMU 재초기화</button><button data-control="mic">마이크 다시 연결</button><button data-control="camera">카메라 다시 연결</button><button data-control="all">전체 다시 연결</button><button data-control="server">서버 재시작</button>
<p id="imu-mode" class="small">IMU 선택: 자동</p><button data-control="imu-auto">자동 선택</button><button data-control="imu-bno">BNO 모드</button><button data-control="imu-lsm">LSM 모드</button><button data-control="imu-cycle">LSM 모드 경유 → BNO 재연결</button>
<p class="small">경유 버튼은 LSM 모드로 2초간 탐색한 뒤 BNO 모드로 돌아옵니다. 실제 LSM이 없으면 연결되지 않으며, BNO에 LSM용 명령을 보내지 않습니다.</p>
<div id="control-message" class="small" role="status">연결 상태를 확인하고 필요한 장치만 다시 연결할 수 있습니다.</div>
<details><summary class="small">연결이 안 될 때 확인 순서</summary><p class="small">① 다른 대시보드·녹음·카메라 프로그램이 장치를 사용 중인지 확인합니다.<br>② 장치별 다시 연결을 누르고 위 오류를 확인합니다. IMU는 I2C 주소 응답 후 초기화, 카메라는 첫 프레임 수신까지 확인합니다.<br>③ 여러 장치가 함께 멈추면 서버 재시작을 사용합니다. 브라우저는 자동으로 다시 연결합니다.<br>④ IMU가 계속 응답하지 않으면 Pi 전원을 끈 상태에서 배선을 점검하고 다시 켭니다. IMU 재초기화는 센서 전원 재인가와 다릅니다.</p></details></section>
<canvas id="view" aria-label="센서의 3D 자세와 XYZ 축"></canvas>
<div class="grid"><div class="card">Roll · X축 회전<div id="roll" class="value">—</div></div><div class="card">Pitch · Y축 회전<div id="pitch" class="value">—</div></div><div class="card">Yaw · Z축 회전<div id="yaw" class="value">—</div></div><div class="card">가속도 크기<div id="gravity" class="value">—</div></div></div>
<button id="zero">현재 자세를 기준으로</button><span id="age" class="small"></span>
<p id="capabilities" class="small">센서별로 지원하는 측정값만 표시합니다.</p>
<section class="panel"><h2>아이 트래킹 카메라 · 실시간 영상</h2><div id="camera-status" class="small">피드 수신 꺼짐</div><img id="camera-view" alt="USB 아이 트래킹 카메라 영상" hidden><p class="small">USB 카메라 원본 영상 · 눈 추적 결과는 아직 표시하지 않습니다.</p></section>
<section class="panel"><h2>마이크 · 실시간 입력</h2><div id="mic-status" class="small">피드 수신 꺼짐</div>
<div class="meter" role="meter" aria-label="마이크 입력 레벨" aria-valuemin="-90" aria-valuemax="0" id="mic-meter"><span id="mic-fill"></span></div>
<div id="mic-level">—</div><canvas id="mic-wave" aria-label="마이크 파형"></canvas>
<div class="small">최근 0.1초 파형 · 자동 확대 · DC 오프셋 제거</div>
<label>듣기 볼륨 <input id="mic-gain" type="range" min="1" max="20" value="4" aria-label="듣기 볼륨"> <span id="gain-value">4×</span></label>
<button id="listen">듣기 시작</button><span id="listen-status" class="small">재생 꺼짐</span></section>
<section class="panel"><h2>센서 측정값 · 센서의 XYZ 축 기준</h2><table><thead><tr><th>측정 / 단위</th><th>X</th><th>Y</th><th>Z</th></tr></thead><tbody>
<tr id="accel-row"><td>가속도 · g</td><td></td><td></td><td></td></tr>
<tr id="gyro-row"><td>회전속도 · °/s</td><td></td><td></td><td></td></tr>
<tr id="mag-row" hidden><td>자기장 · µT</td><td></td><td></td><td></td></tr>
<tr id="gravity-vector-row" hidden><td>중력 · m/s²</td><td></td><td></td><td></td></tr>
<tr id="linear-row" hidden><td>선형가속도 · m/s²</td><td></td><td></td><td></td></tr>
</tbody></table><p id="temperature" class="small" hidden></p></section>
<section id="quaternion-panel" class="panel" hidden><h2>융합 자세 · Rotation Vector</h2><div id="quat">—</div><p class="small">센서가 보내는 쿼터니언 (x, y, z, w). 3D 보드와 각도는 기준 자세 대비로 표시합니다. 자기장 영향을 받으므로 주변 금속·자석에 따라 Yaw가 달라질 수 있습니다.</p></section>
<section class="panel"><h2>연결 상태</h2><div id="diagnostics" class="small">—</div></section></main>
<script>
const el=id=>document.getElementById(id),canvas=el('view'),ctx=canvas.getContext('2d');
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
const unit=q=>{const n=Math.hypot(...q);return q.map(v=>v/n)};
const conjugate=q=>[-q[0],-q[1],-q[2],q[3]];
function multiply(a,b){const [x,y,z,w]=a,[X,Y,Z,W]=b;return [w*X+x*W+y*Z-z*Y,w*Y-x*Z+y*W+z*X,w*Z+x*Y-y*X+z*W,w*W-x*X-y*Y-z*Z]}
function fromEuler(r,p,y=0){const cr=Math.cos(r/2),sr=Math.sin(r/2),cp=Math.cos(p/2),sp=Math.sin(p/2),cy=Math.cos(y/2),sy=Math.sin(y/2);return [sr*cp*cy-cr*sp*sy,cr*sp*cy+sr*cp*sy,cr*cp*sy-sr*sp*cy,cr*cp*cy+sr*sp*sy]}
function euler(q){const [x,y,z,w]=q;return [Math.atan2(2*(w*x+y*z),1-2*(x*x+y*y)),Math.asin(Math.max(-1,Math.min(1,2*(w*y-z*x)))),Math.atan2(2*(w*z+x*y),1-2*(y*y+z*z))]}
let reference=null,offsetR=0,offsetP=0,session=null,latest=null,target=[0,0,0,1],display=[0,0,0,1],fresh=false;
function pose(s){return s.quaternion?unit(multiply(reference?conjugate(reference):[0,0,0,1],s.quaternion)):fromEuler(wrap(s.roll-offsetR),wrap(s.pitch-offsetP))}
function updateAngles(s){target=pose(s);const angles=s.quaternion?euler(target):[wrap(s.roll-offsetR),wrap(s.pitch-offsetP),null];['roll','pitch','yaw'].forEach((id,i)=>el(id).textContent=angles[i]===null?'미지원':(angles[i]*180/Math.PI).toFixed(1)+'°')}
el('zero').onclick=()=>{if(!latest||!fresh)return;if(latest.quaternion)reference=[...latest.quaternion];else{offsetR=latest.roll;offsetP=latest.pitch}updateAngles(latest)};
function draw(){
 const rect=canvas.getBoundingClientRect(),dpr=devicePixelRatio||1,w=rect.width,h=rect.height;
 if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr)}
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
 const sign=display.reduce((s,v,i)=>s+v*target[i],0)<0?-1:1;display=unit(display.map((v,i)=>v+.16*(sign*target[i]-v)));
 function rotate([x,y,z]){const q=display;const result=multiply(multiply(q,[x,y,z,0]),conjugate(q));return result.slice(0,3)}
 function project([x,y,z]){const s=Math.min(w,h)*.84/(6+y);return [w/2+x*s,h/2-z*s+y*s*.30]}
 ctx.strokeStyle='#24384d';ctx.lineWidth=1;
 for(let i=-4;i<=4;i++){ctx.beginPath();let a=project([i,-4,-.7]),b=project([i,4,-.7]);ctx.moveTo(...a);ctx.lineTo(...b);a=project([-4,i,-.7]);b=project([4,i,-.7]);ctx.moveTo(...a);ctx.lineTo(...b);ctx.stroke()}
 const vertices=[[-1.8,-1,-.12],[1.8,-1,-.12],[1.8,1,-.12],[-1.8,1,-.12],[-1.8,-1,.12],[1.8,-1,.12],[1.8,1,.12],[-1.8,1,.12]].map(rotate);
 const faces=[[0,1,2,3,'#17433e'],[0,1,5,4,'#278b78'],[1,2,6,5,'#236b61'],[2,3,7,6,'#236b61'],[3,0,4,7,'#278b78'],[4,5,6,7,'#40c6a7']];
 faces.sort((a,b)=>b.slice(0,4).reduce((s,i)=>s+vertices[i][1],0)-a.slice(0,4).reduce((s,i)=>s+vertices[i][1],0));
 for(const f of faces){ctx.beginPath();f.slice(0,4).forEach((i,j)=>{const q=project(vertices[i]);j?ctx.lineTo(...q):ctx.moveTo(...q)});ctx.closePath();ctx.fillStyle=f[4];ctx.fill();ctx.strokeStyle='#91e7d0';ctx.stroke()}
 for(const [v,label,color] of [[[2.5,0,0],'+X','#ffbd72'],[[0,1.8,0],'+Y','#88baff'],[[0,0,1.7],'+Z','#efb0ff']]){const a=project(rotate([0,0,.16])),b=project(rotate(v));ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.strokeStyle=color;ctx.lineWidth=2;ctx.stroke();ctx.fillStyle=color;ctx.font='14px system-ui';ctx.fillText(label,b[0]+6,b[1])}
 if(!fresh){ctx.fillStyle='#ffbd72';ctx.font='14px system-ui';ctx.fillText('이전 자세 / 새 데이터 대기 중',18,28)}
 requestAnimationFrame(draw)
}
function vectorRow(id,values){const cells=el(id).querySelectorAll('td');for(let i=0;i<3;i++)cells[i+1].textContent=values?values[i].toFixed(3):'대기 중'}
let connectionState=null,serverBoot=null,serverRestartFrom=null,controlRequest=false,serverRestartAt=0;
let receiving=false,feedEpoch=0,pollAbort=null;
function updateConnections(s){
 connectionState=s.connections;const labels={imu:'IMU',mic:'마이크',camera:'카메라'},phases={starting:'초기화 중',ready:'정상',retrying:'자동 재시도 중',waiting:'새 데이터 대기',disabled:'사용 안 함',paused:'읽기 꺼짐'};
 el('imu-mode').textContent='IMU 선택: '+(s.connections.imu_mode==='auto'?'자동':s.connections.imu_mode)+(s.connections.busy?' · 전환 작업 중':'');
 if(serverBoot!==null&&serverBoot!==s.boot_id){setReceiving(false);reference=null;session=null}
 serverBoot=s.boot_id;
 if(serverRestartFrom!==null&&serverRestartFrom!==s.boot_id){serverRestartFrom=null;el('control-message').textContent='서버 재시작 완료 · 장치 연결 상태를 확인하세요.'}
 if(serverRestartFrom!==null&&Date.now()-serverRestartAt>15000){serverRestartFrom=null;el('control-message').textContent='서버 응답이 지연됩니다. Pi 터미널의 실행 상태를 확인하세요.'}
 for(const [kind,info] of Object.entries(s.connections.devices)){
  el(kind+'-connection').textContent=labels[kind]+' · '+(phases[info.phase]||info.phase);
  el(kind+'-connection').className=info.phase==='ready'?'badge':'warning';
  el(kind+'-detail').textContent=(info.message||'장치 탐색 / 초기화 대기')+'\n연결 작업 재시작 '+info.restarts+'회'+(info.last_error?'\n최근 오류: '+info.last_error:'');
 }
 const enabled=!!s.connections.capture_enabled,busy=controlRequest||serverRestartFrom!==null||s.connections.busy;
 if(!enabled&&receiving)setReceiving(false);
 el('capture-toggle').textContent=enabled?'센서 읽기 끄기':'센서 읽기 켜기';
 el('capture-toggle').disabled=busy;
 el('receive-toggle').disabled=busy||!enabled;
 el('receive-toggle').textContent=receiving?'피드 수신 중지':'피드 받아오기';
 el('listen').disabled=!receiving||!enabled;
 el('feed-status').textContent='Pi 센서 읽기: '+(enabled?'켜짐':'꺼짐')+' · 이 브라우저 수신: '+(receiving?'켜짐':'꺼짐');
 document.querySelectorAll('[data-control]').forEach(button=>{button.disabled=busy||(button.dataset.control!=='server'&&!enabled)||s.connections.devices[button.dataset.control]?.phase==='disabled'})
}
function setReceiving(value){
 receiving=value;feedEpoch++;fresh=false;
 if(pollAbort)pollAbort.abort();
 if(!value){
  stopListening();el('camera-view').removeAttribute('src');el('camera-view').hidden=true;
  updateMic({ready:false,error:'피드 수신 중지'});el('camera-status').textContent='피드 수신 중지';
  el('status').textContent='피드 수신 중지';el('age').textContent='';
  ['roll','pitch','yaw','gravity','quat'].forEach(id=>el(id).textContent='—');
  for(const id of ['accel-row','gyro-row','mag-row','gravity-vector-row','linear-row'])vectorRow(id,null);
  el('temperature').textContent='';latest=null;target=display=[0,0,0,1];
 }
 if(connectionState)updateConnections({connections:connectionState,boot_id:serverBoot});
}
el('capture-toggle').onclick=()=>control(connectionState?.capture_enabled?'capture-off':'capture-on');
el('receive-toggle').onclick=()=>setReceiving(!receiving);
async function control(action){
 if(controlRequest||serverBoot===null)return;controlRequest=true;
 document.querySelectorAll('[data-control]').forEach(b=>b.disabled=true);
 if(action==='capture-off')setReceiving(false);
 if(['mic','all','server'].includes(action))stopListening();
 if(['camera','all','server'].includes(action)){el('camera-view').hidden=true;el('camera-view').removeAttribute('src')}
 el('control-message').textContent='요청을 보내는 중…';
 try{
  const response=await fetch('/control/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw Error(response.status===409?'다른 연결 작업이 진행 중입니다. 잠시 후 다시 시도하세요.':'요청 실패: HTTP '+response.status);
  if(action==='server'){serverRestartFrom=serverBoot;serverRestartAt=Date.now();el('control-message').textContent='서버를 재시작하고 있습니다. 자동으로 다시 연결합니다…'}
  else if(action.startsWith('capture-'))el('control-message').textContent=action==='capture-on'?'센서 읽기 시작 요청 완료 · 준비되면 피드 받아오기를 누르세요.':'센서 읽기 중지 요청 완료.';
  else el('control-message').textContent=action==='imu-cycle'?'LSM 모드를 경유한 뒤 BNO로 자동 복귀합니다.':'재초기화를 요청했습니다. 위 장치 상태가 정상으로 바뀌는지 확인하세요.';
 }catch(e){el('control-message').textContent=e.message}
 finally{controlRequest=false;if(connectionState)updateConnections({connections:connectionState,boot_id:serverBoot})}
}
document.querySelectorAll('[data-control]').forEach(button=>{button.disabled=true;button.onclick=()=>control(button.dataset.control)});
let cameraRetryAt=0;
el('camera-view').onerror=()=>{el('camera-view').removeAttribute('src');el('camera-view').hidden=true;cameraRetryAt=Date.now()+2000};
function updateCamera(c){
 const image=el('camera-view'),ready=!!c?.ready;
 el('camera-status').className=ready?'small':'small warning';
 el('camera-status').textContent=ready?(c.mock?'시뮬레이션 · 실제 카메라 아님':c.name+' · '+c.device)+' · '+c.width+'×'+c.height+' · '+c.fps.toFixed(1)+' fps':c?.error||'카메라 데이터 대기 중…';
 if(ready&&receiving){if(!image.hasAttribute('src')&&Date.now()>=cameraRetryAt)image.src='/camera.mjpg?t='+Date.now();image.hidden=!image.hasAttribute('src')}
 else{image.hidden=true;image.removeAttribute('src')}
}
function updateMic(m){
 const ready=!!m?.ready;
 el('mic-status').textContent=ready?(m.mock?'시뮬레이션 · 실제 마이크 아님':m.device+' · '+(m.channel==='left'?'왼쪽':'오른쪽')+' 채널')+' · 16 kHz 모노':m?.error||'마이크 데이터 대기 중…';
 el('mic-status').className=ready?'small':'small warning';
 const level=ready?Math.max(-90,Math.min(0,m.rms_db)):-90;
 el('mic-fill').style.width=((level+90)/90*100)+'%';el('mic-meter').setAttribute('aria-valuenow',level);
 el('mic-level').textContent=ready?'RMS '+m.rms_db.toFixed(1)+' dBFS · Peak '+m.peak_db.toFixed(1)+' dBFS'+(m.clipping?' · 입력 포화':m.signal?'':' · 신호 없음'):'—';
 const c=el('mic-wave'),r=c.getBoundingClientRect(),dpr=devicePixelRatio||1;
 c.width=Math.round(r.width*dpr);c.height=Math.round(r.height*dpr);const g=c.getContext('2d');g.setTransform(dpr,0,0,dpr,0,0);
 g.strokeStyle='#30475f';g.beginPath();g.moveTo(0,r.height/2);g.lineTo(r.width,r.height/2);g.stroke();
 if(ready&&m.waveform.length){const scale=Math.max(.0001,...m.waveform.map(Math.abs));g.strokeStyle='#5ddfc2';g.beginPath();m.waveform.forEach((v,i)=>{const x=i/(m.waveform.length-1)*r.width,y=r.height/2-v/scale*r.height*.43;i?g.lineTo(x,y):g.moveTo(x,y)});g.stroke()}
}
let listening=null;
el('mic-gain').oninput=()=>{el('gain-value').textContent=el('mic-gain').value+'×';if(listening)listening.gain.gain.value=Number(el('mic-gain').value)};
function stopListening(){if(listening){listening.abort.abort();listening.context.close();listening=null}el('listen').textContent='듣기 시작';el('listen-status').textContent='재생 꺼짐'}
el('listen').onclick=async()=>{
 if(listening){stopListening();return}
 if(!receiving||!connectionState?.capture_enabled)return;
 let session;
 try{
  const context=new (window.AudioContext||window.webkitAudioContext)();const gain=context.createGain();gain.gain.value=Number(el('mic-gain').value);gain.connect(context.destination);
  session={context,gain,abort:new AbortController()};listening=session;el('listen').textContent='듣기 중지';el('listen-status').textContent='연결 중…';await context.resume();
  const response=await fetch('/audio',{signal:session.abort.signal});if(!response.ok)throw Error('마이크 연결 실패 ('+response.status+')');
  const reader=response.body.getReader();let next=context.currentTime+.06,leftover=null;el('listen-status').textContent='실시간 재생 중';
  while(listening===session){
   const {value,done}=await reader.read();if(done)break;
   let bytes=value;if(leftover!==null){bytes=new Uint8Array(value.length+1);bytes[0]=leftover;bytes.set(value,1)}
   const count=Math.floor(bytes.length/2);leftover=bytes.length%2?bytes[bytes.length-1]:null;if(!count)continue;
   const view=new DataView(bytes.buffer,bytes.byteOffset,count*2),buffer=context.createBuffer(1,count,16000),samples=buffer.getChannelData(0);
   for(let i=0;i<count;i++)samples[i]=view.getInt16(i*2,true)/32768;
   if(next>context.currentTime+.5)continue;
   const source=context.createBufferSource();source.buffer=buffer;source.connect(gain);next=Math.max(next,context.currentTime+.04);source.start(next);next+=buffer.duration;
  }
  if(listening===session){stopListening();el('listen-status').textContent='마이크 스트림이 종료되었습니다'}
 }catch(e){if(listening===session){stopListening();el('listen-status').textContent=e.message}}
};
window.addEventListener('pagehide',()=>setReceiving(false));
async function poll(){
 const epoch=feedEpoch,wantsFeed=receiving;pollAbort=new AbortController();
 const timeout=setTimeout(()=>pollAbort?.abort(),3000);
 try{
  const res=await fetch(wantsFeed?'/state':'/status',{cache:'no-store',signal:pollAbort.signal});if(!res.ok)throw Error('HTTP '+res.status);const s=await res.json();
  if(epoch!==feedEpoch)return;
  updateConnections(s);
  if(!wantsFeed||!receiving){el('status').textContent=s.connections.capture_enabled?'Pi에서 읽는 중 · 피드 수신 꺼짐':'센서 읽기 꺼짐';return}
  updateMic(s.mic);updateCamera(s.camera);fresh=!s.stale&&!s.error&&s.age_s!==null&&s.age_s<1.5;
  el('status').className=fresh?'badge':'badge warning';
  el('status').textContent=s.mock?'시뮬레이션 · 실제 센서 데이터 아님':fresh?'연결됨 · '+s.sensor+' · 0x'+s.address.toString(16):'새 데이터 대기 · '+(s.error||'읽기 지연');
  el('age').textContent=s.age_s===null?'':'마지막 정상 읽기 '+s.age_s.toFixed(1)+'초 전';
  el('diagnostics').textContent='읽기 오류 '+(s.errors||0)+'회 · 재연결 '+(s.reconnects||0)+'회'+(s.last_error?'\n최근 오류: '+s.last_error:'')+(s.field_errors?.length?'\n추가 측정값 오류: '+s.field_errors.join(' / '):'');
  if(s.sensor){
   el('heading').textContent=s.sensor+' · Live Motion';const bno=s.sensor==='BNO086';
   el('capabilities').textContent=bno?'9축: 가속도 3축 + 자이로 3축 + 자기장 3축. 센서 융합 자세로 Roll / Pitch / Yaw를 표시합니다.':'6축: 가속도 3축 + 자이로 3축. Roll / Pitch는 중력으로 계산하며, Yaw 각도는 미지원입니다. Z축 회전속도는 아래에 표시합니다.';
   ['mag-row','gravity-vector-row','linear-row','quaternion-panel'].forEach(id=>el(id).hidden=!bno);el('temperature').hidden=bno;
  }
  if(fresh){
   const key=s.sensor+':'+s.generation;if(session!==key){session=key;reference=null;offsetR=offsetP=0;display=[0,0,0,1]}
   latest=s;updateAngles(s);el('gravity').textContent=s.gravity.toFixed(3)+' g';
   vectorRow('accel-row',s.accel);vectorRow('gyro-row',s.gyro);vectorRow('mag-row',s.mag);vectorRow('gravity-vector-row',s.gravity_vector);vectorRow('linear-row',s.linear_accel);
   el('temperature').textContent='온도: '+(s.temperature_c===null?'대기 중':s.temperature_c.toFixed(1)+' °C');
   el('quat').textContent=s.quaternion?s.quaternion.map((v,i)=>['x','y','z','w'][i]+': '+v.toFixed(5)).join('   '):'대기 중';
  }
 }catch(e){if(epoch!==feedEpoch)return;fresh=false;for(const kind of ['imu','mic','camera']){el(kind+'-connection').textContent=kind.toUpperCase()+' · 서버 응답 대기';el(kind+'-connection').className='warning'}if(serverRestartFrom!==null&&Date.now()-serverRestartAt>15000){serverRestartFrom=null;el('control-message').textContent='서버가 응답하지 않습니다. Pi 터미널의 실행 상태를 확인하세요.'}updateMic({ready:false,error:'웹 연결 없음'});updateCamera({ready:false,error:'웹 연결 없음'});el('status').className='badge warning';el('status').textContent='연결 없음: '+e.message}
 finally{clearTimeout(timeout);pollAbort=null;setTimeout(poll,receiving?100:1000)}
}
draw();poll();
</script></html>
'''


def tilt(accel):
    ax, ay, az = accel
    return math.atan2(ay, az), math.atan2(-ax, math.hypot(ay, az))


def ensure_imu_pullups():
    """Keep the i2c-gpio pins released with pull-ups; never drive either line HIGH."""
    try:
        state = subprocess.run(['pinctrl', 'get', '23,24'], capture_output=True,
                               text=True, timeout=3, check=True)
        if all(re.search(rf'^\s*{pin}:.*\bpu\b', state.stdout, re.M) for pin in (23, 24)):
            return
        result = subprocess.run(['pinctrl', 'set', '23,24', 'pu'], capture_output=True,
                                text=True, timeout=3)
        if result.returncode:
            subprocess.run(['sudo', '-n', 'pinctrl', 'set', '23,24', 'pu'],
                           capture_output=True, text=True, timeout=3, check=True)
        # BCM2835/2837 cannot read back the pull configuration (`--` on Zero 2 W).
        # A successful set command is sufficient; the I2C probe checks communication.
    except (OSError, subprocess.SubprocessError, RuntimeError) as exc:
        raise RuntimeError('GPIO23/24 풀업 설정 실패. Pi 터미널에서 '
                           '`sudo pinctrl set 23,24 pu` 실행 후 IMU 재연결을 누르세요. '
                           f'({type(exc).__name__})') from exc


def connect_sensor(progress=None, reset_pin=None, mode='auto', i2c_bus=3):
    if i2c_bus == 3:
        if progress:
            progress('GPIO23/24 풀업 확인 중…')
        ensure_imu_pullups()

    if reset_pin is not None and mode != 'LSM6DSO':
        if progress:
            progress('BNO RST 핀 하드웨어 리셋 / 부팅 대기…')
        reset_pin.switch_to_output(value=False)
        time.sleep(.02)
        reset_pin.value = True
        time.sleep(.7)
    if progress:
        progress(f'I2C 버스 {i2c_bus} 열기 / 주소 탐색 중…')
    from adafruit_extended_bus import ExtendedI2C
    bus = ExtendedI2C(i2c_bus)
    keep_bus = False
    try:
        deadline = time.monotonic() + 2
        while not bus.try_lock():
            if time.monotonic() >= deadline:
                raise RuntimeError('I2C bus busy')
            time.sleep(0.01)
        try:
            addresses = bus.scan()
        finally:
            bus.unlock()
        if progress:
            progress('I2C 응답 주소: '+(', '.join(hex(a) for a in addresses) or '없음'))
        # Prefer LSM6DSO if both are connected, preserving the existing viewer.
        for address in (0x6B, 0x6A):
            if mode != 'BNO086' and address in addresses:
                if progress:
                    progress(f'LSM6DSO {address:#04x} 응답 · 초기화 중…')
                import qwiic_lsm6dso
                import qwiic_i2c
                factory = getattr(qwiic_i2c, 'get_i2c_driver', None) or qwiic_i2c.getI2CDriver
                imu = qwiic_lsm6dso.QwiicLSM6DSO(
                    address=address, i2c_driver=factory(iBus=i2c_bus))
                if not imu.is_connected() or not imu.begin():
                    raise RuntimeError(f'LSM6DSO initialization failed at {address:#04x}')
                return 'LSM6DSO', address, imu, None
        candidates = [a for a in (0x4B, 0x4A) if a in addresses] if mode != 'LSM6DSO' else []
        if candidates:
            if progress:
                progress(f'BNO086 {candidates[0]:#04x} 응답 · 리셋 / 측정 기능 활성화 중…')
            # Reuse the BNO packet workaround and bounded initialization retries.
            import imu_init
            lib = imu_init.quiet_library()
            features = tuple(getattr(lib, 'BNO_REPORT_' + feature) for feature in (
                'ACCELEROMETER', 'GYROSCOPE', 'ROTATION_VECTOR', 'MAGNETOMETER',
                'GRAVITY', 'LINEAR_ACCELERATION'))
            imu, address = imu_init.bring_up(
                bus, candidates, features,
                lambda message, level: (print(message, flush=True),
                                        progress(message) if progress else None), tries=3,
                report_interval=100_000)  # 10 Hz per report, six report types
            keep_bus = True
            return 'BNO086', address, imu, bus
        raise RuntimeError(f'{mode} 모드: 해당 IMU 주소 응답 없음; 다시 탐색합니다')
    finally:
        if not keep_bus:
            bus.deinit()


def read_sensor(name, imu):
    if name == 'LSM6DSO':
        values = imu.read_float_accel_gyro_all()
        return tuple(values[:3]), tuple(values[3:])
    # Adafruit BNO API uses m/s² and rad/s; UI uses g and deg/s.
    return tuple(v / 9.80665 for v in imu.acceleration), tuple(math.degrees(v) for v in imu.gyro)


def normalize_quaternion(q):
    if len(q) != 4 or not all(math.isfinite(v) for v in q):
        raise ValueError('Invalid quaternion')
    norm = math.sqrt(sum(v*v for v in q))
    if norm < 0.01:
        raise ValueError('Rotation vector not ready')
    if not 0.95 <= norm <= 1.05:
        raise ValueError(f'Invalid quaternion norm: {norm:.3f}')
    return tuple(v / norm for v in q)


def quaternion_euler(q):
    x, y, z, w = normalize_quaternion(q)
    return (math.atan2(2*(w*x+y*z), 1-2*(x*x+y*y)),
            math.asin(max(-1, min(1, 2*(w*y-z*x)))),
            math.atan2(2*(w*z+x*y), 1-2*(y*y+z*z)))


def measurement(name, imu):
    accel, gyro = read_sensor(name, imu)
    if len(accel) != 3 or len(gyro) != 3 or not all(math.isfinite(v) for v in (*accel, *gyro)):
        raise ValueError('Invalid acceleration/gyro data')
    gravity = math.sqrt(sum(v*v for v in accel))
    fields = dict(accel=accel, gyro=gyro, gravity=gravity, mag=None,
                  gravity_vector=None, linear_accel=None, temperature_c=None,
                  quaternion=None, yaw=None, field_errors=[])
    if name == 'BNO086':
        q = normalize_quaternion(imu.quaternion)
        roll, pitch, yaw = quaternion_euler(q)
        fields.update(quaternion=q, roll=roll, pitch=pitch, yaw=yaw,
                      orientation_source='9-axis rotation vector')
        optional = (('mag', 'magnetic'), ('gravity_vector', 'gravity'),
                    ('linear_accel', 'linear_acceleration'))
        for key, attribute in optional:
            try:
                values = tuple(getattr(imu, attribute))
                if len(values) != 3 or not all(math.isfinite(v) for v in values):
                    raise ValueError('Invalid vector')
                fields[key] = values
            except Exception as exc:
                fields['field_errors'].append(f'{attribute}: {type(exc).__name__}: {exc}')
    else:
        if gravity < 0.05:
            raise ValueError('Acceleration too small to determine tilt')
        roll, pitch = tilt(accel)
        fields.update(roll=roll, pitch=pitch, orientation_source='accelerometer tilt')
        try:
            temp = float(imu.read_temp_c())
            if not math.isfinite(temp):
                raise ValueError('Invalid temperature')
            fields['temperature_c'] = temp
        except Exception as exc:
            fields['field_errors'].append(f'temperature: {type(exc).__name__}: {exc}')
    return fields


def sample_loop(stop, publish, mock=False, progress=None, reset_pin=None, mode='auto', i2c_bus=3):
    imu, bus = None, None
    name, address, generation, failures = 'IMU', None, 0, 0
    errors, reconnects, last_error = 0, 0, None
    last = {}
    def error_state(message):
        publish(dict(last, error=message, stale=True, errors=errors,
                     reconnects=reconnects, last_error=last_error))
    try:
        while not stop.is_set():
            try:
                if not mock and imu is None:
                    error_state('센서 자동 탐색 / 초기화 중…')
                    name, address, imu, bus = connect_sensor(progress, reset_pin, mode, i2c_bus)
                    generation += 1
                    last = {}  # Never retain a pose from a different sensor session.
                    print(f'Connected: {name} at {address:#04x}', flush=True)
                if mock:
                    t = time.monotonic()
                    name = mode if mode != 'auto' else mock if isinstance(mock, str) else 'BNO086'
                    q = (0, 0, math.sin(t/4), math.cos(t/4))
                    fake = type('MockIMU', (), dict(
                        acceleration=(0, 0, 9.80665), gyro=(0, 0, 0.5), quaternion=q,
                        magnetic=(18, 5, -35), gravity=(0, 0, 9.80665),
                        linear_acceleration=(0, 0, 0),
                        read_float_accel_gyro_all=lambda self: (0.3*math.sin(t), 0.2*math.cos(t), .93, 5, 10, 15),
                        read_temp_c=lambda self: 24.5))()
                    data = measurement(name, fake)
                else:
                    data = measurement(name, imu)
                last = dict(data, mock=bool(mock), sensor=name, address=address,
                            generation=generation, sampled_at=time.monotonic(), stale=False,
                            errors=errors, reconnects=reconnects, last_error=last_error)
                publish(last)
                failures = 0
            except Exception as exc:
                errors += 1
                failures += 1
                last_error = f'{type(exc).__name__}: {exc}'
                error_state(last_error)
                # Preserve the last pose, explicitly stale, during brief packet errors.
                if failures == 1 or failures == 20:
                    print(f'IMU read error ({failures} consecutive): {last_error}', flush=True)
                if imu is None or failures >= 20:
                    if bus is not None:
                        bus.deinit()
                    if imu is not None:
                        reconnects += 1
                    imu, bus, failures = None, None, 0
                    stop.wait(2)
            stop.wait(0.05)
    finally:
        if bus is not None:
            bus.deinit()


def microphone_device():
    listing = subprocess.run(['arecord', '-l'], capture_output=True, text=True,
                             env=dict(os.environ, LC_ALL='C'), timeout=5)
    for line in listing.stdout.splitlines():
        match = re.match(r'card (\d+):.*device (\d+):', line)
        if match and any(name in line.lower() for name in ('i2smic', 'googlevoi', 'voicehat')):
            return f'hw:{match[1]},{match[2]}'
    raise RuntimeError('I2S 마이크를 찾지 못했습니다. arecord -l 확인 또는 --mic-device hw:3,0 지정')


def microphone_pcm(raw, channel):
    samples = array.array('i')
    samples.frombytes(raw)
    if len(samples) != 9600:
        raise ValueError('Expected 100 ms of stereo 48 kHz S32_LE')
    # Slicing preserves byte order; pcm16 performs the endian conversion.
    return pcm16(samples[channel::2].tobytes())


def microphone_levels(pcm):
    samples = array.array('h')
    samples.frombytes(pcm)
    if sys.byteorder != 'little':
        samples.byteswap()
    peak = max(abs(v) for v in samples) / 32768
    rms = math.sqrt(sum(v*v for v in samples) / len(samples)) / 32768
    # Preserve brief peaks rather than skipping samples when drawing the envelope.
    stride = max(1, len(samples) // 200)
    wave = [max(samples[i:i+stride], key=abs)/32768 for i in range(0, len(samples), stride)]
    return dict(rms_db=20*math.log10(max(rms, 1e-6)),
                peak_db=20*math.log10(max(peak, 1e-6)), waveform=wave,
                signal=peak > 0, clipping=peak >= .999)


def microphone_loop(stop, publish, audio, device='auto', channel=0, mock=False):
    def emit(pcm, selected):
        publish(dict(microphone_levels(pcm), ready=True, device=selected,
                     channel='left' if channel == 0 else 'right', mock=mock,
                     sampled_at=time.monotonic()))
        audio.publish(pcm)

    if mock:
        tick = 0
        while not stop.is_set():
            pcm = array.array('h', (round(3000*math.sin(2*math.pi*440*(tick+i)/16000))
                                   for i in range(1600)))
            if sys.byteorder != 'little':
                pcm.byteswap()
            emit(pcm.tobytes(), '시뮬레이션')
            tick += 1600
            stop.wait(.1)
        return
    while not stop.is_set():
        process = None
        try:
            selected = microphone_device() if device == 'auto' else device
            with tempfile.TemporaryFile() as errors:
                process = subprocess.Popen(
                    ['arecord', '-q', '-D', selected, '-t', 'raw', '-f', 'S32_LE',
                     '-r', '48000', '-c', '2'], stdout=subprocess.PIPE, stderr=errors)
                pending, last_audio = bytearray(), time.monotonic()
                while not stop.is_set():
                    if select.select([process.stdout], [], [], .2)[0]:
                        chunk = os.read(process.stdout.fileno(), 38400)
                        if not chunk:
                            process.wait(timeout=2)
                            errors.seek(0)
                            raise RuntimeError(errors.read(2048).decode(errors='replace').strip()
                                               or '마이크 녹음이 종료되었습니다')
                        pending.extend(chunk)
                        last_audio = time.monotonic()
                        while len(pending) >= 38400:
                            emit(microphone_pcm(pending[:38400], channel), selected)
                            del pending[:38400]
                    if time.monotonic() - last_audio > 3:
                        raise RuntimeError('마이크 데이터가 3초 동안 도착하지 않았습니다')
        except Exception as exc:
            publish(dict(ready=False, error=f'{type(exc).__name__}: {exc}'))
        finally:
            if process is not None:
                if process.poll() is None:
                    process.terminate()
                    try:
                        process.wait(timeout=2)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait()
                process.stdout.close()
        stop.wait(2)


def camera_open_error(node):
    try:
        descriptor = os.open(node, os.O_RDWR | os.O_NONBLOCK)
        os.close(descriptor)
        access = '장치 파일 읽기/쓰기 권한 확인됨'
    except OSError as exc:
        access = f'장치 파일 접근 실패: {exc}'
    try:
        result = subprocess.run(['fuser', node], capture_output=True, text=True, timeout=2)
        owners = result.stdout.strip() or '확인 가능한 PID 없음'
    except (OSError, subprocess.TimeoutExpired):
        owners = '점유 확인 도구 사용 불가'
    import cv2
    backend = ' / '.join(line.strip() for line in cv2.getBuildInformation().splitlines()
                         if 'v4l' in line.lower()) or 'V4L 빌드 정보 없음'
    return (f'카메라 열기 실패: {node}. {access}. 사용 PID: {owners}. '
            f'OpenCV {cv2.__version__}: {backend}. 점유·USB/드라이버·백엔드를 확인하세요')


def camera_loop(stop, publish, video, device='auto', mock=False, request_small=True):
    identity = None
    while not stop.is_set():
        capture = None
        try:
            import cv2
            cv2.setNumThreads(1)
            if mock:
                import numpy as np
                selected = dict(path='mock', name='시뮬레이션')
            elif device == 'auto':
                # Discover local UVC capture nodes; skip metadata/ISP nodes.
                from camera_device import select_camera
                selected = select_camera({'camera_mode': 'auto', 'camera': -1}, identity)
                identity = selected['identity']
            else:
                selected = dict(path=device, name='USB 카메라')
            node = str(Path(selected.get('node', selected['path'])).resolve()) if not mock else 'mock'
            match = re.fullmatch(r'/dev/video(\d+)', node)
            source = int(match[1]) if match else node
            publish(dict(ready=False, stage='starting', device=selected['path'],
                         error=f"{selected['name']} 발견 · {node} · {'320×240' if request_small else '기본 영상 모드'} 열기 / 첫 프레임 대기…"))
            backend = 'V4L2'
            if not mock:
                capture = cv2.VideoCapture(source, cv2.CAP_V4L2)
                if not capture.isOpened():
                    capture.release()
                    backend = 'AUTO'
                    capture = cv2.VideoCapture(source, cv2.CAP_ANY)
                if not capture.isOpened():
                    raise RuntimeError(camera_open_error(node))
                # Match camera_accuracy: don't renegotiate FOURCC/FPS at UVC startup.
                if request_small:
                    capture.set(cv2.CAP_PROP_FRAME_WIDTH, 320)
                    capture.set(cv2.CAP_PROP_FRAME_HEIGHT, 240)
            started, count, due = time.monotonic(), 0, 0
            first_frame_deadline = started+1.5
            while not stop.is_set():
                if mock:
                    frame = np.zeros((480, 640, 3), dtype=np.uint8)
                    cv2.putText(frame, 'CAMERA SIMULATION', (45, 80), cv2.FONT_HERSHEY_SIMPLEX,
                                1, (190, 220, 240), 2)
                    cv2.circle(frame, (320+int(100*math.sin(time.monotonic())), 260),
                               70, (170, 210, 60), -1)
                else:
                    ok, frame = capture.read()
                    if not ok or frame is None:
                        if count == 0 and time.monotonic() < first_frame_deadline:
                            stop.wait(.1)
                            continue
                        raise RuntimeError('USB 카메라 프레임 읽기 실패 · 다시 연결 중…')
                now = time.monotonic()
                if now < due:
                    continue  # Drain the camera; encode at most 15 fps.
                due = max(due + 1/15, now)
                height, width = frame.shape[:2]
                scale = min(1, 640/width, 480/height)
                if scale < 1:
                    frame = cv2.resize(frame, (round(width*scale), round(height*scale)))
                height, width = frame.shape[:2]
                ok, jpeg = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 75])
                if not ok:
                    raise RuntimeError('카메라 JPEG 변환 실패')
                count += 1
                publish(dict(ready=True, device=selected['path'], name=selected['name'],
                             node=node, backend=backend, width=width, height=height,
                             fps=(count-1)/max(now-started, .001),
                             capture_mode='320×240 요청' if request_small else '카메라 기본 모드',
                             mock=mock, sampled_at=now))
                video.publish(jpeg.tobytes())
                if mock:
                    stop.wait(1/15)
        except Exception as exc:
            if capture is not None:
                request_small = not request_small
            message = ('카메라용 OpenCV가 없습니다. 가상환경에 opencv-python-headless를 설치하세요'
                       if isinstance(exc, ModuleNotFoundError) and exc.name == 'cv2'
                       else f'{type(exc).__name__}: {exc}')
            publish(dict(ready=False, error=message))
        finally:
            if capture is not None:
                capture.release()
        stop.wait(2)


def device_worker(kind, stop, pipe, options):
    # A separate session also contains arecord, so forced recovery leaves no recorder behind.
    os.setsid()
    signal.signal(signal.SIGINT, signal.SIG_IGN)
    signal.signal(signal.SIGTERM, lambda *unused: stop.set())
    def publish(data):
        pipe.send(('state', data))
    output = type('Output', (), {'publish': lambda self, data: pipe.send(('data', data))})()
    reset_pin = None
    try:
        if kind == 'imu':
            if options.get('bno_reset_gpio') is not None and not options['mock']:
                from imu_init import open_reset_pin
                reset_pin = open_reset_pin(options['bno_reset_gpio'])
            sample_loop(stop, publish, options['mock'],
                        lambda message: publish(dict(error=message, stale=True, stage='starting')),
                        reset_pin, options.get('imu_mode', 'auto'), options.get('i2c_bus', 3))
        elif kind == 'mic':
            microphone_loop(stop, publish, output, options['mic_device'],
                            options['mic_channel'], bool(options['mock']))
        else:
            camera_loop(stop, publish, output, options['camera_device'], bool(options['mock']),
                        options.get('camera_small', True))
    except (BrokenPipeError, EOFError):
        pass
    except Exception as exc:
        try:
            publish(dict(ready=False, stale=True, error=f'{type(exc).__name__}: {exc}'))
            stop.wait(2)
        except (BrokenPipeError, EOFError):
            pass
    finally:
        if reset_pin is not None:
            try:
                reset_pin.switch_to_output(value=True)
            finally:
                reset_pin.deinit()
        pipe.close()


class LiveDevices:
    """Own each hardware reader and recover blocked calls without duplicate device access."""
    def __init__(self, options, enabled, publish, streams):
        self.options, self.enabled, self.publish, self.streams = options, enabled, publish, streams
        self.context = multiprocessing.get_context('spawn')
        self.workers, self.status = {}, {}
        self.lock, self.commands, self.stop = threading.Lock(), queue.Queue(), threading.Event()
        self.pending = False
        self.cycle_until = None
        self.capture_enabled = options.get('start_sensors', True)
        for kind in ('imu', 'mic', 'camera'):
            self.status[kind] = dict(phase=('starting' if self.capture_enabled else 'paused') if kind in enabled else 'disabled',
                                     generation=0, restarts=0, last_error=None)
        self.thread = threading.Thread(target=self.run, daemon=True)

    def request(self, kind):
        if not self.thread.is_alive():
            raise ValueError('연결 관리자가 중지되었습니다. 서버를 재시작하세요')
        if kind not in ('capture-on', 'capture-off') and not self.capture_enabled:
            raise ValueError('센서 읽기가 꺼져 있습니다')
        if kind not in ('all', 'capture-on', 'capture-off') and kind not in self.enabled and not (kind in ('imu-auto', 'imu-bno', 'imu-lsm', 'imu-cycle') and 'imu' in self.enabled):
            raise ValueError('사용하지 않는 장치입니다')
        with self.lock:
            if self.pending:
                return False
            self.pending = True
        self.commands.put(kind)
        return True

    def snapshot(self):
        with self.lock:
            devices = {k: dict(v) for k, v in self.status.items()}
        for info in devices.values():
            if info['phase'] == 'ready' and time.monotonic()-info.get('updated_at', 0) > 3:
                info['phase'] = 'waiting'
        return dict(busy=self.pending, capture_enabled=self.capture_enabled, imu_mode=self.options.get('imu_mode', 'auto'), devices=devices)

    def halt(self, kind):
        worker = self.workers.pop(kind, None)
        if not worker:
            return
        process, event, pipe, _ = worker
        event.set()
        process.join(timeout=.7)
        # Kill only this worker's session; the server and other sensors keep running.
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        if process.is_alive():
            process.kill()  # Worker may not have reached setsid() yet.
        process.join(timeout=1)
        pipe.close()
        process.close()

    def launch(self, kind, reason=None):
        if kind == 'camera' and reason:
            self.options['camera_small'] = not self.options.get('camera_small', True)
        with self.lock:
            info = self.status[kind]
            info['phase'] = 'starting'
            info['message'] = reason or '장치 탐색 / 초기화 중…'
            info['restarts'] += int(info['generation'] > 0)
            info['generation'] += 1
            if reason:
                info['last_error'] = reason
        self.publish[kind](dict(ready=False, stale=True, error=reason or '장치 탐색 / 초기화 중…'))
        self.halt(kind)
        receive, send = self.context.Pipe(duplex=False)
        event = self.context.Event()
        process = self.context.Process(target=device_worker,
                                       args=(kind, event, send, self.options), daemon=True)
        try:
            process.start()
        except Exception:
            receive.close()
            raise
        finally:
            send.close()
        self.workers[kind] = [process, event, receive, time.monotonic()]

    def set_capture(self, enabled):
        self.capture_enabled = enabled
        self.cycle_until = None
        for kind in self.enabled:
            if enabled:
                self.launch(kind)
            else:
                self.halt(kind)
                with self.lock:
                    self.status[kind].update(phase='paused', message='센서 읽기 꺼짐')
                self.publish[kind](dict(ready=False, stale=True, error='센서 읽기 꺼짐'))

    def run(self):
        try:
            self.set_capture(self.capture_enabled)
            while not self.stop.is_set():
                try:
                    command = self.commands.get_nowait()
                except queue.Empty:
                    command = None
                if command in ('capture-on', 'capture-off'):
                    desired = command == 'capture-on'
                    if desired != self.capture_enabled:
                        self.set_capture(desired)
                    with self.lock:
                        self.pending = False
                    command = None
                if command:
                    if command.startswith('imu-'):
                        self.options['imu_mode'] = {'imu-auto': 'auto', 'imu-bno': 'BNO086',
                                                    'imu-lsm': 'LSM6DSO', 'imu-cycle': 'LSM6DSO'}[command]
                    for kind in self.enabled if command == 'all' else ('imu',) if command.startswith('imu-') else (command,):
                        self.launch(kind)
                    if command == 'imu-cycle':
                        self.cycle_until = time.monotonic()+2
                    else:
                        with self.lock:
                            self.pending = False
                if self.cycle_until is not None and time.monotonic() >= self.cycle_until:
                    self.options['imu_mode'] = 'BNO086'
                    self.launch('imu')
                    self.cycle_until = None
                    with self.lock:
                        self.pending = False
                for kind, worker in list(self.workers.items()):
                    process, event, pipe, _ = worker
                    for unused in range(8):
                        if not pipe.poll():
                            break
                        try:
                            message, data = pipe.recv()
                        except (EOFError, OSError):
                            break
                        worker[3] = time.monotonic()
                        if message == 'state':
                            with self.lock:
                                info = self.status[kind]
                                info['phase'] = data.get('stage') or ('retrying' if data.get('error') else 'ready')
                                info['updated_at'] = time.monotonic()
                                info['message'] = data.get('error', '정상 데이터 수신 중')
                                if data.get('error') and not data.get('stage'):
                                    info['last_error'] = data['error']
                                generation = info['generation']
                            data['generation'] = generation*1_000_000 + data.get('generation', 0)
                            self.publish[kind](data)
                        elif kind in self.streams:
                            self.streams[kind].publish(data)
                    timeout = 25 if kind == 'imu' else 8
                    if not process.is_alive() or time.monotonic()-worker[3] > timeout:
                        self.launch(kind, f'{kind}: 응답 없음 / 연결 작업 다시 시작')
                self.stop.wait(.02)
        except Exception as exc:
            for kind in self.enabled:
                self.publish[kind](dict(ready=False, stale=True, error=f'연결 관리자 오류: {exc}'))
            print(f'Device supervisor error: {exc}', flush=True)
        finally:
            for kind in list(self.workers):
                self.halt(kind)

    def close(self):
        self.stop.set()
        self.thread.join(timeout=10)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8090)
    parser.add_argument('--mock', action='store_true')
    parser.add_argument('--mock-sensor', choices=('BNO086', 'LSM6DSO'), default='BNO086')
    parser.add_argument('--mic-device', default='auto', help='ALSA device, e.g. hw:3,0')
    parser.add_argument('--mic-channel', choices=('left', 'right'), default='left')
    parser.add_argument('--no-mic', action='store_true')
    parser.add_argument('--camera-device', default='auto', help='USB camera path, e.g. /dev/video0')
    parser.add_argument('--no-camera', action='store_true')
    parser.add_argument('--imu-mode', choices=('auto', 'BNO086', 'LSM6DSO'), default='auto')
    parser.add_argument('--bno-reset-gpio', type=int,
                        choices=[pin for pin in range(4, 28) if pin not in (18, 19, 20, 21)],
                        help='BCM GPIO wired to BNO RST; e.g. 17 (physical pin 11). Disabled by default.')
    parser.add_argument('--start-sensors', action='store_true',
                        help='Start sensor readers immediately; default waits for the UI button')
    parser.add_argument('--i2c-bus', type=int, choices=(1, 3), default=3,
                        help='IMU bus: 3 = GPIO23/24 with automatic pull-ups (default); 1 = GPIO2/3')
    args = parser.parse_args()
    if args.i2c_bus == 3 and args.bno_reset_gpio in (23, 24):
        parser.error('BNO RST cannot share GPIO23/24 with I2C bus 3')
    state = {'error': 'Waiting for first sample'}
    stop = threading.Event()
    mic_state = {'ready': False, 'error': '마이크 꺼짐' if args.no_mic else '마이크 연결 중…'}
    audio = AudioBus()
    camera_state = {'ready': False, 'error': '카메라 꺼짐' if args.no_camera else 'USB 카메라 연결 중…'}
    video = AudioBus()  # Same bounded broadcast queues: one capture, many browsers.
    restart_server = threading.Event()
    boot_id = str(time.time_ns())

    def publish(data):
        nonlocal state
        state = data

    def publish_mic(data):
        nonlocal mic_state
        mic_state = data

    def publish_camera(data):
        nonlocal camera_state
        camera_state = data

    enabled = ['imu'] + ([] if args.no_mic else ['mic']) + ([] if args.no_camera else ['camera'])
    devices = LiveDevices(dict(mock=args.mock_sensor if args.mock else False,
                               mic_device=args.mic_device, mic_channel=int(args.mic_channel == 'right'),
                               camera_device=args.camera_device, bno_reset_gpio=args.bno_reset_gpio,
                               imu_mode=args.imu_mode, i2c_bus=args.i2c_bus,
                               start_sensors=args.start_sensors), enabled,
                          dict(imu=publish, mic=publish_mic, camera=publish_camera),
                          dict(mic=audio, camera=video))

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            # Only the local dashboard may issue controls; never accept a cross-site form.
            origin = self.headers.get('Origin')
            if (self.headers.get('Sec-Fetch-Site') == 'cross-site'
                    or (origin and urlsplit(origin).netloc != self.headers.get('Host'))
                    or self.headers.get('Content-Type') != 'application/json'):
                self.send_error(403)
                return
            action = self.path.removeprefix('/control/') if self.path.startswith('/control/') else ''
            if action not in ('imu', 'imu-auto', 'imu-bno', 'imu-lsm', 'imu-cycle', 'mic', 'camera', 'all', 'server', 'capture-on', 'capture-off'):
                self.send_error(404)
                return
            try:
                size = int(self.headers.get('Content-Length', '0'))
                if size < 0 or size > 1024:
                    raise ValueError('Invalid request size')
                json.loads(self.rfile.read(size) or b'{}')
            except (ValueError, OSError):
                self.send_error(400)
                return
            if restart_server.is_set():
                self.send_error(409, 'Server restarting')
                return
            if action == 'server':
                restart_server.set()
            else:
                try:
                    accepted = devices.request(action)
                except ValueError:
                    self.send_error(400, 'Device disabled')
                    return
                if not accepted:
                    self.send_error(409, 'Another reconnect is in progress')
                    return
            body = json.dumps(dict(accepted=True, action=action)).encode()
            self.send_response(202)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            try:
                self.wfile.write(body)
                self.wfile.flush()
            finally:
                if action == 'server':
                    threading.Thread(target=server.shutdown, daemon=True).start()

        def do_GET(self):
            if self.path.split('?')[0] == '/camera.mjpg':
                self.stream_camera()
                return
            elif self.path == '/audio':
                self.stream_audio()
                return
            elif self.path == '/':
                body, mime = PAGE.encode(), 'text/html; charset=utf-8'
            elif self.path == '/status':
                # No sensor values, waveform, camera frames or audio in control-only polling.
                body, mime = json.dumps(dict(boot_id=boot_id, connections=devices.snapshot())).encode(), 'application/json'
            elif self.path == '/state':
                snapshot = dict(state)
                snapshot['boot_id'] = boot_id
                snapshot['connections'] = devices.snapshot()
                snapshot['age_s'] = (time.monotonic() - snapshot['sampled_at']
                                     if 'sampled_at' in snapshot else None)
                mic = dict(mic_state)
                mic['age_s'] = time.monotonic()-mic['sampled_at'] if 'sampled_at' in mic else None
                mic['ready'] = mic['ready'] and mic['age_s'] is not None and mic['age_s'] < 1
                snapshot['mic'] = mic
                camera = dict(camera_state)
                camera['age_s'] = time.monotonic()-camera['sampled_at'] if 'sampled_at' in camera else None
                camera['ready'] = camera['ready'] and camera['age_s'] is not None and camera['age_s'] < 3
                snapshot['camera'] = camera
                body, mime = json.dumps(snapshot, allow_nan=False).encode(), 'application/json'
            else:
                self.send_error(404)
                return
            self.send_response(200)
            self.send_header('Content-Type', mime)
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(body)

        def stream_camera(self):
            if not camera_state['ready']:
                self.send_error(503, 'Camera unavailable')
                return
            client = video.subscribe()
            try:
                self.connection.settimeout(3)
                self.send_response(200)
                self.send_header('Content-Type', 'multipart/x-mixed-replace; boundary=frame')
                self.send_header('Cache-Control', 'no-store')
                self.send_header('Connection', 'close')
                self.end_headers()
                while not stop.is_set() and devices.capture_enabled:
                    try:
                        jpeg = client.get(timeout=1)
                    except queue.Empty:
                        if not camera_state['ready'] or time.monotonic()-camera_state.get('sampled_at', 0) > 3:
                            break
                        continue
                    self.wfile.write(b'--frame\r\nContent-Type: image/jpeg\r\nContent-Length: '
                                     + str(len(jpeg)).encode() + b'\r\n\r\n' + jpeg + b'\r\n')
                    self.wfile.flush()
            except (OSError, TimeoutError):
                pass
            finally:
                video.unsubscribe(client)
                self.close_connection = True

        def stream_audio(self):
            if not mic_state['ready']:
                self.send_error(503, 'Microphone unavailable')
                return
            client = audio.subscribe()
            try:
                self.connection.settimeout(3)
                self.send_response(200)
                self.send_header('Content-Type', 'application/octet-stream')
                self.send_header('Cache-Control', 'no-store')
                self.send_header('Connection', 'close')
                self.end_headers()
                while not stop.is_set() and devices.capture_enabled:
                    try:
                        chunk = client.get(timeout=1)
                    except queue.Empty:
                        if not mic_state['ready']:
                            break
                        continue
                    self.wfile.write(chunk)
                    self.wfile.flush()
            except (OSError, TimeoutError):
                pass
            finally:
                audio.unsubscribe(client)
                self.close_connection = True

        def log_message(self, *unused):
            pass

    server = ThreadingHTTPServer(('0.0.0.0', args.port), Handler)
    devices.thread.start()
    print(f'Open http://<Pi-IP>:{args.port} on your Mac. Ctrl+C to stop.', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        stop.set()
        devices.close()
        server.server_close()
    if restart_server.is_set():
        launch_args = sys.argv[1:]
        # Keep a mode selected in the UI across a server restart.
        for index in range(len(launch_args)-1, -1, -1):
            if launch_args[index].startswith('--imu-mode='):
                del launch_args[index]
            elif launch_args[index] == '--imu-mode':
                del launch_args[index:index+2]
        launch_args = [arg for arg in launch_args if arg != '--start-sensors']
        if devices.capture_enabled:
            launch_args.append('--start-sensors')
        os.execv(sys.executable, [sys.executable, str(Path(__file__).resolve()), *launch_args,
                                 '--imu-mode', devices.options.get('imu_mode', 'auto')])


if __name__ == '__main__':
    main()
