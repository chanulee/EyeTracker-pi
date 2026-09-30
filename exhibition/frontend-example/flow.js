// The compute server owns detection, calibration samples and filtering.
export function draftPosition(g, reference) {
 if (!g.tracking || !Array.isArray(g.direction)) return null;
 let angles=g.relative_angles;
 if (!angles && g.direction_frame==='eye_camera' && reference) {
  const norm=v=>Math.hypot(...v), dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
  const f=reference.map(v=>v/norm(reference)), right=[1-f[0]*f[0],-f[0]*f[1],-f[0]*f[2]];
  const length=norm(right);if(length<1e-6)return null;
  const r=right.map(v=>v/length), up=[f[1]*r[2]-f[2]*r[1],f[2]*r[0]-f[0]*r[2],f[0]*r[1]-f[1]*r[0]];
  const x=dot(g.direction,r),y=dot(g.direction,up),z=dot(g.direction,f);
  angles={yaw:Math.atan2(x,z)*180/Math.PI,pitch:Math.atan2(y,Math.hypot(x,z))*180/Math.PI};
 }
 const point=angles?[.5+angles.yaw/50,.5-angles.pitch/35]:Array.isArray(g.raw)?[.5+g.raw[0]/.8,.5-g.raw[1]/.8]:null;
 return point?.every(Number.isFinite)?point.map(v=>Math.min(.98,Math.max(.02,v))):null;
}
export function smoothPosition(current,target,dt) {
 if (!current) return [...target];
 const amount=1-Math.exp(-Math.max(0,dt)/35);
 return current.map((value,i)=>value+(target[i]-value)*amount);
}
export function viewportMatches(viewport,width,height) {
 return !viewport || (Math.abs(viewport.width-width)<=1 && Math.abs(viewport.height-height)<=1);
}
export async function runCalibration(h) {
 const request=data=>h.api('calibration',data);
 const attempt=async(task,view)=>{
  while(true){h.check();try{return await task();}catch(error){h.check();h.show({...view,message:error.message,retry:true});await h.action('retry');}}
 };
 const plan=await h.api('plan');h.check();
 await request({action:'reset'});h.check();
 h.show({phase:'fit',title:'안경을 편하게 착용하세요',message:'눈 영상에서 초록 타원이 동공을 따라가는지 확인하고 착용 완료를 눌러주세요.',progress:0,confirm:true});
 await h.action('fit');h.check();
 const warm=[[.5,.5],[.2,.5],[.8,.5],[.5,.2],[.5,.8]];let step=0;
 while(!h.read().g.ready){
  h.show({phase:'model',title:'점을 따라 눈을 움직여주세요',message:'동공과 3D 방향 모델을 준비하고 있어요. 안경과 머리 위치를 유지하세요.',point:warm[Math.floor(step/18)%warm.length],progress:0});
  await h.pause(100);h.check();step++;
 }
 const session=await attempt(()=>request({action:'begin',viewport:h.viewport()}),{phase:'model',title:'방향 모델을 확인하고 있어요'});
 h.setSession(session.session_id);
 const neutral={phase:'neutral',title:'정면의 점을 보세요',message:'머리는 그대로, 눈으로 중앙의 점을 1초 이상 바라보세요.',point:[.5,.5],progress:0};
 h.show(neutral);await h.pause(1600);h.check();
 if(h.read().stats.tracker_details?.engine==='pupil'){
  await attempt(async()=>{await h.pause(500);h.check();return request({action:'neutral',session_id:session.session_id});},neutral);
 }
 const total=plan.points.length+plan.validation_points.length;
 for(let i=0;i<plan.points.length;i++){
  const view={phase:'sample',title:'이 점을 계속 바라보세요',message:`${i+1} / ${plan.points.length} · 시선이 안정되면 다음 점으로 이동해요.`,point:plan.points[i],progress:i/total};
  h.show(view);
  await attempt(async()=>{await h.pause(900);h.check();return request({action:'sample',index:i,session_id:session.session_id});},view);
  h.show({...view,message:'수집했어요',progress:(i+1)/total});await h.pause(200);h.check();
 }
 let result;
 for(let i=0;i<plan.validation_points.length;i++){
  const view={phase:'validate',title:'이제 정확도를 확인할게요',message:`확인 ${i+1} / ${plan.validation_points.length} · 표시된 점을 바라보세요.`,point:plan.validation_points[i],progress:(plan.points.length+i)/total};
  h.show(view);
  result=await attempt(async()=>{await h.pause(900);h.check();return request({action:'validate',validation_index:i,session_id:session.session_id});},view);
 }
 if(!result?.calibrated) throw Error('보정을 완료하지 못했어요. 다시 시작해주세요.');
 return result;
}
