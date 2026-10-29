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
    const [vision,model,labelBytes]=await Promise.all([
      import('./vendor/mediapipe/vision_bundle.mjs'),
      checkedAsset('models/insects.tflite','0ebaeb474dccf56b8b818b014f0d6a8e22b35a45b491a659f0b5405c9c838282'),
      checkedAsset('models/labels.txt','e5e03664a8a70eafc3308268eb8cd6aa28652912735bfdd45e436ae9617155bc')
    ]);
    const labels=new TextDecoder().decode(labelBytes).trim().split(/\r?\n/);
    if(labels.length!==1022)throw new Error('The insect labels could not be verified.');
    onProgress?.('Loading Buzz’s photo checker… stay with your grown-up.');
    const files=await vision.FilesetResolver.forVisionTasks(new URL('vendor/mediapipe/wasm',base).href);
    const classifier=await vision.ImageClassifier.createFromOptions(files,{baseOptions:{modelAssetBuffer:new Uint8Array(model),delegate:'CPU'},runningMode:'IMAGE',maxResults:10});
    return {classifier,labels};
  })().catch(error=>{enginePromise=undefined;throw error;});
  return enginePromise;
}
export async function classifyPhoto(photo,{signal,onProgress}={}) {
  const engine=await getEngine(onProgress);
  if(signal?.aborted)throw new DOMException('Stopped','AbortError');
  const image=new Image();image.src=photo;await image.decode();
  if(signal?.aborted)throw new DOMException('Stopped','AbortError');
  onProgress?.('Looking at this photo…');
  const output=engine.classifier.classify(image);
  const predictions=(output.classifications[0]?.categories||[]).map(category=>({label:engine.labels[category.index]||'',score:category.score}));
  // This closed-set model cannot establish that the subject is an insect.
  // Its softmax scores are relative insect-species scores, not evidence of
  // insect presence. Never turn these unverified candidates into an alert.
  return unverifiedPhotoResult(predictions);
}

export function unverifiedPhotoResult(predictions) {
  // Keep species scoring separate for future independently verified inputs.
  // Raising a score threshold cannot reject out-of-distribution portraits.
  return {verdict:'uncertain',scope:'single_photo',distanceAvailable:false};
}
