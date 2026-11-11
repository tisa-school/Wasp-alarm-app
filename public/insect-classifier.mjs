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
    onProgress?.('Getting Buzz ready… the first scan downloads the image models.');
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
  if(signal?.aborted)throw new DOMException('Stopped','AbortError');
  const engine=await getEngine(onProgress);
  if(signal?.aborted)throw new DOMException('Stopped','AbortError');
  const image=new Image();image.src=photo;await image.decode();
  if(signal?.aborted)throw new DOMException('Stopped','AbortError');
  const views=[];
  const score=view=>{
    const scene=engine.sceneClassifier.classify(view).classifications[0]?.categories||[];
    const output=engine.classifier.classify(view);
    const species=(output.classifications[0]?.categories||[]).map(category=>({label:engine.labels[category.index]||'',score:category.score}));
    return {result:guardedPhotoResult(species,scene),species:summarizePredictions(species)};
  };
  onProgress?.('Looking at the whole photo…');
  // Yield between bounded synchronous inferences so navigation and the radar
  // remain responsive. Never keep checking once the user cancels or leaves.
  await new Promise(resolve=>setTimeout(resolve,0));
  if(signal?.aborted)throw new DOMException('Stopped','AbortError');
  const full=score(image);views.push(full.result);
  if(full.result.verdict!=='uncertain')return full.result;
  // Start broad, then inspect a small overlapping grid. The smaller views are
  // important when the camera sees an insect guide, poster, or phone screen:
  // a real insect picture may occupy only one panel of the overall photo.
  // Every view still has to pass both independent models, and final agreement
  // is still required below, so a single closed-set guess cannot raise an alert.
  const crops=[
    [.7,.5,.5],[.5,.5,.5],[.65,0,0],[.65,1,0],[.65,0,1],[.65,1,1],
    [.42,.5,.5],[.42,0,0],[.42,1,0],[.42,0,1],[.42,1,1]
  ];
  const canvas=document.createElement('canvas');canvas.width=224;canvas.height=224;
  const context=canvas.getContext('2d');
  for(const [index,[scale,x,y]] of crops.entries()){
    onProgress?.('Checking photo detail '+(index+1)+' of '+crops.length+'…');
    await new Promise(resolve=>setTimeout(resolve,0));
    if(signal?.aborted)throw new DOMException('Stopped','AbortError');
    const side=Math.min(image.naturalWidth,image.naturalHeight)*scale;
    context.drawImage(image,(image.naturalWidth-side)*x,(image.naturalHeight-side)*y,side,side,0,0,224,224);
    views.push(score(canvas).result);
  }
  if(signal?.aborted)throw new DOMException('Stopped','AbortError');
  return combinePhotoViews(views,full.species);

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

// A crop must pass both existing models. Require agreement with the full-photo
// species guess or a second crop; conflicting wasp/bee views remain uncertain.
export function combinePhotoViews(views,fullSpecies) {
  const candidates=views.filter(view=>view.reason==='two_model_candidate' && ['possible_wasp','possible_bee'].includes(view.verdict));
  const kinds=new Set(candidates.map(view=>view.verdict));
  if(kinds.size===1 && (candidates.length>=2 || fullSpecies?.verdict===candidates[0].verdict))
    return {...candidates[0],reason:'two_model_candidate'};
  return {...unverifiedPhotoResult(),reason:kinds.size || views.some(view=>view.reason==='species_uncertain')?'species_uncertain':'insect_not_confirmed'};
}
