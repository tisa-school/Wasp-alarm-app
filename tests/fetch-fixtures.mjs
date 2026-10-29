import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
export async function fetchFixtures(){
  const manifest=JSON.parse(await readFile(path.join(root,'tests/model-fixtures.json'),'utf8'));
  const folder=path.join(root,'.test-fixtures');await mkdir(folder,{recursive:true});
  for(const [name,metadata] of Object.entries(manifest)){
    const file=path.join(folder,name);let bytes;
    try{bytes=await readFile(file);}catch{}
    if(!bytes){bytes=execFileSync('curl',['--fail','--silent','--show-error','--location','--max-time','30',metadata.source],{maxBuffer:5_000_000});}
    if(createHash('sha256').update(bytes).digest('hex')!==metadata.sha256)throw new Error('Fixture integrity check failed: '+name);
    await writeFile(file,bytes);
  }
  return folder;
}
