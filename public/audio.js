(() => {
  // Create/resume audio during a tap, before any asynchronous photo analysis.
  class BuzzSound {
    constructor(){this.enabled=true;this.context=undefined;this.master=undefined;this.nodes=new Set();this.utterance=undefined;window.speechSynthesis?.getVoices();}
    unlock(){
      if(!this.enabled)return false;
      try{
        const Audio=window.AudioContext||window.webkitAudioContext;
        if(!Audio)return false;
        if(!this.context || this.context.state==='closed'){
          this.context=new Audio();this.master=this.context.createGain();this.master.gain.value=1;this.master.connect(this.context.destination);
        }
        this.context.resume().catch(()=>{});
        return true;
      }catch{return false;}
    }
    stop(){
      window.speechSynthesis?.cancel();this.utterance=undefined;
      for(const node of this.nodes){try{node.stop();}catch{}}
      this.nodes.clear();
    }
    setEnabled(enabled){
      this.enabled=enabled;
      if(this.master)this.master.gain.setValueAtTime(enabled?1:0,this.context.currentTime);
      if(!enabled)this.stop();
      else this.unlock();
    }
    chime(){
      if(!this.unlock())return false;
      const context=this.context;
      [523.25,659.25,783.99].forEach((frequency,index)=>{
        const oscillator=context.createOscillator(),gain=context.createGain(),at=context.currentTime+index*.18;
        oscillator.frequency.value=frequency;
        gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(.16,at+.025);gain.gain.exponentialRampToValueAtTime(.001,at+.32);
        oscillator.connect(gain);gain.connect(this.master);this.nodes.add(oscillator);
        oscillator.onended=()=>{this.nodes.delete(oscillator);oscillator.disconnect();gain.disconnect();};
        oscillator.start(at);oscillator.stop(at+.34);
      });
      return true;
    }
    speak(text){
      if(!this.enabled || !('speechSynthesis' in window))return false;
      try{
        window.speechSynthesis.cancel();
        const message=new SpeechSynthesisUtterance(text);
        const voices=window.speechSynthesis.getVoices();
        message.voice=voices.find(voice=>voice.lang==='en-GB')||voices.find(voice=>voice.lang?.startsWith('en'))||null;
        message.lang=message.voice?.lang||'en-GB';message.rate=.83;message.pitch=1.08;
        this.utterance=message; // Retain it: some mobile browsers otherwise drop playback.
        window.speechSynthesis.resume();window.speechSynthesis.speak(message);
        return true;
      }catch{return false;}
    }
  }
  window.BuzzSound=BuzzSound;
})();
