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
async function goHome(page){
  if(await page.locator('#buzz-screen').isVisible())return;
  const back=page.locator('[data-go="buzz"]:visible').first();
  if(await back.count())await back.click();
  else await page.locator('#home:visible').click();
}
async function openHistory(page){
  const shortcut=page.locator('.history-shortcut:visible').first();
  if(await shortcut.count())await shortcut.click();
  else {await goHome(page);await page.locator('#history:visible').click();}
}
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
  await page.goto(base);await page.locator('#practice').click();
  await check('Talk to Buzz is the first screen, with safety answers and optional voice',async()=>{
    await goHome(page);
    assert.equal(await page.locator('#buzz-screen').isVisible(),true);
    assert.equal(await page.locator('#buzz-title').textContent(),'Talk to Buzz');
    assert.match(await page.locator('#speech').textContent(),/Hi! I’m Buzz/);
    assert.equal(await page.locator('#camera').evaluate(el=>el.srcObject),null);
    await page.locator('[data-question="space"]').evaluate(button=>button.click());
    assert.match(await page.locator('#speech').textContent(),/Give wasps lots of space/);
    await page.locator('#microphone').click();
    assert.equal(await page.locator('#parent-dialog').evaluate(el=>el.open),true);
    await page.locator('#parent-done').click();
    await page.locator('#practice').click();
    assert.equal(await page.locator('#camera-screen').isVisible(),true);
    await page.locator('#camera-screen [data-go="buzz"]').click();
    assert.equal(await page.locator('#buzz-screen').isVisible(),true);
    await page.locator('#practice').click();
  });
  await check('Open camera opens the real camera screen',async()=>{
    assert.equal(await page.title(),'Wasp Buddy Lab');
    assert.equal(await page.locator('#camera-screen').isVisible(),true);
    assert.equal(await page.locator('#buzz-screen').isVisible(),false);
    assert.match(await page.locator('#take-photo').textContent(),/Start camera/);
    assert.equal(await page.locator('#practice-alert').count(),0);
  });
  await check('Sound button toggles accessible state',async()=>{
    await goHome(page);
    await page.locator('#sound').click();assert.equal(await page.locator('#sound').getAttribute('aria-pressed'),'false');
    await page.locator('#sound').click();assert.equal(await page.locator('#sound').getAttribute('aria-pressed'),'true');
    await page.locator('#practice').click();
  });
  await check('Live camera starts and releases its tracks on navigation',async()=>{
    await page.locator('#take-photo').click();
    await page.waitForFunction(()=>document.querySelector('#camera').srcObject?.getVideoTracks()[0]?.readyState==='live');
    await page.evaluate(()=>window.testTrack=document.querySelector('#camera').srcObject.getVideoTracks()[0]);
    await openHistory(page);assert.equal(await page.evaluate(()=>window.testTrack.readyState),'ended');
    await goHome(page);await page.locator('#practice').click();assert.equal(await page.locator('#camera-screen').isVisible(),true);
  });
  await check('Scan history starts empty and can return to camera',async()=>{
    await openHistory(page);assert.match(await page.locator('#history-list').textContent(),/No photo checks yet/);
    await page.locator('#history-screen [data-go="buzz"]').click();assert.equal(await page.locator('#buzz-screen').isVisible(),true);await page.locator('#practice').click();
  });
  await check('Primary screens fit common phone and browser viewports without page scrolling or clipped controls',async()=>{
    const assertFits=async label=>{
      const fit=await page.evaluate(()=>{
        const screen=[...document.querySelectorAll('.screen')].find(element=>!element.hidden),bounds=screen.getBoundingClientRect();
        const children=[...screen.children].filter(element=>{const box=element.getBoundingClientRect(),style=getComputedStyle(element);return style.display!=='none'&&style.visibility!=='hidden'&&box.width&&box.height;});
        return {horizontal:document.documentElement.scrollWidth<=innerWidth,vertical:document.body.scrollHeight<=innerHeight,children:children.every(element=>{const box=element.getBoundingClientRect();return box.top>=bounds.top-1&&box.bottom<=bounds.bottom+1;}),footer:document.querySelector('footer').getBoundingClientRect().bottom<=innerHeight+1};
      });
      assert.deepEqual(fit,{horizontal:true,vertical:true,children:true,footer:true},label);
    };
    for(const [width,height] of [[320,640],[375,667],[390,844],[430,932],[1024,700],[1366,768],[1440,900],[2048,1152]]){
      await page.setViewportSize({width,height});await goHome(page);await assertFits(`Home ${width}x${height}`);
      await page.locator('#listen-buzz').click();await assertFits(`Sound ${width}x${height}`);
      await page.locator('#buzzing-screen [data-go="buzz"]').click();await page.locator('#practice').click();await assertFits(`Camera ${width}x${height}`);
    }
  });
  await check('Camera denial keeps the camera app usable',async()=>{
    await page.addInitScript(()=>Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>{throw new DOMException('Denied','NotAllowedError');}}));
    await page.reload();await page.locator('#practice').click();await page.locator('#take-photo').click();
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
    await context.setOffline(true);await page.reload();assert.equal(await page.locator('#buzz-screen').isVisible(),true);await context.setOffline(false);
  });
  await check('Single-file bundle runs without network or a server',async()=>{
    const local=await browser.newContext({offline:true,viewport:{width:390,height:844}}),file=await local.newPage();
    const requests=[];file.on('request',req=>{if(/^https?:/.test(req.url()))requests.push(req.url());});
    // This cloud browser blocks all file: URLs by administrator policy.
    // Load the exact bundle bytes into a blank offline document instead.
    await file.setContent(await readFile(path.join(root,'dist/Wasp-Buddy.html'),'utf8'));
    assert.equal(await file.locator('#buzz-screen').isVisible(),true);
    await file.locator('#grownups').click();assert.equal(await file.locator('#parent-dialog').evaluate(el=>el.open),true);
    await file.locator('#parent-done').click();await file.locator('#practice').click();
    await file.locator('#photo-file').setInputFiles(path.join(root,'public/icon-192.png'));
    await file.locator('#focus-photo').waitFor({state:'visible'});await file.locator('#focus-photo').click();
    await file.waitForFunction(()=>!document.querySelector('#focus-apply').disabled);
    await file.locator('#focus-size').focus();await file.locator('#focus-size').press('ArrowRight');
    assert.equal(await file.locator('#focus-size').inputValue(),'46');
    await file.locator('#focus-apply').click();assert.match(await file.locator('#camera-status').textContent(),/Selected area ready/);
    assert.equal(requests.length,0);await local.close();
  });
  await check('Sound checker reports only generic buzzing and never claims a wasp from audio',async()=>{
    const soundContext=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}});
    const soundPage=await soundContext.newPage();soundPage.on('pageerror',error=>errors.push(error.message));
    await soundPage.route('**/buzz-sound-detector.mjs',route=>route.fulfill({contentType:'text/javascript',body:"export async function listenForBuzz({onProgress}){onProgress?.(1);return {verdict:'possible_buzz',frequency:190}}"}));
    await soundPage.goto(base);await soundPage.locator('#listen-buzz').click();
    assert.equal(await soundPage.locator('#buzzing-screen').isVisible(),true);
    await soundPage.locator('#buzz-listen').click();await soundPage.waitForFunction(()=>document.querySelector('#buzzing-result').textContent==='BUZZING HEARD');
    assert.match(await soundPage.locator('#buzzing-status').textContent(),/cannot confirm a wasp/i);
    await soundPage.locator('#buzzing-screen [data-go="buzz"]').click();
    assert.equal(await soundPage.locator('#buzz-screen').isVisible(),true);await soundContext.close();
  });
  await check('Choose a photo opens the file picker and produces a JPEG for Scan',async()=>{
    await goHome(page);await page.locator('#practice').click();
    await choosePhoto(page);
    await page.waitForFunction(()=>!document.querySelector('#captured-photo').hidden);
    assert.match(await page.locator('#captured-photo').getAttribute('src'),/^data:image\/jpeg;base64,/);
    await page.locator('#check').click();assert.equal(await page.locator('#parent-dialog').evaluate(el=>el.open),true);
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
    page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto(base);await page.locator('#practice').click();
    await goHome(page);await page.locator('#grownups').click();await page.locator('#photo-consent').check();await page.locator('#parent-done').click();
    let uploads=0;
    for(const verdict of ['possible_wasp','no_wasp_visible','uncertain']){
      await page.route('**/api/scan',async route=>{
        const body=route.request().postDataJSON();assert.equal(body.consent,true);assert.match(body.image,/^data:image\/jpeg;base64,/);uploads++;
        await route.fulfill({json:{verdict,scope:'single_photo',distanceAvailable:false}});
      });
      await goHome(page);await page.locator('#practice').click();
      if(verdict==='possible_wasp'){
        await page.locator('#enable-camera').click();
        await page.waitForFunction(()=>document.querySelector('#camera').videoWidth>0);
      }else{
        await choosePhoto(page);
        await page.waitForFunction(()=>!document.querySelector('#captured-photo').hidden);
      }
      await page.locator('#check').click();await page.waitForFunction(()=>!document.querySelector('#result-screen').hidden);
      assert.match(await page.locator('#result-badge').textContent(),/ONE PHOTO/);
      const expected={possible_wasp:/SELECT THEINSECT/,no_wasp_visible:/NOTSPOTTED/,uncertain:/I’M NOTSURE/};
      assert.match(await page.locator('#result-title').textContent(),expected[verdict]);
      if(verdict==='possible_wasp'){
        assert.match(await page.locator('#result-message').textContent(),/will not label a whole camera picture or a person/);
        assert.equal(await page.locator('.app').evaluate(el=>el.classList.contains('alert-state')),false);
      }
      assert.equal(await page.locator('.app').evaluate(el=>el.classList.contains('clear-state')),false);
      assert.equal(await page.locator('#result-photo').isVisible(),true);await page.unroute('**/api/scan');
    }
    assert.equal(uploads,3);
  });
  await check('Radar follows camera waiting, scan progress, completion and cancellation, with reduced motion',async()=>{
    const radarContext=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}});
    await radarContext.addInitScript(()=>{
      window.BUZZ_RUNTIME={photoChecks:true,recognition:'server'};
      localStorage.setItem('buzz-photo-allowed','yes');
      Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:()=>new Promise((resolve,reject)=>{window.__denyCamera=()=>reject(new DOMException('Denied','NotAllowedError'));})});
    });
    try{
      const radarPage=await radarContext.newPage();radarPage.on('pageerror',error=>errors.push(error.message));
      await radarPage.goto(base);await radarPage.locator('#practice').click();
      assert.equal(await radarPage.locator('#scan-radar').isVisible(),false);
      await radarPage.locator('#take-photo').click();
      assert.equal(await radarPage.locator('#scan-radar').isVisible(),true);
      assert.match(await radarPage.locator('#radar-label').textContent(),/Waiting for camera/);
      await radarPage.evaluate(()=>window.__denyCamera());
      await radarPage.waitForFunction(()=>document.querySelector('.camera-frame').getAttribute('aria-busy')==='false');
      assert.equal(await radarPage.locator('#scan-radar').isVisible(),false);
      await choosePhoto(radarPage);await radarPage.waitForFunction(()=>!document.querySelector('#captured-photo').hidden);
      assert.equal(await radarPage.locator('#radar-label').textContent(),'Ready to check');
      let pending;
      await radarPage.route('**/api/scan',route=>{pending=route;});
      await radarPage.locator('#check').click();
      await radarPage.waitForFunction(()=>document.querySelector('#scan-radar').classList.contains('is-busy'));
      assert.equal(await radarPage.locator('.camera-frame').getAttribute('aria-busy'),'true');
      const before=await radarPage.locator('.radar-sweep').evaluate(el=>getComputedStyle(el).transform);
      await radarPage.waitForTimeout(120);
      assert.notEqual(await radarPage.locator('.radar-sweep').evaluate(el=>getComputedStyle(el).transform),before);
      await radarPage.emulateMedia({reducedMotion:'reduce'});
      assert.equal(await radarPage.locator('.radar-sweep').evaluate(el=>getComputedStyle(el).animationName),'none');
      assert.match(await radarPage.locator('#radar-label').textContent(),/Analyzing/);
      await pending.fulfill({json:{verdict:'uncertain'}});
      await radarPage.locator('#result-screen').waitFor({state:'visible'});
      assert.equal(await radarPage.locator('#scan-radar').evaluate(el=>el.hidden),true);
      assert.equal(await radarPage.locator('.camera-frame').getAttribute('aria-busy'),'false');
      await goHome(radarPage);await radarPage.locator('#practice').click();await choosePhoto(radarPage);
      await radarPage.waitForFunction(()=>!document.querySelector('#captured-photo').hidden);
      await radarPage.locator('#check').click();await radarPage.waitForFunction(()=>document.querySelector('.camera-frame').getAttribute('aria-busy')==='true');
      await goHome(radarPage);
      assert.equal(await radarPage.locator('#scan-radar').evaluate(el=>el.hidden),true);
      assert.equal(await radarPage.locator('.camera-frame').getAttribute('aria-busy'),'false');
      assert.equal(await radarPage.locator('#buzz-screen').isVisible(),true);
    }finally{await radarContext.close();}
  });
  await check('A failed online scan produces no result',async()=>{
    await goHome(page);await page.locator('#practice').click();
    await choosePhoto(page);
    await page.waitForFunction(()=>!document.querySelector('#captured-photo').hidden);
    await context.setOffline(true);await page.locator('#check').click();
    await page.waitForFunction(()=>document.querySelector('#camera-status').textContent.includes('No result was made'));
    assert.equal(await page.locator('#result-screen').isVisible(),false);assert.equal(await page.locator('#check').isEnabled(),true);await context.setOffline(false);
  });
  await check('Voice questions show transcripts, release listening, and explain browser failures (stubbed speech service)',async()=>{
    const voiceContext=await browser.newContext({serviceWorkers:'block'});
    await voiceContext.addInitScript(()=>{
      localStorage.setItem('buzz-voice-allowed','yes');
      window.__voiceStarts=0;window.__voiceAborts=0;window.__spoken=[];window.__cancelCount=0;
      class FakeRecognition{
        constructor(){window.__voice=this;}
        start(){window.__voiceStarts++;this.onstart?.();}
        abort(){window.__voiceAborts++;}
      }
      window.SpeechRecognition=FakeRecognition;
      Object.defineProperty(window,'SpeechSynthesisUtterance',{value:class{constructor(text){this.text=text;}}});
      Object.defineProperty(window,'speechSynthesis',{value:{getVoices:()=>[],resume(){},cancel(){window.__cancelCount++;},speak(message){window.__spoken.push(message.text);window.__lastUtterance=message;}}});
    });
    try{
      const voicePage=await voiceContext.newPage();voicePage.on('pageerror',error=>errors.push(error.message));await voicePage.goto(base);
      await voicePage.locator('#read').click();
      const cancellations=await voicePage.evaluate(()=>window.__cancelCount);
      await voicePage.locator('#microphone').click();
      assert.match(await voicePage.locator('#voice-status').textContent(),/Listening/);
      assert.ok(await voicePage.evaluate(()=>window.__cancelCount)>cancellations,'Listening stops Buzz playback');
      await voicePage.evaluate(()=>window.__voice.onresult({results:[[{transcript:'I got stung'}]]}));
      assert.match(await voicePage.locator('#speech').textContent(),/Tell your grown-up straight away/);
      assert.match(await voicePage.locator('#voice-status').textContent(),/Buzz heard: “I got stung”/);
      assert.equal(await voicePage.locator('#microphone').getAttribute('aria-label'),'Ask Buzz a question using your microphone');
      for(const [error,expected] of [['not-allowed',/site settings/],['no-speech',/No speech/],['audio-capture',/No microphone/],['network',/internet connection/]]){
        await voicePage.locator('#microphone').click();
        await voicePage.evaluate(error=>window.__voice.onerror({error}),error);
        assert.match(await voicePage.locator('#voice-status').textContent(),expected);
        assert.equal(await voicePage.locator('#microphone').evaluate(el=>el.classList.contains('listening')),false);
      }
      await voicePage.locator('#microphone').click();await voicePage.evaluate(()=>window.__voice.onend());
      assert.match(await voicePage.locator('#voice-status').textContent(),/No question was heard/);
      await voicePage.clock.install();
      await voicePage.locator('#microphone').click();await voicePage.clock.fastForward(15_001);
      assert.match(await voicePage.locator('#voice-status').textContent(),/No question was heard/);
      assert.equal(await voicePage.locator('#microphone').evaluate(el=>el.classList.contains('listening')),false);
      await voicePage.clock.resume();
      await voicePage.locator('#microphone').click();await voicePage.locator('#practice').click();
      assert.equal(await voicePage.evaluate(()=>window.__voice.onresult),null,'Leaving Buzz detaches recognition callbacks');
      await goHome(voicePage);await voicePage.locator('#read').click();
      await voicePage.evaluate(()=>window.__lastUtterance.onerror({error:'synthesis-failed'}));
      assert.match(await voicePage.locator('#voice-status').textContent(),/voice could not play/);
      await voicePage.evaluate(()=>{window.SpeechRecognition=undefined;window.webkitSpeechRecognition=undefined;});
      await voicePage.locator('#microphone').click();assert.match(await voicePage.locator('#voice-status').textContent(),/browser cannot understand/);
    }finally{await voiceContext.close();}
  });
  assert.deepEqual(errors,[]);console.log(`${checks} functional checks passed; no browser JavaScript errors.`);
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill('SIGTERM');});
