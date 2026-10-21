import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixture } from './demo-transport.mjs';
import { autopilotSettings,plan,validateSettings } from '../planner.mjs';
import { Runner } from '../runner.mjs';
import { StateStore } from '../state-store.mjs';
import { serviceUnit } from '../deploy/service-unit.mjs';
const automatic=()=>validateSettings(JSON.parse(readFileSync(new URL('../autopilot.json',import.meta.url),'utf8')));

test('10 ô lúa: giữ nguyên cây, chuẩn bị gà, vụ sau chia 5 khoai và 5 cà chua',()=>{
 const s=fixture();s.farm.owned=10;s.farm.capacity={poultry:6,livestock:10,pond:2};s.farm.poultry=[];
 s.farm.plots.slice(0,10).forEach(p=>Object.assign(p,{stage:'growing',cropId:'rice',wateredAt:s.serverTime}));
 const before=structuredClone(s),effective=autopilotSettings(s,automatic()),p=plan(s,automatic());
 assert.equal(Object.values(effective.plotCrops).filter(c=>c==='potato').length,5);
 assert.equal(Object.values(effective.plotCrops).filter(c=>c==='tomato').length,5);
 assert(p.actions.some(a=>a.command.type==='buy-animal'&&a.cost===500));
 assert(!p.actions.some(a=>a.command.type==='plot'));assert.deepEqual(s,before);
 s.farm.coins=2000;assert(!plan(s,automatic()).actions.some(a=>a.command.type==='buy-animal'));
});
test('Có lúa trong kho thì tự chọn món Cơm; không mua quá 6 con hoặc dùng Gem',()=>{
 const s=fixture();s.farm.capacity={poultry:6};s.farm.inventory={rice:1440,seed:0,strawberry:0};
 s.farm.poultry=Array.from({length:6},()=>({...s.farm.poultry[0]}));
 const p=plan(s,automatic());
 assert.equal(p.actions.find(a=>a.command.type==='cook').command.recipeId,'riceMeal');
 assert(!p.actions.some(a=>a.command.type==='buy-animal'));
});
test('Lưu hạn mức và lệnh chưa rõ kết quả qua restart; reset hạn mức theo ngày Việt Nam',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'chibi-state-')),file=join(dir,'state.json');
 try{
  const store=new StateStore(file),r=new Runner({},Date.now,store);r.configure(automatic());
  const s=fixture(Date.UTC(2026,9,21,16,0));r.acceptSnapshot(s);
  r.spent=3000;r.pending={command:{type:'feed',unit:'poultry'},cost:25,body:{requestId:'same-id',mapInstanceId:'home',type:'feed',unit:'poultry'}};r.persist();
  const restored=new Runner({},Date.now,new StateStore(file));assert.equal(restored.spent,3000);assert.equal(restored.pending.body.requestId,'same-id');
  restored.acceptSnapshot(fixture(Date.UTC(2026,9,21,17,1)));assert.equal(restored.spent,0);assert.equal(restored.pending.body.requestId,'same-id');
  assert(!readFileSync(file,'utf8').includes('chibi_session'));
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('Khóa chặn hai tiến trình và unit không restart vô hạn lỗi phiên',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'chibi-lock-'));const a=new StateStore(join(dir,'state.json')),b=new StateStore(join(dir,'state.json'));
 try{a.acquire();assert.throws(()=>b.acquire(),/Đã có tiến trình/);a.release();b.acquire();b.release();}
 finally{a.release();b.release();await rm(dir,{recursive:true,force:true});}
 const unit=serviceUnit({node:'/usr/bin/node',cli:'/home/a path/cli.mjs',session:'/home/a/session.json',state:'/home/a/state.json'});
 assert.match(unit,/RestartPreventExitStatus=78/);assert.match(unit,/Restart=on-failure/);assert.match(unit,/"\/home\/a path\/cli.mjs"/);
});
