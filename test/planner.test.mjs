import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultSettings, plan, validateSettings, animalEvent } from '../planner.mjs';
import { animals, FOOD_MS } from '../catalog.mjs';
import { fixture } from './demo-transport.mjs';
const now=1_000_000_000;
const settings=()=>structuredClone(defaultSettings);

test('Thu đúng mốc server, không thu sớm',()=>{
  const s=fixture(now);s.farm.plots[0].wateredAt-=20000;
  const p=plan(s,settings());
  assert(p.actions.some(a=>a.command.type==='plot'&&a.command.action==='harvest'&&a.command.index===0));
  assert(!p.actions.some(a=>a.command.action==='harvest'&&a.command.index===1));
});
test('Nấu ưu tiên đúng nguyên liệu, một chỗ bếp và giữ nguyên kho',()=>{
  const s=fixture(now),before=structuredClone(s);
  assert.equal(plan(s,settings()).actions.find(a=>a.command.type==='cook').command.recipeId,'fries');
  assert.deepEqual(s,before);
  s.farm.kitchen=[{id:'a',recipeId:'fries',readyAt:now+1}];
  assert(!plan(s,settings()).actions.some(a=>a.command.type==='cook'));
  assert(!plan(s,settings()).actions.some(a=>a.command.type==='collect-dish'));
  s.farm.kitchen[0].readyAt=now;
  assert(plan(s,settings()).actions.some(a=>a.command.type==='collect-dish'));
});
test('Giữ xu dự phòng, hạn mức chi và không dùng Gem',()=>{
  const s=fixture(now);s.farm.plots[0]={stage:'tilled',wateredAt:null};
  s.farm.fedAt.poultry=null;const options=settings();options.spendLimit=20;
  assert(!plan(s,options).actions.some(a=>a.command.type==='feed'));
  assert(plan(s,options).actions.some(a=>a.command.action==='sow'));
  assert(!plan(s,options,20).actions.some(a=>a.cost>0));
  s.farm.coins=1000;
  assert(!plan(s,options).actions.some(a=>a.cost>0));
  assert.throws(()=>validateSettings({defaultCrop:'aloe'}));
});
test('Cho ăn ở ngưỡng 25%, sản phẩm không tự cộng dồn qua nhiều chu kỳ',()=>{
  const s=fixture(now);s.farm.fedAt.poultry=now-FOOD_MS*.75;
  assert(plan(s,settings()).actions.some(a=>a.command.type==='feed'));
  s.farm.fedAt.poultry++;
  assert(!plan(s,settings()).actions.some(a=>a.command.type==='feed'));
  assert.equal(animalEvent({...s.farm.poultry[0],productionMs:0},null,now).paused,true);
  assert.equal(animalEvent({...s.farm.poultry[0],productionMs:animals.hen.cycleMs},null,now).ready,true);
});
test('Kho đầy ngăn thu nhưng vẫn cho nấu để giải phóng nguyên liệu',()=>{
  const s=fixture(now);s.farm.inventory=Object.fromEntries(Array.from({length:12},(_,i)=>[`x${i}`,1]));
  s.farm.plots[0]={stage:'ripe',wateredAt:0,cropId:'potato'};
  const p=plan(s,settings());
  assert(!p.actions.some(a=>a.command.action==='harvest'));
  assert(p.warnings.some(w=>w.includes('Kho đầy')));
});
test('Chỉ bán món ăn, không bán nguyên liệu hoặc tự mua/nâng cấp',()=>{
  const s=fixture(now);s.farm.inventory.fries=2;s.farm.inventory.turtle=5;
  const p=plan(s,settings());
  assert.deepEqual(p.actions.filter(a=>a.command.type==='sell').map(a=>a.command.product),['fries']);
  assert(!p.actions.some(a=>['buy-animal','expand','upgrade-chest'].includes(a.command.type)));
});
