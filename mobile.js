(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const app = $('.app');
  const photoChecksEnabled = window.BUZZ_RUNTIME?.photoChecks !== false;
  const scanLabel = photoChecksEnabled ? 'SCAN' : 'PHOTO';
  let soundOn = true;
  let stream;
  let audio;
  let recognition;
  let screen = 'buzz';
  let cameraPending = false;
  let cameraGeneration = 0;
  let installPrompt;
  let voiceAllowed = false;
  let photoAllowed = false;
  let selectedPhoto;
  let scanController;
  let scanGeneration = 0;
  let practiceHistory = [];
  try { voiceAllowed = localStorage.getItem('buzz-voice-allowed') === 'yes';
    photoAllowed = localStorage.getItem('buzz-photo-allowed') === 'yes';
    const saved = JSON.parse(localStorage.getItem('buzz-practice') || '[]');
    if (Array.isArray(saved)) practiceHistory = saved.filter(item => item && typeof item.clear === 'boolean' && Number.isFinite(item.time)).slice(0,20);
  } catch { /* Private browsing can disable storage. The app still works. */ }
  function save(key, value) { try { localStorage.setItem(key, value); } catch { /* Session-only fallback. */ } }
  function speak(text) {
    if (!soundOn || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const message = new SpeechSynthesisUtterance(text);
    message.lang = 'en-GB'; message.rate = .83; message.pitch = 1.12;
    window.speechSynthesis.speak(message);
  }
  function stopListening() {
    if (recognition) { recognition.onend = null; recognition.onerror = null; recognition.onresult = null; recognition.abort(); recognition = undefined; }
    $('#microphone').classList.remove('listening');
    $('#microphone').setAttribute('aria-label', 'Ask Buzz a question using your microphone');
  }
  function stopCamera() {
    cameraGeneration++;
    stream?.getTracks().forEach(track => track.stop()); stream = undefined;
    $('#camera').srcObject = null;
    $('#camera-placeholder').hidden = false;
    $('#enable-camera').disabled = false;
    cameraPending = false;
  }
  function show(next) {
    cancelScan();
    stopListening(); window.speechSynthesis?.cancel(); navigator.vibrate?.(0);
    if (next !== 'camera') { stopCamera(); clearPhoto(); }
    if (next !== 'result') { $('#result-photo').hidden = true; $('#result-photo').removeAttribute('src'); }
    screen = next;
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
  function tellBuzz(question) { $('#speech').textContent = answer(question); speak($('#speech').textContent); }
  $('#sound').addEventListener('click', () => {
    soundOn = !soundOn;
    $('#sound').setAttribute('aria-pressed',String(soundOn));
    $('#sound').setAttribute('aria-label',soundOn ? 'Mute voice and sounds' : 'Turn voice and sounds on');
    if (!soundOn) window.speechSynthesis?.cancel();
  });
  $('#home').addEventListener('click',() => show('buzz'));
  for (const button of document.querySelectorAll('[data-go]')) button.addEventListener('click',() => show(button.dataset.go));
  for (const id of ['practice','again']) $('#'+id).addEventListener('click',() => show('camera'));
  for (const button of document.querySelectorAll('[data-question]')) button.addEventListener('click',() => tellBuzz(button.dataset.question === 'sting' ? 'I got stung' : 'give wasps space'));
  $('#read').addEventListener('click',() => speak($('#speech').textContent));
  $('#listen').addEventListener('click',() => {
    const guidance = photoChecksEnabled ? 'Point your camera, then tap Scan to check one photo. If you see a wasp, keep your hands still, walk away slowly, and tell a grown-up. A photo check can miss a wasp.' : 'Point your camera and tap Photo to take a picture. This camera does not recognise wasps. If you see a wasp, walk away slowly and tell a grown-up.';
    $('#camera-status').textContent = guidance;
    speak(guidance);
  });
  $('#enable-camera').addEventListener('click',async () => {
    cancelScan();
    if (cameraPending || stream) return;
    if (!navigator.mediaDevices?.getUserMedia) { $('#camera-status').textContent = 'Live video needs a secure website. Try “Use phone camera” to take a real photo instead.'; return; }
    clearPhoto();
    cameraPending = true; $('#enable-camera').disabled = true;
    const generation = ++cameraGeneration;
    try {
      const acquired = await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
      if (screen !== 'camera' || generation !== cameraGeneration || document.hidden) { acquired.getTracks().forEach(track => track.stop()); return; }
      stream = acquired; $('#camera').srcObject = stream; $('#camera-placeholder').hidden = true;
      $('#camera-status').textContent = photoChecksEnabled ? 'Live camera is on. Tap Scan to check one photo with your grown-up.' : 'Live camera is on. Tap Photo to capture a picture on this device.';
    } catch (error) {
      if (generation === cameraGeneration) $('#camera-status').textContent = error.name === 'NotAllowedError' ? 'Camera permission was not given. Ask your grown-up, or try “Use phone camera”.' : 'Live camera unavailable. Try “Use phone camera” instead.';
    } finally {
      if (generation === cameraGeneration) { cameraPending = false; $('#enable-camera').disabled = false; }
    }
  });
  function chime() {
    if (!soundOn) return;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      audio ||= new Audio(); audio.resume();
      [523.25,659.25,783.99].forEach((frequency,index) => {
        const oscillator = audio.createOscillator(), gain = audio.createGain(), at = audio.currentTime + index*.18;
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(.07,at+.02);gain.gain.exponentialRampToValueAtTime(.001,at+.3);
        oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(at); oscillator.stop(at+.32);
      });
    } catch { /* Visual instructions are still available. */ }
  }
  function result(clear) {
    show('result'); app.classList.add(clear ? 'clear-state' : 'alert-state');
    $('#result-screen').classList.remove('photo-result');
    $('#result-badge').textContent = 'PRETEND RESULT · PRACTICE ONLY';
    $('#result-photo').hidden = true;
    $('#result-screen .result-note').textContent = 'A pretend result. These practice buttons do not check a photo.';
    $('#result-title').innerHTML = clear ? 'ALL<br>CLEAR!' : 'WASP<br>HERE!';
    $('#result-message').textContent = clear ? 'Practice finished! Stay with your grown-up.' : 'Stay back and tell a grown-up!';
    $('#result-wasp').hidden = clear; $('#result-sun').hidden = !clear;
    $('#result-sticker').textContent = clear ? '✓' : '!';
    $('#acknowledge').textContent = clear ? 'Yay!' : 'Got it!';
    practiceHistory.unshift({clear,time:Date.now()}); practiceHistory = practiceHistory.slice(0,20);
    save('buzz-practice',JSON.stringify(practiceHistory));
    chime(); if (!clear) navigator.vibrate?.([130,100,130]);
    speak(clear ? 'Pretend all clear! Practice finished. Stay with your grown-up.' : 'Practice alert! Stay calm. Walk away slowly, and tell your grown-up.');
  }
  $('#practice-alert').addEventListener('click',() => { dialog.close(); result(false); });
  $('#clear').addEventListener('click',() => { dialog.close(); result(true); });
  $('#acknowledge').addEventListener('click',() => show('buzz'));
  function renderHistory() {
    const list = $('#history-list'); list.replaceChildren();
    if (!practiceHistory.length) { const empty = document.createElement('p');empty.className='empty';empty.textContent='No practice yet. Let’s try it together!';list.append(empty); }
    for (const item of practiceHistory) {
      const entry = document.createElement('p');
      const names = {possible_wasp:'Photo · Possible wasp',no_wasp_visible:'Photo · No wasp spotted',uncertain:'Photo · Not sure'};
      const label = names[item.verdict] || `${item.clear ? '☀ All clear' : '✳ Wasp alert'} · Pretend`;
      entry.textContent = `${label}\n${new Date(item.time).toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}`;
      entry.style.whiteSpace='pre-line';list.append(entry);
    }
    $('#clear-history').hidden = practiceHistory.length === 0;
  }
  $('#history').addEventListener('click',() => { renderHistory(); show('history'); });
  $('#clear-history').addEventListener('click',() => { practiceHistory=[];save('buzz-practice','[]');renderHistory(); });
  const dialog = $('#parent-dialog');
  $('#grownups').addEventListener('click',() => { stopListening(); window.speechSynthesis?.cancel(); dialog.showModal(); });
  for (const id of ['close-dialog','parent-done']) $('#'+id).addEventListener('click',() => dialog.close());
  $('#voice-consent').checked = voiceAllowed;
  $('#photo-consent').checked = photoAllowed;
  $('#photo-consent').addEventListener('change',event => {photoAllowed=event.target.checked;save('buzz-photo-allowed',photoAllowed ? 'yes' : 'no');if(!photoAllowed)cancelScan();});
  $('#voice-consent').addEventListener('change',event => { voiceAllowed=event.target.checked;save('buzz-voice-allowed',voiceAllowed ? 'yes' : 'no');if(!voiceAllowed)stopListening(); });
  $('#microphone').addEventListener('click',() => {
    if (recognition) { stopListening(); $('#voice-status').textContent='Voice stopped. You can pick a picture question.'; return; }
    if (!voiceAllowed) { $('#voice-status').textContent='Ask your grown-up to allow voice questions first.';dialog.showModal();return; }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { $('#voice-status').textContent='Voice questions are not supported here. Tap a picture question instead.';return; }
    window.speechSynthesis?.cancel();
    const current = new SpeechRecognition();recognition = current;
    current.lang='en-GB';current.interimResults=false;current.maxAlternatives=1;current.continuous=false;
    current.onresult = event => { const transcript=event.results[0]?.[0]?.transcript;if(transcript){tellBuzz(transcript);$('#voice-status').textContent='Buzz heard your question.';} };
    current.onerror = () => { $('#voice-status').textContent='Could not hear a question. Try a picture button, or ask your grown-up.'; };
    current.onend = () => { if(recognition===current){recognition=undefined;$('#microphone').classList.remove('listening');$('#microphone').setAttribute('aria-label','Ask Buzz a question using your microphone');if($('#voice-status').textContent.startsWith('Listening'))$('#voice-status').textContent='Try again, or pick a picture question.';} };
    try { current.start();$('#microphone').classList.add('listening');$('#microphone').setAttribute('aria-label','Stop listening');$('#voice-status').textContent='Listening… tap the mic to stop.'; }
    catch { stopListening();$('#voice-status').textContent='Microphone unavailable. Tap a picture question instead.'; }
  });
  window.addEventListener('beforeinstallprompt',event => { event.preventDefault();installPrompt=event;$('#install').hidden=false; });
  $('#install').addEventListener('click',async () => {
    if(!installPrompt)return;
    try { await installPrompt.prompt();const choice=await installPrompt.userChoice;$('#install-message').textContent=choice.outcome==='accepted' ? 'Installation requested. Look for Wasp Buddy on your home screen.' : 'You can install later or keep playing in the browser.'; }
    catch { $('#install-message').textContent='Use your browser’s Add to Home Screen option.'; }
    installPrompt=undefined;$('#install').hidden=true;
  });
  if('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('./sw.js').catch(()=>{});
  function clearPhoto() { $('#photo-file').value=''; selectedPhoto = undefined; $('#captured-photo').hidden = true; $('#captured-photo').removeAttribute('src'); }
  function photoData(image,width,height) {
    if(!width || !height)throw new Error('Camera not ready');
    const scale=Math.min(1,960/Math.max(width,height));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
    canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
    return canvas.toDataURL('image/jpeg',.82);
  }
  $('#take-photo').addEventListener('click',()=>{cancelScan();$('#photo-file').value='';$('#photo-file').click();});
  $('#photo-file').addEventListener('change',async event=>{
    const file=event.target.files?.[0];if(!file)return;
    if(file.size>30_000_000){$('#camera-status').textContent='That photo is too large. Try a smaller photo.';return;}
    cancelScan();stopCamera();const generation=cameraGeneration;
    const url=URL.createObjectURL(file);
    try{
      const image=new Image();image.src=url;await image.decode();
      if(screen!=='camera' || generation!==cameraGeneration)return;
      selectedPhoto=photoData(image,image.naturalWidth,image.naturalHeight);
      $('#captured-photo').src=selectedPhoto;$('#captured-photo').hidden=false;$('#camera-placeholder').hidden=true;
      $('#camera-status').textContent=photoChecksEnabled ? 'Your photo is ready. Tap Scan with your grown-up to check it.' : 'Your real photo is ready. This camera version cannot recognise wasps.';
    }catch{$('#camera-status').textContent='Could not read that photo. Try taking another picture.';}
    finally{URL.revokeObjectURL(url);}
  });
  function cancelScan(){if(scanController)$('#camera-status').textContent='Photo check paused. Tap Scan to try again.';scanGeneration++;scanController?.abort();scanController=undefined;$('#check').disabled=false;$('#check').textContent=scanLabel;}
  function photoResult(verdict,photo){
    show('result');$('#result-screen').classList.add('photo-result');
    $('#result-badge').textContent='ONE PHOTO · NOT A SAFETY GUARANTEE';
    $('#result-photo').src=photo;$('#result-photo').hidden=false;$('#result-wasp').hidden=true;$('#result-sun').hidden=true;
    const outcomes={
      possible_wasp:{title:'POSSIBLE<br>WASP',message:'Stay back and tell your grown-up!',symbol:'!',voice:'Possible wasp in this photo. Stay calm, move away slowly, and tell your grown-up.'},
      no_wasp_visible:{title:'NOT<br>SPOTTED',message:'No wasp spotted in this photo. It could still be nearby.',symbol:'?',voice:'No wasp spotted in this photo. Buzz can miss a wasp. Stay with your grown-up.'},
      uncertain:{title:'I’M NOT<br>SURE',message:'Ask your grown-up to look. Keep your distance.',symbol:'?',voice:'I am not sure about this photo. Keep your distance and ask your grown-up to look.'}
    };
    const outcome=outcomes[verdict];app.classList.add(verdict==='possible_wasp'?'alert-state':'photo-neutral');
    $('#result-title').innerHTML=outcome.title;$('#result-message').textContent=outcome.message;$('#result-sticker').textContent=outcome.symbol;
    $('#acknowledge').textContent='Got it!';$('#result-screen .result-note').textContent='A photo check can miss insects. It cannot measure distance or confirm safety.';
    practiceHistory.unshift({clear:false,time:Date.now(),verdict});practiceHistory=practiceHistory.slice(0,20);save('buzz-practice',JSON.stringify(practiceHistory));
    if(verdict==='possible_wasp'){chime();navigator.vibrate?.([130,100,130]);}speak(outcome.voice);
  }
  $('#check').addEventListener('click',async()=>{
    if(scanController)return;
    if(!selectedPhoto && !stream){$('#camera-status').textContent='First turn on the camera or use “Use phone camera” to take a photo.';return;}
    if(!photoChecksEnabled){
      try{
        const photo=selectedPhoto||photoData($('#camera'),$('#camera').videoWidth,$('#camera').videoHeight);
        stopCamera();selectedPhoto=photo;$('#captured-photo').src=photo;$('#captured-photo').hidden=false;$('#camera-placeholder').hidden=true;
        $('#camera-status').textContent='Photo taken on this device. Automatic wasp recognition is not connected.';
      }catch{$('#camera-status').textContent='Camera is warming up. Try Photo again in a moment.';}
      return;
    }
    if(!photoAllowed){$('#camera-status').textContent='Ask your grown-up to allow a photo check first.';dialog.showModal();return;}
    if(!/^https?:$/.test(location.protocol)){$('#camera-status').textContent='Photo recognition needs the hosted app and its image service. This downloaded file can show your camera photo but cannot analyse it.';return;}
    let photo;
    try{photo=selectedPhoto||photoData($('#camera'),$('#camera').videoWidth,$('#camera').videoHeight);}
    catch{$('#camera-status').textContent='The camera is still warming up. Try Scan again in a moment.';return;}
    scanController=new AbortController();const current=scanController,generation=++scanGeneration;
    $('#check').disabled=true;$('#check').textContent='WAIT…';$('#camera-status').textContent='Checking this photo… stay with your grown-up.';
    const timer=setTimeout(()=>current.abort(),30_000);
    try{
      const response=await fetch('/api/scan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:photo,consent:true}),signal:current.signal});
      const body=await response.json();
      if(generation!==scanGeneration || screen!=='camera')return;
      if(!response.ok){
        const messages={not_configured:'Photo checks are not connected yet. Ask your grown-up to finish setup.',rate_limited:'Buzz needs a short break. Try again in a minute.'};
        $('#camera-status').textContent=messages[body.error]||'The photo could not be checked. Ask your grown-up to help, or try again.';return;
      }
      if(!['possible_wasp','no_wasp_visible','uncertain'].includes(body.verdict))throw new Error('Invalid result');
      photoResult(body.verdict,photo);
    }catch{if(generation===scanGeneration && screen==='camera')$('#camera-status').textContent='Could not check this photo. You may be offline, or the photo service is unavailable. No result was made.';}
    finally{clearTimeout(timer);if(generation===scanGeneration){scanController=undefined;$('#check').disabled=false;$('#check').textContent=scanLabel;}}
  });
  if(!photoChecksEnabled){
    $('#check').textContent=scanLabel;
    $('#camera-title').innerHTML='Your real<br>camera.';
    $('#camera-screen .practice-badge').textContent='CAMERA ONLY · NO WASP RECOGNITION';
    $('#camera-screen .camera-disclaimer').textContent='This version takes real photos but cannot identify wasps.';
    $('.app footer span').textContent='Camera only · no recognition';
    $('#service-status').textContent='GitHub Pages serves the camera app but cannot run the recognition server. Photos are not uploaded. Use the server version for photo checks.';
    $('#photo-consent').closest('label').hidden=true;
  }else if(/^https?:$/.test(location.protocol))fetch('/api/status',{cache:'no-store'}).then(response=>response.json()).then(status=>{$('#service-status').textContent=status.configured?'A photo service key is configured. Checks require an internet connection and may incur provider charges.':'Photo checks are not connected. An adult needs to set WASP_VISION_API_KEY on this app’s server.';}).catch(()=>{$('#service-status').textContent='Photo service unavailable. Ask your grown-up to check the server connection.';});
  function pause(){cancelScan();stopListening();stopCamera();window.speechSynthesis?.cancel();navigator.vibrate?.(0);}
  window.addEventListener('pagehide',pause);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
})();
