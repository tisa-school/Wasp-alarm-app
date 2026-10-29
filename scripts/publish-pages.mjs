import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const output=path.join(root,'dist/web');
const git=(args,options={})=>execFileSync('git',['-C',root,...args],{encoding:'utf8',...options});
if(git(['status','--porcelain']).trim())throw new Error('Commit source changes before publishing.');
if(!(await readFile(path.join(output,'runtime-config.js'),'utf8')).includes('recognition: "local"'))throw new Error('Run npm run build:pages first.');
const files=await readdir(output);
if(!files.includes('.nojekyll') || files.some(name=>name.startsWith('.env')))throw new Error('Invalid static publishing folder.');
git(['fetch','origin','refs/heads/gh-pages'],{stdio:'inherit'});
const parent=git(['rev-parse','FETCH_HEAD']).trim();
const temp=await mkdtemp(path.join(tmpdir(),'buzz-pages-'));
try{
  const env={...process.env,GIT_INDEX_FILE:path.join(temp,'index')};
  const args=['--work-tree='+output];
  git([...args,'read-tree','--empty'],{env});git([...args,'add','--all'],{env});
  const tree=git([...args,'write-tree'],{env}).trim();
  const commit=git(['commit-tree',tree,'-p',parent,'-m','Update Wasp Buddy photo recognition, camera and sound']).trim();
  git(['push','origin',commit+':refs/heads/gh-pages'],{stdio:'inherit'});
  console.log('Published static app commit '+commit);
}finally{await rm(temp,{recursive:true,force:true});}
