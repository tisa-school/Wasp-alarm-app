import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeBuzzFrames,waveformLevel} from '../public/buzz-sound-detector.mjs';

const frames=(count,make)=>Array.from({length:count},(_,index)=>make(index));

test('A sustained narrow buzz is reported only as a possible generic buzz',()=>{
  const result=summarizeBuzzFrames(frames(45,index=>({frequency:190+(index%3-1)*3,level:-32,prominence:18})));
  assert.equal(result.verdict,'possible_buzz');
  assert.ok(result.frequency>=185&&result.frequency<=195);
});

test('A quieter speaker recording with harmonic jitter is still noticed as buzzing',()=>{
  const result=summarizeBuzzFrames(frames(45,index=>index%4===0
    ? {frequency:720,level:-70,prominence:3}
    : {frequency:720+(index%5-2)*14,level:-54,prominence:7.5}));
  assert.equal(result.verdict,'possible_buzz');
  assert.ok(result.frequency>=680&&result.frequency<=760);
});

test('Speaker playback can alternate between a buzz and its harmonic',()=>{
  const result=summarizeBuzzFrames(frames(45,index=>({frequency:index%2?190:380,level:-52,prominence:5})));
  assert.equal(result.verdict,'possible_buzz');
});

test('Time-domain microphone level measures broadband sound instead of one FFT bin',()=>{
  const silence=new Float32Array(256);
  const tone=Float32Array.from({length:256},(_,index)=>.1*Math.sin(2*Math.PI*index/16));
  assert.ok(waveformLevel(silence)<-100);
  assert.ok(waveformLevel(tone)>-25&&waveformLevel(tone)<-20);
});

test('Quiet, broad, and changing sounds do not become buzz alerts',()=>{
  assert.equal(summarizeBuzzFrames(frames(45,()=>({frequency:190,level:-80,prominence:20}))).verdict,'too_quiet');
  assert.equal(summarizeBuzzFrames(frames(45,()=>({frequency:190,level:-30,prominence:4}))).verdict,'no_steady_buzz');
  assert.equal(summarizeBuzzFrames(frames(45,index=>({frequency:index%2?110:470,level:-30,prominence:18}))).verdict,'uncertain');
});

test('Missing or malformed microphone samples cannot produce a result',()=>{
  assert.equal(summarizeBuzzFrames([]).verdict,'too_quiet');
  assert.equal(summarizeBuzzFrames([{frequency:NaN,level:-20,prominence:20}]).verdict,'too_quiet');
});
