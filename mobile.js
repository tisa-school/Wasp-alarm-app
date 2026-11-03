(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const app = $('.app');
  const photoChecksEnabled = window.BUZZ_RUNTIME?.photoChecks !== false;
  const localRecognition = photoChecksEnabled && window.BUZZ_RUNTIME?.recognition !== 'server';
  const scanLabel = photoChecksEnabled ? 'SCAN' : 'PHOTO';
  let soundOn = true;
  const sounds = new window.BuzzSound();
  let stream;
  let recognition;
  let listeningTimer;
  let screen = 'buzz';
  let cameraPending = false;
  let cameraGeneration = 0;
  let installPrompt;
  let voiceAllowed = false;
  let photoAllowed = false;
  let selectedPhoto;
  let selectedPhotoFocused = false;
  let scanController;
  let scanGeneration = 0;
  let practiceHistory = [];
  try { voiceAllowed = localStorage.getItem('buzz-voice-allowed') === 'yes';
    soundOn = localStorage.getItem('buzz-sound') !== 'off';
    photoAllowed = localStorage.getItem('buzz-photo-allowed') === 'yes';
    const saved = JSON.parse(localStorage.getItem('buzz-practice') || '[]');
    if (Array.isArray(saved)) practiceHistory = saved.filter(item => item && typeof item.clear === 'boolean' && Number.isFinite(item.time)).slice(0,20);
  } catch { /* Private browsing can disable storage. The app still works. */ }
  function save(key, value) { try { localStorage.setItem(key, value); } catch { /* Session-only fallback. */ } }
  function syncSound() {
    sounds.setEnabled(soundOn);
    $('#sound').setAttribute('aria-pressed',String(soundOn));
    $('#sound').setAttribute('aria-label',soundOn ? 'Mute voice and sounds' : 'Turn voice and sounds on');
    $('#sound').classList.toggle('sound-off',!soundOn);
    save('buzz-sound',soundOn ? 'on' : 'off');
  }
  // Do not initialize AudioContext until a tap. In particular, avoid autoplay
  // attempts when restoring an enabled preference at page load.
  if(!soundOn)syncSound();
  function speak(text) {
    if(soundOn)sounds.speak(text,{onError:message=>{
      $('#voice-status').textContent=message;
      if($('#parent-dialog').open)$('#sound-status').textContent=message;
    }});
  }
  function stopListening() {
    clearTimeout(listeningTimer);
    if (recognition) {
      const current=recognition;recognition=undefined;
      current.onstart=null;current.onend=null;current.onerror=null;current.onresult=null;
      try{current.abort();}catch{ /* Already stopped by the browser. */ }
      if(/^(Listening|Starting microphone)/.test($('#voice-status').textContent))$('#voice-status').textContent='Voice stopped. Tap the mic to ask again.';
    }
    $('#microphone').classList.remove('listening');
    $('#microphone').setAttribute('aria-label', 'Ask Buzz a question using your microphone');
  }
  function updateRadar(){
    const busy=Boolean(scanController)||cameraPending;
    const visible=!document.hidden && screen==='camera' && (busy||Boolean(stream)||Boolean(selectedPhoto));
    $('#scan-radar').hidden=!visible;
    $('#focus-photo').hidden=!selectedPhoto;
    $('#scan-radar').classList.toggle('is-busy',busy);
    $('.camera-frame').classList.toggle('radar-visible',visible);
    $('.camera-frame').setAttribute('aria-busy',String(busy));
    $('#radar-label').textContent=scanController?'Analyzing photo…':cameraPending?'Waiting for camera…':'Ready to scan';
  }
  function stopCamera() {
    cameraGeneration++;
    stream?.getTracks().forEach(track => track.stop()); stream = undefined;
    $('#camera').srcObject = null;
    $('#camera-placeholder').hidden = false;
    $('#enable-camera').disabled = false;
    $('#take-photo').disabled = false;
    $('#take-photo').textContent = '📷 Start camera';
    cameraPending = false;updateRadar();
  }
  function show(next) {
    cancelScan();
    stopListening(); sounds.stop(); navigator.vibrate?.(0);
    if (next !== 'camera') { stopCamera(); clearPhoto(); }
    if (next !== 'result') { $('#result-photo').hidden = true; $('#result-photo').removeAttribute('src'); }
    screen = next;updateRadar();
    document.querySelectorAll('.screen').forEach(section => section.hidden = section.id !== `${next}-screen`);
    app.classList.remove('alert-state','clear-state','photo-neutral');
    window.scrollTo({top:0,behavior:'instant'});
    const heading = $(`#${next}-screen h1`);
    heading.setAttribute('tabindex','-1'); heading.focus({preventScroll:true});
  }
  function answer(question) {
    const text = question.toLowerCase();
    if (/stung|sting|hurt|ouch/.test(text)) return 'Tell your grown-up straight away if you get stung. They will help you. Keep away from the wasp.';
    if (/bee|bees/.test(text)) return 'Bees and wasps are little garden helpers! Give them space. Look with your eyes, and keep your hands still.';
    if (/scared|afraid|fear/.test(text)) return 'It is okay to feel scared. Take a slow breath. Walk away slowly, and find your grown-up. They can help!';
    if (/space|near|wasp|walk|safe/.test(text)) return 'Give wasps lots of space! Keep your hands still, walk away slowly, and tell your grown-up. One big grown-up step is a good way to practise making space.';
    return 'I know a few things about wasps, bees, and staying calm. Try asking: why do wasps need space? You can also tap a picture question!';
  }
  function tellBuzz(question) { stopListening(); $('#speech').textContent = answer(question); speak($('#speech').textContent); }
  $('#sound').addEventListener('click', () => {
    soundOn = !soundOn;
    syncSound();
    if(soundOn)chime();
  });
  $('#test-sound').addEventListener('click',()=>{
    soundOn=true;syncSound();
    const started=sounds.chime();
    speak('Hello! I am Buzz. Stay calm, and tell your grown-up.');
    $('#sound-status').textContent=started ? 'Listen for three notes and Buzz’s voice. If silent, check device volume, silent mode, and browser sound settings.' : 'This browser could not start sound. Check its sound permissions and try again.';
  });
  $('#home').addEventListener('click',() => show('buzz'));
  for (const button of document.querySelectorAll('[data-go]')) button.addEventListener('click',() => show(button.dataset.go));
  for (const id of ['practice','again']) $('#'+id).addEventListener('click',() => show('camera'));
  for (const button of document.querySelectorAll('[data-question]')) button.addEventListener('click',() => tellBuzz(button.dataset.question === 'sting' ? 'I got stung' : 'give wasps space'));
  $('#read').addEventListener('click',() => {stopListening();speak($('#speech').textContent);});
  $('#listen').addEventListener('click',() => {
    const guidance = photoChecksEnabled ? 'Point your camera, then tap Scan to check one photo. If you see a wasp, keep your hands still, walk away slowly, and tell a grown-up. A photo check can miss a wasp.' : 'Point your camera and tap Photo to take a picture. This camera does not recognise wasps. If you see a wasp, walk away slowly and tell a grown-up.';
    $('#camera-status').textContent = guidance;
    speak(guidance);
  });
  async function startCamera() {
    cancelScan();
    if (cameraPending || stream) return;
    if (!navigator.mediaDevices?.getUserMedia) { $('#camera-status').textContent = 'Live video needs a secure website. You can still use “Choose a photo”.'; return; }
    clearPhoto();
    cameraPending = true;updateRadar(); $('#enable-camera').disabled = true;
    $('#take-photo').disabled = true;
    const generation = ++cameraGeneration;
    try {
      const acquired = await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
      if (screen !== 'camera' || generation !== cameraGeneration || document.hidden) { acquired.getTracks().forEach(track => track.stop()); return; }
      stream = acquired; $('#camera').srcObject = stream; $('#camera-placeholder').hidden = true;
      $('#take-photo').textContent = 'Stop camera';
      $('#camera-status').textContent = photoChecksEnabled ? 'Live camera is on. Tap Scan to check one photo with your grown-up.' : 'Live camera is on. Tap Photo to capture a picture on this device.';
    } catch (error) {
      if (generation === cameraGeneration) $('#camera-status').textContent = error.name === 'NotAllowedError' ? 'Camera permission was not given. Allow it in your browser’s site settings, or use “Choose a photo”.' : 'Camera unavailable. Check another app is not using it, or use “Choose a photo”.';
    } finally {
      if (generation === cameraGeneration) { cameraPending = false;updateRadar(); $('#enable-camera').disabled = false; $('#take-photo').disabled = false; }
    }
  }
  $('#enable-camera').addEventListener('click',startCamera);
  $('#take-photo').addEventListener('click',()=>{
    if(stream){cancelScan();stopCamera();$('#camera-status').textContent='Camera is off. You can turn it on again or choose a photo.';}
    else startCamera();
  });
  function chime() {
    if(soundOn)sounds.chime();
  }
  $('#acknowledge').addEventListener('click',() => show('camera'));
  function renderHistory() {
    const list = $('#history-list'); list.replaceChildren();
    if (!practiceHistory.length) { const empty = document.createElement('p');empty.className='empty';empty.textContent='No photo checks yet.';list.append(empty); }
    for (const item of practiceHistory) {
      const entry = document.createElement('p');
      const names = {possible_wasp:'Photo · Possible wasp',possible_bee:'Photo · Possible bee',no_wasp_visible:'Photo · No wasp spotted',uncertain:'Photo · Not sure'};
      const label = names[item.verdict] || 'Photo · Not sure';
      entry.textContent = `${label}\n${new Date(item.time).toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}`;
      entry.style.whiteSpace='pre-line';list.append(entry);
    }
    $('#clear-history').hidden = practiceHistory.length === 0;
  }
  $('#history').addEventListener('click',() => { renderHistory(); show('history'); });
  $('#clear-history').addEventListener('click',() => { practiceHistory=[];save('buzz-practice','[]');renderHistory(); });
  const dialog = $('#parent-dialog');
  $('#grownups').addEventListener('click',() => { stopListening(); sounds.stop(); dialog.showModal(); });
  for (const id of ['close-dialog','parent-done']) $('#'+id).addEventListener('click',() => dialog.close());
  $('#voice-consent').checked = voiceAllowed;
  $('#photo-consent').checked = photoAllowed;
  $('#photo-consent').addEventListener('change',event => {photoAllowed=event.target.checked;save('buzz-photo-allowed',photoAllowed ? 'yes' : 'no');if(!photoAllowed)cancelScan();});
  $('#voice-consent').addEventListener('change',event => { voiceAllowed=event.target.checked;save('buzz-voice-allowed',voiceAllowed ? 'yes' : 'no');if(!voiceAllowed)stopListening(); });
  $('#microphone').addEventListener('click',() => {
    if (recognition) { stopListening(); $('#voice-status').textContent='Voice stopped. You can pick a picture question.'; return; }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { $('#voice-status').textContent='This browser cannot understand voice questions. Try Safari or Chrome, or tap a picture question.';return; }
    if(!window.isSecureContext){$('#voice-status').textContent='Microphone questions need the secure HTTPS website. You can still tap a picture question.';return;}
    if (!voiceAllowed) { $('#voice-status').textContent='Ask your grown-up to allow voice questions, then tap the mic again.';dialog.showModal();return; }
    // Stop all output before opening the microphone so Buzz cannot hear itself.
    sounds.stop();
    let current;
    try{current=new SpeechRecognition();}catch{$('#voice-status').textContent='Voice questions could not start in this browser. Tap a picture question.';return;}
    recognition=current;
    current.lang='en-GB';current.interimResults=false;current.maxAlternatives=1;current.continuous=false;
    const finish=message=>{
      if(recognition!==current)return;
      stopListening();$('#voice-status').textContent=message;
    };
    const timeout=()=>finish('No question was heard. Tap the mic to try again, or pick a picture question.');
    current.onstart=()=>{
      if(recognition!==current)return;
      clearTimeout(listeningTimer);listeningTimer=setTimeout(timeout,15_000);
      $('#voice-status').textContent='Listening… ask in English. Tap the mic to stop.';
    };
    current.onresult=event=>{
      if(recognition!==current)return;
      const transcript=event.results?.[0]?.[0]?.transcript?.trim();
      if(!transcript){finish('No words were heard. Tap the mic to try again, or pick a picture question.');return;}
      stopListening();
      $('#voice-status').textContent='Buzz heard: “'+transcript.slice(0,200)+'”';
      tellBuzz(transcript);
    };
    current.onerror=event=>{
      const messages={
        'not-allowed':'Microphone access was blocked. Ask your grown-up to allow the microphone in this browser’s site settings, then try again.',
        'service-not-allowed':'The browser’s speech service is blocked. Ask your grown-up to check browser settings, or tap a picture question.',
        'audio-capture':'No microphone is available. Check that it is connected and another app is not using it.',
        'no-speech':'No speech was heard. Tap the mic and ask in English, or pick a picture question.',
        network:'The browser’s speech service could not connect. Check your internet connection, or tap a picture question.',
        'language-not-supported':'English voice recognition is unavailable in this browser. Tap a picture question.',
        aborted:'Voice stopped. Tap the mic to try again.'
      };
      finish(messages[event.error]||'Voice recognition failed. Tap the mic to try again, or pick a picture question.');
    };
    current.onend=()=>finish('No question was heard. Tap the mic to try again, or pick a picture question.');
    $('#microphone').classList.add('listening');$('#microphone').setAttribute('aria-label','Stop listening');
    $('#voice-status').textContent='Starting microphone… allow access if your browser asks.';
    listeningTimer=setTimeout(timeout,15_000);
    try{current.start();}
    catch(error){finish(error.name==='NotAllowedError'?'Microphone access was blocked. Ask your grown-up to allow it in this browser’s site settings.':'Microphone unavailable. Tap the mic to try again, or pick a picture question.');}
  });
  window.addEventListener('beforeinstallprompt',event => { event.preventDefault();installPrompt=event;$('#install').hidden=false; });
  $('#install').addEventListener('click',async () => {
    if(!installPrompt)return;
    try { await installPrompt.prompt();const choice=await installPrompt.userChoice;$('#install-message').textContent=choice.outcome==='accepted' ? 'Installation requested. Look for Wasp Buddy on your home screen.' : 'You can install later or keep using the camera in your browser.'; }
    catch { $('#install-message').textContent='Use your browser’s Add to Home Screen option.'; }
    installPrompt=undefined;$('#install').hidden=true;
  });
  if('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('./sw.js').catch(()=>{});
  function clearPhoto() { $('#photo-file').value=''; selectedPhoto = undefined;selectedPhotoFocused=false; $('#captured-photo').hidden = true; $('#captured-photo').removeAttribute('src');updateRadar(); }
  function photoData(image,width,height) {
    if(!width || !height)throw new Error('Camera not ready');
    const scale=Math.min(1,960/Math.max(width,height));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
    canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
    return canvas.toDataURL('image/jpeg',.82);
  }
  $('#choose-photo').addEventListener('click',()=>{cancelScan();$('#photo-file').value='';$('#photo-file').click();});
  $('#photo-file').addEventListener('change',async event=>{
    const file=event.target.files?.[0];if(!file)return;
    if(file.size>30_000_000){$('#camera-status').textContent='That photo is too large. Try a smaller photo.';return;}
    cancelScan();stopCamera();const generation=cameraGeneration;
    const url=URL.createObjectURL(file);
    try{
      const image=new Image();image.src=url;await image.decode();
      if(screen!=='camera' || generation!==cameraGeneration)return;
      selectedPhoto=photoData(image,image.naturalWidth,image.naturalHeight);
      selectedPhotoFocused=false;
      $('#captured-photo').src=selectedPhoto;$('#captured-photo').hidden=false;$('#camera-placeholder').hidden=true;updateRadar();
      $('#camera-status').textContent=photoChecksEnabled ? 'Your photo is ready. Tap Scan with your grown-up to check it.' : 'Your real photo is ready. This camera version cannot recognise wasps.';
    }catch{$('#camera-status').textContent='Could not read that photo. Try taking another picture.';}
    finally{URL.revokeObjectURL(url);}
  });
  const focusDialog=$('#focus-dialog');
  let focusImage,focusGeometry,focusGeneration=0;
  function currentFocus(){return focusGeometry(focusImage.naturalWidth,focusImage.naturalHeight,Number($('#focus-x').value),Number($('#focus-y').value),Number($('#focus-size').value));}
  function drawFocus(){
    if(!focusImage||!focusGeometry)return;
    const canvas=$('#focus-preview'),context=canvas.getContext('2d');
    const scale=Math.min(1,640/Math.max(focusImage.naturalWidth,focusImage.naturalHeight));
    canvas.width=Math.max(1,Math.round(focusImage.naturalWidth*scale));canvas.height=Math.max(1,Math.round(focusImage.naturalHeight*scale));
    context.drawImage(focusImage,0,0,canvas.width,canvas.height);
    const crop=currentFocus(),sx=canvas.width/focusImage.naturalWidth,sy=canvas.height/focusImage.naturalHeight;
    const x=crop.x*sx,y=crop.y*sy,w=crop.size*sx,h=crop.size*sy;
    context.fillStyle='#0b261ab3';
    context.fillRect(0,0,canvas.width,y);context.fillRect(0,y+h,canvas.width,canvas.height-y-h);
    context.fillRect(0,y,x,h);context.fillRect(x+w,y,canvas.width-x-w,h);
    context.strokeStyle='#ffcf00';context.lineWidth=3;context.strokeRect(x,y,w,h);
    $('#focus-status').textContent='Only the yellow box will be scanned.';
  }
  async function openFocus(source){
    if(!source)return;
    cancelScan();stopListening();sounds.stop();
    const generation=++focusGeneration;focusImage=undefined;
    for(const [id,value] of [['focus-x','50'],['focus-y','50'],['focus-size','45']])$('#'+id).value=value;
    $('#focus-apply').disabled=true;$('#focus-status').textContent='Loading photo…';focusDialog.showModal();
    try{
      const [{cropRect},image]=await Promise.all([import('./photo-crop.mjs'),(async()=>{const image=new Image();image.src=source;await image.decode();return image;})()]);
      if(generation!==focusGeneration||!focusDialog.open)return;
      focusImage=image;focusGeometry=cropRect;drawFocus();$('#focus-apply').disabled=false;
    }catch{if(generation===focusGeneration)$('#focus-status').textContent='Could not open this photo. Keep the original photo and try again.';}
  }
  $('#focus-photo').addEventListener('click',()=>openFocus(selectedPhoto));
  $('#focus-result').addEventListener('click',()=>openFocus($('#result-photo').getAttribute('src')));
  for(const id of ['focus-x','focus-y','focus-size'])$('#'+id).addEventListener('input',drawFocus);
  $('#focus-preview').addEventListener('pointerdown',event=>{
    if(!focusImage)return;
    const box=event.currentTarget.getBoundingClientRect();
    $('#focus-x').value=String(Math.round(100*(event.clientX-box.left)/box.width));
    $('#focus-y').value=String(Math.round(100*(event.clientY-box.top)/box.height));drawFocus();
  });
  for(const id of ['focus-close','focus-cancel'])$('#'+id).addEventListener('click',()=>focusDialog.close());
  focusDialog.addEventListener('close',()=>{focusGeneration++;focusImage=undefined;$('#focus-preview').width=1;$('#focus-preview').height=1;});
  $('#focus-apply').addEventListener('click',()=>{
    if(!focusImage||!focusGeometry)return;
    try{
      const crop=currentFocus(),canvas=document.createElement('canvas');canvas.width=canvas.height=Math.min(960,crop.size);
      canvas.getContext('2d').drawImage(focusImage,crop.x,crop.y,crop.size,crop.size,0,0,canvas.width,canvas.height);
      const photo=canvas.toDataURL('image/jpeg',.9);
      show('camera');stopCamera();selectedPhoto=photo;
      selectedPhotoFocused=true;
      $('#captured-photo').src=photo;$('#captured-photo').hidden=false;$('#camera-placeholder').hidden=true;updateRadar();
      $('#camera-status').textContent='Selected area ready. Tap Scan to check this insect photo.';
      focusDialog.close();$('#check').focus();
    }catch{$('#focus-status').textContent='Could not use that selection. Keep the original photo and try again.';}
  });
  function cancelScan(){if(scanController)$('#camera-status').textContent='Photo check paused. Tap Scan to try again.';scanGeneration++;scanController?.abort();scanController=undefined;$('#check').disabled=false;$('#check').textContent=scanLabel;updateRadar();}
  function protectUnfocusedPhoto(result,photoWasFocused){
    if(!photoWasFocused && ['possible_wasp','possible_bee'].includes(result?.verdict))
      return {...result,verdict:'uncertain',reason:'needs_insect_focus'};
    return result;
  }
  function photoResult(verdict,photo,reason){
    show('result');$('#result-screen').classList.add('photo-result');
    $('#result-badge').textContent='ONE PHOTO · NOT A SAFETY GUARANTEE';
    $('#result-photo').src=photo;$('#result-photo').hidden=false;$('#result-wasp').hidden=true;$('#result-sun').hidden=true;
    const outcomes={
      possible_wasp:{title:'POSSIBLE<br>WASP',message:'This is only a guess about the selected area. It never means a person is dangerous. Show your grown-up.',symbol:'!',voice:'The selected area may contain a wasp. This is only a photo guess and never means a person is dangerous. Show your grown-up.'},
      possible_bee:{title:'POSSIBLE<br>BEE',message:'This is only a guess about the selected area. It never means a person is dangerous. Show your grown-up.',symbol:'!',voice:'The selected area may contain a bee. This is only a photo guess and never means a person is dangerous. Show your grown-up.'},
      no_wasp_visible:{title:'NOT<br>SPOTTED',message:'No wasp spotted in this photo. It could still be nearby.',symbol:'?',voice:'No wasp spotted in this photo. Buzz can miss a wasp. Stay with your grown-up.'},
      uncertain:{title:'I’M NOT<br>SURE',message:'Ask your grown-up to look. Keep your distance.',symbol:'?',voice:'I am not sure about this photo. Keep your distance and ask your grown-up to look.'}
    };
    const warning=verdict==='possible_wasp'||verdict==='possible_bee';
    const outcome={...outcomes[verdict]};
    if(reason==='insect_not_confirmed')Object.assign(outcome,{title:'INSECT NOT<br>CONFIRMED',message:'Buzz could not confirm an insect. Screen borders, small subjects, or blur can hide it. Try the original photo with your grown-up.',voice:'I could not confirm an insect in this photo. Ask your grown-up to help. This does not mean the area is safe.'});
    if(reason==='needs_insect_focus')Object.assign(outcome,{title:'SELECT THE<br>INSECT',message:'No wasp warning was made. Buzz will not label a whole camera picture or a person. Ask a grown-up to select only the insect.',voice:'No wasp warning was made. I will not label a whole camera picture or a person. Ask a grown-up to select only the insect.'});
    if(reason==='species_uncertain')Object.assign(outcome,{message:'The models could not agree on a wasp or bee. Try a clearer existing photo. Do not move closer to an insect.'});app.classList.add(warning?'alert-state':'photo-neutral');
    $('#result-title').innerHTML=outcome.title;$('#result-message').textContent=outcome.message;$('#result-sticker').textContent=outcome.symbol;
    $('#acknowledge').textContent='Got it!';$('#result-screen .result-note').textContent='A photo check can miss insects. It cannot measure distance or confirm safety.';
    practiceHistory.unshift({clear:false,time:Date.now(),verdict});practiceHistory=practiceHistory.slice(0,20);save('buzz-practice',JSON.stringify(practiceHistory));
    if(warning){chime();navigator.vibrate?.([130,100,130]);}speak(outcome.voice);
  }
  $('#check').addEventListener('click',async()=>{
    if(scanController)return;
    sounds.unlock();
    if(!selectedPhoto && !stream){$('#camera-status').textContent='First turn on the camera or use “Choose a photo”.';return;}
    if(!photoChecksEnabled){
      try{
        const photo=selectedPhoto||photoData($('#camera'),$('#camera').videoWidth,$('#camera').videoHeight);
        stopCamera();selectedPhoto=photo;$('#captured-photo').src=photo;$('#captured-photo').hidden=false;$('#camera-placeholder').hidden=true;updateRadar();
        $('#camera-status').textContent='Photo taken on this device. Automatic wasp recognition is not connected.';
      }catch{$('#camera-status').textContent='Camera is warming up. Try Photo again in a moment.';}
      return;
    }
    if(!localRecognition && !photoAllowed){$('#camera-status').textContent='Ask your grown-up to allow a photo check first.';dialog.showModal();return;}
    if(!/^https?:$/.test(location.protocol)){$('#camera-status').textContent='Open the website version to check photos. This downloaded HTML file cannot load the recognition model.';return;}
    const photoWasFocused=selectedPhotoFocused;
    let photo;
    try{photo=selectedPhoto||photoData($('#camera'),$('#camera').videoWidth,$('#camera').videoHeight);}
    catch{$('#camera-status').textContent='The camera is still warming up. Try Scan again in a moment.';return;}
    scanController=new AbortController();const current=scanController,generation=++scanGeneration;updateRadar();
    $('#check').disabled=true;$('#check').textContent='WAIT…';$('#camera-status').textContent='Checking this photo… stay with your grown-up.';
    speak('Checking your photo. Stay with your grown-up.');
    const timer=setTimeout(()=>current.abort(),localRecognition?90_000:30_000);
    try{
      if(localRecognition){
        const {classifyPhoto}=await import('./insect-classifier.mjs');
        const rawBody=await classifyPhoto(photo,{signal:current.signal,onProgress:message=>{if(generation===scanGeneration && screen==='camera'){$('#camera-status').textContent=message;$('#radar-label').textContent=/Getting|Loading/.test(message)?'Getting ready…':'Analyzing photo…';}}});
        if(generation!==scanGeneration || screen!=='camera' || current.signal.aborted)return;
        const body=protectUnfocusedPhoto(rawBody,photoWasFocused);
        photoResult(body.verdict,photo,body.reason);return;
      }
      const response=await fetch('/api/scan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:photo,consent:true}),signal:current.signal});
      const body=await response.json();
      if(generation!==scanGeneration || screen!=='camera')return;
      if(!response.ok){
        const messages={not_configured:'Photo checks are not connected yet. Ask your grown-up to finish setup.',rate_limited:'Buzz needs a short break. Try again in a minute.'};
        $('#camera-status').textContent=messages[body.error]||'The photo could not be checked. Ask your grown-up to help, or try again.';return;
      }
      if(!['possible_wasp','no_wasp_visible','uncertain'].includes(body.verdict))throw new Error('Invalid result');
      const protectedBody=protectUnfocusedPhoto(body,photoWasFocused);
      photoResult(protectedBody.verdict,photo,protectedBody.reason);
    }catch{if(generation===scanGeneration && screen==='camera')$('#camera-status').textContent='Could not check this photo. You may be offline, or the photo service is unavailable. No result was made.';}
    finally{clearTimeout(timer);if(generation===scanGeneration){scanController=undefined;$('#check').disabled=false;$('#check').textContent=scanLabel;updateRadar();}}
  });
  if(!photoChecksEnabled){
    $('#check').textContent=scanLabel;
    $('#camera-title').innerHTML='Your real<br>camera.';
    $('#camera-screen .practice-badge').textContent='CAMERA ONLY · NO WASP RECOGNITION';
    $('#camera-screen .camera-disclaimer').textContent='This version takes real photos but cannot identify wasps.';
    $('.app footer span').textContent='Camera only · no recognition';
    $('#service-status').textContent='GitHub Pages serves the camera app but cannot run the recognition server. Photos are not uploaded. Use the server version for photo checks.';
    $('#photo-consent').closest('label').hidden=true;
  }else if(localRecognition){
    $('#photo-consent').closest('label').hidden=true;
    $('#photo-privacy').textContent='Photo recognition runs on this device. Photos are not uploaded. The first scan downloads two image models and the browser runtime from this website; later scans reuse them. It can mistake other objects for insects or fail to identify a wasp. A clear insect photo works best; do not approach an insect to take one.';
    $('#service-status').textContent='Experimental on-device photo identification uses two models. They can still be wrong. No API key is needed. It cannot confirm safety or measure distance.';
    $('#camera-screen .practice-badge').textContent='ON-DEVICE PHOTO CHECK · CAN BE WRONG';
  }else if(/^https?:$/.test(location.protocol))fetch('/api/status',{cache:'no-store'}).then(response=>response.json()).then(status=>{$('#service-status').textContent=status.configured?'A photo service key is configured. Checks require an internet connection and may incur provider charges.':'Photo checks are not connected. An adult needs to set WASP_VISION_API_KEY on this app’s server.';}).catch(()=>{$('#service-status').textContent='Photo service unavailable. Ask your grown-up to check the server connection.';});
  function pause(){cancelScan();stopListening();stopCamera();sounds.stop();navigator.vibrate?.(0);}
  window.addEventListener('pagehide',pause);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();else updateRadar();});
})();
