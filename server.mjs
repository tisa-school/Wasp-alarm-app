import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectPhoto, visionConfigured, validPhoto, VisionError } from './vision.mjs';
const root = path.join(import.meta.dirname,'public');
const types = {'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.png':'image/png'};
function json(res,status,body) {
  if(res.destroyed)return;
  res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(JSON.stringify(body));
}
async function readJSON(req) {
  if(req.body !== undefined) {
    const data=typeof req.body==='string' ? req.body : JSON.stringify(req.body);
    if(Buffer.byteLength(data)>1_450_000)throw new VisionError('bad_image','Photo is too large.',413);
    try{return JSON.parse(data);}catch{throw new VisionError('bad_request','A JSON photo request is required.',400);}
  }
  const chunks=[];let size=0;
  for await(const chunk of req) {
    size+=chunk.length;
    if(size>1_450_000)throw new VisionError('bad_image','Photo is too large.',413);
    chunks.push(chunk);
  }
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
  catch{throw new VisionError('bad_request','A JSON photo request is required.',400);}
}
export function createRequestHandler({inspect = inspectPhoto, configured = visionConfigured} = {}) {
  const attempts=new Map();let inFlight=0;let hourStart=Date.now();let hourlyCount=0;
  return async(req,res)=>{
    let pathname;
    try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{json(res,400,{error:'bad_request',message:'Invalid address.'});return;}
    if(pathname==='/api/status') { if(req.method!=='GET'){json(res,405,{error:'method_not_allowed'});return;}json(res,200,{configured:configured(),distanceAvailable:false});return; }
    if(pathname==='/api/scan') {
      if(req.method!=='POST'){json(res,405,{error:'method_not_allowed'});return;}
      // Browser uploads must originate from this app; no cross-origin photo API.
      try { if(!req.headers.origin || new URL(req.headers.origin).host!==req.headers.host)throw new Error(); }
      catch{json(res,403,{error:'origin_denied',message:'Use the photo check from this app.'});return;}
      if(!req.headers['content-type']?.startsWith('application/json')){json(res,415,{error:'bad_request',message:'A JSON camera photo is required.'});return;}
      if(!configured()){json(res,503,{error:'not_configured',message:'Photo checks are not connected yet. Ask your grown-up to finish setup.'});return;}
      const now=Date.now();
      if(now-hourStart>3_600_000){hourStart=now;hourlyCount=0;}
      for(const [key,value] of attempts)if(now-value.start>60_000)attempts.delete(key);
      const ip=req.socket.remoteAddress;
      const usage=attempts.get(ip)||{start:now,count:0};
      if(usage.count>=6 || hourlyCount>=100 || inFlight>=2){json(res,429,{error:'rate_limited',message:'Buzz needs a short break. Try again in a minute.'});return;}
      usage.count++;attempts.set(ip,usage);hourlyCount++;inFlight++;
      const controller=new AbortController();
      const cancel=()=>{if(!res.writableEnded)controller.abort();};
      res.on('close',cancel);
      try{
        const body=await readJSON(req);
        if(body?.consent!==true)throw new VisionError('consent_required','Ask your grown-up before sending a photo.',400);
        if(!validPhoto(body.image))throw new VisionError('bad_image','A valid camera photo is required.',400);
        const result=await inspect(body.image,{signal:controller.signal});
        if(!['possible_wasp','no_wasp_visible','uncertain'].includes(result.verdict))throw new VisionError('vision_unavailable','The image service could not return a result.');
        json(res,200,{verdict:result.verdict,scope:'single_photo',distanceAvailable:false});
      }catch(error){
        const known=error instanceof VisionError;
        json(res,known?error.status:503,{error:known?error.code:'vision_unavailable',message:known?error.message:'Photo check unavailable. Ask your grown-up for help.'});
      }finally{inFlight--;res.off('close',cancel);}
      return;
    }
    if(pathname.startsWith('/api/')){json(res,404,{error:'not_found'});return;}
    if(req.method!=='GET' && req.method!=='HEAD'){res.writeHead(405);res.end();return;}
    try{
      const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
      if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
      const body=await readFile(file);
      res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
      res.end(req.method==='HEAD'?undefined:body);
    }catch{res.writeHead(404);res.end('Not found');}
  };
}
export function createAppServer(options) { return http.createServer(createRequestHandler(options)); }
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url))createAppServer().listen(process.env.PORT||3000,'0.0.0.0');
