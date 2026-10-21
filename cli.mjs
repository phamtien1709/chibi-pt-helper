import { readFile } from 'node:fs/promises';
import { ApiTransport } from './api-transport.mjs';
import { Runner } from './runner.mjs';
import { StateStore } from './state-store.mjs';
import { fileURLToPath } from 'node:url';

const args=process.argv.slice(2);
let file,config,check=false;
for(let i=0;i<args.length;i++) {
  if(args[i]==='--session')file=args[++i];
  else if(args[i]==='--config')config=args[++i];
  else if(args[i]==='--check')check=true;
  else {console.error('Dùng: --terminal --session <file> [--config <file>] [--check]');process.exit(1);}
}
if(!file){console.error('Cần --session <file phiên đã xuất>.');process.exit(1);}
const transport=new ApiTransport(file);
const store=new StateStore(process.env.CHIBI_STATE_FILE??fileURLToPath(new URL('./.private/runtime.json',import.meta.url)));
try{store.acquire();}catch(error){console.error(error.message);process.exit(78);}
process.on('exit',()=>store.release());
const hadState=store.load()!==null;
const runner=new Runner(transport,Date.now,store);
const originalLog=runner.log.bind(runner);
runner.log=(message,kind='info')=>{originalLog(message,kind);console.log(`[${new Date().toISOString()}] ${kind}: ${message}`);};
let stopping=false;
async function stop(){
  if(stopping)return;stopping=true;runner.pause('Đang dừng công cụ.');
  while(runner.busy)await new Promise(resolve=>setTimeout(resolve,100));
  await transport.close();
}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>void stop());
try {
  if(config||!hadState)runner.configure(JSON.parse(await readFile(config??new URL('./autopilot.json',import.meta.url),'utf8')));
  await runner.sync();
  console.log(`Tài khoản: ${runner.player.name}; số dư: ${runner.snapshot.farm.coins} xu.`);
  console.log(`Hạn mức chi: ${runner.settings.spendLimit} xu; giữ lại: ${runner.settings.reserveCoins} xu.`);
  console.log(`Dự kiến: ${runner.view().planned.actions.map(a=>a.label).join(' | ')||'Chờ mốc tiếp theo'}`);
  if(!check&&!stopping){
    await runner.start();
    while(runner.running||runner.busy)await new Promise(resolve=>setTimeout(resolve,500));
    if(!stopping){console.error(runner.status);process.exitCode=['NETWORK_ERROR','RATE_LIMITED','SERVER_ERROR'].includes(runner.lastErrorCode)?1:78;}
  }
} catch(error) {console.error(error.message);process.exitCode=['NETWORK_ERROR','RATE_LIMITED','SERVER_ERROR'].includes(error.code)?1:78;}
finally{await stop();}
