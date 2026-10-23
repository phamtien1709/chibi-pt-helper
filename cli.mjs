import { readFile } from 'node:fs/promises';
import { ApiTransport } from './api-transport.mjs';
import { Runner } from './runner.mjs';
import { StateStore } from './state-store.mjs';
import { fileURLToPath } from 'node:url';

const args=process.argv.slice(2);
let file,config,credentialsFile,check=false;
for(let i=0;i<args.length;i++) {
  if(args[i]==='--session')file=args[++i];
  else if(args[i]==='--credentials')credentialsFile=args[++i];
  else if(args[i]==='--config')config=args[++i];
  else if(args[i]==='--check')check=true;
  else {console.error('Dùng: --terminal (--session <file> hoặc --credentials <file>) [--config <file>] [--check]');process.exit(1);}
}
if(!file&&!credentialsFile){console.error('Cần --session <file phiên> hoặc --credentials <file đăng nhập>.');process.exit(1);}
const transport=new ApiTransport(file,{credentialsFile});
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
  if(check){
    const view=runner.view();
    console.log(`Chế độ tự động: ${runner.settings.autoPlan?'bật':'tắt'}; nấu: ${runner.settings.cook?'bật':'tắt'}; bán món: ${runner.settings.sellDishes?'bật':'tắt'}.`);
    console.log(`Kho: ${JSON.stringify(runner.snapshot.farm.inventory)}`);
    console.log(`Bếp: ${JSON.stringify(runner.snapshot.farm.kitchen)}`);
    console.log(`Lịch tiếp theo: ${JSON.stringify(view.planned.events.slice(0,12))}`);
  }
  if(!check&&!stopping){
    await runner.start();
    while(runner.running||runner.busy)await new Promise(resolve=>setTimeout(resolve,500));
    if(!stopping){console.error(runner.status);process.exitCode=['NETWORK_ERROR','RATE_LIMITED','SERVER_ERROR'].includes(runner.lastErrorCode)?1:78;}
  }
} catch(error) {console.error(error.message);process.exitCode=['NETWORK_ERROR','RATE_LIMITED','SERVER_ERROR'].includes(error.code)?1:78;}
finally{await stop();}
