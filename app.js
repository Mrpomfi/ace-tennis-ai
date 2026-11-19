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
const RACKET_CLASS_NAMES={0:'Tennisschläger',1:'Tennisball',2:'untere Auszone',3:'Spielfeld',4:'linke Doppelauslinie',5:'linkes Aufschlagfeld',6:'Netz',7:'rechte Doppelauslinie',8:'rechtes Aufschlagfeld',9:'obere Auszone'};
const MP_MODEL='./vendor/mediapipe/pose_landmarker_lite.task';
async function getPoseTask(){
  setStatus('analysisStatus','Bewegungsmodell wird vorbereitet …');
  const {FilesetResolver,PoseLandmarker,ObjectDetector}=await import('./vendor/mediapipe/vision_bundle.mjs');
  const vision=await FilesetResolver.forVisionTasks('./vendor/mediapipe/wasm');
  // Jede Videoanalyse erhält eine frische Instanz. So kann der VIDEO-Tracker
  // keine Landmarken aus einer vorherigen Aufnahme in das nächste Video tragen.
  return await PoseLandmarker.createFromOptions(vision,{baseOptions:{modelAssetPath:MP_MODEL,delegate:'GPU'},runningMode:'VIDEO',numPoses:1,minPoseDetectionConfidence:.45,minPosePresenceConfidence:.45,minTrackingConfidence:.45});
}
const RACKET_MODEL_URL='./models/courtside-yolov11n.onnx';
let ortLoadingPromise=null;
async function loadOnnxRuntime(){
  let ort=window.ort;
  if(!ort?.InferenceSession){
    if(!ortLoadingPromise){
      ortLoadingPromise=new Promise((resolve,reject)=>{
        const script=document.createElement('script');
        script.src='./vendor/onnxruntime-web/ort.wasm.min.js';
        script.onload=()=>window.ort?.InferenceSession?resolve(window.ort):reject(Error('ONNX Runtime Web konnte nicht gestartet werden.'));
        script.onerror=()=>reject(Error('ONNX Runtime Web konnte nicht geladen werden.'));
        document.head.appendChild(script);
      }).catch(error=>{ortLoadingPromise=null;throw error;});
    }
    ort=await ortLoadingPromise;
  }
  // GitHub Pages may serve .mjs with a MIME type Safari rejects for dynamic module imports.
  // Serve the identical ONNX Runtime module through a .js URL instead.
  ort.env.wasm.wasmPaths={mjs:new URL('./vendor/onnxruntime-web/ort-wasm-simd-threaded.js',document.baseURI).href,wasm:new URL('./vendor/onnxruntime-web/ort-wasm-simd-threaded.wasm',document.baseURI).href};
  ort.env.wasm.numThreads=1;
  return ort;
}
async function getRacketTask(){
  setStatus('analysisStatus','Tennis-Schläger-Modell wird vorbereitet …');
  const ort=await loadOnnxRuntime();
  setStatus('analysisStatus','Tennis-Schläger-Modell wird geladen (ca. 11 MB, beim ersten Mal) …');
  const response=await fetch(RACKET_MODEL_URL);
  if(!response.ok)throw Error('Tennis-Schläger-Modell konnte nicht geladen werden ('+response.status+').');
  const modelBytes=await response.arrayBuffer();
  const moduleUrl=new URL('./vendor/onnxruntime-web/ort-wasm-simd-threaded.js',document.baseURI);
  const moduleResponse=await fetch(moduleUrl,{cache:'no-store'});
  const moduleType=moduleResponse.headers.get('content-type')||'unbekannt';
  if(!moduleResponse.ok)throw Error('WASM-JS-Modul nicht erreichbar: HTTP '+moduleResponse.status+' · '+moduleUrl.href);
  if(!/(javascript|ecmascript)/i.test(moduleType))throw Error('WASM-JS-Modul hat falschen MIME-Typ: '+moduleType+' · '+moduleUrl.href);
  const wasmUrl=new URL('./vendor/onnxruntime-web/ort-wasm-simd-threaded.wasm',document.baseURI);
  const wasmHead=await fetch(wasmUrl,{method:'HEAD',cache:'no-store'});
  const wasmType=wasmHead.headers.get('content-type')||'unbekannt';
  if(!wasmHead.ok)throw Error('WASM-Binärdatei nicht erreichbar: HTTP '+wasmHead.status+' · '+wasmUrl.href);
  if(wasmType==='text/html')throw Error('WASM-Binärdatei liefert HTML statt WASM · '+wasmUrl.href);
  let session;
  try{session=await ort.InferenceSession.create(modelBytes,{executionProviders:['wasm'],graphOptimizationLevel:'all'});}
  catch(error){throw Error('ONNX-Initialisierung fehlgeschlagen. Modul: HTTP '+moduleResponse.status+', MIME '+moduleType+'. WASM: HTTP '+wasmHead.status+', MIME '+wasmType+'. Ursache: '+String(error?.stack||error?.message||error));}
  const inputName=session.inputNames[0],outputName=session.outputNames[0];
  const inputCanvas=document.createElement('canvas');
  inputCanvas.width=640;inputCanvas.height=640;
  const inputContext=inputCanvas.getContext('2d',{willReadFrequently:true});
  const inputData=new Float32Array(3*640*640);
  return {
    async detect(canvas){
      const scale=Math.min(640/canvas.width,640/canvas.height);
      const scaledWidth=Math.round(canvas.width*scale),scaledHeight=Math.round(canvas.height*scale);
      const offsetX=(640-scaledWidth)/2,offsetY=(640-scaledHeight)/2;
      inputContext.fillStyle='rgb(114,114,114)';
      inputContext.fillRect(0,0,640,640);
      inputContext.drawImage(canvas,offsetX,offsetY,scaledWidth,scaledHeight);
      const pixels=inputContext.getImageData(0,0,640,640).data;
      const plane=640*640;
      for(let i=0;i<plane;i++){
        const p=i*4;
        inputData[i]=pixels[p]/255;
        inputData[i+plane]=pixels[p+1]/255;
        inputData[i+plane*2]=pixels[p+2]/255;
      }
      const tensor=new ort.Tensor('float32',inputData,[1,3,640,640]);
      const outputs=await session.run({[inputName]:tensor});
      const output=outputs[outputName],values=output.data,dims=output.dims||[];
      let best=null;
      const rank=dims.length,shape=dims.slice(-2);
      const candidates=[],debugCandidates=[];
      const diag={outputShape:dims.join(' × '),format:'unbekannt',maxRacketScore:0,maxOtherScore:0,maxAnyScore:0,validRows:0,paddedRows:0,classCounts:{},topRows:[],above01:0,above05:0,above15:0,rawCandidates:0};
      const mapBox=(x1,y1,x2,y2,score,classId)=>{
        if(!Number.isFinite(score)||![x1,y1,x2,y2].every(Number.isFinite))return null;
        const x=Math.max(0,Math.min(canvas.width,(x1-offsetX)/scale));
        const y=Math.max(0,Math.min(canvas.height,(y1-offsetY)/scale));
        const right=Math.max(0,Math.min(canvas.width,(x2-offsetX)/scale));
        const bottom=Math.max(0,Math.min(canvas.height,(y2-offsetY)/scale));
        if(right<=x||bottom<=y)return null;
        return {x:x/canvas.width,y:y/canvas.height,w:(right-x)/canvas.width,h:(bottom-y)/canvas.height,score,classId,className:RACKET_CLASS_NAMES[classId]||('Klasse '+classId)};
      };
      const addDebugBox=(x1,y1,x2,y2,score,classId)=>{
        if(score<(classId===0?.01:.05))return;
        const box=mapBox(x1,y1,x2,y2,score,classId);
        if(box)debugCandidates.push(box);
      };
      const addBox=(x1,y1,x2,y2,score)=>{
        if(!Number.isFinite(score))return;
        diag.rawCandidates++;
        diag.maxRacketScore=Math.max(diag.maxRacketScore,score);
        if(score>=.01)diag.above01++;
        if(score>=.05)diag.above05++;
        if(score>=.15)diag.above15++;
        // Das Modell erkennt den echten Schläger in den Testframes oft nur mit 1–5 %.
        // Niedrige Scores werden aufgenommen; die anschließende Hand-/Arm-Geometrie
        // filtert räumlich unplausible Treffer (z. B. Spielzeug am unteren Bildrand).
        // Etwas niedrigere Rohschwelle: die räumliche Prüfung entscheidet
        // anschließend, ob der Treffer tatsächlich zum Schlägerkopf passt.
        if(score<.005)return;
        const box=mapBox(x1,y1,x2,y2,score,0);
        if(box)candidates.push(box);
      };
      if(rank===3&&shape[1]===6){
        diag.format='NMS [1, detections, 6]';
        // Ultralytics export with NMS: [1, detections, x1/y1/x2/y2/conf/class].
        const count=shape[0];
        for(let i=0;i<count;i++){
          const j=i*6,score=Number(values[j+4]),classValue=Number(values[j+5]),classId=Math.round(classValue);
          const x1=Number(values[j]),y1=Number(values[j+1]),x2=Number(values[j+2]),y2=Number(values[j+3]);
          diag.maxAnyScore=Math.max(diag.maxAnyScore,Number.isFinite(score)?score:0);
          // Ultralytics pads unused NMS slots with six zeroes. They are not class-0 detections.
          if(!(Number.isFinite(score)&&score>0&&x2>x1&&y2>y1)){diag.paddedRows++;continue;}
          diag.validRows++;
          const classKey=String(classId);diag.classCounts[classKey]=(diag.classCounts[classKey]||0)+1;
          diag.topRows.push({score,classId,x1,y1,x2,y2,boxCenterX:Number(((x1+x2)/2).toFixed(1)),boxCenterY:Number((y1+y2)/2).toFixed(1),boxWidth:Number((x2-x1).toFixed(1)),boxHeight:Number((y2-y1).toFixed(1))});
          addDebugBox(x1,y1,x2,y2,score,classId);
          if(classId!==0){diag.maxOtherScore=Math.max(diag.maxOtherScore,score);continue;}
          addBox(x1,y1,x2,y2,score);
        }
      }else if(rank===3&&shape[0]===6){
        diag.format='NMS [1, 6, detections]';
        // Same NMS output with transposed dimensions: [1, 6, detections].
        const count=shape[1];
        for(let i=0;i<count;i++){
          const score=values[4*count+i],classId=Math.round(values[5*count+i]);
          const x1=values[i],y1=values[count+i],x2=values[2*count+i],y2=values[3*count+i];
          addDebugBox(x1,y1,x2,y2,score,classId);
          if(classId===0)addBox(x1,y1,x2,y2,score);
          else if(Number.isFinite(score))diag.maxOtherScore=Math.max(diag.maxOtherScore,score);
        }
      }else if(rank===3&&shape[0]>=5&&shape[0]<=64){
        diag.format='YOLO raw [1, channels, candidates]';
        // Raw YOLO output [1, 4 + classes, candidates], with xywh and class scores.
        const channels=shape[0],count=shape[1];
        for(let i=0;i<count;i++){
          let classId=0,score=-Infinity;
          for(let c=4;c<channels;c++){const value=values[c*count+i];if(value>score){score=value;classId=c-4;}}
          if(classId===0&&Number.isFinite(score))diag.maxRacketScore=Math.max(diag.maxRacketScore,score);else if(Number.isFinite(score))diag.maxOtherScore=Math.max(diag.maxOtherScore,score);
          const cx=values[i],cy=values[count+i],bw=values[2*count+i],bh=values[3*count+i];
          addDebugBox(cx-bw/2,cy-bh/2,cx+bw/2,cy+bh/2,score,classId);
          if(classId===0)addBox(cx-bw/2,cy-bh/2,cx+bw/2,cy+bh/2,score);
        }
      }else if(rank===3&&shape[1]>=5&&shape[1]<=64){
        diag.format='YOLO raw [1, candidates, channels]';
        // Raw YOLO output [1, candidates, 4 + classes].
        const count=shape[0],channels=shape[1];
        for(let i=0;i<count;i++){
          const j=i*channels;
          let classId=0,score=-Infinity;
          for(let c=4;c<channels;c++){const value=values[j+c];if(value>score){score=value;classId=c-4;}}
          if(classId===0&&Number.isFinite(score))diag.maxRacketScore=Math.max(diag.maxRacketScore,score);else if(Number.isFinite(score))diag.maxOtherScore=Math.max(diag.maxOtherScore,score);
          const cx=values[j],cy=values[j+1],bw=values[j+2],bh=values[j+3];
          addDebugBox(cx-bw/2,cy-bh/2,cx+bw/2,cy+bh/2,score,classId);
          if(classId===0)addBox(cx-bw/2,cy-bh/2,cx+bw/2,cy+bh/2,score);
        }
      }else{
        console.warn('Unbekanntes Schläger-Modell-Ausgabeformat:',dims);
      }
      diag.topRows.sort((a,b)=>(Number(b.score)||0)-(Number(a.score)||0));diag.topRows=diag.topRows.slice(0,5);
      for(const candidate of candidates)if(!best||candidate.score>best.score)best=candidate;
      diag.maxRacketScore=Math.max(diag.maxRacketScore,best?.score||0);
      diag.error=diag.format==='unbekannt'?'Ausgabeformat nicht unterstützt':null;
      tensor.dispose?.();output?.dispose?.();
      return {box:best,candidates,debugCandidates,diagnostic:diag};
    },
    async close(){await session.release();}
  };
}
async function detectRacket(detector,canvas,landmarks){
  if(!detector)return {box:null,candidates:[],diagnostic:{error:'Modell nicht geladen'}};
  if(!landmarks)return {box:null,candidates:[],diagnostic:{error:'Körperpose nicht erkannt'}};
  const width=canvas.width,height=canvas.height;
  const fullFrame=await detector.detect(canvas);
  const fullCandidates=(fullFrame.candidates||[]).map(candidate=>({...candidate,source:'Ganzbild'}));
  const fullDebugCandidates=(fullFrame.debugCandidates||fullFrame.candidates||[]).map(candidate=>({...candidate,source:'Ganzbild'}));
  const fullDiagnostic={...(fullFrame.diagnostic||{}),source:'Ganzbild'};
  // Keep the full-frame result, but do not stop here: hand/forearm crops
  // can reveal a small or motion-blurred racket that the full-frame pass misses.
  const fullSelection=selectRacketCandidate(fullCandidates,landmarks,fullDiagnostic);
  const point=i=>landmarks[i]&&(landmarks[i].visibility??1)>.4?landmarks[i]:null;
  const torsoPoints=[point(11),point(12),point(23),point(24)].filter(Boolean);
  if(torsoPoints.length<4)return {box:null,candidates:fullCandidates,debugCandidates:fullDebugCandidates,diagnostic:{
    ...fullDiagnostic,inferenceModes:['Ganzbild'],cropInferenceCount:0,cropSides:[],
    errors:['Rumpf für Schläger-Suchfenster nicht sicher erkannt']
  }};
  const shoulder={x:(landmarks[11].x+landmarks[12].x)*.5*width,y:(landmarks[11].y+landmarks[12].y)*.5*height};
  const hip={x:(landmarks[23].x+landmarks[24].x)*.5*width,y:(landmarks[23].y+landmarks[24].y)*.5*height};
  const torso=Math.max(24,Math.hypot(shoulder.x-hip.x,shoulder.y-hip.y));
  const arms=[[13,15,'links'],[14,16,'rechts']].flatMap(([elbowId,wristId,side])=>{
    const elbow=point(elbowId),wrist=point(wristId);
    if(!elbow||!wrist)return [];
    const ex=elbow.x*width,ey=elbow.y*height,wx=wrist.x*width,wy=wrist.y*height;
    const dx=wx-ex,dy=wy-ey,length=Math.hypot(dx,dy);
    if(length<4)return [];
    // Multi-scale crops: a tight, upscaled hand/racket crop plus the wider
    // context crop. The original full-frame pass remains the first inference.
    // Keep the first crop close to the grip, then search farther along the
    // forearm axis so a racket head angled away from the hand remains visible.
    return [
      // Die bisherigen Ausschnitte lagen zu nahe am Griff. Der Schlägerkopf
      // befindet sich meist deutlich weiter außerhalb der Hand in Schlagrichtung.
      {factor:2.2,offset:.65},
      {factor:4.4,offset:1.05}
    ].map(({factor,offset})=>{
      const sideLength=torso*factor,cx=wx+dx/length*torso*offset,cy=wy+dy/length*torso*offset;
      const sx=Math.max(0,Math.min(width-sideLength,cx-sideLength/2));
      const sy=Math.max(0,Math.min(height-sideLength,cy-sideLength/2));
      const sw=Math.max(1,Math.min(sideLength,width-sx)),sh=Math.max(1,Math.min(sideLength,height-sy));
      return {side:side+'-'+factor.toFixed(1)+'x',sx,sy,sw,sh};
    });
  });
  if(!arms.length)return {box:null,candidates:fullCandidates,debugCandidates:fullDebugCandidates,diagnostic:{
    ...fullDiagnostic,inferenceModes:['Ganzbild'],cropInferenceCount:0,cropSides:[],
    errors:['Keine sichere Hand-/Unterarmposition für die lokale Suche']
  }};
  const candidates=[...fullCandidates],debugCandidates=[...fullDebugCandidates],diagnostics=[fullDiagnostic];
  for(const region of arms){
    const crop=document.createElement('canvas');
    crop.width=Math.max(1,Math.round(region.sw));crop.height=Math.max(1,Math.round(region.sh));
    const context=crop.getContext('2d',{willReadFrequently:true});
    context.drawImage(canvas,region.sx,region.sy,region.sw,region.sh,0,0,crop.width,crop.height);
    const result=await detector.detect(crop),diag=result.diagnostic||{};
    diagnostics.push({...diag,cropSide:region.side});
    for(const candidate of result.candidates||[]){
      candidates.push({
        ...candidate,
        x:(region.sx+candidate.x*region.sw)/width,
        y:(region.sy+candidate.y*region.sh)/height,
        w:candidate.w*region.sw/width,
        h:candidate.h*region.sh/height,
        cropSide:region.side,source:'Arm-Ausschnitt'
      });
    }
    for(const candidate of result.debugCandidates||result.candidates||[]){
      debugCandidates.push({...candidate,
        x:(region.sx+candidate.x*region.sw)/width,
        y:(region.sy+candidate.y*region.sh)/height,
        w:candidate.w*region.sw/width,
        h:candidate.h*region.sh/height,
        cropSide:region.side,source:'Arm-Ausschnitt'
      });
    }
  }
  const diagnostic={
    fullFrameSelection:!!fullSelection,
    outputShape:diagnostics.find(d=>d.outputShape)?.outputShape||'—',
    format:diagnostics.find(d=>d.format)?.format||'—',
    maxRacketScore:Math.max(0,...diagnostics.map(d=>d.maxRacketScore||0)),
    maxOtherScore:Math.max(0,...diagnostics.map(d=>d.maxOtherScore||0)),
    maxAnyScore:Math.max(0,...diagnostics.map(d=>d.maxAnyScore||0)),
    validRows:diagnostics.reduce((n,d)=>n+(d.validRows||0),0),
    paddedRows:diagnostics.reduce((n,d)=>n+(d.paddedRows||0),0),
    classCounts:diagnostics.reduce((acc,d)=>{for(const [k,v] of Object.entries(d.classCounts||{}))acc[k]=(acc[k]||0)+v;return acc;},{}),
    topRows:diagnostics.flatMap(d=>(d.topRows||[]).map(row=>({...row,cropSide:d.cropSide||null,source:d.source||'Arm-Ausschnitt'}))).sort((a,b)=>(b.score||0)-(a.score||0)).slice(0,5),
    above01:diagnostics.reduce((n,d)=>n+(d.above01||0),0),
    above05:diagnostics.reduce((n,d)=>n+(d.above05||0),0),
    above15:diagnostics.reduce((n,d)=>n+(d.above15||0),0),
    inferenceModes:['Ganzbild',...arms.map(a=>'Arm-'+a.side)],
    cropInferenceCount:arms.length,
    cropSides:arms.map(d=>d.side),
    errors:diagnostics.filter(d=>d.error).map(d=>d.error)
  };
  const best=candidates.reduce((chosen,candidate)=>!chosen||candidate.score>chosen.score?candidate:chosen,null);
  return {box:best,candidates,debugCandidates,diagnostic};
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
  const peakIndex=smooth.findIndex(x=>x?.i===peak.i);
  let motionStartIndex=peakIndex,belowThreshold=0;
  for(let i=peakIndex-1;i>=0;i--){
    if(smooth[i]&&smooth[i].speed>=threshold){motionStartIndex=i;belowThreshold=0;}
    else if(++belowThreshold>=2)break;
  }
  if(motionStartIndex<0||!smooth[motionStartIndex])return {status:'uncertain',side:best.side,phases:[],reason:'Keine zusammenhängende Beschleunigungsphase erkannt.'};
  const motionStartFrame=smooth[motionStartIndex].i;
  let reversal=null,reversalScore=0;
  for(let i=3;i<=peakPoint-3;i++){
    const before=points[i].p,after=points[i+3].p,origin=points[i-3].p;
    if(points[i].i-origin.i>5||points[i+3].i-points[i].i>5)continue;
    const bx=before.x-origin.x,by=before.y-origin.y,ax=after.x-before.x,ay=after.y-before.y;
    const beforeDistance=Math.hypot(bx,by),afterDistance=Math.hypot(ax,ay);
    if(beforeDistance<.08||afterDistance<.10)continue;
    const direction=(bx*ax+by*ay)/(beforeDistance*afterDistance);
    if(direction<-.25){
      const score=beforeDistance+afterDistance+(-direction)*.1;
      if(score>reversalScore){reversalScore=score;reversal=points[i];}
    }
  }
  let loadStart=null,clearLoad=false;
  if(reversal){
    const preparationPoints=points.filter(p=>p.i<=reversal.i);
    if(preparationPoints.length>=4){
      const baselinePoints=preparationPoints.slice(0,3);
      const baseline={x:baselinePoints.reduce((s,p)=>s+p.p.x,0)/baselinePoints.length,y:baselinePoints.reduce((s,p)=>s+p.p.y,0)/baselinePoints.length};
      const distance=p=>Math.hypot(p.p.x-baseline.x,p.p.y-baseline.y);
      const excursion=distance(reversal);
      let pathLength=0,previous=baseline;
      for(const p of preparationPoints){pathLength+=Math.hypot(p.p.x-previous.x,p.p.y-previous.y);previous=p.p;}
      const coherence=pathLength>0?excursion/pathLength:0;
      const onsetThreshold=Math.max(.035,excursion*.15);
      loadStart=preparationPoints.find(p=>distance(p)>=onsetThreshold)||null;
      clearLoad=excursion>=.10&&coherence>=.50&&!!loadStart&&reversal.i>=loadStart.i+2;
    }
  }
  let motionEnd=points[points.length-1].i;
  const afterPeak=smooth.filter(x=>x&&x.i>peak.i);
  for(let i=0;i<afterPeak.length-1;i++){if(afterPeak[i].speed<threshold&&afterPeak[i+1].speed<threshold){motionEnd=afterPeak[i+1].i;break;}}
  const sample=frames.length>1?(frames[frames.length-1].time-frames[0].time)/(frames.length-1):.1;
  const at=i=>frames[Math.max(0,Math.min(frames.length-1,i))]?.time??0;
  const phases=[];
  if(clearLoad)phases.push({name:'Ausholen / Vorbereitung',start:at(loadStart.i),end:at(reversal.i)});
  phases.push({name:'Beschleunigung',start:at(clearLoad?reversal.i:motionStartFrame),end:at(peak.i)});
  phases.push({name:'Treffpunkt-Kandidat',start:Math.max(0,peak.time-sample/2),end:peak.time+sample/2});
  if(motionEnd>peak.i+1)phases.push({name:'Ausschwung',start:at(Math.min(motionEnd,peak.i+1)),end:at(motionEnd)});
  const status=clearLoad&&motionEnd>peak.i+1?'estimated':'low-confidence';
  const reason=clearLoad?'Ausholen anhand einer klaren Richtungsumkehr vor der Beschleunigung erkannt.':'Keine ausreichend klare Ausholbewegung mit Richtungswechsel erkannt; die Phase wird nicht künstlich ergänzt.';
  return {status,side:best.side,peakTime:peak.time,peakSpeed:Number(peak.speed.toFixed(2)),phases,reason};
}
async function startForehandAnalysis(videoId){
  if(analysisBusy)return;analysisBusy=true;const status=$('analysisStatus'),out=$('analysisResult');clearSkeletonPlayback();out.innerHTML='';
  let videoEl,objectUrl,task,racketTask,vision,racketInitError=null;
  try{
    const item=await get('videos',videoId);if(!item)throw Error('Video nicht gefunden');
    if(item.shot!=='Vorhand')throw Error('Bitte ein Vorhandvideo auswählen.');
    status.textContent='Video wird lokal vorbereitet …';
    objectUrl=URL.createObjectURL(item.blob);videoEl=document.createElement('video');videoEl.src=objectUrl;videoEl.muted=true;videoEl.playsInline=true;videoEl.preload='auto';
    await new Promise((resolve,reject)=>{videoEl.onloadedmetadata=resolve;videoEl.onerror=()=>reject(Error('Videoformat kann nicht gelesen werden.'));});
    if(!Number.isFinite(videoEl.duration)||videoEl.duration<=0)throw Error('Videolänge konnte nicht ermittelt werden.');
    task=await getPoseTask();
    try{racketTask=await getRacketTask();}catch(racketError){racketInitError=String(racketError?.stack||racketError?.message||racketError);console.warn('Schläger-Erkennung nicht verfügbar:',racketError);status.textContent='Schläger-Modell nicht verfügbar – Körperanalyse läuft weiter …';}
    const duration=videoEl.duration,count=Math.min(144,Math.max(48,Math.ceil(duration*24)));
    const times=Array.from({length:count},(_,i)=>Math.min(Math.max(0.05,duration-0.05),0.05+(Math.max(0,duration-0.1)*i/Math.max(1,count-1))));
    const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
    const frames=[],elbowL=[],elbowR=[],kneeL=[],kneeR=[],phaseFrames=[[],[],[]];let detected=0,preview=null,racketSamples=0;
    for(let i=0;i<times.length;i++){
      status.textContent='Vorhand wird untersucht: Bild '+(i+1)+' von '+times.length+' …';
      const seeked=waitEvent(videoEl,'seeked');videoEl.currentTime=times[i];await seeked;
      const scale=Math.min(1,640/(videoEl.videoWidth||640));canvas.width=Math.round((videoEl.videoWidth||640)*scale);canvas.height=Math.round((videoEl.videoHeight||360)*scale);ctx.drawImage(videoEl,0,0,canvas.width,canvas.height);
      const res=task.detectForVideo(canvas,Math.round(times[i]*1000)+i),lm=res.landmarks?.[0];if(!lm){const missing={time:times[i],visible:0,leftElbow:null,rightElbow:null,leftKnee:null,rightKnee:null,leftArmPoint:null,rightArmPoint:null,pose:null,racket:null,racketDiagnostic:{error:'Körperpose nicht erkannt'}};frames.push(missing);phaseFrames[Math.min(2,Math.floor(i/Math.max(1,times.length/3)))].push(missing);continue;}detected++;const racketResult=racketTask&&i%2===0?await detectRacket(racketTask,canvas,lm):{box:null,candidates:[],diagnostic:racketTask?null:{error:'Modell nicht geladen'}};const racketDiagnostic=racketResult.diagnostic;
      const visible=lm.filter(p=>(p.visibility??1)>.4).length;
      const racket=selectRacketCandidate(racketResult.candidates||[],lm,racketDiagnostic),racketAccepted=!!racket;if(racketAccepted)racketSamples++;
      const frame={time:times[i],visible,leftElbow:null,rightElbow:null,leftKnee:null,rightKnee:null,leftArmPoint:null,rightArmPoint:null,pose:lm.map(p=>({x:p.x,y:p.y,visibility:p.visibility??1})),racket,racketCandidates:racketResult.debugCandidates||racketResult.candidates||[],racketDiagnostic};
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
    // The hand-connected geometry check is stronger than centre-based temporal
    // filtering: during a fast swing the racket may move far between samples.
    // Keep each spatially verified sample instead of deleting valid swing frames.
    racketSamples=frames.filter(frame=>frame.racket).length;
    const coverage=Math.round(detected/Math.max(1,times.length)*100);
    const phases=phaseFrames.map((group,i)=>({name:['Anfang','Mitte','Ende'][i],leftElbow:seriesStats(group.map(x=>x.leftElbow).filter(Number.isFinite)),rightElbow:seriesStats(group.map(x=>x.rightElbow).filter(Number.isFinite)),leftKnee:seriesStats(group.map(x=>x.leftKnee).filter(Number.isFinite)),rightKnee:seriesStats(group.map(x=>x.rightKnee).filter(Number.isFinite))}));
    const strokePhases=detectStrokePhases(frames);
    const racketDiags=frames.map(f=>f.racketDiagnostic).filter(Boolean),selectionDiags=racketDiags.map(d=>d.selection).filter(Boolean),racketDiagSummary={outputShape:racketDiags.find(d=>d.outputShape)?.outputShape||'—',format:racketDiags.find(d=>d.format)?.format||'—',maxRacketScore:Math.max(0,...racketDiags.map(d=>d.maxRacketScore||0)),maxOtherScore:Math.max(0,...racketDiags.map(d=>d.maxOtherScore||0)),maxAnyScore:Math.max(0,...racketDiags.map(d=>d.maxAnyScore||0)),validRows:racketDiags.reduce((n,d)=>n+(d.validRows||0),0),paddedRows:racketDiags.reduce((n,d)=>n+(d.paddedRows||0),0),classCounts:racketDiags.reduce((acc,d)=>{for(const [k,v] of Object.entries(d.classCounts||{}))acc[k]=(acc[k]||0)+v;return acc;},{}),topRows:racketDiags.flatMap(d=>d.topRows||[]).sort((a,b)=>(Number(b.score)||0)-(Number(a.score)||0)).slice(0,5),above01:racketDiags.reduce((n,d)=>n+(d.above01||0),0),above05:racketDiags.reduce((n,d)=>n+(d.above05||0),0),above15:racketDiags.reduce((n,d)=>n+(d.above15||0),0),selectionChecked:selectionDiags.reduce((n,d)=>n+d.checked,0),selectionNearHand:selectionDiags.reduce((n,d)=>n+d.nearHand,0),selectionNearArm:selectionDiags.reduce((n,d)=>n+d.nearArm,0),selectionBestHandDistance:selectionDiags.length?Math.min(...selectionDiags.map(d=>d.bestHandDistance??Infinity)):null,selectionBestArmDistance:selectionDiags.length?Math.min(...selectionDiags.map(d=>d.bestArmDistance??Infinity)):null,selectionNearestCandidate:selectionDiags.map(d=>d.nearestCandidate).filter(Boolean).sort((a,b)=>(a.handDistance+a.armDistance)-(b.handDistance+b.armDistance))[0]||null,errors:racketDiags.filter(d=>d.error).length+(racketInitError?1:0),errorSamples:[...(racketInitError?[racketInitError]:[]),...racketDiags.filter(d=>d.error).map(d=>d.error)].slice(0,3),modelLoaded:!!racketTask};
    const result={videoId,created:Date.now(),angle:item.angle||'unknown',sampled:times.length,detected,coverage,racketSamples,racketChecked:racketTask?Math.ceil(times.length/2):0,racketDiagSummary,strokePhases,elbowAverage:seriesStats([...elbowL,...elbowR])?.avg??null,kneeAverage:seriesStats([...kneeL,...kneeR])?.avg??null,elbowLeft:seriesStats(elbowL),elbowRight:seriesStats(elbowR),kneeLeft:seriesStats(kneeL),kneeRight:seriesStats(kneeR),phases,preview,frames};
    await add('analyses',result);
    status.textContent='Analyse abgeschlossen · '+detected+' von '+times.length+' Bildern mit erkennbarer Körperpose. Ergebnis lokal gespeichert.';
    renderAnalysisResult(result,item);
  }catch(e){status.textContent='Analyse nicht möglich: '+(e.message||'Unbekannter Fehler')+'. Bitte ein gut beleuchtetes Video mit vollständig sichtbarem Körper verwenden.'}
  finally{if(task){try{task.close()}catch(e){console.warn('PoseLandmarker konnte nicht geschlossen werden:',e)}}if(racketTask){try{await racketTask.close()}catch(e){console.warn('Tennis-Schläger-Modell konnte nicht geschlossen werden:',e)}}if(objectUrl)URL.revokeObjectURL(objectUrl);analysisBusy=false}
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
function wristSpeedChart(frames,side,phases){
  const key=side+'ArmPoint',samples=[];
  for(let i=1;i<frames.length;i++){
    const a=frames[i-1],b=frames[i],dt=b.time-a.time,pa=a[key],pb=b[key];
    if(!pa||!pb||dt<=0||dt>.35){samples.push(null);continue;}
    samples.push({time:b.time,speed:Math.hypot(pb.x-pa.x,pb.y-pa.y)/dt});
  }
  const smooth=samples.map((sample,i)=>{
    if(!sample)return null;
    const values=[samples[i-1]?.speed,sample.speed,samples[i+1]?.speed].filter(Number.isFinite);
    return {time:sample.time,speed:values.reduce((sum,value)=>sum+value,0)/values.length};
  });
  const valid=smooth.filter(Boolean);
  if(valid.length<5)return '<p class="tiny">Zu wenige zusammenhängende Handgelenkpositionen für den Bewegungsverlauf.</p>';
  const width=640,height=220,left=48,right=14,top=16,bottom=34,plotW=width-left-right,plotH=height-top-bottom;
  const first=frames[0].time,last=frames[frames.length-1].time,duration=Math.max(.001,last-first);
  const maxSpeed=Math.max(.5,...valid.map(x=>x.speed))*1.12;
  const xAt=t=>left+(t-first)/duration*plotW,yAt=v=>top+plotH-(v/maxSpeed)*plotH;
  const bands=(phases||[]).map(p=>{
    const colors={'Ausholen / Vorbereitung':'#55aaff','Beschleunigung':'#ffad32','Treffpunkt-Kandidat':'#ff4d4d','Ausschwung':'#45d483'};
    const x=Math.max(left,xAt(p.start)),end=Math.min(width-right,xAt(p.end));
    return end>x?'<rect x="'+x.toFixed(1)+'" y="'+top+'" width="'+(end-x).toFixed(1)+'" height="'+plotH+'" fill="'+(colors[p.name]||'#c7f36b')+'" opacity=".13"/>':'';
  }).join('');
  let path='',active=false,peak=null;
  for(const point of smooth){
    if(!point){active=false;continue;}
    const x=xAt(point.time),y=yAt(point.speed);
    path+=(active?' L':' M')+x.toFixed(1)+' '+y.toFixed(1);
    active=true;
    if(!peak||point.speed>peak.speed)peak={...point,x,y};
  }
  const grid=[0,.25,.5,.75,1].map(f=>{
    const value=maxSpeed*f,y=yAt(value);
    return '<line x1="'+left+'" y1="'+y.toFixed(1)+'" x2="'+(width-right)+'" y2="'+y.toFixed(1)+'" stroke="#e6ebef" stroke-width="1"/><text x="'+(left-8)+'" y="'+(y+3).toFixed(1)+'" text-anchor="end" fill="#8c97a3" font-size="10">'+value.toFixed(1)+'</text>';
  }).join('');
  const peakMark=peak?'<circle cx="'+peak.x.toFixed(1)+'" cy="'+peak.y.toFixed(1)+'" r="4" fill="#263b59"/><text x="'+Math.min(width-right-4,peak.x+7).toFixed(1)+'" y="'+Math.max(top+10,peak.y-8).toFixed(1)+'" fill="#263b59" font-size="10">Maximum</text>':'';
  const sideText=side==='left'?'linke Seite':'rechte Seite';
  return '<section class="angle-chart wrist-chart"><b>Handgelenk-Geschwindigkeit ('+sideText+')</b><p class="tiny">Geschätzte Bewegung relativ zur Schulter. Die farbigen Flächen markieren die erkannten Phasen; der höchste Wert ist markiert. Einheit: Rumpflängen pro Sekunde.</p><svg viewBox="0 0 '+width+' '+height+'" role="img" aria-label="Geschwindigkeit des Handgelenks auf der '+(side==='left'?'linken':'rechten')+' Seite über die Zeit, mit markierten Schlagphasen">'+bands+grid+'<path d="'+path+'" fill="none" stroke="#263b59" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'+peakMark+'<text x="'+left+'" y="'+(height-8)+'" fill="#8c97a3" font-size="10">'+first.toFixed(1)+' s</text><text x="'+(width-right)+'" y="'+(height-8)+'" text-anchor="end" fill="#8c97a3" font-size="10">'+last.toFixed(1)+' s</text></svg></section>';
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
function selectRacketCandidate(candidates,landmarks,diagnostic){
  if(!Array.isArray(candidates)||!candidates.length||!landmarks)return null;
  const point=i=>landmarks[i]&&(landmarks[i].visibility??1)>.45?landmarks[i]:null;
  const shoulders=[point(11),point(12)].filter(Boolean),hips=[point(23),point(24)].filter(Boolean);
  if(shoulders.length<2||hips.length<2)return null;
  const avg=items=>({x:items.reduce((n,p)=>n+p.x,0)/items.length,y:items.reduce((n,p)=>n+p.y,0)/items.length});
  const torso=Math.max(.06,Math.hypot(avg(shoulders).x-avg(hips).x,avg(shoulders).y-avg(hips).y));
  const arms=[[13,15],[14,16]].map(([elbowId,wristId])=>({elbow:point(elbowId),wrist:point(wristId)})).filter(a=>a.elbow&&a.wrist);
  if(!arms.length)return null;
  const pointRectDistance=(p,l,t,r,b)=>{
    const dx=Math.max(l-p.x,0,p.x-r),dy=Math.max(t-p.y,0,p.y-b);
    return Math.hypot(dx,dy);
  };
  let selected=null,bestRank=-Infinity,bestNearHand=Infinity,bestNearArm=Infinity;
  let nearestCandidate=null,nearestDistance=Infinity,checked=0,nearHand=0,nearArm=0;
  let rejectedCourtLine=0,rejectedTooClose=0,rejectedTooFar=0,rejectedDirection=0;
  for(const candidate of candidates){
    checked++;
    const l=candidate.x,t=candidate.y,r=l+candidate.w,b=t+candidate.h;
    if(![l,t,r,b,candidate.score].every(Number.isFinite)||candidate.w<=0||candidate.h<=0)continue;
    if(candidate.w>1.25||candidate.h>1.25||candidate.w*candidate.h>.28)continue;
    // Court markings often appear as extremely thin, elongated false positives.
    // A real racket-head detection must have a meaningful short axis and area.
    const longSide=Math.max(candidate.w,candidate.h),shortSide=Math.min(candidate.w,candidate.h);
    const aspect=longSide/Math.max(1e-6,shortSide);
    if(aspect>9||shortSide<torso*.035||candidate.w*candidate.h<torso*torso*.002){
      rejectedCourtLine++;
      continue;
    }
    let bestForCandidate=null;
    for(const arm of arms){
      const wrist={x:arm.wrist.x,y:arm.wrist.y};
      const elbow={x:arm.elbow.x,y:arm.elbow.y};
      const wristDistance=pointRectDistance(wrist,l,t,r,b);
      const center={x:(l+r)/2,y:(t+b)/2};
      const vx=center.x-wrist.x,vy=center.y-wrist.y,headDistance=Math.hypot(vx,vy);
      const ax=wrist.x-elbow.x,ay=wrist.y-elbow.y,armLength=Math.hypot(ax,ay);
      const directionCos=armLength>0&&headDistance>0?(vx*ax+vy*ay)/(armLength*headDistance):0;
      const handRatio=wristDistance/torso,headRatio=headDistance/torso;
      const armDistance=Math.min(
        pointRectDistance(elbow,l,t,r,b),
        wristDistance
      )/torso;
      const directionPenalty=Math.max(0,.15-directionCos);
      const rank=candidate.score/(1+handRatio*.45+headRatio*.55+directionPenalty*.8);
      if(!bestForCandidate||rank>bestForCandidate.rank){
        bestForCandidate={rank,handRatio,headRatio,armDistance,directionCos,arm};
      }
    }
    if(!bestForCandidate)continue;
    const {rank,handRatio,headRatio,armDistance,directionCos}=bestForCandidate;
    if(handRatio<bestNearHand)bestNearHand=handRatio;
    if(armDistance<bestNearArm)bestNearArm=armDistance;
    if(handRatio<=.48)nearHand++;
    if(armDistance<=.30)nearArm++;
    // A box almost on the wrist/torso is usually clothing or a hand artifact,
    // not the racket head. Require a little separation and prefer the outward
    // continuation of the forearm; still allow a moderately angled racket.
    if(headRatio<.42){rejectedTooClose++;continue;}
    if(headRatio>2.0){rejectedTooFar++;continue;}
    if(directionCos<-.20){rejectedDirection++;continue;}
    if(handRatio>1.65)continue;
    const enriched={
      ...candidate,
      handDistance:handRatio,
      armDistance,
      headDistance:headRatio,
      racketDirection:Number(directionCos.toFixed(3)),
      linkVerified:true
    };
    if(handRatio+headRatio<nearestDistance){
      nearestDistance=handRatio+headRatio;
      nearestCandidate={x:Number(l.toFixed(4)),y:Number(t.toFixed(4)),w:Number(candidate.w.toFixed(4)),h:Number(candidate.h.toFixed(4)),score:Number(candidate.score.toFixed(4)),handDistance:Number(handRatio.toFixed(3)),headDistance:Number(headRatio.toFixed(3)),direction:Number(directionCos.toFixed(3))};
    }
    if(rank>bestRank){bestRank=rank;selected=enriched;}
  }
  if(diagnostic)diagnostic.selection={
    checked,nearHand,nearArm,
    bestHandDistance:Number.isFinite(bestNearHand)?Number(bestNearHand.toFixed(3)):null,
    bestArmDistance:Number.isFinite(bestNearArm)?Number(bestNearArm.toFixed(3)):null,
    nearestCandidate,selected:!!selected,
    rejectedCourtLine,rejectedTooClose,rejectedTooFar,rejectedDirection,
    rule:'Schlägerkopf mit Mindestabstand zum Handgelenk gesucht; Armrichtung und Linienform geprüft'
  };
  return selected;
}
function racketAtTime(frames,time){
  let before=null,after=null;
  for(const frame of frames||[]){
    if(!frame.racket)continue;
    if(frame.time<=time)before=frame;
    if(frame.time>=time){after=frame;break;}
  }
  if(before&&after&&before!==after&&after.time-before.time<=.34){
    const ratio=(time-before.time)/(after.time-before.time);
    const a=before.racket,b=after.racket;
    return {x:a.x+(b.x-a.x)*ratio,y:a.y+(b.y-a.y)*ratio,w:a.w+(b.w-a.w)*ratio,h:a.h+(b.h-a.h)*ratio,score:Math.min(a.score,b.score),bridged:true};
  }
  const nearest=before||after;
  return nearest&&Math.abs(nearest.time-time)<=.22?nearest.racket:null;
}
function racketCandidatesAtTime(frames,time){
  let nearest=null,distance=Infinity;
  for(const frame of frames||[]){if(!frame.racketCandidates?.length)continue;const d=Math.abs(frame.time-time);if(d<distance){distance=d;nearest=frame;}}
  return nearest&&distance<=.22?nearest.racketCandidates:[];
}
function drawPlaybackPose(canvas,pose,color,racket,candidates=[]){
  const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;ctx.clearRect(0,0,w,h);
  if(pose){
    ctx.lineWidth=Math.max(3,w/180);ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle=color;ctx.fillStyle='#fff';ctx.beginPath();
    for(const [a,b] of POSE_LINKS){const p=pose[a],q=pose[b];if(!p||!q||p.visibility<.35||q.visibility<.35)continue;ctx.moveTo(p.x*w,p.y*h);ctx.lineTo(q.x*w,q.y*h);}ctx.stroke();
    for(const p of pose){if(!p||p.visibility<.35)continue;ctx.beginPath();ctx.arc(p.x*w,p.y*h,Math.max(2,w/150),0,Math.PI*2);ctx.fill();}
  }
  for(const candidate of (candidates||[]).slice().sort((a,b)=>(b.score||0)-(a.score||0)).slice(0,8)){
    const x=candidate.x*w,y=candidate.y*h,bw=candidate.w*w,bh=candidate.h*h;
    ctx.save();ctx.strokeStyle='#ffd54a';ctx.lineWidth=Math.max(2,w/260);ctx.setLineDash([Math.max(4,w/120),Math.max(3,w/180)]);
    ctx.strokeRect(x,y,bw,bh);ctx.setLineDash([]);ctx.font='bold '+Math.max(11,w/48)+'px sans-serif';
    const className=candidate.className||('Klasse '+(candidate.classId??'?'));
    const label=className+' '+(candidate.score*100).toFixed(1)+'%';ctx.fillStyle='rgba(35,42,52,.9)';ctx.fillRect(x,Math.max(0,y-18),ctx.measureText(label).width+8,18);
    ctx.fillStyle='#ffd54a';ctx.textBaseline='middle';ctx.fillText(label,x+4,Math.max(9,y-9));ctx.restore();
  }
  if(racket){
    const rawX=racket.x*w,rawY=racket.y*h,rawW=racket.w*w,rawH=racket.h*h;
    const pad=Math.max(7,w/100),x=Math.max(0,rawX-pad),y=Math.max(0,rawY-pad);
    const bw=Math.min(w-x,rawW+pad*2),bh=Math.min(h-y,rawH+pad*2);
    ctx.save();ctx.fillStyle='rgba(255,159,10,.16)';ctx.fillRect(x,y,bw,bh);
    ctx.strokeStyle='#ff9f0a';ctx.lineWidth=Math.max(5,w/140);ctx.setLineDash([]);
    ctx.strokeRect(x,y,bw,bh);
    const label='SCHLÄGER-KANDIDAT '+Math.round(racket.score*100)+'%';
    ctx.font='bold '+Math.max(14,w/34)+'px sans-serif';
    const labelW=ctx.measureText(label).width+16,labelH=Math.max(24,w/24);
    const labelY=Math.max(0,y-labelH-3);
    ctx.fillStyle='#b86b00';ctx.fillRect(x,labelY,labelW,labelH);
    ctx.fillStyle='#fff';ctx.textBaseline='middle';ctx.fillText(label,x+8,labelY+labelH/2);
    ctx.beginPath();ctx.arc(rawX+rawW/2,rawY+rawH/2,Math.max(5,w/100),0,Math.PI*2);ctx.fillStyle='#ff2638';ctx.fill();
    ctx.restore();
  }
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
    label.textContent=phase?.name||'Keine Phase zugeordnet';drawPlaybackPose(canvas,poseAtTime(r.frames,t),phaseColorAt(t,r.strokePhases?.phases),racketAtTime(r.frames,t),racketCandidatesAtTime(r.frames,t));
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
  const rd=r.racketDiagSummary||{},racketMarkup='<h3>Schläger-Erkennung (Diagnose)</h3><p class="tiny">'+(rd.modelLoaded?'Modell geladen · ':'Modell nicht geladen · ')+(r.racketChecked?(r.racketSamples+' von '+r.racketChecked+' Bildern mit Erkennung ('+Math.round(r.racketSamples/r.racketChecked*100)+'%).'):'Keine Modell-Inferenz durchgeführt.')+'</p><details class="diagnostic"><summary>Technische Schläger-Diagnose anzeigen</summary><p class="tiny">Modell-Ausgabe: '+esc(rd.outputShape||'—')+' · Format: '+esc(rd.format||'—')+'</p><p class="tiny">Höchster Schläger-Score (Klasse 0): '+(Number(rd.maxRacketScore||0)*100).toFixed(1)+'% · höchste andere Klasse: '+(Number(rd.maxOtherScore||0)*100).toFixed(1)+'% · höchster Score insgesamt: '+(Number(rd.maxAnyScore||0)*100).toFixed(1)+'%</p><p class="tiny">Gültige Modelltreffer: '+(rd.validRows||0)+' · Leere NMS-Plätze (Padding): '+(rd.paddedRows||0)+'</p><p class="tiny">Klassenverteilung (nur gültige Treffer): '+esc(Object.entries(rd.classCounts||{}).map(([k,v])=>(RACKET_CLASS_NAMES[k]||'Klasse '+k)+': '+v).join(' · ')||'Keine gültigen Treffer')+'</p><p class="tiny">Top-Ausgaben: '+esc((rd.topRows||[]).map(x=>(RACKET_CLASS_NAMES[x.classId]||'Klasse '+x.classId)+' / '+(Number(x.score)*100).toFixed(1)+'% (Boxmitte '+Number(x.boxCenterX||0).toFixed(0)+','+Number(x.boxCenterY||0).toFixed(0)+')').join(' · ')||'—')+'</p><p class="tiny">Nächster Kandidat zur Hand: '+(rd.selectionNearestCandidate?('Mitte '+Math.round((rd.selectionNearestCandidate.x+rd.selectionNearestCandidate.w/2)*100)+'% / '+Math.round((rd.selectionNearestCandidate.y+rd.selectionNearestCandidate.h/2)*100)+'% des Bildes · Box '+Math.round(rd.selectionNearestCandidate.w*100)+'×'+Math.round(rd.selectionNearestCandidate.h*100)+'% · Score '+(rd.selectionNearestCandidate.score*100).toFixed(1)+'% · Handabstand '+rd.selectionNearestCandidate.handDistance+' · Armabstand '+rd.selectionNearestCandidate.armDistance):'kein Kandidat')+'</p><p class="tiny">Kandidaten über 1%: '+(rd.above01||0)+' · über 5%: '+(rd.above05||0)+' · über 15%: '+(rd.above15||0)+'</p><p class="tiny">Hand-Zuordnung: '+(rd.selectionChecked||0)+' Kandidaten geprüft · '+(rd.selectionNearHand||0)+' nahe Hand · '+(rd.selectionNearArm||0)+' nahe Arm · kleinster Handabstand: '+(rd.selectionBestHandDistance??'—')+' · kleinster Armabstand: '+(rd.selectionBestArmDistance??'—')+'</p><p class="tiny">Technische Fehler: '+(rd.errors||0)+(rd.errorSamples?.length?' · '+rd.errorSamples.map(esc).join(' / '):'')+'</p><p class="tiny">Die Diagnosewerte werden nur lokal im Analysebericht gespeichert.</p></details>';
  const strokeMarkup=stroke?.phases?.length?'<div class="stroke-phase-list">'+stroke.phases.map(p=>'<div class="stroke-phase"><b>'+esc(p.name)+'</b><small>'+p.start.toFixed(2)+'–'+p.end.toFixed(2)+' s</small></div>').join('')+'</div>':'<p class="tiny">'+esc(stroke?.reason||'Keine zuverlässige Phasenschätzung möglich.')+'</p>';
  const sideLabel=stroke?.side==='left'?'die linke Seite (größere erkannte Handgelenkbewegung)':stroke?.side==='right'?'die rechte Seite (größere erkannte Handgelenkbewegung)':'keine Seite';
  const tips=[];if(r.coverage<80)tips.push('Filme bei gutem Licht und halte Kopf, Füße und beide Arme während des gesamten Schlages im Bild.');if(r.angle==='unknown')tips.push('Wähle beim nächsten Video die Kameraperspektive aus.');tips.push('Nutze möglichst dieselbe Kameraposition und denselben Abstand, wenn du Fortschritte vergleichen möchtest.');
  $('analysisResult').innerHTML='<article class="entry"><div class="entry-top"><b>Vorhand · '+dateText(v.date)+'</b><span class="pill">'+r.coverage+'% Pose-Erkennung</span></div><small>Perspektive: '+angleLabel+' · '+r.detected+'/'+r.sampled+' analysierte Bilder</small>'+(r.frames?.some(f=>f.pose)?'<h3>Video mit animiertem Skelett</h3><p class="tiny">Das Skelett folgt den erkannten Gelenkpunkten. Die Zwischenpositionen werden zwischen den analysierten Bildern interpoliert.</p><div class="skeleton-player" id="skeletonPlayer"><div class="skeleton-stage" id="skeletonStage"><video id="skeletonVideo" playsinline preload="metadata"></video><canvas id="skeletonCanvas" aria-hidden="true"></canvas></div><div class="skeleton-controls"><button type="button" id="skeletonPlay" aria-label="Abspielen oder pausieren">▶</button><input id="skeletonSeek" type="range" min="0" max="1000" value="0" aria-label="Video-Position"><span id="skeletonTime">0:00</span><button type="button" id="skeletonExpand">⛶ Vollbild</button><button type="button" id="skeletonClose" hidden>Schließen</button></div><div class="skeleton-speed-row"><span class="skeleton-speed-label">Geschwindigkeit</span><div class="skeleton-speed-buttons" role="group" aria-label="Wiedergabegeschwindigkeit"><button type="button" data-speed="0.5" aria-pressed="false">0,5×</button><button type="button" data-speed="1" aria-pressed="true" class="active">1×</button></div></div></div><div id="skeletonPhaseLabel" class="skeleton-phase-label">Video wird vorbereitet …</div><div class="skeleton-legend"><span><i style="background:#55aaff"></i>Ausholen</span><span><i style="background:#ffad32"></i>Beschleunigung</span><span><i style="background:#ff4d4d"></i>Treffpunkt-Kandidat</span><span><i style="background:#45d483"></i>Ausschwung</span><span><i style="background:#ffd54a"></i>Modell-Vermutungen</span><span><i style="background:#ff4d4d"></i>Schläger-Erkennung</span></div>':(r.preview?'<img alt="Erkanntes Körperskelett" src="'+r.preview+'" style="width:100%;border-radius:10px;margin-top:10px;background:#111">':'<p class="tiny">Für diese Analyse sind noch keine Gelenkpunkte gespeichert. Bitte das Video erneut analysieren.</p>'))+'<h3>Automatische Schlagphasen (experimentell)</h3><p class="tiny">Konservative Schätzung aus der Handgelenkbewegung relativ zur Schulter. „Ausholen“ wird nur bei einem erkennbaren maximalen Abstand vor der Beschleunigung angezeigt. Ausgewertet wird '+sideLabel+'. Der Treffpunkt ist nur ein Kandidaten-Zeitfenster, kein nachgewiesener Ballkontakt.</p>'+racketMarkup+strokeMarkup+'<p class="tiny">'+(stroke?.status==='estimated'?'Bewegungsmuster ausreichend deutlich für eine erste Schätzung.':(stroke?.reason||'Die Phasenschätzung ist unsicher und sollte im Video überprüft werden.'))+'</p><h3>Winkelverlauf über die gesamte Aufnahme</h3><p class="tiny">Die Kurven zeigen die erkannten Winkel Bild für Bild. Lücken bedeuten, dass ein Gelenk in diesem Einzelbild nicht sicher erkannt wurde.</p>'+(r.frames?.length?angleChart(r.frames,[{key:'leftElbow',label:'Links',side:'left'},{key:'rightElbow',label:'Rechts',side:'right'}],'Ellenbogen'): '<p class="tiny">Keine Winkelmesswerte vorhanden.</p>')+(r.frames?.length?angleChart(r.frames,[{key:'leftKnee',label:'Links',side:'left'},{key:'rightKnee',label:'Rechts',side:'right'}],'Knie'):'')+'<h3>Bewegungsverlauf des Schlagarms</h3><p class="tiny">Diese Kurve zeigt, wann sich das erkannte Handgelenk besonders schnell bewegt. Sie hilft, die automatisch geschätzten Phasen zu überprüfen, beweist aber keinen Ballkontakt.</p>'+(stroke?.side&&r.frames?.length?wristSpeedChart(r.frames,stroke.side,stroke.phases):'<p class="tiny">Kein sicherer Schlagarm für einen Bewegungsverlauf erkannt.</p>')+'<h3>Anfang, Mitte und Ende</h3>'+(phases||'<p class="tiny">Zu wenige Messwerte für den Zeitverlauf.</p>')+'<h3>Winkelübersicht</h3>'+side('Ellenbogen links',r.elbowLeft)+side('Ellenbogen rechts',r.elbowRight)+side('Knie links',r.kneeLeft)+side('Knie rechts',r.kneeRight)+'<h3>Einordnung</h3><p>'+coverageText+'</p><h3>Für die nächste Aufnahme</h3><ul>'+tips.map(t=>'<li>'+esc(t)+'</li>').join('')+'</ul><p class="tiny">Die Schlägerbox ist noch keine genaue Schlägerkopf- oder Griffverfolgung. Ball, bestätigter Treffpunkt, Schlagrichtung und 3D-Rotation werden weiterhin nicht erkannt. Deshalb gibt es bewusst keine Techniknote und keine Aussage, ob die Bewegung technisch richtig ist.</p></article>';
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
