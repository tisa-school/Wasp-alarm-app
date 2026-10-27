const assert=require('node:assert/strict');
const http=require('node:http');
const {readFile}=require('node:fs/promises');
const path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../dist/web');
const prefix='/Wasp-alarm-app/';
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
let apiRequests=0;
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname.startsWith('/api/'))apiRequests++;
  if(!url.pathname.startsWith(prefix)){res.writeHead(404);res.end();return;}
  const file=path.resolve(root,url.pathname.slice(prefix.length)||'index.html');
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  try{const body=await readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(body);}catch{res.writeHead(404);res.end();}
});
let browser;
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
  const context=await browser.newContext({permissions:['camera'],viewport:{width:390,height:844}});
  const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}${prefix}`);
  await page.locator('#practice').click();assert.equal(await page.locator('#check').textContent(),'PHOTO');
  assert.match(await page.locator('#camera-screen .practice-badge').textContent(),/NO WASP RECOGNITION/);
  await page.locator('#enable-camera').click();await page.waitForFunction(()=>document.querySelector('#camera').videoWidth>0);
  await page.evaluate(()=>window.trackForTest=document.querySelector('#camera').srcObject.getVideoTracks()[0]);
  await page.locator('#check').click();
  assert.equal(await page.locator('#captured-photo').isVisible(),true);
  assert.match(await page.locator('#captured-photo').getAttribute('src'),/^data:image\/jpeg;base64,/);
  assert.equal(await page.evaluate(()=>window.trackForTest.readyState),'ended');
  assert.equal(await page.locator('#result-screen').isVisible(),false);
  assert.match(await page.locator('#camera-status').textContent(),/not connected/);
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
  assert.equal(apiRequests,0);assert.deepEqual(errors,[]);
  console.log('PASS GitHub Pages repository subpath, real camera API capture (simulated device), stream cleanup, no false result, no API uploads, and service-worker installation.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();server.close();});
