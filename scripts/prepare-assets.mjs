import { mkdir, cp, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
export async function prepareAssets() {
  const models=path.join(root,'public/models');
  const provenance=JSON.parse(await readFile(path.join(models,'provenance.json'),'utf8'));
  for(const [file,metadata] of Object.entries(provenance)){
    const bytes=await readFile(path.join(models,file));
    if(createHash('sha256').update(bytes).digest('hex')!==metadata.sha256)throw new Error('Model integrity check failed for '+file);
  }
  const source=path.join(root,'node_modules/@mediapipe/tasks-vision');
  const target=path.join(root,'public/vendor/mediapipe');
  await mkdir(target,{recursive:true});
  await cp(path.join(source,'vision_bundle.mjs'),path.join(target,'vision_bundle.mjs'));
  await cp(path.join(source,'wasm'),path.join(target,'wasm'),{recursive:true});
  await writeFile(path.join(target,'LICENSE.txt'),await readFile(path.join(models,'LICENSE.txt')));
}
