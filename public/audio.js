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
      if(this.utterance){this.utterance.onend=null;this.utterance.onerror=null;}
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
    muteChime(){
      if(!this.unlock())return false;
      const context=this.context;
      [520,330].forEach((frequency,index)=>{
        const oscillator=context.createOscillator(),gain=context.createGain(),at=context.currentTime+index*.11;
        oscillator.type='sine';oscillator.frequency.value=frequency;
        gain.gain.setValueAtTime(.001,at);gain.gain.exponentialRampToValueAtTime(.12,at+.015);gain.gain.exponentialRampToValueAtTime(.001,at+.14);
        oscillator.connect(gain);gain.connect(this.master);this.nodes.add(oscillator);
        oscillator.onended=()=>{this.nodes.delete(oscillator);oscillator.disconnect();gain.disconnect();};
        oscillator.start(at);oscillator.stop(at+.16);
      });
      return true;
    }
    tap(){
      if(!this.unlock())return false;
      const context=this.context,oscillator=context.createOscillator(),gain=context.createGain(),at=context.currentTime;
      oscillator.type='sine';oscillator.frequency.setValueAtTime(420,at);oscillator.frequency.exponentialRampToValueAtTime(620,at+.07);
      gain.gain.setValueAtTime(.07,at);gain.gain.exponentialRampToValueAtTime(.001,at+.09);
      oscillator.connect(gain);gain.connect(this.master);this.nodes.add(oscillator);
      oscillator.onended=()=>{this.nodes.delete(oscillator);oscillator.disconnect();gain.disconnect();};
      oscillator.start(at);oscillator.stop(at+.1);
      return true;
    }
    speak(text,{onError}={}){
      if(!this.enabled)return false;
      if(!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)){
        onError?.('This browser cannot play Buzz’s voice. You can read the answer on screen.');return false;
      }
      try{
        if(this.utterance){this.utterance.onend=null;this.utterance.onerror=null;}
        window.speechSynthesis.cancel();
        const message=new SpeechSynthesisUtterance(text);
        const voices=window.speechSynthesis.getVoices();
        message.voice=voices.find(voice=>voice.lang==='en-GB')||voices.find(voice=>voice.lang?.startsWith('en'))||null;
        message.lang=message.voice?.lang||'en-GB';message.rate=.83;message.pitch=1.08;
        message.onend=()=>{if(this.utterance===message)this.utterance=undefined;};
        message.onerror=event=>{
          if(this.utterance!==message)return;
          this.utterance=undefined;
          if(event.error!=='canceled' && event.error!=='interrupted')onError?.('Buzz’s voice could not play. Check your browser’s sound settings, or read the answer on screen.');
        };
        this.utterance=message; // Retain it: some mobile browsers otherwise drop playback.
        window.speechSynthesis.resume();window.speechSynthesis.speak(message);
        return true;
      }catch{onError?.('Buzz’s voice could not start. You can read the answer on screen.');return false;}
    }
  }
  window.BuzzSound=BuzzSound;
})();
