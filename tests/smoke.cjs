const assert = require('node:assert/strict');
const {spawn} = require('node:child_process');
const {readFile} = require('node:fs/promises');
const path = require('node:path');
const {chromium} = require('playwright');
const root = path.resolve(__dirname,'..');
const port = process.env.TEST_PORT || '4319';
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:port},stdio:'pipe'});
let browser;
let checks = 0;
async function check(label,work){await work();checks++;console.log(`PASS ${label}`);}
async function choosePhoto(page){const pending=page.waitForEvent('filechooser');await page.locator('#choose-photo').click();await(await pending).setFiles(path.join(root,'public/icon-192.png'));}
(async()=>{
  for(let i=0;i<50;i++){
    try{const response=await fetch(base);if(response.ok)break;}catch{}
    if(i===49)throw Error('Server did not start');
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {}),args:['--no-sandbox','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
  let context=await browser.newContext({viewport:{width:390,height:844},permissions:['camera']});
  await context.addInitScript(()=>{window.BUZZ_RUNTIME={photoChecks:true,recognition:'server'};});
  let page=await context.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base);
  await check('App opens on the real camera screen',async()=>{
    assert.equal(await page.title(),'Wasp Buddy Camera');
    assert.equal(await page.locator('#camera-screen').isVisible(),true);
    assert.equal(await page.locator('#buzz-screen').isVisible(),false);
    assert.match(await page.locator('#take-photo').textContent(),/Start camera/);
    assert.equal(await page.locator('#practice-alert').count(),0);
  });
  await check('Sound button toggles accessible state',async()=>{
    await page.locator('#sound').click();assert.equal(await page.locator('#sound').getAttribute('aria-pressed'),'false');
    await page.locator('#sound').click();assert.equal(await page.locator('#sound').getAttribute('aria-pressed'),'true');
  });
  await check('Live camera starts and releases its tracks on navigation',async()=>{
    await page.locator('#take-photo').click();
    await page.waitForFunction(()=>document.querySelector('#camera').srcObject?.getVideoTracks()[0]?.readyState==='live');
    await page.evaluate(()=>window.testTrack=document.querySelector('#camera').srcObject.getVideoTracks()[0]);
    await page.locator('#history').click();assert.equal(await page.evaluate(()=>window.testTrack.readyState),'ended');
    await page.locator('#home').click();assert.equal(await page.locator('#camera-screen').isVisible(),true);
  });
  await check('Scan history starts empty and can return to camera',async()=>{
    await page.locator('#history').click();assert.match(await page.locator('#history-list').textContent(),/No photo checks yet/);
    await page.locator('[data-go="camera"]').click();assert.equal(await page.locator('#camera-screen').isVisible(),true);
  });
  await check('No horizontal overflow at phone sizes',async()=>{
    await page.locator('#home').click();
    for(const width of [320,390,430]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
  });
  await check('Camera denial keeps the camera app usable',async()=>{
    await page.addInitScript(()=>Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>{throw new DOMException('Denied','NotAllowedError');}}));
    await page.reload();await page.locator('#take-photo').click();
    await page.waitForFunction(()=>document.querySelector('#camera-status').textContent.includes('permission was not given'));
    assert.equal(await page.locator('#take-photo').isVisible(),true);
    assert.equal(await page.locator('#photo-file').getAttribute('capture'),null);
    assert.equal(await page.locator('#choose-photo').isVisible(),true);
    await page.locator('#check').click();assert.match(await page.locator('#camera-status').textContent(),/First turn on/);
  });
  await check('Installed web assets work offline after caching',async()=>{
    await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
    await page.reload();
    await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
    await context.setOffline(true);await page.reload();assert.equal(await page.locator('#camera-screen').isVisible(),true);await context.setOffline(false);
  });
  await check('Single-file bundle runs without network or a server',async()=>{
    const local=await browser.newContext({offline:true,viewport:{width:390,height:844}}),file=await local.newPage();
    const requests=[];file.on('request',req=>{if(/^https?:/.test(req.url()))requests.push(req.url());});
    // This cloud browser blocks all file: URLs by administrator policy.
    // Load the exact bundle bytes into a blank offline document instead.
    await file.setContent(await readFile(path.join(root,'dist/Wasp-Buddy.html'),'utf8'));
    assert.equal(await file.locator('#camera-screen').isVisible(),true);
    await file.locator('#grownups').click();assert.equal(await file.locator('dialog').evaluate(el=>el.open),true);
    assert.equal(requests.length,0);await local.close();
  });
  await check('Choose a photo opens the file picker and produces a JPEG for Scan',async()=>{
    await page.locator('#home').click();
    await choosePhoto(page);
    await page.waitForFunction(()=>!document.querySelector('#captured-photo').hidden);
    assert.match(await page.locator('#captured-photo').getAttribute('src'),/^data:image\/jpeg;base64,/);
    await page.locator('#check').click();assert.equal(await page.locator('dialog').evaluate(el=>el.open),true);
    await page.locator('#photo-consent').check();await page.locator('#parent-done').click();
    await page.locator('#check').click();
    await page.waitForFunction(()=>document.querySelector('#camera-status').textContent.includes('not connected'));
    assert.equal(await page.locator('#result-screen').isVisible(),false);
  });
  await check('Photo upload and three model-response screens work (stubbed provider)',async()=>{
    // Request routing cannot reliably intercept service-worker-owned requests.
    // Offline service-worker behavior is exercised separately above.
    await context.close();
    context=await browser.newContext({serviceWorkers:'block',permissions:['camera'],viewport:{width:390,height:844}});
    await context.addInitScript(()=>{window.BUZZ_RUNTIME={photoChecks:true,recognition:'server'};});
    page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto(base);
    await page.locator('#grownups').click();await page.locator('#photo-consent').check();await page.locator('#parent-done').click();
    let uploads=0;
    for(const verdict of ['possible_wasp','no_wasp_visible','uncertain']){
      await page.route('**/api/scan',async route=>{
        const body=route.request().postDataJSON();assert.equal(body.consent,true);assert.match(body.image,/^data:image\/jpeg;base64,/);uploads++;
        await route.fulfill({json:{verdict,scope:'single_photo',distanceAvailable:false}});
      });
      await page.locator('#home').click();
      if(verdict==='possible_wasp'){
        await page.locator('#enable-camera').click();
        await page.waitForFunction(()=>document.querySelector('#camera').videoWidth>0);
      }else{
        await choosePhoto(page);
        await page.waitForFunction(()=>!document.querySelector('#captured-photo').hidden);
      }
      await page.locator('#check').click();await page.waitForFunction(()=>!document.querySelector('#result-screen').hidden);
      assert.match(await page.locator('#result-badge').textContent(),/ONE PHOTO/);
      const expected={possible_wasp:/POSSIBLEWASP/,no_wasp_visible:/NOTSPOTTED/,uncertain:/I’M NOTSURE/};
      assert.match(await page.locator('#result-title').textContent(),expected[verdict]);
      assert.equal(await page.locator('.app').evaluate(el=>el.classList.contains('clear-state')),false);
      assert.equal(await page.locator('#result-photo').isVisible(),true);await page.unroute('**/api/scan');
    }
    assert.equal(uploads,3);
  });
  await check('A failed online scan produces no result',async()=>{
    await page.locator('#home').click();
    await choosePhoto(page);
    await page.waitForFunction(()=>!document.querySelector('#captured-photo').hidden);
    await context.setOffline(true);await page.locator('#check').click();
    await page.waitForFunction(()=>document.querySelector('#camera-status').textContent.includes('No result was made'));
    assert.equal(await page.locator('#result-screen').isVisible(),false);assert.equal(await page.locator('#check').isEnabled(),true);await context.setOffline(false);
  });
  assert.deepEqual(errors,[]);console.log(`${checks} functional checks passed; no browser JavaScript errors.`);
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill('SIGTERM');});
