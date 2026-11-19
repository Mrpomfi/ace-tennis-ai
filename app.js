/* ACE Tennis AI – lokale Datenbank und lokale Videoanalyse. */
const DB_NAME='ace-tennis-ai-local', DB_VERSION=2;
let db, selectedVideo=null, previewUrl=null;
const $=id=>document.getElementById(id);
const today=()=>new Date().toISOString().slice(0,10);
$('videoDate').value=today();$('matchDate').value=today();$('trainDate').value=today();
function openDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,DB_VERSION);req.onupgradeneeded=()=>{const d=req.result;for(const s of ['videos','matches','trainings','analyses'])if(!d.objectStoreNames.contains(s))d.createObjectStore(s,{keyPath:'id',autoIncrement:true});if(!d.objectStoreNames.contains('settings'))d.createObjectStore('settings',{keyPath:'key'});};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
function tx(store,mode='readonly'){return db.transaction(store,mode).objectStore(store)}
function all(store){return new Promise((res,rej)=>{const r=tx(store).getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function put(store,value){return new Promise((res,rej)=>{const r=tx(store,'readwrite').put(value);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function add(store,value){return new Promise((res,rej)=>{const r=tx(store,'readwrite').add(value);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function del(store,id){return new Promise((res,rej)=>{const r=tx(store,'readwrite').delete(id);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
function get(store,key){return new Promise((res,rej)=>{const r=tx(store).get(key);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function setStatus(id,msg){$(id).textContent=msg}
function esc(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function dateText(d){return d?new Date(d+'T12:00:00').toLocaleDateString('de-DE'):'—'}
function go(view){document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id==='view-'+view));document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.view===view));window.scrollTo({top:0,behavior:'smooth'});if(view==='videos')renderVideos();if(view==='matches')renderMatches();if(view==='training')renderTrainings();if(view==='home')renderHome();if(view==='profile')loadProfile()}
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.view)));
document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.go)));
$('videoFile').addEventListener('change',()=>{selectedVideo=$('videoFile').files?.[0]||null;$('saveVideo').disabled=!selectedVideo;if(previewUrl)URL.revokeObjectURL(previewUrl);if(selectedVideo){previewUrl=URL.createObjectURL(selectedVideo);$('videoPreview').src=previewUrl;$('videoPreview').hidden=false;setStatus('videoStatus',`${selectedVideo.name} · ${(selectedVideo.size/1048576).toFixed(1)} MB – noch nicht gespeichert.`)}else{$('videoPreview').hidden=true;setStatus('videoStatus','')}})
$('saveVideo').addEventListener('click',async()=>{if(!selectedVideo)return;try{const id=await add('videos',{shot:$('videoShot').value,date:$('videoDate').value||today(),note:$('videoNote').value,blob:selectedVideo,angle:$('videoAngle').value||'unknown',name:selectedVideo.name,type:selectedVideo.type,size:selectedVideo.size,created:Date.now()});selectedVideo=null;$('videoFile').value='';$('videoPreview').hidden=true;$('saveVideo').disabled=true;$('videoNote').value='';setStatus('videoStatus','Video wurde ausschließlich lokal auf diesem iPhone gespeichert.');await renderVideos();await renderHome();}catch(e){setStatus('videoStatus','Speichern fehlgeschlagen. Möglicherweise ist nicht genug Gerätespeicher frei.')}});
async function renderVideos(){const items=(await all('videos')).sort((a,b)=>b.created-a.created);$('videoCount').textContent=items.length+' Videos';const el=$('videoList');el.className='stack'+(items.length?'':' empty');if(!items.length){el.textContent='Noch keine Videos gespeichert.';return;}el.innerHTML='';for(const v of items){const card=document.createElement('article');card.className='entry';const url=URL.createObjectURL(v.blob);card.innerHTML=`<div class="entry-top"><div><b>${esc(v.shot)}</b><small>${dateText(v.date)} · ${esc(v.name)} · ${(v.size/1048576).toFixed(1)} MB</small></div><span class="pill">Lokal</span></div>${v.note?`<p>${esc(v.note)}</p>`:''}<video controls playsinline preload="metadata" src="${url}"></video><div class="entry-actions">${v.shot==='Vorhand'?`<button data-analyze="${v.id}">Vorhand analysieren</button>`:''}<button data-export="${v.id}">Video teilen / exportieren</button><button class="remove" data-delete="${v.id}">Löschen</button></div>`;el.append(card);const analyzeBtn=card.querySelector('[data-analyze]');if(analyzeBtn)analyzeBtn.onclick=()=>startForehandAnalysis(v.id);
card.querySelector('[data-delete]').onclick=async()=>{if(confirm('Dieses Video und seine Notiz löschen?')){await del('videos',v.id);for(const a of await all('analyses'))if(a.videoId===v.id)await del('analyses',a.id);URL.revokeObjectURL(url);renderVideos();renderHome()}};card.querySelector('[data-export]').onclick=()=>{const a=document.createElement('a');a.href=url;a.download=v.name||'ace-video';a.click()};}}

// ACE Movement Lab – lokale Einzelbildanalyse mit MediaPipe Pose Landmarker.
let analysisBusy=false,analysisPlaybackUrl=null,playbackFrame=null;
const MP_MODEL='./vendor/mediapipe/pose_landmarker_lite.task';
async function getPoseTask(){
  setStatus('analysisStatus','Bewegungsmodell wird vorbereitet …');
  const {FilesetResolver,PoseLandmarker}=await import('./vendor/mediapipe/vision_bundle.mjs');
  const vision=await FilesetResolver.forVisionTasks('./vendor/mediapipe/wasm');
  // Jede Videoanalyse erhält eine frische Instanz. So kann der VIDEO-Tracker
  // keine Landmarken aus einer vorherigen Aufnahme in das nächste Video tragen.
  return await PoseLandmarker.createFromOptions(vision,{baseOptions:{modelAssetPath:MP_MODEL,delegate:'GPU'},runningMode:'VIDEO',numPoses:1,minPoseDetectionConfidence:.45,minPosePresenceConfidence:.45,minTrackingConfidence:.45});
}
function angle3(a,b,c){const ab=[a.x-b.x,a.y-b.y],cb=[c.x-b.x,c.y-b.y];const dot=ab[0]*cb[0]+ab[1]*cb[1],mag=Math.hypot(...ab)*Math.hypot(...cb);if(!mag)return null;return Math.round(Math.acos(Math.max(-1,Math.min(1,dot/mag)))*180/Math.PI)}
const POSE_LINKS=[[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28]];
function drawPose(canvas,landmarks){
  const c=canvas.getContext('2d');c.lineWidth=Math.max(3,canvas.width/180);c.strokeStyle='#c7f36b';c.fillStyle='#ffffff';
  c.beginPath();for(const [a,b] of POSE_LINKS){const p=landmarks[a],q=landmarks[b];if((p.visibility??1)<.35||(q.visibility??1)<.35)continue;c.moveTo(p.x*canvas.width,p.y*canvas.height);c.lineTo(q.x*canvas.width,q.y*canvas.height)}c.stroke();
  for(const p of landmarks){if((p.visibility??1)<.35)continue;c.beginPath();c.arc(p.x*canvas.width,p.y*canvas.height,Math.max(2,canvas.width/150),0,Math.PI*2);c.fill()}
}
function waitEvent(el,name){return new Promise((resolve,reject)=>{const done=()=>{cleanup();resolve()},bad=()=>{cleanup();reject(Error('Video konnte nicht gelesen werden'))},cleanup=()=>{el.removeEventListener(name,done);el.removeEventListener('error',bad)};el.addEventListener(name,done,{once:true});el.addEventListener('error',bad,{once:true})})}

function seriesStats(values){
  if(!values.length)return null;
  const sorted=[...values].sort((a,b)=>a-b);
  return {avg:Math.round(values.reduce((a,b)=>a+b,0)/values.length),min:sorted[0],max:sorted[sorted.length-1],count:values.length};
}
function formatStats(s){return s?s.avg+'° im Mittel · '+s.min+'–'+s.max+'° · '+s.count+' Messungen':'Nicht ausreichend erkannt'}
function detectStrokePhases(frames){
  const candidates=['left','right'].map(side=>{
    const points=frames.map((f,i)=>({i,time:f.time,p:f[side+'ArmPoint']})).filter(x=>x.p&&Number.isFinite(x.p.x)&&Number.isFinite(x.p.y));
    const path=points.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.p.x-points[i].p.x,p.p.y-points[i].p.y),0);
    return {side,points,path};
  }).sort((a,b)=>b.path-a.path);
  const best=candidates[0];
  if(!best||best.points.length<10)return {status:'uncertain',side:best?.side||null,phases:[],reason:'Zu wenige sicher erkannte Handgelenkpositionen.'};
  const points=best.points,speeds=[];
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],dt=b.time-a.time;
    speeds.push(dt<=0||dt>.35?null:{i:b.i,time:b.time,speed:Math.hypot(b.p.x-a.p.x,b.p.y-a.p.y)/dt});
  }
  const smooth=speeds.map((s,i)=>{
    if(!s)return null;
    const vals=[speeds[i-1]?.speed,s.speed,speeds[i+1]?.speed].filter(Number.isFinite);
    return {...s,speed:vals.reduce((x,y)=>x+y,0)/vals.length};
  });
  const peak=smooth.reduce((best,x)=>x&&(!best||x.speed>best.speed)?x:best,null);
  if(!peak||peak.speed<.35)return {status:'uncertain',side:best.side,phases:[],reason:'Keine ausreichend deutliche Schlagbewegung erkannt.'};
  const peakPoint=points.findIndex(p=>p.i===peak.i);
  if(peakPoint<4||peakPoint>=points.length-3)return {status:'uncertain',side:best.side,phases:[],reason:'Zu wenig Bewegung vor oder nach dem schnellsten Armabschnitt.'};
  const threshold=Math.max(.12,peak.speed*.14);
  let motionStartIndex=-1;
  for(let i=0;i<smooth.length;i++){
    if(smooth[i]?.speed>=threshold&&smooth.slice(i,Math.min(smooth.length,i+3)).filter(x=>x&&x.speed>=threshold).length>=2){motionStartIndex=i;break;}
  }
  if(motionStartIndex<0)return {status:'uncertain',side:best.side,phases:[],reason:'Keine zusammenhängende Schlagbewegung mit ausreichender Geschwindigkeit erkannt.'};
  const motionStartFrame=smooth[motionStartIndex].i;
  const prePeak=points.filter(p=>p.i>=motionStartFrame&&p.i<peak.i);
  if(prePeak.length<3)return {status:'low-confidence',side:best.side,phases:[],reason:'Eine getrennte Ausholbewegung vor der Beschleunigung ließ sich nicht sicher abgrenzen.'};
  const radius=p=>Math.hypot(p.p.x,p.p.y);
  const farthest=prePeak.reduce((a,b)=>radius(b)>radius(a)?b:a,prePeak[0]);
  const first=points.find(p=>p.i===motionStartFrame)||points[0];
  const clearLoad=radius(farthest)>=radius(first)*1.08&&farthest.i<peak.i-2;
  let motionEnd=points[points.length-1].i;
  const afterPeak=smooth.filter(x=>x&&x.i>peak.i);
  for(let i=0;i<afterPeak.length-1;i++){if(afterPeak[i].speed<threshold&&afterPeak[i+1].speed<threshold){motionEnd=afterPeak[i+1].i;break;}}
  const sample=frames.length>1?(frames[frames.length-1].time-frames[0].time)/(frames.length-1):.1;
  const at=i=>frames[Math.max(0,Math.min(frames.length-1,i))]?.time??0;
  const phases=[];
  if(clearLoad&&farthest.i>motionStartFrame+1)phases.push({name:'Ausholen / Vorbereitung',start:at(motionStartFrame),end:at(farthest.i)});
  phases.push({name:'Beschleunigung',start:at(clearLoad?farthest.i:motionStartFrame),end:at(peak.i)});
  phases.push({name:'Treffpunkt-Kandidat',start:Math.max(0,peak.time-sample/2),end:peak.time+sample/2});
  if(motionEnd>peak.i+1)phases.push({name:'Ausschwung',start:at(Math.min(motionEnd,peak.i+1)),end:at(motionEnd)});
  return {status:clearLoad&&motionEnd>peak.i+1?'estimated':'low-confidence',side:best.side,peakTime:peak.time,peakSpeed:Number(peak.speed.toFixed(2)),phases,reason:clearLoad?'Ausholen nur bei erkennbarem maximalem Abstand vor der Beschleunigung ausgewiesen.':'Kein eindeutiges Ausholmuster erkannt; die Phase wird nicht künstlich ergänzt.'};
}
async function startForehandAnalysis(videoId){
  if(analysisBusy)return;analysisBusy=true;const status=$('analysisStatus'),out=$('analysisResult');clearSkeletonPlayback();out.innerHTML='';
  let videoEl,objectUrl,task;
  try{
    const item=await get('videos',videoId);if(!item)throw Error('Video nicht gefunden');
    if(item.shot!=='Vorhand')throw Error('Bitte ein Vorhandvideo auswählen.');
    status.textContent='Video wird lokal vorbereitet …';
    objectUrl=URL.createObjectURL(item.blob);videoEl=document.createElement('video');videoEl.src=objectUrl;videoEl.muted=true;videoEl.playsInline=true;videoEl.preload='auto';
    await new Promise((resolve,reject)=>{videoEl.onloadedmetadata=resolve;videoEl.onerror=()=>reject(Error('Videoformat kann nicht gelesen werden.'));});
    if(!Number.isFinite(videoEl.duration)||videoEl.duration<=0)throw Error('Videolänge konnte nicht ermittelt werden.');
    task=await getPoseTask();
    const duration=videoEl.duration,count=Math.min(96,Math.max(24,Math.ceil(duration*12)));
    const times=Array.from({length:count},(_,i)=>Math.min(Math.max(0.05,duration-0.05),0.05+(Math.max(0,duration-0.1)*i/Math.max(1,count-1))));
    const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
    const frames=[],elbowL=[],elbowR=[],kneeL=[],kneeR=[],phaseFrames=[[],[],[]];let detected=0,preview=null;
    for(let i=0;i<times.length;i++){
      status.textContent='Vorhand wird untersucht: Bild '+(i+1)+' von '+times.length+' …';
      const seeked=waitEvent(videoEl,'seeked');videoEl.currentTime=times[i];await seeked;
      const scale=Math.min(1,640/(videoEl.videoWidth||640));canvas.width=Math.round((videoEl.videoWidth||640)*scale);canvas.height=Math.round((videoEl.videoHeight||360)*scale);ctx.drawImage(videoEl,0,0,canvas.width,canvas.height);
      const res=task.detectForVideo(canvas,Math.round(times[i]*1000)+i),lm=res.landmarks?.[0];if(!lm){const missing={time:times[i],visible:0,leftElbow:null,rightElbow:null,leftKnee:null,rightKnee:null,leftArmPoint:null,rightArmPoint:null,pose:null};frames.push(missing);phaseFrames[Math.min(2,Math.floor(i/Math.max(1,times.length/3)))].push(missing);continue;}detected++;
      const visible=lm.filter(p=>(p.visibility??1)>.4).length;
      const frame={time:times[i],visible,leftElbow:null,rightElbow:null,leftKnee:null,rightKnee:null,leftArmPoint:null,rightArmPoint:null,pose:lm.map(p=>({x:p.x,y:p.y,visibility:p.visibility??1}))};
      const torsoLeft=Math.max(.05,Math.hypot(lm[11].x-lm[23].x,lm[11].y-lm[23].y));
      const torsoRight=Math.max(.05,Math.hypot(lm[12].x-lm[24].x,lm[12].y-lm[24].y));
      if([lm[11],lm[15],lm[23]].every(p=>(p.visibility??1)>.4))frame.leftArmPoint={x:(lm[15].x-lm[11].x)/torsoLeft,y:(lm[15].y-lm[11].y)/torsoLeft};
      if([lm[12],lm[16],lm[24]].every(p=>(p.visibility??1)>.4))frame.rightArmPoint={x:(lm[16].x-lm[12].x)/torsoRight,y:(lm[16].y-lm[12].y)/torsoRight};
      for(const [s,e,w,key,arr] of [[11,13,15,'leftElbow',elbowL],[12,14,16,'rightElbow',elbowR]]){
        if([lm[s],lm[e],lm[w]].every(p=>(p.visibility??1)>.4)){const a=angle3(lm[s],lm[e],lm[w]);if(a!==null){frame[key]=a;arr.push(a)}}
      }
      for(const [h,k,a,key,arr] of [[23,25,27,'leftKnee',kneeL],[24,26,28,'rightKnee',kneeR]]){
        if([lm[h],lm[k],lm[a]].every(p=>(p.visibility??1)>.4)){const v=angle3(lm[h],lm[k],lm[a]);if(v!==null){frame[key]=v;arr.push(v)}}
      }
      frames.push(frame);phaseFrames[Math.min(2,Math.floor(i/Math.max(1,times.length/3)))].push(frame);
      if(!preview&&visible>=20){drawPose(canvas,lm);preview=canvas.toDataURL('image/jpeg',.78)}
    }
    const coverage=Math.round(detected/Math.max(1,times.length)*100);
    const phases=phaseFrames.map((group,i)=>({name:['Anfang','Mitte','Ende'][i],leftElbow:seriesStats(group.map(x=>x.leftElbow).filter(Number.isFinite)),rightElbow:seriesStats(group.map(x=>x.rightElbow).filter(Number.isFinite)),leftKnee:seriesStats(group.map(x=>x.leftKnee).filter(Number.isFinite)),rightKnee:seriesStats(group.map(x=>x.rightKnee).filter(Number.isFinite))}));
    const strokePhases=detectStrokePhases(frames);
    const result={videoId,created:Date.now(),angle:item.angle||'unknown',sampled:times.length,detected,coverage,strokePhases,elbowAverage:seriesStats([...elbowL,...elbowR])?.avg??null,kneeAverage:seriesStats([...kneeL,...kneeR])?.avg??null,elbowLeft:seriesStats(elbowL),elbowRight:seriesStats(elbowR),kneeLeft:seriesStats(kneeL),kneeRight:seriesStats(kneeR),phases,preview,frames};
    await add('analyses',result);
    status.textContent='Analyse abgeschlossen · '+detected+' von '+times.length+' Bildern mit erkennbarer Körperpose. Ergebnis lokal gespeichert.';
    renderAnalysisResult(result,item);
  }catch(e){status.textContent='Analyse nicht möglich: '+(e.message||'Unbekannter Fehler')+'. Bitte ein gut beleuchtetes Video mit vollständig sichtbarem Körper verwenden.'}
  finally{if(task){try{task.close()}catch(e){console.warn('PoseLandmarker konnte nicht geschlossen werden:',e)}}if(objectUrl)URL.revokeObjectURL(objectUrl);analysisBusy=false}
}

function angleChart(frames,keys,title){
  const colors={left:'#8ba944',right:'#263b59'};
  const width=640,height=220,left=42,right=14,top=14,bottom=34;
  const plotW=width-left-right,plotH=height-top-bottom;
  const series=keys.map(k=>({key:k.key,label:k.label,color:k.side==='left'?colors.left:colors.right}));
  const paths=series.map(s=>{
    let drawing='',active=false;
    frames.forEach((f,i)=>{
      const value=f[s.key];
      if(!Number.isFinite(value)){active=false;return;}
      const startTime=frames[0]?.time??f.time,endTime=frames[frames.length-1]?.time??f.time;const x=left+(endTime<=startTime?0:(f.time-startTime)/(endTime-startTime))*plotW;
      const y=top+(180-Math.max(0,Math.min(180,value)))/180*plotH;
      drawing+=(active?' L':' M')+x.toFixed(1)+' '+y.toFixed(1);
      active=true;
    });
    return '<path d="'+drawing+'" fill="none" stroke="'+s.color+'" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>';
  }).join('');
  const grid=[0,45,90,135,180].map(v=>{
    const y=top+(180-v)/180*plotH;
    return '<line x1="'+left+'" y1="'+y+'" x2="'+(width-right)+'" y2="'+y+'" stroke="#e6ebef" stroke-width="1"/><text x="'+(left-8)+'" y="'+(y+3)+'" text-anchor="end" fill="#8c97a3" font-size="10">'+v+'°</text>';
  }).join('');
  const first=frames[0]?.time??0,last=frames[frames.length-1]?.time??0;
  const legend=series.map(s=>'<span class="chart-legend-item"><i style="background:'+s.color+'"></i>'+s.label+'</span>').join('');
  return '<section class="angle-chart"><b>'+title+'</b><div class="chart-legend">'+legend+'</div><svg viewBox="0 0 '+width+' '+height+'" role="img" aria-label="'+title+': Gelenkwinkel im Zeitverlauf von '+first.toFixed(1)+' bis '+last.toFixed(1)+' Sekunden">'+grid+paths+'<text x="'+left+'" y="'+(height-8)+'" fill="#8c97a3" font-size="10">0 s</text><text x="'+(width-right)+'" y="'+(height-8)+'" text-anchor="end" fill="#8c97a3" font-size="10">'+last.toFixed(1)+' s</text></svg></section>';
}
function clearSkeletonPlayback(){
  if(playbackFrame!==null){cancelAnimationFrame(playbackFrame);playbackFrame=null;}
  if(analysisPlaybackUrl){URL.revokeObjectURL(analysisPlaybackUrl);analysisPlaybackUrl=null;}
  const player=$('skeletonPlayer');if(player)player.classList.remove('is-expanded');
}
function phaseAtTime(time,phases){
  const list=phases||[];
  for(const name of ['Treffpunkt-Kandidat','Beschleunigung','Ausschwung','Ausholen / Vorbereitung']){
    const phase=list.find(p=>p.name===name&&time>=p.start&&time<=p.end);if(phase)return phase;
  }
  return null;
}
function phaseColorAt(time,phases){
  const phase=phaseAtTime(time,phases);
  return phase?({'Ausholen / Vorbereitung':'#55aaff','Beschleunigung':'#ffad32','Treffpunkt-Kandidat':'#ff4d4d','Ausschwung':'#45d483'}[phase.name]):'#c7f36b';
}
function poseAtTime(frames,time){
  if(!frames?.length)return null;
  let before=null,after=null;
  for(const frame of frames){if(!frame.pose)continue;if(frame.time<=time)before=frame;if(frame.time>=time){after=frame;break;}}
  if(before&&after&&before!==after&&after.time-before.time<=.4){
    const ratio=(time-before.time)/(after.time-before.time);
    return before.pose.map((p,i)=>({x:p.x+(after.pose[i].x-p.x)*ratio,y:p.y+(after.pose[i].y-p.y)*ratio,visibility:Math.min(p.visibility,after.pose[i].visibility)}));
  }
  const nearest=before||after;return nearest&&Math.abs(nearest.time-time)<=.22?nearest.pose:null;
}
function drawPlaybackPose(canvas,pose,color){
  const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;ctx.clearRect(0,0,w,h);if(!pose)return;
  ctx.lineWidth=Math.max(3,w/180);ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle=color;ctx.fillStyle='#fff';ctx.beginPath();
  for(const [a,b] of POSE_LINKS){const p=pose[a],q=pose[b];if(!p||!q||p.visibility<.35||q.visibility<.35)continue;ctx.moveTo(p.x*w,p.y*h);ctx.lineTo(q.x*w,q.y*h);}ctx.stroke();
  for(const p of pose){if(!p||p.visibility<.35)continue;ctx.beginPath();ctx.arc(p.x*w,p.y*h,Math.max(2,w/150),0,Math.PI*2);ctx.fill();}
}
function setupSkeletonPlayback(r,v){
  const player=$('skeletonPlayer'),stage=$('skeletonStage'),video=$('skeletonVideo'),canvas=$('skeletonCanvas'),label=$('skeletonPhaseLabel');
  if(!player||!stage||!video||!canvas||!v?.blob)return;
  clearSkeletonPlayback();analysisPlaybackUrl=URL.createObjectURL(v.blob);video.src=analysisPlaybackUrl;
  const playBtn=$('skeletonPlay'),seek=$('skeletonSeek'),timeLabel=$('skeletonTime'),speedButtons=[...player.querySelectorAll('[data-speed]')],expand=$('skeletonExpand'),close=$('skeletonClose');
  const fmt=t=>Math.floor(t/60)+':'+String(Math.floor(t%60)).padStart(2,'0');
  const resize=()=>{
    if(!video.videoWidth)return;
    if(player.classList.contains('is-expanded')){
      const ratio=video.videoWidth/video.videoHeight,availableW=window.innerWidth,availableH=window.innerHeight-64;
      const w=Math.min(availableW,availableH*ratio),h=w/ratio;
      stage.style.width=w+'px';stage.style.height=h+'px';stage.style.flex='0 0 auto';
    }else{stage.style.width='100%';stage.style.height='auto';stage.style.flex='';}
    const dpr=Math.min(2,window.devicePixelRatio||1),w=stage.clientWidth,h=stage.clientHeight;
    canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);canvas.style.width=w+'px';canvas.style.height=h+'px';
  };
  const render=()=>{
    if(!video.videoWidth||!video.videoHeight)return;
    const dpr=Math.min(2,window.devicePixelRatio||1);if(canvas.width!==Math.round(stage.clientWidth*dpr)||canvas.height!==Math.round(stage.clientHeight*dpr))resize();
    const t=video.currentTime,phase=phaseAtTime(t,r.strokePhases?.phases);
    label.textContent=phase?.name||'Keine Phase zugeordnet';drawPlaybackPose(canvas,poseAtTime(r.frames,t),phaseColorAt(t,r.strokePhases?.phases));
    if(video.duration>0){seek.value=String(Math.round(t/video.duration*1000));timeLabel.textContent=fmt(t)+' / '+fmt(video.duration);}playBtn.textContent=video.paused?'▶':'Ⅱ';
  };
  const animate=()=>{render();if(!video.paused&&!video.ended)playbackFrame=requestAnimationFrame(animate);else playbackFrame=null;};
  video.addEventListener('loadedmetadata',()=>{stage.style.aspectRatio=video.videoWidth+'/'+video.videoHeight;resize();render();});
  video.addEventListener('loadeddata',render);video.addEventListener('timeupdate',render);video.addEventListener('seeked',render);
  video.addEventListener('play',()=>{if(playbackFrame===null)playbackFrame=requestAnimationFrame(animate);});
  video.addEventListener('pause',()=>{if(playbackFrame!==null){cancelAnimationFrame(playbackFrame);playbackFrame=null;}render();});
  video.addEventListener('ended',()=>{if(playbackFrame!==null){cancelAnimationFrame(playbackFrame);playbackFrame=null;}render();});
  playBtn.onclick=()=>video.paused?video.play():video.pause();
  seek.oninput=()=>{if(video.duration)video.currentTime=Number(seek.value)/1000*video.duration;};
  const setSpeed=rate=>{const value=Number(rate);video.defaultPlaybackRate=value;video.playbackRate=value;speedButtons.forEach(button=>{const active=Number(button.dataset.speed)===value;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});};
  speedButtons.forEach(button=>button.addEventListener('click',()=>setSpeed(button.dataset.speed)));
  setSpeed(1);
  expand.onclick=()=>{player.classList.add('is-expanded');close.hidden=false;expand.hidden=true;resize();render();};
  close.onclick=()=>{player.classList.remove('is-expanded');close.hidden=true;expand.hidden=false;resize();render();};
  window.addEventListener('resize',resize);video.load();
}

function renderAnalysisResult(r,v){
  const angleLabel=r.angle==='side'?'Seitlich':r.angle==='front'?'Von vorne':'Nicht angegeben';
  const side=(label,s)=>'<div class="metric-row"><span>'+label+'</span><b>'+formatStats(s)+'</b></div>';
  const phases=(r.phases||[]).map(p=>'<div class="phase"><b>'+p.name+'</b><small>Linker Ellenbogen: '+(p.leftElbow?.avg!=null?p.leftElbow.avg+'°':'—')+' · Rechter Ellenbogen: '+(p.rightElbow?.avg!=null?p.rightElbow.avg+'°':'—')+'</small><small>Linkes Knie: '+(p.leftKnee?.avg!=null?p.leftKnee.avg+'°':'—')+' · Rechtes Knie: '+(p.rightKnee?.avg!=null?p.rightKnee.avg+'°':'—')+'</small></div>').join('');
  const coverageText=r.coverage>=80?'Die Körperpose wurde in einem großen Teil der Stichproben erkannt.':r.coverage>=50?'Die Erkennung war wechselhaft. Einzelne Messwerte können fehlen.':'Die Erkennung war zu unsicher für eine verlässliche Bewegungsbeobachtung.';
  const stroke=r.strokePhases;
  const strokeMarkup=stroke?.phases?.length?'<div class="stroke-phase-list">'+stroke.phases.map(p=>'<div class="stroke-phase"><b>'+esc(p.name)+'</b><small>'+p.start.toFixed(2)+'–'+p.end.toFixed(2)+' s</small></div>').join('')+'</div>':'<p class="tiny">'+esc(stroke?.reason||'Keine zuverlässige Phasenschätzung möglich.')+'</p>';
  const sideLabel=stroke?.side==='left'?'die linke Seite (größere erkannte Handgelenkbewegung)':stroke?.side==='right'?'die rechte Seite (größere erkannte Handgelenkbewegung)':'keine Seite';
  const tips=[];if(r.coverage<80)tips.push('Filme bei gutem Licht und halte Kopf, Füße und beide Arme während des gesamten Schlages im Bild.');if(r.angle==='unknown')tips.push('Wähle beim nächsten Video die Kameraperspektive aus.');tips.push('Nutze möglichst dieselbe Kameraposition und denselben Abstand, wenn du Fortschritte vergleichen möchtest.');
  $('analysisResult').innerHTML='<article class="entry"><div class="entry-top"><b>Vorhand · '+dateText(v.date)+'</b><span class="pill">'+r.coverage+'% Pose-Erkennung</span></div><small>Perspektive: '+angleLabel+' · '+r.detected+'/'+r.sampled+' analysierte Bilder</small>'+(r.frames?.some(f=>f.pose)?'<h3>Video mit animiertem Skelett</h3><p class="tiny">Das Skelett folgt den erkannten Gelenkpunkten. Die Zwischenpositionen werden zwischen den analysierten Bildern interpoliert.</p><div class="skeleton-player" id="skeletonPlayer"><div class="skeleton-stage" id="skeletonStage"><video id="skeletonVideo" playsinline preload="metadata"></video><canvas id="skeletonCanvas" aria-hidden="true"></canvas></div><div class="skeleton-controls"><button type="button" id="skeletonPlay" aria-label="Abspielen oder pausieren">▶</button><input id="skeletonSeek" type="range" min="0" max="1000" value="0" aria-label="Video-Position"><span id="skeletonTime">0:00</span><button type="button" id="skeletonExpand">⛶ Vollbild</button><button type="button" id="skeletonClose" hidden>Schließen</button></div><div class="skeleton-speed-row"><span class="skeleton-speed-label">Geschwindigkeit</span><div class="skeleton-speed-buttons" role="group" aria-label="Wiedergabegeschwindigkeit"><button type="button" data-speed="0.5" aria-pressed="false">0,5×</button><button type="button" data-speed="0.75" aria-pressed="false">0,75×</button><button type="button" data-speed="1" aria-pressed="true" class="active">1×</button><button type="button" data-speed="1.25" aria-pressed="false">1,25×</button><button type="button" data-speed="1.5" aria-pressed="false">1,5×</button><button type="button" data-speed="2" aria-pressed="false">2×</button></div></div></div><div id="skeletonPhaseLabel" class="skeleton-phase-label">Video wird vorbereitet …</div><div class="skeleton-legend"><span><i style="background:#55aaff"></i>Ausholen</span><span><i style="background:#ffad32"></i>Beschleunigung</span><span><i style="background:#ff4d4d"></i>Treffpunkt-Kandidat</span><span><i style="background:#45d483"></i>Ausschwung</span></div>':(r.preview?'<img alt="Erkanntes Körperskelett" src="'+r.preview+'" style="width:100%;border-radius:10px;margin-top:10px;background:#111">':'<p class="tiny">Für diese Analyse sind noch keine Gelenkpunkte gespeichert. Bitte das Video erneut analysieren.</p>'))+'<h3>Automatische Schlagphasen (experimentell)</h3><p class="tiny">Konservative Schätzung aus der Handgelenkbewegung relativ zur Schulter. „Ausholen“ wird nur bei einem erkennbaren maximalen Abstand vor der Beschleunigung angezeigt. Ausgewertet wird '+sideLabel+'. Der Treffpunkt ist nur ein Kandidaten-Zeitfenster, kein nachgewiesener Ballkontakt.</p>'+strokeMarkup+'<p class="tiny">'+(stroke?.status==='estimated'?'Bewegungsmuster ausreichend deutlich für eine erste Schätzung.':(stroke?.reason||'Die Phasenschätzung ist unsicher und sollte im Video überprüft werden.'))+'</p><h3>Winkelverlauf über die gesamte Aufnahme</h3><p class="tiny">Die Kurven zeigen die erkannten Winkel Bild für Bild. Lücken bedeuten, dass ein Gelenk in diesem Einzelbild nicht sicher erkannt wurde.</p>'+(r.frames?.length?angleChart(r.frames,[{key:'leftElbow',label:'Links',side:'left'},{key:'rightElbow',label:'Rechts',side:'right'}],'Ellenbogen'): '<p class="tiny">Keine Winkelmesswerte vorhanden.</p>')+(r.frames?.length?angleChart(r.frames,[{key:'leftKnee',label:'Links',side:'left'},{key:'rightKnee',label:'Rechts',side:'right'}],'Knie'):'')+'<h3>Anfang, Mitte und Ende</h3>'+(phases||'<p class="tiny">Zu wenige Messwerte für den Zeitverlauf.</p>')+'<h3>Winkelübersicht</h3>'+side('Ellenbogen links',r.elbowLeft)+side('Ellenbogen rechts',r.elbowRight)+side('Knie links',r.kneeLeft)+side('Knie rechts',r.kneeRight)+'<h3>Einordnung</h3><p>'+coverageText+'</p><h3>Für die nächste Aufnahme</h3><ul>'+tips.map(t=>'<li>'+esc(t)+'</li>').join('')+'</ul><p class="tiny">Noch nicht erkannt werden Schläger, Ball, Treffpunkt, Schlagrichtung oder 3D-Rotation. Deshalb gibt es bewusst keine Techniknote und keine Aussage, ob die Bewegung technisch richtig ist.</p></article>';
  setupSkeletonPlayback(r,v);
}

$('saveMatch').addEventListener('click',async()=>{await add('matches',{date:$('matchDate').value||today(),opponent:$('opponent').value.trim(),result:$('matchResult').value,score:$('matchScore').value.trim(),surface:$('matchSurface').value,good:$('matchGood').value,improve:$('matchImprove').value,mood:Number($('matchMood').value),created:Date.now()});['opponent','matchScore','matchGood','matchImprove'].forEach(id=>$(id).value='');setStatus('matchStatus','Match wurde lokal gespeichert.');renderMatches();renderHome()});
$('matchMood').addEventListener('input',()=>$('moodValue').textContent=$('matchMood').value+' / 5');
async function renderMatches(){const items=(await all('matches')).sort((a,b)=>b.created-a.created);const el=$('matchList');el.className='stack'+(items.length?'':' empty');if(!items.length){el.textContent='Noch keine Matches eingetragen.';return;}el.innerHTML='';for(const m of items){const d=document.createElement('article');d.className='entry';d.innerHTML=`<div class="entry-top"><div><b>${esc(m.opponent||'Gegner nicht angegeben')}</b><small>${dateText(m.date)} · ${esc(m.surface)}</small></div><span class="pill">${esc(m.result)} · ${esc(m.score||'ohne Spielstand')}</span></div>${m.good?`<p><b>Gut:</b> ${esc(m.good)}</p>`:''}${m.improve?`<p><b>Verbessern:</b> ${esc(m.improve)}</p>`:''}<small>Mentale Stärke: ${m.mood}/5</small><div class="entry-actions"><button class="remove">Eintrag löschen</button></div>`;d.querySelector('button').onclick=async()=>{if(confirm('Match-Eintrag löschen?')){await del('matches',m.id);renderMatches();renderHome()}};el.append(d)}}
$('saveTraining').addEventListener('click',async()=>{await add('trainings',{date:$('trainDate').value||today(),focus:$('trainFocus').value,minutes:Number($('trainMinutes').value)||0,feeling:Number($('trainFeeling').value),notes:$('trainNotes').value,created:Date.now()});$('trainNotes').value='';setStatus('trainStatus','Trainingseinheit lokal gespeichert.');renderTrainings();renderHome()});
async function renderTrainings(){const items=(await all('trainings')).sort((a,b)=>b.created-a.created);const el=$('trainingList');el.className='stack'+(items.length?'':' empty');if(!items.length){el.textContent='Noch keine Trainingseinheiten gespeichert.';return;}el.innerHTML='';for(const t of items){const d=document.createElement('article');d.className='entry';d.innerHTML=`<div class="entry-top"><div><b>${esc(t.focus)}</b><small>${dateText(t.date)} · ${t.minutes} Minuten</small></div><span class="pill">Gefühl ${t.feeling}/5</span></div>${t.notes?`<p>${esc(t.notes)}</p>`:''}<div class="entry-actions"><button class="remove">Eintrag löschen</button></div>`;d.querySelector('button').onclick=async()=>{if(confirm('Trainingseinheit löschen?')){await del('trainings',t.id);renderTrainings();renderHome()}};el.append(d)}}
async function loadProfile(){const p=await get('settings','profile');if(p){$('playerName').value=p.name||'';$('playerAge').value=p.age||'';$('playerLevel').value=p.level||'Turnierspieler';$('playerGoal').value=p.goal||''}}
$('saveProfile').addEventListener('click',async()=>{await put('settings',{key:'profile',name:$('playerName').value.trim(),age:$('playerAge').value,level:$('playerLevel').value,goal:$('playerGoal').value});setStatus('profileStatus','Profil ist lokal auf diesem iPhone gespeichert.');renderHome()});
async function renderHome(){const [vs,ms,ts]=await Promise.all([all('videos'),all('matches'),all('trainings')]);const scores={};for(const v of vs){if(!scores[v.shot])scores[v.shot]=v.shot==='Vorhand'?'–':v.shot==='Rückhand'?'–':'–'}$('score-forehand').textContent='–';$('score-backhand').textContent='–';$('score-serve').textContent='–';const recent=[...ms.map(x=>({kind:'Match',title:(x.opponent||'Match')+' · '+x.result,date:x.date,created:x.created})),...ts.map(x=>({kind:'Training',title:x.focus,date:x.date,created:x.created})),...vs.map(x=>({kind:'Video',title:x.shot,date:x.date,created:x.created}))].sort((a,b)=>b.created-a.created).slice(0,5);const el=$('recent');if(!recent.length){el.className='empty';el.textContent='Noch keine Einträge. Speichere dein erstes Video oder Match.'}else{el.className='stack';el.innerHTML=recent.map(x=>`<div class="entry"><div class="entry-top"><div><b>${esc(x.title)}</b><small>${x.kind} · ${dateText(x.date)}</small></div></div></div>`).join('')}}
async function exportAll(){const [videos,matches,trainings,profile,analyses]=await Promise.all([all('videos'),all('matches'),all('trainings'),get('settings','profile'),all('analyses')]);const payload={app:'ACE Tennis AI',version:1,exportedAt:new Date().toISOString(),matches,trainings,profile:profile||null,analyses,videos:await Promise.all(videos.map(async v=>({...v,blobData:await blobToDataURL(v.blob),blob:undefined})))};const blob=new Blob([JSON.stringify(payload)],{type:'application/json'});downloadBlob(blob,'ace-tennis-ai-sicherung-'+today()+'.json');setStatus('backupStatus','Sicherung erstellt. Bitte in der Dateien-App sicher ablegen.')}
function blobToDataURL(blob){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(blob)})}
function dataURLToBlob(data){const [meta,b64]=data.split(',');const mime=(meta.match(/:(.*?);/)||[])[1]||'application/octet-stream';const bin=atob(b64),arr=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)arr[i]=bin.charCodeAt(i);return new Blob([arr],{type:mime})}
function downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000)}
$('exportData').onclick=exportAll;
$('importData').onclick=async()=>{const f=$('importFile').files?.[0];if(!f){setStatus('backupStatus','Bitte zuerst eine Sicherungsdatei auswählen.');return;}try{const data=JSON.parse(await f.text());if(data.app!=='ACE Tennis AI'||data.version!==1)throw Error('Ungültiges Format');for(const m of data.matches||[])await add('matches',m);for(const t of data.trainings||[])await add('trainings',t);for(const a of data.analyses||[])await add('analyses',a);for(const v of data.videos||[]){const {blobData,...rest}=v;await add('videos',{...rest,blob:dataURLToBlob(blobData)})}if(data.profile)await put('settings',data.profile);await loadProfile();await renderHome();setStatus('backupStatus','Sicherung wurde importiert. Bereits vorhandene Einträge wurden nicht überschrieben.')}catch(e){setStatus('backupStatus','Import fehlgeschlagen: Sicherungsdatei nicht lesbar.')}};
$('deleteAll').onclick=async()=>{if(!confirm('Wirklich ALLE Videos, Matches, Trainingseinheiten und Profildaten von ACE Tennis AI löschen?'))return;for(const s of ['videos','matches','trainings','settings','analyses'])await new Promise((res,rej)=>{const r=db.transaction(s,'readwrite').objectStore(s).clear();r.onsuccess=res;r.onerror=()=>rej(r.error)});await renderHome();await renderVideos();await renderMatches();await renderTrainings();await loadProfile();setStatus('backupStatus','Alle lokalen App-Daten wurden gelöscht.')};
async function storageInfo(){try{if(navigator.storage?.estimate){const e=await navigator.storage.estimate();$('storageStatus').textContent=`${((e.usage||0)/1048576).toFixed(1)} MB belegt`;if(navigator.storage.persist){const p=await navigator.storage.persisted();if(!p)$('storageStatus').textContent+=' · Browser-Speicher nicht garantiert dauerhaft'}}else $('storageStatus').textContent='Nicht verfügbar'}catch{$('storageStatus').textContent='Nicht verfügbar'}}
(async()=>{try{db=await openDB();await loadProfile();await Promise.all([renderHome(),renderVideos(),renderMatches(),renderTrainings(),storageInfo()]);}catch(e){alert('Lokaler Speicher konnte nicht geöffnet werden. Bitte die App über Safari/HTTPS starten.')}})();
if('serviceWorker'in navigator&&location.protocol!=='file:')addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
