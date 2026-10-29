import { mkdir, readFile, writeFile, cp, rm } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { prepareAssets } from './scripts/prepare-assets.mjs';
await prepareAssets();
const root = import.meta.dirname;
const output = path.join(root,'dist');
await mkdir(output,{recursive:true});
let html = await readFile(path.join(root,'public/index.html'),'utf8');
const css = await readFile(path.join(root,'public/mobile.css'),'utf8');
const js = await readFile(path.join(root,'public/mobile.js'),'utf8');
const audio = await readFile(path.join(root,'public/audio.js'),'utf8');
const runtime = await readFile(path.join(root,'public/runtime-config.js'),'utf8');
const svg = await readFile(path.join(root,'public/icon.svg'),'utf8');
const icon = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
html = html.replace('<link rel="stylesheet" href="mobile.css">', '<style>'+css+'</style>')
  .replace('<script src="audio.js"></script>','<script>'+audio+'</script>')
  .replace('<script src="runtime-config.js"></script>','<script>'+runtime+'</script>')
  .replace('<script src="mobile.js"></script>','<script>'+js+'</script>')
  .replaceAll('src="icon.svg"', 'src="'+icon+'"')
  .replace('href="icon.svg"', 'href="'+icon+'"')
  .replace('<link rel="manifest" href="manifest.webmanifest">','')
  .replace('<link rel="apple-touch-icon" href="icon-192.png">','');
await writeFile(path.join(output,'Wasp-Buddy.html'),html);
await rm(path.join(output,'web'),{recursive:true,force:true});
await cp(path.join(root,'public'),path.join(output,'web'),{recursive:true});
if (process.argv.includes('--pages')) {
  await writeFile(path.join(output,'web/runtime-config.js'),'window.BUZZ_RUNTIME = { photoChecks: true, recognition: "local" };\n');
  await writeFile(path.join(output,'web/.nojekyll'),'');
}
console.log('Built dist/Wasp-Buddy.html (single-file browser app) and dist/web/ (installable web app).');

const release=createHash('sha256').update(css+js+audio+runtime+await readFile(path.join(root,'public/insect-classifier.mjs'),'utf8')).digest('hex').slice(0,12);
let webHtml=await readFile(path.join(output,'web/index.html'),'utf8');
webHtml=webHtml.replace(/(src|href)="(mobile.css|mobile.js|audio.js|runtime-config.js)"/g,(_,attribute,file)=>`${attribute}="${file}?v=${release}"`);
await writeFile(path.join(output,'web/index.html'),webHtml);
const worker=await readFile(path.join(output,'web/sw.js'),'utf8');
await writeFile(path.join(output,'web/sw.js'),worker.replace('wasp-buddy-v5','wasp-buddy-'+release));
