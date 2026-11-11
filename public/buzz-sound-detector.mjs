function median(values){
  if(!values.length)return NaN;
  const sorted=[...values].sort((a,b)=>a-b),middle=Math.floor(sorted.length/2);
  return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;
}

export function summarizeBuzzFrames(frames){
  const valid=frames.filter(frame=>Number.isFinite(frame.frequency)&&Number.isFinite(frame.level)&&Number.isFinite(frame.prominence));
  if(valid.length<8)return {verdict:'too_quiet'};
  const audible=valid.filter(frame=>frame.level>-58);
  if(audible.length<valid.length*.3)return {verdict:'too_quiet'};
  // Phone speakers and microphones often shift energy to a harmonic above the
  // insect's wingbeat. Accept a wider tonal range and modest prominence, while
  // still requiring the tone to persist across many frames.
  const candidates=audible.filter(frame=>frame.frequency>=70&&frame.frequency<=1000&&frame.prominence>=6&&
    frame.harmonicity>=3.5&&frame.prominence-frame.harmonicity<=30);
  if(candidates.length<valid.length*.3)return {verdict:'no_steady_buzz'};
  const centre=median(candidates.map(frame=>frame.frequency));
  // Real insect recordings and small speakers can alternate between the
  // wingbeat and a nearby harmonic. Allow that movement while still rejecting
  // sounds whose strongest frequency jumps across unrelated bands.
  const tolerance=Math.max(45,centre*.35);
  const harmonicTolerance=Math.max(35,centre*.2);
  const stable=candidates.filter(frame=>Math.abs(frame.frequency-centre)<=tolerance ||
    [frame.frequency*2,frame.frequency*3,frame.frequency/2,frame.frequency/3]
      .some(frequency=>Math.abs(frequency-centre)<=harmonicTolerance));
  if(stable.length<valid.length*.3||stable.length<candidates.length*.65)return {verdict:'uncertain'};
  return {verdict:'possible_buzz',frequency:Math.round(median(stable.map(frame=>frame.frequency)))};
}

export function waveformLevel(samples){
  if(!samples?.length)return -160;
  let mean=0;for(const sample of samples)mean+=Number.isFinite(sample)?sample:0;mean/=samples.length;
  let energy=0;for(const sample of samples){const value=(Number.isFinite(sample)?sample:0)-mean;energy+=value*value;}
  const rms=Math.sqrt(energy/samples.length);
  return 20*Math.log10(Math.max(rms,1e-8));
}

function frameFromSpectrum(data,sampleRate,fftSize,timeLevel=-160){
  const hzPerBin=sampleRate/fftSize;
  let peak=-Infinity,peakIndex=-1;
  for(let index=Math.ceil(70/hzPerBin);index<=Math.min(data.length-1,Math.floor(1000/hzPerBin));index++){
    if(data[index]>peak){peak=data[index];peakIndex=index;}
  }
  const background=[];
  for(let index=Math.ceil(70/hzPerBin);index<=Math.min(data.length-1,Math.floor(1200/hzPerBin));index++){
    if(Math.abs(index-peakIndex)>2&&Number.isFinite(data[index]))background.push(data[index]);
  }
  const floor=median(background);
  const nearbyPeak=target=>{
    if(!Number.isFinite(target)||target<1||target>=data.length-1)return -Infinity;
    const index=Math.round(target);return Math.max(data[index-1],data[index],data[index+1]);
  };
  // A real wing/fan-like buzz usually contains a related harmonic. Requiring
  // that structure prevents a quiet room or one pure tone from becoming a
  // "buzzing heard" result merely because its frequency stays steady.
  const related=Math.max(nearbyPeak(peakIndex/2),nearbyPeak(peakIndex*2),nearbyPeak(peakIndex*3));
  return {frequency:peakIndex*hzPerBin,level:timeLevel,prominence:peak-floor,harmonicity:related-floor};
}

function wait(milliseconds,signal){
  return new Promise((resolve,reject)=>{
    const aborted=()=>{clearTimeout(timer);reject(new DOMException('Stopped','AbortError'));};
    const timer=setTimeout(()=>{signal?.removeEventListener('abort',aborted);resolve();},milliseconds);
    signal?.addEventListener('abort',aborted,{once:true});
  });
}

export async function listenForBuzz({durationMs=4500,signal,onProgress}={}){
  if(signal?.aborted)throw new DOMException('Stopped','AbortError');
  if(!navigator.mediaDevices?.getUserMedia)throw new DOMException('Microphone unavailable','NotSupportedError');
  let stream,context,source;
  try{
    stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:false,noiseSuppression:false,autoGainControl:false},video:false});
    if(signal?.aborted)throw new DOMException('Stopped','AbortError');
    const Audio=window.AudioContext||window.webkitAudioContext;
    if(!Audio)throw new DOMException('Audio analysis unavailable','NotSupportedError');
    context=new Audio();await context.resume();
    source=context.createMediaStreamSource(stream);
    const analyser=context.createAnalyser();analyser.fftSize=4096;analyser.smoothingTimeConstant=.55;source.connect(analyser);
    // Ignore the button's own tap sound before listening to the room.
    await wait(400,signal);
    const data=new Float32Array(analyser.frequencyBinCount),waveform=new Float32Array(analyser.fftSize),frames=[],started=performance.now();
    while(performance.now()-started<durationMs){
      if(signal?.aborted)throw new DOMException('Stopped','AbortError');
      analyser.getFloatFrequencyData(data);analyser.getFloatTimeDomainData(waveform);
      const frame=frameFromSpectrum(data,context.sampleRate,analyser.fftSize,waveformLevel(waveform));frames.push(frame);
      onProgress?.(Math.min(1,(performance.now()-started)/durationMs),frame);
      await wait(100,signal);
    }
    return summarizeBuzzFrames(frames);
  }finally{
    try{source?.disconnect();}catch{}
    stream?.getTracks().forEach(track=>track.stop());
    if(context&&context.state!=='closed')await context.close().catch(()=>{});
  }
}
