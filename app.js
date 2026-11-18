/* ACE Tennis AI – lokale Datenbank. Keine Netzwerk- oder Analyse-API-Aufrufe. */
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
let poseTaskPromise=null, analysisBusy=false;
const MP_MODEL='./vendor/mediapipe/pose_landmarker_lite.task';
async function getPoseTask(){
  if(!poseTaskPromise)poseTaskPromise=(async()=>{
    setStatus('analysisStatus','Bewegungsmodell wird geladen. Beim ersten Mal ist eine Internetverbindung nötig …');
    const {FilesetResolver,PoseLandmarker}=await import('./vendor/mediapipe/vision_bundle.mjs');
    const vision=await FilesetResolver.forVisionTasks('./vendor/mediapipe/wasm');
    return await PoseLandmarker.createFromOptions(vision,{baseOptions:{modelAssetPath:MP_MODEL,delegate:'GPU'},runningMode:'VIDEO',numPoses:1,minPoseDetectionConfidence:.45,minPosePresenceConfidence:.45,minTrackingConfidence:.45});
  })().catch(e=>{poseTaskPromise=null;throw e});
  return poseTaskPromise;
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
async function startForehandAnalysis(videoId){
  if(analysisBusy)return;analysisBusy=true;const status=$('analysisStatus'),out=$('analysisResult');out.innerHTML='';
  let videoEl,objectUrl;
  try{
    const item=await get('videos',videoId);if(!item)throw Error('Video nicht gefunden');
    if(item.shot!=='Vorhand')throw Error('Bitte ein Vorhandvideo auswählen.');
    status.textContent='Video wird lokal vorbereitet …';
    objectUrl=URL.createObjectURL(item.blob);videoEl=document.createElement('video');videoEl.src=objectUrl;videoEl.muted=true;videoEl.playsInline=true;videoEl.preload='auto';
    await new Promise((resolve,reject)=>{videoEl.onloadedmetadata=resolve;videoEl.onerror=()=>reject(Error('Videoformat kann nicht gelesen werden.'));});
    if(!Number.isFinite(videoEl.duration)||videoEl.duration<=0)throw Error('Videolänge konnte nicht ermittelt werden.');
    const task=await getPoseTask();
    const duration=videoEl.duration,count=Math.min(48,Math.max(12,Math.ceil(duration*4)));
    const times=Array.from({length:count},(_,i)=>Math.min(Math.max(0.05,duration-0.05),0.05+(Math.max(0,duration-0.1)*i/Math.max(1,count-1))));
    const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
    const frames=[],elbowL=[],elbowR=[],kneeL=[],kneeR=[],phaseFrames=[[],[],[]];let detected=0,preview=null;
    for(let i=0;i<times.length;i++){
      status.textContent='Vorhand wird untersucht: Bild '+(i+1)+' von '+times.length+' …';
      const seeked=waitEvent(videoEl,'seeked');videoEl.currentTime=times[i];await seeked;
      const scale=Math.min(1,640/(videoEl.videoWidth||640));canvas.width=Math.round((videoEl.videoWidth||640)*scale);canvas.height=Math.round((videoEl.videoHeight||360)*scale);ctx.drawImage(videoEl,0,0,canvas.width,canvas.height);
      const res=task.detectForVideo(canvas,Math.round(times[i]*1000)+i),lm=res.landmarks?.[0];if(!lm)continue;detected++;
      const visible=lm.filter(p=>(p.visibility??1)>.4).length;
      const frame={time:times[i],visible,leftElbow:null,rightElbow:null,leftKnee:null,rightKnee:null};
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
    const result={videoId,created:Date.now(),angle:item.angle||'unknown',sampled:times.length,detected,coverage,elbowAverage:seriesStats([...elbowL,...elbowR])?.avg??null,kneeAverage:seriesStats([...kneeL,...kneeR])?.avg??null,elbowLeft:seriesStats(elbowL),elbowRight:seriesStats(elbowR),kneeLeft:seriesStats(kneeL),kneeRight:seriesStats(kneeR),phases,preview,frames};
    await add('analyses',result);
    status.textContent='Analyse abgeschlossen · '+detected+' von '+times.length+' Bildern mit erkennbarer Körperpose. Ergebnis lokal gespeichert.';
    renderAnalysisResult(result,item);
  }catch(e){status.textContent='Analyse nicht möglich: '+(e.message||'Unbekannter Fehler')+'. Bitte ein gut beleuchtetes Video mit vollständig sichtbarem Körper verwenden.'}
  finally{if(objectUrl)URL.revokeObjectURL(objectUrl);analysisBusy=false}
}
function renderAnalysisResult(r,v){
  const angleLabel=r.angle==='side'?'Seitlich':r.angle==='front'?'Von vorne':'Nicht angegeben';
  const side=(label,s)=>'<div class="metric-row"><span>'+label+'</span><b>'+formatStats(s)+'</b></div>';
  const phases=(r.phases||[]).map(p=>'<div class="phase"><b>'+p.name+'</b><small>Linker Ellenbogen: '+(p.leftElbow?.avg!=null?p.leftElbow.avg+'°':'—')+' · Rechter Ellenbogen: '+(p.rightElbow?.avg!=null?p.rightElbow.avg+'°':'—')+'</small><small>Linkes Knie: '+(p.leftKnee?.avg!=null?p.leftKnee.avg+'°':'—')+' · Rechtes Knie: '+(p.rightKnee?.avg!=null?p.rightKnee.avg+'°':'—')+'</small></div>').join('');
  const coverageText=r.coverage>=80?'Die Körperpose wurde in einem großen Teil der Stichproben erkannt.':r.coverage>=50?'Die Erkennung war wechselhaft. Einzelne Messwerte können fehlen.':'Die Erkennung war zu unsicher für eine verlässliche Bewegungsbeobachtung.';
  const tips=[];if(r.coverage<80)tips.push('Filme bei gutem Licht und halte Kopf, Füße und beide Arme während des gesamten Schlages im Bild.');if(r.angle==='unknown')tips.push('Wähle beim nächsten Video die Kameraperspektive aus.');tips.push('Nutze möglichst dieselbe Kameraposition und denselben Abstand, wenn du Fortschritte vergleichen möchtest.');
  $('analysisResult').innerHTML='<article class="entry"><div class="entry-top"><b>Vorhand · '+dateText(v.date)+'</b><span class="pill">'+r.coverage+'% Pose-Erkennung</span></div><small>Perspektive: '+angleLabel+' · '+r.detected+'/'+r.sampled+' analysierte Bilder</small>'+(r.preview?'<img alt="Erkanntes Körperskelett" src="'+r.preview+'" style="width:100%;border-radius:10px;margin-top:10px;background:#111">':'')+'<h3>Bewegungsverlauf</h3><p class="tiny">Die Aufnahme ist in drei gleich lange Zeitabschnitte unterteilt. So lässt sich sehen, wie sich erkannte Gelenkwinkel im Video verändern. Das sind Messwerte, keine Bewertung der Schlagtechnik.</p>'+(phases||'<p class="tiny">Zu wenige Messwerte für den Zeitverlauf.</p>')+'<h3>Winkelübersicht</h3>'+side('Ellenbogen links',r.elbowLeft)+side('Ellenbogen rechts',r.elbowRight)+side('Knie links',r.kneeLeft)+side('Knie rechts',r.kneeRight)+'<h3>Einordnung</h3><p>'+coverageText+'</p><h3>Für die nächste Aufnahme</h3><ul>'+tips.map(t=>'<li>'+esc(t)+'</li>').join('')+'</ul><p class="tiny">Noch nicht erkannt werden Schläger, Ball, Treffpunkt, Schlagrichtung oder 3D-Rotation. Deshalb gibt es bewusst keine Techniknote und keine Aussage, ob die Bewegung technisch richtig ist.</p></article>';
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
