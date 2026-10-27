import { mkdir, readFile, writeFile, cp, rm } from 'node:fs/promises';
import path from 'node:path';
const root = import.meta.dirname;
const output = path.join(root,'dist');
await mkdir(output,{recursive:true});
let html = await readFile(path.join(root,'public/index.html'),'utf8');
const css = await readFile(path.join(root,'public/mobile.css'),'utf8');
const js = await readFile(path.join(root,'public/mobile.js'),'utf8');
const runtime = await readFile(path.join(root,'public/runtime-config.js'),'utf8');
const svg = await readFile(path.join(root,'public/icon.svg'),'utf8');
const icon = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
html = html.replace('<link rel="stylesheet" href="mobile.css">', '<style>'+css+'</style>')
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
  await writeFile(path.join(output,'web/runtime-config.js'),'window.BUZZ_RUNTIME = { photoChecks: false };\n');
  await writeFile(path.join(output,'web/.nojekyll'),'');
}
console.log('Built dist/Wasp-Buddy.html (single-file browser app) and dist/web/ (installable web app).');
