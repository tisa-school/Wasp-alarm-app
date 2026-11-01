// Google Coral's iNaturalist insect classifier, running on this device.
// A closed-set classifier can be confidently wrong on unfamiliar images.
// These conservative heuristics are not a calibrated safety detector.
const WASPS = new Set(['Dolichovespula','Ammophila','Polistes','Brachygastra','Vespula','Monobia','Sphex','Vespa','Scolia','Ancistrocerus','Sceliphron']);
const BEES = new Set(['Apis','Bombus','Xylocopa','Melissodes','Megachile','Anthidium']);
function group(label) { const genus=label.split(' ')[0];return WASPS.has(genus)?'wasp':BEES.has(genus)?'bee':'other'; }
export function summarizePredictions(predictions) {
  const valid=predictions.filter(p=>typeof p.label==='string' && Number.isFinite(p.score) && p.score>=0 && p.score<=1).sort((a,b)=>b.score-a.score);
  const top=valid[0];
  if(!top)return {verdict:'uncertain',scope:'single_photo',distanceAvailable:false};
  const waspScore=valid.filter(p=>group(p.label)==='wasp').reduce((sum,p)=>sum+p.score,0);
  const beeScore=valid.filter(p=>group(p.label)==='bee').reduce((sum,p)=>sum+p.score,0);
  let verdict='uncertain';
  if(top.score>=.25 && group(top.label)==='wasp' && waspScore>=.55 && waspScore-beeScore>=.20)verdict='possible_wasp';
  if(top.score>=.25 && group(top.label)==='bee' && beeScore>=.55 && beeScore-waspScore>=.20)verdict='possible_bee';
  return {verdict,label:top.label,scope:'single_photo',distanceAvailable:false};
}
const base=new URL('./',import.meta.url);
let enginePromise;
async function checkedAsset(file,expected) {
  const response=await fetch(new URL(file,base));
  if(!response.ok)throw new Error('Could not load the insect model. Check your connection and try again.');
  const buffer=await response.arrayBuffer();
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer)),byte=>byte.toString(16).padStart(2,'0')).join('');
  if(hash!==expected)throw new Error('The insect model could not be verified. Reload the app and try again.');
  return buffer;
}
async function getEngine(onProgress) {
  if(!enginePromise)enginePromise=(async()=>{
    onProgress?.('Getting Buzz ready… the first scan downloads the insect model.');
    const [vision,model,labelBytes,sceneModel,sceneLabelBytes]=await Promise.all([
      import('./vendor/mediapipe/vision_bundle.mjs'),
      checkedAsset('models/insects.tflite','0ebaeb474dccf56b8b818b014f0d6a8e22b35a45b491a659f0b5405c9c838282'),
      checkedAsset('models/labels.txt','e5e03664a8a70eafc3308268eb8cd6aa28652912735bfdd45e436ae9617155bc'),
      checkedAsset('models/scene.tflite','7aad0c74c5e3c06e5eb3c827e13304fdd68a83da6087d92ee169c24ff9fd4776'),
      checkedAsset('models/scene-labels.txt','b8aaeb5630c62626a7d124a05c0e14230a7ffdd2136a31d0190a4fb71c1d82f1')
    ]);
    const labels=new TextDecoder().decode(labelBytes).trim().split(/\r?\n/);
    if(labels.length!==1022)throw new Error('The insect labels could not be verified.');
    onProgress?.('Loading Buzz’s photo checker… stay with your grown-up.');
    const files=await vision.FilesetResolver.forVisionTasks(new URL('vendor/mediapipe/wasm',base).href);
    const classifier=await vision.ImageClassifier.createFromOptions(files,{baseOptions:{modelAssetBuffer:new Uint8Array(model),delegate:'CPU'},runningMode:'IMAGE',maxResults:10});
    const sceneLabels=new TextDecoder().decode(sceneLabelBytes).trim().split(/\r?\n/);
    if(sceneLabels.length!==1001)throw new Error('The scene labels could not be verified.');
    const sceneClassifier=await vision.ImageClassifier.createFromOptions(files,{baseOptions:{modelAssetBuffer:new Uint8Array(sceneModel),delegate:'CPU'},runningMode:'IMAGE',maxResults:1001});
    return {classifier,labels,sceneClassifier};
  })().catch(error=>{enginePromise=undefined;throw error;});
  return enginePromise;
}
export async function classifyPhoto(photo,{signal,onProgress}={}) {
  const engine=await getEngine(onProgress);
  if(signal?.aborted)throw new DOMException('Stopped','AbortError');
  const image=new Image();image.src=photo;await image.decode();
  if(signal?.aborted)throw new DOMException('Stopped','AbortError');
  onProgress?.('Looking at this photo…');
  const scene=engine.sceneClassifier.classify(image).classifications[0]?.categories||[];
  if(signal?.aborted)throw new DOMException('Stopped','AbortError');
  const output=engine.classifier.classify(image);
  const predictions=(output.classifications[0]?.categories||[]).map(category=>({label:engine.labels[category.index]||'',score:category.score}));
  return guardedPhotoResult(predictions,scene);
}

export function unverifiedPhotoResult(predictions) {
  // Keep species scoring separate for future independently verified inputs.
  // Raising a score threshold cannot reject out-of-distribution portraits.
  return {verdict:'uncertain',scope:'single_photo',distanceAvailable:false};
}

// ImageNet output indices 301–327 are insect classes in the pinned 1001-label
// model. Unlike the species model, it also has non-insect classes. This is an
// experimental rejection check, not a calibrated presence or safety detector.
export function guardedPhotoResult(species,scene) {
  const valid=scene.filter(p=>Number.isInteger(p.index) && p.index>=0 && p.index<=1000 && Number.isFinite(p.score) && p.score>=0 && p.score<=1);
  const indices=new Set(valid.map(p=>p.index));
  const total=valid.reduce((sum,p)=>sum+p.score,0);
  const insect=p=>p.index>=301 && p.index<=327;
  const top=valid.reduce((best,p)=>!best||p.score>best.score?p:best,undefined);
  const mass=valid.filter(insect).reduce((sum,p)=>sum+p.score,0);
  // Reject malformed/duplicated evidence and images dominated by other classes.
  if(indices.size!==valid.length || total>1.1 || !top || !insect(top) || top.score<.25 || mass<.85)
    return {...unverifiedPhotoResult(),reason:'insect_not_confirmed'};
  const candidate=summarizePredictions(species);
  return candidate.verdict==='uncertain'
    ? {...unverifiedPhotoResult(),reason:'species_uncertain'}
    : {...candidate,reason:'two_model_candidate'};
}
