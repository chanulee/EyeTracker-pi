import {connectGaze} from '/gaze-client.js';
import {draftPosition,smoothPosition,viewportMatches,runCalibration} from './flow.js';
const $=id=>document.getElementById(id), players=new Map(), stops=[];
let active=null,mouse=[.5,.5];
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function api(id,resource,data,options={}){
 const response=await fetch(`/api/players/${id}/${resource}`,data===undefined?options:{...options,method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
 if(!response.ok)throw Error(await response.text());return response.json();
}
function refreshCard(p){
 const {g,stats}=p;
 p.card.querySelector('.connection').textContent=stats.simulate?'시뮬레이션 · 실제 눈 아님':g.camera_connected?'카메라 연결됨':'카메라 대기';
 p.card.querySelector('.tracking').textContent=g.valid?'보정된 시선 수신 중':g.tracking?(g.ready?'방향 모델 준비 완료':'방향 모델 준비 중'):stats.pupil_detected?'동공 확인 · 방향 모델 준비 중':'동공 입력 대기';
 p.card.querySelector('.performance').textContent=`${stats.processing_fps??'—'} FPS · ${stats.processing_ms??'—'} ms`;
 p.card.querySelector('.start').disabled=Boolean(active);
 if(stats.simulate)p.card.querySelector('.placeholder').textContent='마우스로 점을 따라보는 테스트';
 if(g.calibrated && !active && !p.invalidating)p.card.querySelector('.result').textContent=!viewportMatches(g.calibration_viewport,innerWidth,innerHeight)?'화면 크기가 바뀌었어요. 다시 보정해주세요.':p.calibrationResult==null?'보정 완료 · 시선으로 커서를 움직여보세요':`보정 완료 · 확인 오차 ${(p.calibrationResult*100).toFixed(1)}%`;
 if(active?.id===p.id && active.phase==='fit'){
  $('continue').disabled=!(p.previewURL||stats.simulate);
  if(!stats.simulate&&!p.previewURL)$('cal-message').textContent='눈 영상을 기다리고 있어요. Pi가 연결되면 착용 완료를 누를 수 있습니다.';
  else $('cal-message').textContent=stats.pupil_detected||stats.simulate?'눈 영상에서 초록 타원이 동공을 따라가는지 확인하고 착용 완료를 눌러주세요.':'카메라에 눈이 보이도록 위치를 맞추고 착용 완료를 누르세요. 다음 단계에서 동공과 방향 모델을 확인합니다.';
 }
}
function clearCursor(p){p.target=p.position=null;p.cursor.hidden=true;}
function clearPreview(p){
 if(p.previewURL)URL.revokeObjectURL(p.previewURL);p.previewURL=null;
 p.image.hidden=true;p.card.querySelector('.placeholder').hidden=false;
 if(active?.id===p.id){$('cal-preview').hidden=true;$('cal-camera-state').hidden=false;$('cal-camera-state').textContent='최신 눈 영상 대기 · Pi 연결을 확인하세요';}
}
function cancelRun(message='보정을 취소했어요'){
 const run=active;if(!run)return;
 active=null;run.stopped=true;run.waiter?.reject(Error('cancelled'));
 $('calibration').hidden=true;document.body.removeAttribute('data-cal-user');
 players.get(run.id).card.querySelector('.result').textContent=message;
 api(run.id,'calibration',{action:'cancel',...(run.session?{session_id:run.session}:{})}).catch(()=>{});
 players.forEach(refreshCard);players.get(run.id).card.querySelector('.start').focus();
}
function show(view){
 if(!active)return;active.phase=view.phase;$('calibration').dataset.phase=view.phase;
 $('cal-step').textContent=`${active.id}P · ${view.phase==='sample'?'시선 보정':view.phase==='validate'?'정확도 확인':'착용 준비'}`;
 $('cal-title').textContent=view.title;$('cal-message').textContent=view.message||'영상 연결과 시선 상태를 확인해주세요.';
 $('progress-bar').style.width=(view.progress??0)*100+'%';
 $('continue').hidden=!view.confirm;$('continue').textContent='착용 완료';$('retry').hidden=!view.retry;
 $('target').hidden=!view.point;
 if(view.point){$('target').style.left=view.point[0]*100+'%';$('target').style.top=view.point[1]*100+'%';}
 const panel=document.querySelector('.cal-panel');panel.classList.toggle('top',Boolean(view.point&&view.point[1]>.7));panel.classList.toggle('bottom',!view.point||view.point[1]<=.7);
 const p=players.get(active.id);$('cal-preview').hidden=!p.previewURL;$('cal-camera-state').hidden=Boolean(p.previewURL);
 $('cal-camera-state').textContent=p.stats.simulate?'시뮬레이션 · 실제 영상 없음':'눈 영상 연결 확인 중';
 if(p.previewURL)$('cal-preview').src=p.previewURL;
 refreshCard(p);if(view.confirm)$('continue').focus();else if(view.retry)$('retry').focus();
}
async function start(id){
 if(active)return;
 const run={id,phase:'entering',session:null,stopped:false,waiter:null};active=run;players.forEach(refreshCard);
 players.get(id).calibrationResult=null;
 try{
  if(!document.fullscreenElement){try{await document.documentElement.requestFullscreen();}catch{/* Window mode uses the same viewport for calibration and play. */}}
  await pause(100);if(run.stopped)return;
  const viewport={width:innerWidth,height:innerHeight};run.viewport=viewport;
  $('calibration').hidden=false;document.body.dataset.calUser=id;$('calibration').dataset.activeUser=id;
  const check=()=>{if(active!==run||run.stopped)throw Error('cancelled');};
  const result=await runCalibration({
   api:async(resource,data)=>{check();const value=await api(id,resource,data);check();return value;},
   read:()=>players.get(id),show,check,viewport:()=>viewport,setSession:value=>{check();run.session=value;},
   pause:async ms=>{await pause(ms);check();},
   action:kind=>new Promise((resolve,reject)=>{run.waiter={kind,resolve:()=>{run.waiter=null;resolve();},reject};})
  });
  check();active=null;$('calibration').hidden=true;document.body.removeAttribute('data-cal-user');
  players.get(id).calibrationResult=result.validation_error;
  players.get(id).card.querySelector('.result').textContent=`보정 완료 · 확인 오차 ${(result.validation_error*100).toFixed(1)}%`;
  players.forEach(refreshCard);players.get(id).card.querySelector('.start').focus();
 }catch(error){if(active===run)cancelRun(error.message);}
}
$('continue').onclick=()=>{if(active?.waiter?.kind==='fit')active.waiter.resolve();};
$('retry').onclick=()=>{if(active?.waiter?.kind==='retry')active.waiter.resolve();};
$('cancel').onclick=()=>cancelRun();
addEventListener('keydown',event=>{
 if(!active)return;
 if(event.key==='Escape')cancelRun();
 if(event.key==='Tab'){
  const buttons=[...$('calibration').querySelectorAll('button')].filter(button=>!button.hidden&&!button.disabled);
  const first=buttons[0],last=buttons.at(-1);
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
 }
});
$('full').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch(error){$('play-note').textContent=error.message;}};
const mousePosition=event=>mouse=[event.clientX/innerWidth,event.clientY/innerHeight];
addEventListener('mousemove',mousePosition);
addEventListener('pointerdown',mousePosition);
addEventListener('resize',()=>{
 if(active && active.phase!=='entering')cancelRun('화면 크기가 바뀌었어요. 같은 화면에서 다시 보정해주세요.');
 for(const p of players.values()){
  clearCursor(p);
  if(p.g.calibrated && !viewportMatches(p.g.calibration_viewport,innerWidth,innerHeight) && !p.invalidating){
   p.invalidating=true;p.card.querySelector('.result').textContent='화면 크기가 바뀌었어요. 다시 보정해주세요.';
   api(p.id,'calibration',{action:'reset'}).finally(()=>p.invalidating=false).catch(()=>{});
  }
 }
});
async function poll(p){
 if(p.polling)return;p.polling=true;
 try{p.stats=await api(p.id,'status');refreshCard(p);}catch(error){p.card.querySelector('.tracking').textContent='처리 서버 연결을 확인해주세요';}finally{p.polling=false;}
}
async function preview(p){
 if(p.previewBusy||p.stats.simulate||!(p.g.camera_connected||p.stats.camera_connected)||document.hidden||(active&&active.id!==p.id))return;
 p.previewBusy=true;
 try{
  const response=await fetch(`/api/players/${p.id}/preview?overlay=1`);if(!response.ok)throw Error();
  const url=URL.createObjectURL(await response.blob()),previous=p.previewURL;p.previewURL=url;
  p.image.src=url;p.image.hidden=false;p.card.querySelector('.placeholder').hidden=true;
  if(active?.id===p.id){$('cal-preview').src=url;$('cal-preview').hidden=false;$('cal-camera-state').hidden=true;}
  if(previous)URL.revokeObjectURL(previous);
 }catch{clearPreview(p);}finally{p.previewBusy=false;}
}
try{
 const response=await fetch('/connection.json');if(!response.ok)throw Error('연결 설정을 읽지 못했어요');
 for(const {user_id:id,url,token} of (await response.json()).players){
  const card=$('card'+id),p={id,card,cursor:$('p'+id),image:card.querySelector('.preview'),g:{},stats:{},target:null,position:null,reference:null,previewURL:null,received:0};players.set(id,p);
  card.querySelector('.start').onclick=()=>start(id);
  stops.push(connectGaze(url,g=>{
   if(p.g.session_id&&g.session_id&&p.g.session_id!==g.session_id){p.reference=null;p.calibrationResult=null;clearCursor(p);if(!active)p.card.querySelector('.result').textContent='보정 세션이 초기화됐어요. 다시 보정해주세요.';}
   p.g=g;p.received=performance.now();
   if(!g.camera_connected&&!p.stats.simulate)clearPreview(p);
   if(active?.id===id && active.session && g.session_id && active.session!==g.session_id)cancelRun('영상 연결이나 보정 세션이 바뀌었어요. 다시 시작해주세요.');
   if(!p.reference&&g.direction)p.reference=[...g.direction];
   refreshCard(p);
  },status=>{if(status!=='connected'){clearCursor(p);card.querySelector('.connection').textContent=status==='stale'?'입력 지연':'서버 연결 끊김';}},{token}));
  poll(p);setInterval(()=>poll(p),700);setInterval(()=>preview(p),250);
 }
}catch(error){for(const el of document.querySelectorAll('.tracking'))el.textContent=error.message;}
let last=performance.now();
function render(now){
 const dt=Math.min(100,now-last);last=now;
 for(const p of players.values()){
  const g=p.g,fresh=now-p.received<500,matches=viewportMatches(g.calibration_viewport,innerWidth,innerHeight);
  const point=(!fresh||p.invalidating||(active&&active.id!==p.id))?null:g.valid&&matches?[g.x,g.y]:!g.calibrated||active?.id===p.id?draftPosition(g,p.reference):null;
  if(!point){clearCursor(p);continue;}
  p.position=smoothPosition(p.position,point,dt);p.cursor.hidden=false;
  p.cursor.style.left=p.position[0]*innerWidth+'px';p.cursor.style.top=p.position[1]*innerHeight+'px';
  const draft=!g.valid;p.cursor.classList.toggle('draft',draft);p.cursor.querySelector('span').textContent=`${p.id}P${draft?' 임시':''}`;
 }
 for(const tile of document.querySelectorAll('.tile')){
  const rect=tile.getBoundingClientRect();tile.classList.toggle('hot',[...players.values()].some(p=>p.g.valid&&!p.cursor.hidden&&p.position&&p.position[0]*innerWidth>=rect.left&&p.position[0]*innerWidth<=rect.right&&p.position[1]*innerHeight>=rect.top&&p.position[1]*innerHeight<=rect.bottom));
 }
 requestAnimationFrame(render);
}
requestAnimationFrame(render);
// Explicit server simulation only: real-camera mode never accepts mouse gaze.
setInterval(async()=>{
 for(const p of players.values())if(p.stats.simulate&&!p.demoBusy&&(!active||active.id===p.id)){
  p.demoBusy=true;try{await api(p.id,'demo',{x:mouse[0],y:mouse[1]});}catch{}finally{p.demoBusy=false;}
 }
},40);
addEventListener('pagehide',()=>{
 if(active){const run=active;api(run.id,'calibration',{action:'cancel',...(run.session?{session_id:run.session}:{})},{keepalive:true}).catch(()=>{});}
 stops.forEach(stop=>stop());for(const p of players.values())if(p.previewURL)URL.revokeObjectURL(p.previewURL);
});
