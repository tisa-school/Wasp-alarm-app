function median(values){
  if(!values.length)return NaN;
  const sorted=[...values].sort((a,b)=>a-b),middle=Math.floor(sorted.length/2);
  return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;
}

export function summarizeBuzzFrames(frames){
  const valid=frames.filter(frame=>Number.isFinite(frame.frequency)&&Number.isFinite(frame.level)&&Number.isFinite(frame.prominence));
  if(valid.length<8)return {verdict:'too_quiet'};
  const audible=valid.filter(frame=>frame.level>-65);
  if(audible.length<valid.length*.3)return {verdict:'too_quiet'};
  const candidates=audible.filter(frame=>frame.frequency>=90&&frame.frequency<=500&&frame.prominence>=10);
  if(candidates.length<valid.length*.45)return {verdict:'no_steady_buzz'};
  const centre=median(candidates.map(frame=>frame.frequency));
  const tolerance=Math.max(20,centre*.15);
  const stable=candidates.filter(frame=>Math.abs(frame.frequency-centre)<=tolerance);
  if(stable.length<valid.length*.45||stable.length<candidates.length*.75)return {verdict:'uncertain'};
  return {verdict:'possible_buzz',frequency:Math.round(median(stable.map(frame=>frame.frequency)))};
}

function frameFromSpectrum(data,sampleRate,fftSize){
  const hzPerBin=sampleRate/fftSize;
  let peak=-Infinity,peakIndex=-1;
  for(let index=Math.ceil(90/hzPerBin);index<=Math.min(data.length-1,Math.floor(500/hzPerBin));index++){
    if(data[index]>peak){peak=data[index];peakIndex=index;}
  }
  const background=[];
  for(let index=Math.ceil(70/hzPerBin);index<=Math.min(data.length-1,Math.floor(1200/hzPerBin));index++){
    if(Math.abs(index-peakIndex)>2&&Number.isFinite(data[index]))background.push(data[index]);
  }
  const floor=median(background);
  return {frequency:peakIndex*hzPerBin,level:peak,prominence:peak-floor};
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
    stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false},video:false});
    if(signal?.aborted)throw new DOMException('Stopped','AbortError');
    const Audio=window.AudioContext||window.webkitAudioContext;
    if(!Audio)throw new DOMException('Audio analysis unavailable','NotSupportedError');
    context=new Audio();await context.resume();
    source=context.createMediaStreamSource(stream);
    const analyser=context.createAnalyser();analyser.fftSize=4096;analyser.smoothingTimeConstant=.55;source.connect(analyser);
    // Ignore the button's own tap sound before listening to the room.
    await wait(400,signal);
    const data=new Float32Array(analyser.frequencyBinCount),frames=[],started=performance.now();
    while(performance.now()-started<durationMs){
      if(signal?.aborted)throw new DOMException('Stopped','AbortError');
      analyser.getFloatFrequencyData(data);frames.push(frameFromSpectrum(data,context.sampleRate,analyser.fftSize));
      onProgress?.(Math.min(1,(performance.now()-started)/durationMs));
      await wait(100,signal);
    }
    return summarizeBuzzFrames(frames);
  }finally{
    try{source?.disconnect();}catch{}
    stream?.getTracks().forEach(track=>track.stop());
    if(context&&context.state!=='closed')await context.close().catch(()=>{});
  }
}
