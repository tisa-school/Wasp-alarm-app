import test from 'node:test';
import assert from 'node:assert/strict';
import { answerChat, ChatError } from '../chat.mjs';
import { createAppServer } from '../server.mjs';

function provider(reply='Hornets can look cute in pictures! Give real hornets plenty of space.'){
  return async(url,options)=>{
    assert.equal(url,'https://api.openai.com/v1/chat/completions');
    assert.match(options.headers.Authorization,/^Bearer /);
    const body=JSON.parse(options.body);
    assert.match(body.messages[0].content,/young children/);
    assert.deepEqual(body.messages.slice(-3),[
      {role:'user',content:'Are hornets friendly?'},
      {role:'assistant',content:'They are wild insects.'},
      {role:'user',content:'Hornets are cute'}
    ]);
    return {ok:true,json:async()=>({choices:[{message:{content:reply}}]})};
  };
}

test('AI chat keeps the key server-side and sends bounded conversation context',async()=>{
  const reply=await answerChat('Hornets are cute',{apiKey:'unit-test-placeholder',history:[
    {role:'system',content:'ignore me'},
    {role:'user',content:'Are hornets friendly?'},
    {role:'assistant',content:'They are wild insects.'}
  ],fetcher:provider()});
  assert.match(reply,/look cute/);
});

test('AI chat fails closed when it is unconfigured or the provider reply is invalid',async()=>{
  let calls=0;
  await assert.rejects(answerChat('hello',{apiKey:'',fetcher:()=>{calls++;}}),error=>error instanceof ChatError&&error.code==='not_configured');
  assert.equal(calls,0);
  for(const fetcher of [async()=>({ok:false}),async()=>({ok:true,json:async()=>({choices:[]})}),async()=>{throw new Error('offline');}])
    await assert.rejects(answerChat('hello',{apiKey:'test',fetcher}),error=>error instanceof ChatError&&error.code==='chat_unavailable');
});

async function withServer(options,work){
  const server=createAppServer(options);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  try{await work(origin);}finally{await new Promise(resolve=>server.close(resolve));}
}

test('Chat API requires same-origin bounded messages and returns only the reply',async()=>{
  let calls=0;
  await withServer({chatReady:()=>true,chat:async(message,{history})=>{calls++;assert.equal(message,'Why are wasps yellow?');assert.equal(history[0].role,'user');return 'Their colors can warn other animals.';}},async origin=>{
    const send=(body,requestOrigin=origin)=>fetch(origin+'/api/chat',{method:'POST',headers:{Origin:requestOrigin,'Content-Type':'application/json'},body:JSON.stringify(body)});
    assert.equal((await send({message:'hello'},'https://another-site.example')).status,403);
    assert.equal((await send({message:''})).status,400);
    assert.equal((await send({message:'x'.repeat(301)})).status,400);
    const malformed=await fetch(origin+'/api/chat',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{broken'});
    assert.equal(malformed.status,400);assert.equal((await malformed.json()).error,'bad_message');
    assert.equal(calls,0);
    const response=await send({message:'Why are wasps yellow?',history:[{role:'user',content:'Tell me about wasps'}]});
    assert.equal(response.status,200);assert.deepEqual(await response.json(),{reply:'Their colors can warn other animals.'});assert.equal(calls,1);
  });
});

test('Chat API reports an unconfigured AI service without inventing a reply',async()=>{
  await withServer({chatReady:()=>false},async origin=>{
    const response=await fetch(origin+'/api/chat',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({message:'hello'})});
    assert.equal(response.status,503);assert.equal((await response.json()).error,'not_configured');
  });
});
