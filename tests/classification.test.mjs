import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizePredictions as summarize } from '../public/insect-classifier.mjs';
test('Wasp species produce a possible-wasp result without a distance claim',()=>{
  const result=summarize([{label:'Vespula vulgaris (Common Yellowjacket)',score:.8},{label:'Bombus terrestris (Buff-tailed Bumblebee)',score:.1}]);
  assert.equal(result.verdict,'possible_wasp');assert.equal(result.distanceAvailable,false);assert.equal(result.scope,'single_photo');
});
test('Bee species remain distinct from wasps',()=>{
  assert.equal(summarize([{label:'Apis mellifera (Honey Bee)',score:.8}]).verdict,'possible_bee');
});
test('Ambiguous bee/wasp matches stay uncertain',()=>{
  assert.equal(summarize([{label:'Vespula germanica (German Wasp)',score:.48},{label:'Apis mellifera (Honey Bee)',score:.45}]).verdict,'uncertain');
});
test('Bee flies, mantidflies, and other classes are never called wasps based on their names',()=>{
  for(const label of ['Climaciella brunnea (Wasp Mantidfly)','Bombylius major (Greater Bee Fly)','Aphomia sociella (Bee Moth)','Junonia coenia (Common Buckeye)','background'])assert.equal(summarize([{label,score:.99}]).verdict,'uncertain');
});
test('Missing, invalid, or weak scores never produce an all-clear result',()=>{
  for(const predictions of [[],[{label:'Vespula vulgaris',score:.2}],[{label:'Vespula vulgaris',score:NaN}],[{label:'Vespula vulgaris',score:2}]])assert.equal(summarize(predictions).verdict,'uncertain');
});

 test('Unverified photos cannot trigger an insect alert even with a confident species guess',async()=>{
  const {unverifiedPhotoResult}=await import('../public/insect-classifier.mjs');
  for(const label of ['Vespula vulgaris','Apis mellifera']){
    const result=unverifiedPhotoResult([{label,score:1}]);
    assert.equal(result.verdict,'uncertain');
    assert.equal(result.distanceAvailable,false);
    assert.equal(result.label,undefined);
  }
});

test('A species guess needs separate general-image insect evidence',async()=>{
  const {guardedPhotoResult}=await import('../public/insect-classifier.mjs');
  const wasp=[{label:'Vespula vulgaris',score:.9}];
  for(const scene of [[],[{index:286,score:.99}],[{index:310,score:.5}],[{index:310,score:.9},{index:310,score:.9}],[{index:310,score:NaN}]]){
    const result=guardedPhotoResult(wasp,scene);
    assert.equal(result.verdict,'uncertain');assert.equal(result.reason,'insect_not_confirmed');
  }
  assert.equal(guardedPhotoResult(wasp,[{index:310,score:.9}]).verdict,'possible_wasp');
  assert.equal(guardedPhotoResult([{label:'Apis mellifera',score:.9}],[{index:310,score:.9}]).verdict,'possible_bee');
  const weak=guardedPhotoResult([{label:'Vespula vulgaris',score:.2}],[{index:310,score:.9}]);
  assert.equal(weak.verdict,'uncertain');assert.equal(weak.reason,'species_uncertain');
});

test('Photo details need agreement and never bypass either model',async()=>{
  const {combinePhotoViews}=await import('../public/insect-classifier.mjs');
  const wasp={verdict:'possible_wasp',reason:'two_model_candidate',distanceAvailable:false,scope:'single_photo'};
  const bee={...wasp,verdict:'possible_bee'};
  const unsure={verdict:'uncertain',reason:'insect_not_confirmed'};
  assert.equal(combinePhotoViews([unsure,wasp],{verdict:'uncertain'}).verdict,'uncertain');
  assert.equal(combinePhotoViews([unsure,wasp],{verdict:'possible_wasp'}).verdict,'possible_wasp');
  assert.equal(combinePhotoViews([wasp,wasp],{verdict:'uncertain'}).verdict,'possible_wasp');
  assert.equal(combinePhotoViews([wasp,bee],{verdict:'possible_wasp'}).verdict,'uncertain');
  assert.equal(combinePhotoViews([{verdict:'possible_wasp',reason:'unverified'}],{verdict:'possible_wasp'}).verdict,'uncertain');
});

test('Photo selection stays within portrait and landscape source pixels',async()=>{
  const {cropRect}=await import('../public/photo-crop.mjs');
  assert.deepEqual(cropRect(600,600,75,25,40),{x:330,y:30,size:240});
  assert.deepEqual(cropRect(800,400,100,100,50),{x:600,y:200,size:200});
  assert.deepEqual(cropRect(400,800,0,0,100),{x:0,y:0,size:400});
  for(const [width,height] of [[400,800],[800,400],[1,1]])for(const x of [-10,50,110])for(const y of [-10,50,110]){
    const crop=cropRect(width,height,x,y,300);
    assert.ok(crop.x>=0&&crop.y>=0&&crop.size>0);
    assert.ok(crop.x+crop.size<=width&&crop.y+crop.size<=height);
  }
  assert.throws(()=>cropRect(0,200));assert.throws(()=>cropRect(NaN,200));
});
