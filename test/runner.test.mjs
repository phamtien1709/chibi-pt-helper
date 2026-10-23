import test from 'node:test';
import assert from 'node:assert/strict';
import { Runner } from '../runner.mjs';
import { DemoTransport, fixture } from './demo-transport.mjs';
test('Mất phản hồi giữ requestId; retry không trừ tiền lần hai',async()=>{
  let calls=0,firstId;const s=fixture();const receipts=new Map();
  const transport={async request(path,body){
    if(path==='/player')return{id:'one',name:'One'};
    if(path==='/inventory')return structuredClone(s);
    calls++;
    if(!receipts.has(body.requestId)){firstId=body.requestId;s.farm.coins-=25;receipts.set(body.requestId,structuredClone(s));}
    if(calls===1)throw Object.assign(new Error('NETWORK_ERROR'),{code:'NETWORK_ERROR'});
    return receipts.get(body.requestId);
  }};
  const r=new Runner(transport);await r.sync();
  const action={command:{type:'feed',unit:'poultry'},cost:25,label:'Cho ăn'};
  await assert.rejects(r.send(action));assert(r.pending);
  await r.read();await r.send(r.pending);
  assert.equal(firstId,[...receipts.keys()][0]);assert.equal(receipts.size,1);
  assert.equal(s.farm.coins,29975);assert.equal(r.spent,25);assert.equal(r.pending,null);
});
test('Dừng ngay khi tài khoản đổi và không gửi lệnh',async()=>{
  let id='one',writes=0;const r=new Runner({async request(path){
    if(path==='/player')return{id,name:id};if(path==='/inventory')return fixture();writes++;
  }});await r.sync();id='two';r.running=true;await r.cycle();
  assert.equal(r.running,false);assert.equal(writes,0);
});
test('Giữ giống cũ sau thu hoạch và chỉ chỉnh cấu hình lúc dừng',async()=>{
  const s=fixture();s.farm.plots[0].cropId='starfruit';
  const r=new Runner({request:async path=>path==='/player'?{id:'one',name:'One'}:structuredClone(s)});
  await r.sync();assert.equal(r.settings.plotCrops[0],'starfruit');
  delete s.farm.plots[0].cropId;s.farm.plots[0].stage='tilled';await r.sync();
  assert.equal(r.view().planned.actions.find(a=>a.command.action==='sow').command.cropId,'starfruit');
  r.running=true;assert.throws(()=>r.configure({}));r.pause();
});
test('Hết phiên tự dừng, không lặp gửi lệnh',async()=>{
  const r=new Runner({request:async()=>{throw Object.assign(new Error('UNAUTHENTICATED'),{code:'UNAUTHENTICATED',definitive:true});}});
  r.running=true;await r.cycle();assert.equal(r.running,false);assert.match(r.status,/hết hạn/);assert.equal(r.timer,null);
});
test('Chu kỳ nhận món, bán, thu cây, nấu, gieo và tưới dùng snapshot mới sau mỗi lệnh',async()=>{
  const t=new DemoTransport(),now=Date.now();
  t.snapshot.farm.kitchen=[{id:'ready-dish',recipeId:'fries',startedAt:now-3600000,readyAt:now-1}];
  t.snapshot.farm.plots[0]={stage:'ripe',cropId:'potato',wateredAt:now-21600000};
  const r=new Runner(t);await r.sync();r.running=true;
  try{
    await r.cycle();
    assert.equal(r.snapshot.farm.kitchen.length,1);
    assert.equal(r.snapshot.farm.kitchen[0].recipeId,'fries');
    assert.equal(r.snapshot.farm.plots[0].stage,'growing');
    assert.equal(r.snapshot.farm.coins,49990);
    assert.equal(r.spent,10);assert.equal(r.revenue,20000);
    assert(r.logs.some(l=>l.message==='Nhận món đã nấu'));
    assert(r.logs.some(l=>l.message==='Thu hoạch ô 1'));
  }finally{r.pause();}
});

function rejectionRunner({changeState=false,code='NOT_ALLOWED',definitive=true}={}) {
  const s=fixture();s.farm.inventory={};
  s.farm.plots[0]={stage:'ripe',cropId:'rice',wateredAt:0};
  const ids=[];
  const r=new Runner({async request(path,body){
    if(path==='/player')return{id:'one',name:'One'};
    if(path==='/inventory')return structuredClone(s);
    ids.push(body.requestId);
    if(changeState)s.farm.plots[0]={stage:'growing',cropId:'rice',wateredAt:s.serverTime};
    throw Object.assign(new Error(code),{code,status:403,path,definitive});
  }});
  r.settings.replant=false;r.settings.cook=false;r.running=true;
  return {r,ids};
}
test('Lệnh bị từ chối: bỏ pending, đồng bộ lại và bỏ lệnh không còn cần thiết',async()=>{
  const {r,ids}=rejectionRunner({changeState:true});
  try{
    await r.cycle();clearTimeout(r.timer);
    assert.equal(r.running,true);assert.equal(r.pending,null);assert.equal(ids.length,1);
    assert(r.logs.some(l=>l.message.includes('Thu hoạch ô 1')&&l.message.includes('HTTP=403')&&l.message.includes('"cropId":"rice"')));
    await r.cycle();clearTimeout(r.timer);
    assert.equal(ids.length,1);assert.equal(r.running,true);
  }finally{r.pause();}
});
test('Từ chối lặp lại: tối đa 3 lần, mã thao tác mới sau kết quả xác định',async()=>{
  const {r,ids}=rejectionRunner();
  try{
    for(let i=0;i<3;i++){await r.cycle();clearTimeout(r.timer);}
    assert.equal(r.running,false);assert.equal(r.timer,null);assert.equal(r.pending,null);
    assert.equal(ids.length,3);assert.equal(new Set(ids).size,3);assert.equal(r.spent,0);
    assert.match(r.status,/3 lần liên tiếp/);
  }finally{r.pause();}
});
test('Không tự thử lại lỗi phiên đăng nhập, hoặc NOT_ALLOWED chưa xác định kết quả',async()=>{
  for(const options of [{code:'UNAUTHENTICATED'},{definitive:false}]){
    const {r,ids}=rejectionRunner(options);await r.cycle();
    assert.equal(r.running,false);assert.equal(ids.length,1);assert.equal(r.timer,null);
    if(options.definitive===false)assert(r.pending);
  }
});
