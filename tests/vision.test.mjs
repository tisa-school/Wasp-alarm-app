import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectPhoto, validPhoto, VisionError } from '../vision.mjs';
import { createAppServer } from '../server.mjs';
const photo='data:image/jpeg;base64,'+Buffer.concat([Buffer.from([255,216,255]),Buffer.alloc(50)]).toString('base64');
function provider(verdict='possible_wasp',quality='usable') { return async(url,options)=>{
  assert.equal(url,'https://api.openai.com/v1/chat/completions');
  const body=JSON.parse(options.body);
  assert.equal(body.messages[1].content[1].image_url.url,photo);
  assert.equal(body.response_format.json_schema.strict,true);
  return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({verdict,image_quality:quality})}}]})};
};}
test('Only bounded camera JPEG data is accepted',()=>{
  assert.equal(validPhoto(photo),true);
  for(const value of [null,'https://example.com/image.jpg','data:image/svg+xml;base64,PHN2Zz4=', 'data:image/jpeg;base64,YWJj','data:image/jpeg;base64,'+'a'.repeat(1_400_000)])assert.equal(validPhoto(value),false);
});
test('A missing key prevents any upstream request',async()=>{
  let calls=0;
  await assert.rejects(inspectPhoto(photo,{apiKey:'',fetcher:()=>{calls++;}}),error=>error instanceof VisionError && error.code==='not_configured');
  assert.equal(calls,0);
});
test('Provider verdicts refer only to a photo and never claim distance',async()=>{
  for(const verdict of ['possible_wasp','no_wasp_visible','uncertain']){
    const result=await inspectPhoto(photo,{apiKey:'unit-test-placeholder',fetcher:provider(verdict)});
    assert.deepEqual(result,{verdict,scope:'single_photo',distanceAvailable:false});
  }
});
test('Poor images always produce uncertainty',async()=>{
  assert.equal((await inspectPhoto(photo,{apiKey:'unit-test-placeholder',fetcher:provider('no_wasp_visible','poor')})).verdict,'uncertain');
});
test('Malformed or unavailable model replies are errors, never a result',async()=>{
  const fetchers=[provider('safe'),async()=>({ok:false,status:401}),async()=>({ok:true,json:async()=>({choices:[]})}),async()=>{throw new Error('Network down');}];
  for(const fetcher of fetchers)await assert.rejects(inspectPhoto(photo,{apiKey:'unit-test-placeholder',fetcher}),error=>error.code==='vision_unavailable');
});
async function withServer(options,work){const server=createAppServer(options);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;try{await work(origin);}finally{await new Promise(resolve=>server.close(resolve));}}
test('The API exposes an honest unconfigured status and never makes a fake detection',async()=>{
  await withServer({configured:()=>false},async origin=>{
    assert.deepEqual(await(await fetch(origin+'/api/status')).json(),{configured:false,distanceAvailable:false});
    const response=await fetch(origin+'/api/scan',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({image:photo,consent:true})});
    assert.equal(response.status,503);assert.equal((await response.json()).error,'not_configured');
    assert.equal(response.headers.get('cache-control'),'no-store');
  });
});
test('The API requires same-origin requests, consent, and a real photo payload',async()=>{
  let calls=0;
  await withServer({configured:()=>true,inspect:async()=>{calls++;return {verdict:'possible_wasp'};}},async origin=>{
    const send=(body,requestOrigin=origin)=>fetch(origin+'/api/scan',{method:'POST',headers:{Origin:requestOrigin,'Content-Type':'application/json'},body:JSON.stringify(body)});
    assert.equal((await send({image:photo,consent:true},'https://another-site.example')).status,403);
    assert.equal((await send({image:photo})).status,400);
    assert.equal((await send({image:'not-an-image',consent:true})).status,400);
    assert.equal(calls,0);
    const response=await send({image:photo,consent:true});assert.equal(response.status,200);
    assert.deepEqual(await response.json(),{verdict:'possible_wasp',scope:'single_photo',distanceAvailable:false});assert.equal(calls,1);
  });
});
test('API request limits stop repeated provider calls',async()=>{
  let calls=0;
  await withServer({configured:()=>true,inspect:async()=>{calls++;return {verdict:'uncertain'};}},async origin=>{
    for(let i=0;i<7;i++){
      const response=await fetch(origin+'/api/scan',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({image:photo,consent:true})});
      assert.equal(response.status,i===6?429:200);await response.arrayBuffer();
    }
    assert.equal(calls,6);
  });
});
