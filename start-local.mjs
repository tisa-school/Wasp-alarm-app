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
  console.log('Click Turn camera on or Use phone camera. Allow camera access in your browser.');
  console.log(visionConfigured()?'A photo recognition key is configured. Scan needs an internet connection.':'Photo recognition is not connected. Camera capture works; Scan will report unavailable.');
  console.log('Keep this window open. Press Ctrl+C to stop.');
  if(process.argv.includes('--no-open'))return;
  const command=process.platform==='win32'?'cmd':process.platform==='darwin'?'open':'xdg-open';
  const args=process.platform==='win32'?['/c','start','',address]:[address];
  const opener=spawn(command,args,{stdio:'ignore',detached:true});
  opener.on('error',()=>console.log('Open the address above in Safari, Chrome, Firefox, or Edge.'));
  opener.unref();
});
