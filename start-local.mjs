import { spawn } from 'node:child_process';
import { createAppServer } from './server.mjs';
import { visionConfigured } from './vision.mjs';
const port=Number(process.env.PORT || 3000);
if(!Number.isInteger(port)||port<1||port>65535){console.error('PORT must be a number from 1 to 65535.');process.exit(1);}
const server=createAppServer();
server.on('error',error=>{console.error(error.code==='EADDRINUSE'?'Port is in use. Close the other Wasp Buddy server, or choose a different PORT.':'Could not start Wasp Buddy.');process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>{
  const address=`http://localhost:${port}`;
  console.log(`Wasp Buddy is running at ${address}`);
  console.log('Click Use device camera and allow access, or use Choose a photo for existing images.');
  console.log('Default photo recognition runs on this device. No API key required.');
  if(visionConfigured())console.log('A key is also available for the optional server recognition mode.');
  console.log('Keep this window open. Press Ctrl+C to stop.');
  if(process.argv.includes('--no-open'))return;
  const command=process.platform==='win32'?'cmd':process.platform==='darwin'?'open':'xdg-open';
  const args=process.platform==='win32'?['/c','start','',address]:[address];
  const opener=spawn(command,args,{stdio:'ignore',detached:true});
  opener.on('error',()=>console.log('Open the address above in Safari, Chrome, Firefox, or Edge.'));
  opener.unref();
});
