(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const app = $('.app');
  const chatDialog = $('#chat-dialog');
  const photoChecksEnabled = window.BUZZ_RUNTIME?.photoChecks !== false;
  const localRecognition = photoChecksEnabled && window.BUZZ_RUNTIME?.recognition !== 'server';
  const scanLabel = photoChecksEnabled ? 'CHECK' : 'PHOTO';
  let soundOn = true;
  const sounds = new window.BuzzSound();
  let stream;
  let recognition;
  let listeningTimer;
  let muteTimer;
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
  let buzzController;
  let buzzGeneration = 0;
  let chatGeneration = 0;
  let chatTopic = 'general';
  let practiceHistory = [];
  try { voiceAllowed = localStorage.getItem('buzz-voice-allowed') === 'yes';
    soundOn = localStorage.getItem('buzz-sound') !== 'off';
    photoAllowed = localStorage.getItem('buzz-photo-allowed') === 'yes';
    const saved = JSON.parse(localStorage.getItem('buzz-practice') || '[]');
    if (Array.isArray(saved)) practiceHistory = saved.filter(item => item && typeof item.clear === 'boolean' && Number.isFinite(item.time)).slice(0,20);
  } catch { /* Private browsing can disable storage. The app still works. */ }
  function save(key, value) { try { localStorage.setItem(key, value); } catch { /* Session-only fallback. */ } }
  function syncSound(updateAudio=true) {
    if(updateAudio)sounds.setEnabled(soundOn);
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
      if(/^(Listening|Starting microphone)/.test($('#voice-status').textContent))$('#voice-status').textContent='Paused. Tap the mic whenever you want to keep chatting.';
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
    $('#radar-label').textContent=scanController?'Analyzing photo…':cameraPending?'Waiting for camera…':'Ready to check';
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
    if(next!=='buzzing')stopBuzzListening();
    stopListening(); sounds.stop(); navigator.vibrate?.(0);
    if (next !== 'camera') { stopCamera(); clearPhoto(); }
    if (next !== 'result') { $('#result-photo').hidden = true; $('#result-photo').removeAttribute('src'); }
    screen = next;updateRadar();
    app.dataset.screen=next;
    document.querySelectorAll('.screen').forEach(section => section.hidden = section.id !== `${next}-screen`);
    app.classList.remove('alert-state','clear-state','photo-neutral','sound-alert');
    window.scrollTo({top:0,behavior:'instant'});
    const heading = $(`#${next}-screen h1`);
    heading.setAttribute('tabindex','-1'); heading.focus({preventScroll:true});
  }
  function stopBuzzListening(message){
    buzzGeneration++;buzzController?.abort();buzzController=undefined;
    $('#sound-orb').classList.remove('is-listening');
    $('#buzz-listen').disabled=false;$('#buzz-listen').textContent='START LISTENING';
    if(message)$('#buzzing-status').textContent=message;
  }
  async function startBuzzListening(){
    if(buzzController){stopBuzzListening('Listening stopped. Tap Start to try again.');return;}
    if(!navigator.mediaDevices?.getUserMedia){$('#buzzing-status').textContent='This browser cannot use the microphone. Ask a grown-up to try Safari or Chrome.';return;}
    app.classList.remove('sound-alert');
    stopListening();sounds.stop();
    const current=new AbortController(),generation=++buzzGeneration;buzzController=current;
    $('#buzzing-result').textContent='Listening…';$('#buzzing-status').textContent='Keep the device still. Do not move closer to the sound.';
    $('#sound-orb').classList.add('is-listening');$('#buzz-listen').textContent='STOP LISTENING';
    try{
      const {listenForBuzz}=await import('./buzz-sound-detector.mjs');
      const result=await listenForBuzz({signal:current.signal,onProgress:(progress,frame)=>{
        if(generation===buzzGeneration){
          const level=!Number.isFinite(frame?.level)?'very low':frame.level>-36?'strong':frame.level>-48?'medium':frame.level>-58?'low':'very low';
          $('#buzzing-status').textContent=`Listening… ${Math.max(1,Math.ceil((1-progress)*5))} seconds · microphone input ${level}.`;
        }
      }});
      if(generation!==buzzGeneration||screen!=='buzzing')return;
      const outcomes={
        possible_buzz:{title:'BUZZING HEARD',message:'A steady buzzing pattern was heard. It could be an insect, fan, toy, or something else. Sound cannot confirm a wasp. Ask a grown-up to look.'},
        no_steady_buzz:{title:'NO STEADY BUZZ',message:'No steady buzzing pattern was heard. A wasp can be quiet, so this does not mean the area is safe.'},
        too_quiet:{title:'TOO QUIET',message:'The microphone level stayed very low. Ask a grown-up to check the computer’s selected microphone, then try again. Do not move closer to an insect.'},
        uncertain:{title:'NOT SURE',message:'The sound changed too much to check. It cannot confirm a wasp. Ask a grown-up to look.'}
      };
      const outcome=outcomes[result.verdict]||outcomes.uncertain;
      app.classList.toggle('sound-alert',result.verdict==='possible_buzz');
      $('#buzzing-result').textContent=outcome.title;$('#buzzing-status').textContent=outcome.message;speak(outcome.title+'. '+outcome.message);
    }catch(error){
      if(generation!==buzzGeneration||error.name==='AbortError')return;
      $('#buzzing-result').textContent='MICROPHONE NEEDED';
      $('#buzzing-status').textContent=error.name==='NotAllowedError'?'Microphone permission was not given. Ask a grown-up to allow it in the browser’s site settings.':'The sound check could not start. Ask a grown-up to check the microphone and try again.';
    }finally{
      if(generation===buzzGeneration){buzzController=undefined;$('#sound-orb').classList.remove('is-listening');$('#buzz-listen').textContent='LISTEN AGAIN';}
    }
  }
  function answer(question) {
    const text = question.toLowerCase();
    const followUp=/\b(why|more|then|next|else|really|how come)\b/.test(text);
    if(followUp&&chatTopic==='nest')return 'Wasps may defend the area around their nest. That is why you should leave it alone, walk away slowly, and let a trained adult handle it.';
    if(followUp&&chatTopic==='sting')return 'A grown-up should watch how you feel after a sting. Trouble breathing, faintness, or swelling of the mouth or throat means emergency help is needed.';
    if(followUp&&chatTopic==='food')return 'Check open cups and cans before drinking, because a wasp can crawl inside. Put lids on sweet drinks and move away if several wasps gather.';
    if(followUp&&chatTopic==='inside')return 'Give the wasp space and keep people away from it. A grown-up can open a window or door and wait for it to leave.';
    if(followUp&&chatTopic==='space')return 'Slow, calm movement is best. Do not test how close you can get—the camera cannot measure a safe distance.';
    if (/\b(hello|hi|hey|good morning|good afternoon)\b/.test(text)) {chatTopic='general';return 'Hi! I’m Buzz. I can chat about wasps, nests, stings, food, and how to stay calm. What would you like to know?';}
    if (/\b(thank you|thanks|cheers)\b/.test(text)) return 'You’re welcome! Remember: stay calm, give wasps space, and tell a grown-up when you need help.';
    if (/\b(bye|goodbye|see you)\b/.test(text)) return 'Bye for now! Stay calm, give insects space, and come back if you have another wasp-safety question.';
    if (/who are you|what are you|your name|are you (an )?ai/.test(text)) {chatTopic='general';return 'I’m Buzz, the app’s friendly safety helper. I use a small reviewed guide rather than a full AI brain, but I can still chat about common wasp-safety questions.';}
    if (/how are you|how do you feel/.test(text)) return 'I’m ready to help! Ask me something about wasps or staying safe.';
    if (/can('|’)t breathe|cannot breathe|breathing|throat|mouth|allerg|emergency/.test(text)) {chatTopic='emergency';return 'Tell a grown-up now. Trouble breathing, faintness, or swelling of the mouth or throat after a sting needs emergency medical help.';}
    if (/stung|sting|hurt|ouch/.test(text)) {chatTopic='sting';return 'Tell your grown-up straight away if you get stung. Walk away from the insect. A grown-up can wash the area and watch for a serious reaction.';}
    if (/nest|hive|roof|attic|hole/.test(text)) {chatTopic='nest';return 'Do not touch or block a wasp nest. Walk away slowly and tell a grown-up. A trained adult should decide what to do.';}
    if (/inside|indoors|room|house|window|car/.test(text)) {chatTopic='inside';return 'Stay calm, move away, and tell a grown-up. Do not trap or swat the wasp. A grown-up can open a safe way outside.';}
    if (/food|drink|juice|sweet|picnic|bin|trash/.test(text)) {chatTopic='food';return 'Wasps may visit sweet food, drinks, and bins. Cover drinks, look before you sip, put food away, and tell a grown-up if wasps gather nearby.';}
    if (/where.*(live|nest)|live.*where|habitat/.test(text)) {chatTopic='nest';return 'Wasps can build nests in trees, sheds, roofs, soil, or wall spaces. Never search for or touch a nest. Tell a grown-up if you notice many wasps using the same place.';}
    if (/sleep|night|dark/.test(text)) {chatTopic='nature';return 'Many wasps are less active when it is cool or dark, but you should still leave them and their nests alone. Ask a grown-up to help.';}
    if (/look like|colour|color|legs|wings|stripe/.test(text)) {chatTopic='appearance';return 'Wasps often have six legs, four wings, and yellow, black, brown, or reddish markings. Some harmless insects look similar, so do not move closer to identify one.';}
    if (/dangerous|attack|will.*sting|do.*sting/.test(text)) {chatTopic='space';return 'A wasp can sting, especially if it or its nest feels threatened. Stay calm, do not swat, walk away slowly, and tell a grown-up.';}
    if (/swat|hit|kill|squash|wave/.test(text)) {chatTopic='movement';return 'Do not swat or wave at a wasp. Keep your hands still and walk away slowly. Fast movements can make it feel threatened.';}
    if (/bee|bees|difference/.test(text)) {chatTopic='bee';return 'Bees are usually fuzzier and collect pollen. Wasps often look smoother. Do not get close to check—give both insects space and ask a grown-up.';}
    if (/why|good|help|eat|garden/.test(text)) {chatTopic='nature';return 'Wasps help gardens by hunting other insects and some also pollinate flowers. We can respect them by giving them space.';}
    if (/scared|afraid|fear/.test(text)) {chatTopic='fear';return 'It is okay to feel scared. Take a slow breath. Walk away slowly, and find your grown-up. They can help!';}
    if (/space|near|close|distance|metre|meter|wasp|walk|safe/.test(text)) {chatTopic='space';return 'Give wasps lots of space. Keep your hands still, walk away slowly, and tell a grown-up. The camera cannot measure distance or say an area is safe.';}
    chatTopic='general';
    return 'I can help with wasp safety. Ask what to do near a wasp, near a nest, around food, inside a room, or after a sting.';
  }
  function addChatMessage(role,text,{thinking=false}={}){
    const message=document.createElement('div');message.className=`chat-message ${role==='user'?'user-message':'buzz-message'}${thinking?' thinking-message':''}`;
    const name=document.createElement('strong');name.textContent=role==='user'?'You':'Buzz';
    const copy=document.createElement('p');copy.textContent=text;
    message.append(name,copy);$('#chat-log').append(message);
    $('#chat-log').scrollTop=$('#chat-log').scrollHeight;
    return message;
  }
  function wait(milliseconds){return new Promise(resolve=>setTimeout(resolve,milliseconds));}
  async function tellBuzz(question,{source='button'}={}) {
    const clean=String(question||'').trim().slice(0,200);if(!clean)return;
    stopListening();
    document.querySelectorAll('.thinking-message').forEach(message=>message.remove());
    addChatMessage('user',clean);
    const generation=++chatGeneration;
    $('#speech').textContent='Buzz is thinking…';
    $('#voice-status').textContent='Buzz is thinking…';
    const thinking=addChatMessage('buzz','Thinking…',{thinking:true});
    await wait(420);
    if(generation!==chatGeneration)return;
    const reply=answer(clean);thinking.remove();
    addChatMessage('buzz',reply);
    $('#speech').textContent=reply;
    $('#voice-status').textContent=source==='voice'?'Buzz answered. Tap the mic to keep chatting.':'Buzz answered. Ask me another question!';
    speak(reply);
  }
  function openChat(){
    stopListening();sounds.stop();
    if(!chatDialog.open)chatDialog.showModal();
    $('#chat-input').focus();
  }
  $('#type-question').addEventListener('click',openChat);
  $('#chat-close').addEventListener('click',()=>chatDialog.close());
  $('#chat-form').addEventListener('submit',event=>{
    event.preventDefault();
    const question=$('#chat-input').value.trim();
    if(!question)return;
    $('#chat-input').value='';void tellBuzz(question,{source:'typed'});
  });
  for(const button of document.querySelectorAll('[data-chat-question]')) button.addEventListener('click',()=>void tellBuzz(button.dataset.chatQuestion,{source:'typed'}));
  $('#sound').addEventListener('click', () => {
    clearTimeout(muteTimer);
    if(soundOn){
      sounds.stop();sounds.muteChime();soundOn=false;syncSound(false);
      muteTimer=setTimeout(()=>{if(!soundOn)sounds.setEnabled(false);},360);
    }else{
      soundOn=true;syncSound();chime();
    }
  });
  $('#test-sound').addEventListener('click',()=>{
    soundOn=true;syncSound();
    const started=sounds.chime();
    speak('Hello! I am Buzz. Stay calm, and tell your grown-up.');
    $('#sound-status').textContent=started ? 'Listen for three notes and Buzz’s voice. If silent, check device volume, silent mode, and browser sound settings.' : 'This browser could not start sound. Check its sound permissions and try again.';
  });
  document.addEventListener('click',event=>{
    const button=event.target.closest('button');
    if(button && !button.disabled && !['sound','test-sound'].includes(button.id))sounds.tap();
  });
  $('#home').addEventListener('click',() => show('buzz'));
  for (const button of document.querySelectorAll('[data-go]')) button.addEventListener('click',() => show(button.dataset.go));
  for (const id of ['practice','again']) $('#'+id).addEventListener('click',() => show('camera'));
  $('#listen-buzz').addEventListener('click',()=>show('buzzing'));
  $('#buzz-listen').addEventListener('click',startBuzzListening);
  for (const button of document.querySelectorAll('[data-question]')) button.addEventListener('click',() => void tellBuzz(button.dataset.question === 'sting' ? 'I got stung' : 'give wasps space'));
  $('#read').addEventListener('click',() => {stopListening();speak($('#speech').textContent);});
  $('#listen').addEventListener('click',() => show('buzzing'));
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
      $('#camera-status').textContent = photoChecksEnabled ? 'Live camera is on. Tap Check to check one photo with your grown-up.' : 'Live camera is on. Tap Photo to capture a picture on this device.';
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
      const entry = document.createElement('article');entry.className='history-card';
      const picture=document.createElement('img');picture.src='icon.svg';picture.alt='';entry.append(picture);
      const copy=document.createElement('div');
      const names = {possible_wasp:'Possible wasp — ask a grown-up',possible_bee:'Possible bee — ask a grown-up',no_wasp_visible:'No wasp spotted — not an all clear',uncertain:'No confirmed result'};
      const label = names[item.verdict] || 'Photo · Not sure';
      const title=document.createElement('strong');title.textContent=label;copy.append(title);
      const time=document.createElement('span');time.textContent=new Date(item.time).toLocaleString([], {month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit'});copy.append(time);
      entry.append(copy);list.append(entry);
    }
    $('#clear-history').hidden = practiceHistory.length === 0;
  }
  $('#history').addEventListener('click',() => { renderHistory(); show('history'); });
  for (const button of document.querySelectorAll('.history-shortcut')) button.addEventListener('click',() => { renderHistory(); show('history'); });
  $('#clear-history').addEventListener('click',() => { practiceHistory=[];save('buzz-practice','[]');renderHistory(); });
  const dialog = $('#parent-dialog');
  $('#grownups').addEventListener('click',() => { stopListening(); sounds.stop(); dialog.showModal(); });
  for (const id of ['close-dialog','parent-done']) $('#'+id).addEventListener('click',() => dialog.close());
  $('#voice-consent').checked = voiceAllowed;
  $('#photo-consent').checked = photoAllowed;
  $('#photo-consent').addEventListener('change',event => {photoAllowed=event.target.checked;save('buzz-photo-allowed',photoAllowed ? 'yes' : 'no');if(!photoAllowed)cancelScan();});
  $('#voice-consent').addEventListener('change',event => { voiceAllowed=event.target.checked;save('buzz-voice-allowed',voiceAllowed ? 'yes' : 'no');if(!voiceAllowed)stopListening(); });
  $('#microphone').addEventListener('click',() => {
    if (recognition) { stopListening(); $('#voice-status').textContent='Paused. Tap the mic whenever you want to keep chatting.'; return; }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { $('#voice-status').textContent='Voice questions are unavailable here. Type your question instead.';openChat();return; }
    if(!window.isSecureContext){$('#voice-status').textContent='Voice chat needs the secure HTTPS website. Type your question instead.';openChat();return;}
    // Pressing the clearly labelled microphone is the explicit user action that
    // starts voice input. The browser still controls its own permission prompt.
    if (!voiceAllowed) { voiceAllowed=true;save('buzz-voice-allowed','yes');$('#voice-consent').checked=true; }
    // Stop all output before opening the microphone so Buzz cannot hear itself.
    sounds.stop();
    let current;
    try{current=new SpeechRecognition();}catch{$('#voice-status').textContent='Voice chat could not start here. Type your question instead.';openChat();return;}
    recognition=current;
    current.lang='en-GB';current.interimResults=false;current.maxAlternatives=1;current.continuous=false;
    const finish=message=>{
      if(recognition!==current)return;
      stopListening();$('#voice-status').textContent=message;
    };
    const timeout=()=>finish('I did not catch that. Tap the mic and ask me again.');
    current.onstart=()=>{
      if(recognition!==current)return;
      clearTimeout(listeningTimer);listeningTimer=setTimeout(timeout,15_000);
      $('#voice-status').textContent='Listening… ask me about wasp safety.';
    };
    current.onresult=event=>{
      if(recognition!==current)return;
      const transcript=event.results?.[0]?.[0]?.transcript?.trim();
      if(!transcript){finish('I did not catch that. Tap the mic and ask me again.');return;}
      stopListening();
      void tellBuzz(transcript,{source:'voice'});
    };
    current.onerror=event=>{
      const messages={
        'not-allowed':'Microphone access was blocked. Ask your grown-up to allow the microphone in this browser’s site settings, then try again.',
        'service-not-allowed':'The browser’s speech service is blocked. Ask a grown-up to check browser settings, or type your question.',
        'audio-capture':'No microphone is available. Check that it is connected and another app is not using it.',
        'no-speech':'I did not catch that. Tap the mic and ask me again.',
        network:'The browser’s speech service could not connect. Check your internet connection, or type your question.',
        'language-not-supported':'English voice recognition is unavailable here. Type your question instead.',
        aborted:'Paused. Tap the mic whenever you want to keep chatting.'
      };
      finish(messages[event.error]||'Voice chat had a problem. Tap the mic to try again, or type your question.');
    };
    current.onend=()=>finish('I did not catch that. Tap the mic and ask me again.');
    $('#microphone').classList.add('listening');$('#microphone').setAttribute('aria-label','Stop listening');
    $('#voice-status').textContent='Starting microphone… allow access if your browser asks.';
    listeningTimer=setTimeout(timeout,15_000);
    try{current.start();}
    catch(error){finish(error.name==='NotAllowedError'?'Microphone access was blocked. Ask your grown-up to allow it in this browser’s site settings.':'Microphone unavailable. Tap the mic to try again, or type your question.');}
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
    // Keep insect markings sharp enough for the local models. The old quality
    // level blurred narrow yellow/black patterns and turned clear fixtures into
    // uncertain results after an otherwise harmless browser re-encode.
    return canvas.toDataURL('image/jpeg',.94);
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
      $('#camera-status').textContent=photoChecksEnabled ? 'Your photo is ready. Tap Check with your grown-up to check it.' : 'Your real photo is ready. This camera version cannot recognise wasps.';
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
      $('#camera-status').textContent='Selected area ready. Tap Check to check this insect photo.';
      focusDialog.close();$('#check').focus();
    }catch{$('#focus-status').textContent='Could not use that selection. Keep the original photo and try again.';}
  });
  function cancelScan(){if(scanController)$('#camera-status').textContent='Photo check paused. Tap Check to try again.';scanGeneration++;scanController?.abort();scanController=undefined;$('#check').disabled=false;$('#check').textContent=scanLabel;updateRadar();}
  function protectUnfocusedPhoto(result,photoWasFocused){
    // The local result already requires independent insect and species models.
    // Let that conservative two-model candidate reach the user. Keep requiring
    // a selected insect for server or otherwise unverified whole-photo guesses.
    if(!photoWasFocused && ['possible_wasp','possible_bee'].includes(result?.verdict) && result?.reason!=='two_model_candidate')
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
    if(reason==='insect_not_confirmed')Object.assign(outcome,{title:'NO WASP<br>RESULT',message:'Buzz could not find enough insect evidence in the whole photo. If you can already see an insect, ask a grown-up to choose Focus on one insect. This result never says a person is dangerous.',voice:'No wasp result. If you can already see an insect, ask a grown-up to choose Focus on one insect. This result never says a person is dangerous.'});
    if(reason==='needs_insect_focus')Object.assign(outcome,{title:'SELECT THE<br>INSECT',message:'No wasp warning was made. Buzz will not label a whole camera picture or a person. Ask a grown-up to select only the insect.',voice:'No wasp warning was made. I will not label a whole camera picture or a person. Ask a grown-up to select only the insect.'});
    if(reason==='species_uncertain')Object.assign(outcome,{message:'The models could not agree on a wasp or bee. Try a clearer existing photo. Do not move closer to an insect.'});app.classList.add(warning?'alert-state':'photo-neutral');
    $('#result-title').innerHTML=outcome.title;$('#result-message').textContent=outcome.message;$('#result-sticker').textContent=outcome.symbol;
    // Keep the manual crop available after every result. A camera view of a
    // poster or screen may contain a clear insect that the whole-photo models
    // missed, and the grown-up may need to adjust the selected area again.
    $('#focus-result').hidden=false;
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
    catch{$('#camera-status').textContent='The camera is still warming up. Try Check again in a moment.';return;}
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
    $('#photo-privacy').textContent='Photo recognition runs on this device. Photos are not uploaded. The first check downloads two image models and the browser runtime from this website; later checks reuse them. It can mistake other objects for insects or fail to identify a wasp. A clear insect photo works best; do not approach an insect to take one.';
    $('#service-status').textContent='Experimental on-device photo identification uses two models. They can still be wrong. No API key is needed. It cannot confirm safety or measure distance.';
    $('#camera-screen .practice-badge').textContent='ON-DEVICE PHOTO CHECK · CAN BE WRONG';
  }else if(/^https?:$/.test(location.protocol))fetch('/api/status',{cache:'no-store'}).then(response=>response.json()).then(status=>{$('#service-status').textContent=status.configured?'A photo service key is configured. Checks require an internet connection and may incur provider charges.':'Photo checks are not connected. An adult needs to set WASP_VISION_API_KEY on this app’s server.';}).catch(()=>{$('#service-status').textContent='Photo service unavailable. Ask your grown-up to check the server connection.';});
  function pause(){cancelScan();stopBuzzListening();stopListening();stopCamera();sounds.stop();navigator.vibrate?.(0);}
  window.addEventListener('pagehide',pause);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();else updateRadar();});
})();
