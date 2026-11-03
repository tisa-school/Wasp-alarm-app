const assert=require('node:assert/strict');
const http=require('node:http');
const {readFile}=require('node:fs/promises');
const path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../dist/web');
const prefix='/Wasp-alarm-app/';
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.txt':'text/plain','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
let apiRequests=0,uploads=0;
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname.startsWith('/api/'))apiRequests++;
  if(req.method!=='GET')uploads++;
  if(!url.pathname.startsWith(prefix)){res.writeHead(404);res.end();return;}
  const file=path.resolve(root,url.pathname.slice(prefix.length)||'index.html');
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  try{const body=await readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(body);}catch{res.writeHead(404);res.end();}
});
let browser;
async function choosePhoto(page,file){const chooser=page.waitForEvent('filechooser');await page.locator('#choose-photo').click();await(await chooser).setFiles(file);await page.waitForFunction(()=>!document.querySelector('#captured-photo').hidden);}
async function scan(page){await page.locator('#check').click();await page.waitForFunction(()=>!document.querySelector('#result-screen').hidden || (!document.querySelector('#check').disabled && document.querySelector('#camera-status').textContent.includes('Could not check')),{},{timeout:90_000});assert.equal(await page.locator('#result-screen').isVisible(),true,await page.locator('#camera-status').textContent());}
async function audioPeak(page,duration=350){return page.evaluate(async duration=>{const meter=window.__meter;let peak=0;const end=performance.now()+duration;while(performance.now()<end){const samples=new Float32Array(meter.fftSize);meter.getFloatTimeDomainData(samples);peak=Math.max(peak,...samples.map(Math.abs));await new Promise(resolve=>setTimeout(resolve,20));}return peak;},duration);}
(async()=>{
  const {fetchFixtures}=await import('./fetch-fixtures.mjs');const fixtures=await fetchFixtures();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}${prefix}`;
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=user-gesture-required']});
  const context=await browser.newContext({permissions:['camera'],viewport:{width:390,height:844}});
  await context.addInitScript(()=>{
    window.__audioContexts=[];const NativeAudio=window.AudioContext;
    window.AudioContext=class extends NativeAudio {
      constructor(...args){super(...args);window.__audioContexts.push(this);}
      createGain(){const gain=super.createGain();if(!this.masterForTest)this.masterForTest=gain;return gain;}
    };
  });
  const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base);await page.locator('#practice').click();
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  assert.equal(await page.locator('#camera-screen').isVisible(),true);assert.equal(await page.locator('#check').textContent(),'SCAN');
  let chooserCount=0;const chooserListener=()=>chooserCount++;page.on('filechooser',chooserListener);
  await page.locator('#take-photo').click();await page.waitForFunction(()=>document.querySelector('#camera').videoWidth>0);
  assert.equal(chooserCount,0);page.off('filechooser',chooserListener);
  await page.evaluate(()=>window.trackForTest=document.querySelector('#camera').srcObject.getVideoTracks()[0]);
  await page.locator('#take-photo').click();assert.equal(await page.evaluate(()=>window.trackForTest.readyState),'ended');
  console.log('PASS Device camera button opens camera API, never the file picker; Stop camera releases tracks.');
  await page.locator('#grownups').click();await page.locator('#test-sound').click();
  await page.evaluate(()=>{const context=window.__audioContexts[0];window.__meter=context.createAnalyser();window.__meter.fftSize=2048;context.masterForTest.connect(window.__meter);});
  assert.ok(await audioPeak(page)>.005,'Sound test must generate an actual nonzero audio waveform');
  await page.locator('#parent-done').click();await page.locator('#sound').click();
  await page.waitForTimeout(150);assert.equal(await page.locator('#sound').getAttribute('aria-pressed'),'false');
  assert.ok(await audioPeak(page,100)<.0001,'Mute must silence the audio graph');
  await page.locator('#sound').click();
  assert.equal(await page.locator('#sound').getAttribute('aria-pressed'),'true');
  await page.waitForTimeout(900);
  await page.evaluate(()=>{const button=document.createElement('button');button.id='tap-sound-test';button.textContent='Tap sound test';document.body.append(button);});
  const tapPeak=audioPeak(page,180);await page.locator('#tap-sound-test').click();
  assert.ok(await tapPeak>.005,'A normal button tap must generate an audible waveform');
  await page.locator('#tap-sound-test').evaluate(element=>element.remove());
  console.log('PASS Sound test generates audio; mute silences the graph; enabling sound and normal button taps produce audio.');
  const cases=[
    ['natural-wasps-1.jpg',/NO WASPRESULT|I’M NOTSURE/],
    ['natural-wasps-2.jpg',/NO WASPRESULT|I’M NOTSURE/],
    ['natural-wasps-3.jpg',/SELECT THEINSECT/],
    ['natural-bees-1.jpg',/SELECT THEINSECT/],
    ['natural-bees-2.jpg',/SELECT THEINSECT/],
    ['dragonfly.bmp',/I’M NOTSURE/],
    ['cat.bmp',/NO WASPRESULT/],
    ['person.bmp',/NO WASPRESULT/]
  ];
  for(const [file,expected] of cases){
    await page.locator('#home').click();await page.locator('#practice').click();
    await choosePhoto(page,path.join(fixtures,file));
    await scan(page);const title=await page.locator('#result-title').textContent();assert.match(title,expected);
    assert.equal(await page.locator('#result-photo').isVisible(),true);
    assert.match(await page.locator('#result-screen .result-note').textContent(),/cannot measure/);
    if(file==='person.bmp'){
      assert.match(await page.locator('#result-message').textContent(),/A person is never a wasp/);
      assert.equal(await page.locator('#focus-result').isVisible(),false);
    }
    if(file==='natural-wasps-2.jpg' && title==='I’M NOTSURE')console.log('KNOWN LIMITATION: wasp sample 2 remains uncertain.');
    else console.log('PASS Real model:',file,'→',title);
  }
  console.log('Real model UI outcome: whole photos cannot trigger insect alerts; likely insect candidates require a grown-up to select the insect area.');
  for(const [file,expected] of [['natural-wasps-3.jpg','possible_wasp'],['natural-bees-2.jpg','possible_bee'],['person.bmp','uncertain'],['cat.bmp','uncertain']]){
    const source='data:image/'+(file.endsWith('.bmp')?'bmp':'jpeg')+';base64,'+(await readFile(path.join(fixtures,file))).toString('base64');
    const result=await page.evaluate(async source=>{
      const image=new Image();image.src=source;await image.decode();
      // A photo embedded in a screen, with borders and text, rather than a
      // tightly framed source image. This used to lose the clear wasp match.
      const canvas=document.createElement('canvas');canvas.width=720;canvas.height=960;
      const context=canvas.getContext('2d');context.fillStyle='#28241e';context.fillRect(0,0,720,960);
      context.fillStyle='#fff';context.fillRect(70,160,580,700);context.fillStyle='#111';context.font='32px sans-serif';context.fillText('Photo on a screen',100,210);
      context.drawImage(image,100,300,520,400);
      const {classifyPhoto}=await import('./insect-classifier.mjs');
      return classifyPhoto(canvas.toDataURL('image/jpeg',.82));
    },source);
    assert.equal(result.verdict,expected,'Framed '+file);
    assert.equal(result.distanceAvailable,false);
    console.log('PASS Photo embedded in a screen:',file,'→',result.verdict);
  }
  const collage=await page.evaluate(async sources=>{
    const images=await Promise.all(sources.map(async src=>{const image=new Image();image.src=src;await image.decode();return image;}));
    const canvas=document.createElement('canvas');canvas.width=canvas.height=600;
    const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,600,600);
    context.fillStyle='#111';context.font='26px sans-serif';context.fillText('Insect photo collage',10,28);
    for(let i=0;i<4;i++)context.drawImage(images[i],(i%2)*300,40+Math.floor(i/2)*280,300,260);
    return canvas.toDataURL('image/jpeg',.9);
  },await Promise.all(['natural-wasps-1.jpg','natural-wasps-3.jpg','natural-wasps-2.jpg','natural-bees-2.jpg'].map(async file=>'data:image/jpeg;base64,'+(await readFile(path.join(fixtures,file))).toString('base64'))));
  await page.locator('#home').click();await page.locator('#practice').click();
  const collageChooser=page.waitForEvent('filechooser');await page.locator('#choose-photo').click();
  await(await collageChooser).setFiles({name:'collage.jpg',mimeType:'image/jpeg',buffer:Buffer.from(collage.split(',')[1],'base64')});
  await page.locator('#focus-photo').waitFor({state:'visible'});
  const originalPhoto=await page.locator('#captured-photo').getAttribute('src');
  await page.locator('#focus-photo').click();await page.locator('#focus-apply').waitFor({state:'visible'});
  await page.waitForFunction(()=>!document.querySelector('#focus-apply').disabled);
  await page.locator('#focus-cancel').click();assert.equal(await page.locator('#captured-photo').getAttribute('src'),originalPhoto,'Cancel preserves the original photo');
  await page.locator('#focus-photo').click();await page.waitForFunction(()=>!document.querySelector('#focus-apply').disabled);
  for(const [id,value] of [['focus-x','75'],['focus-y','28'],['focus-size','40']]){
    await page.locator('#'+id).evaluate((el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));},value);
  }
  await page.locator('#focus-apply').click();
  assert.equal(await page.locator('#focus-dialog').evaluate(el=>el.open),false);
  assert.match(await page.locator('#camera-status').textContent(),/Selected area ready/);
  assert.notEqual(await page.locator('#captured-photo').getAttribute('src'),originalPhoto);
  assert.equal(await page.locator('#check').evaluate(el=>el===document.activeElement),true);
  await scan(page);assert.match(await page.locator('#result-title').textContent(),/POSSIBLEWASP/);
  await page.locator('#focus-result').click();await page.waitForFunction(()=>!document.querySelector('#focus-apply').disabled);
  await page.locator('#focus-cancel').click();assert.equal(await page.locator('#result-screen').isVisible(),true);
  console.log('PASS Select a single wasp within a collage, cancel without losing the original, scan the chosen pixels, and reopen selection from the result.');
  await page.locator('#home').click();await page.locator('#practice').click();await choosePhoto(page,path.join(fixtures,'person.bmp'));
  await page.locator('#focus-photo').click();await page.waitForFunction(()=>!document.querySelector('#focus-apply').disabled);
  await page.locator('#focus-apply').click();await scan(page);
  assert.doesNotMatch(await page.locator('#result-title').textContent(),/POSSIBLE(WASP|BEE)/,'Selecting a portrait does not establish insect presence');
  console.log('PASS A selected portrait still cannot trigger an insect alert.');
  const stopped=await page.evaluate(async()=>{
    const {classifyPhoto}=await import('./insect-classifier.mjs');const controller=new AbortController();controller.abort();
    try{await classifyPhoto('unused',{signal:controller.signal});return false;}catch(error){return error.name==='AbortError';}
  });assert.equal(stopped,true,'Canceled analysis cannot return a prediction');
  for(const fill of ['white','black']){
    const result=await page.evaluate(async fill=>{
      const canvas=document.createElement('canvas');canvas.width=224;canvas.height=224;
      const context=canvas.getContext('2d');context.fillStyle=fill;context.fillRect(0,0,224,224);
      const {classifyPhoto}=await import('./insect-classifier.mjs');return classifyPhoto(canvas.toDataURL('image/jpeg'));
    },fill);
    assert.equal(result.verdict,'uncertain','Blank images must never trigger insect alerts');
  }
  console.log('PASS Blank black and white images cannot trigger alerts.');
  assert.equal(apiRequests,0);assert.equal(uploads,0);
  await context.setOffline(true);await page.reload();
  await page.locator('#home').click();await page.locator('#practice').click();await choosePhoto(page,path.join(fixtures,'natural-wasps-3.jpg'));
  await scan(page);assert.match(await page.locator('#result-title').textContent(),/SELECT THEINSECT/);await context.setOffline(false);
  console.log('PASS Actual model inference works offline after its first download, with zero photo uploads or API calls.');
  const failureContext=await browser.newContext({serviceWorkers:'block'});const failure=await failureContext.newPage();
  await failure.route('**/models/insects.tflite',route=>route.abort());await failure.goto(base);await failure.locator('#practice').click();
  await choosePhoto(failure,path.join(fixtures,'natural-wasps-1.jpg'));
  await failure.locator('#check').click();await failure.waitForFunction(()=>document.querySelector('#camera-status').textContent.includes('Could not check'));
  assert.equal(await failure.locator('#result-screen').isVisible(),false);assert.equal(await failure.locator('#check').isEnabled(),true);
  console.log('PASS Model download failures show an error and never fabricate a detection.');
  await failureContext.close();
  const corruptContext=await browser.newContext({serviceWorkers:'block'});
  try{
    const corrupt=await corruptContext.newPage();await corrupt.route('**/models/scene.tflite',route=>route.fulfill({body:'not a verified model'}));
    await corrupt.goto(base);await corrupt.locator('#practice').click();await choosePhoto(corrupt,path.join(fixtures,'natural-wasps-3.jpg'));
    await corrupt.locator('#check').click();await corrupt.waitForFunction(()=>document.querySelector('#camera-status').textContent.includes('Could not check'));
    assert.equal(await corrupt.locator('#result-screen').isVisible(),false);assert.equal(await corrupt.locator('#check').isEnabled(),true);
    console.log('PASS A corrupted scene model fails checksum verification and cannot produce a result.');
  }finally{await corruptContext.close();}
  assert.deepEqual(errors,[]);
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();server.close();});
