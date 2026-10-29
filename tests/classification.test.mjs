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
