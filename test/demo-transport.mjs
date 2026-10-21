import { crops, animals, FOOD_MS, recipes, units } from '../catalog.mjs';

export function fixture(now=Date.now()) {
  return {mapInstanceId:'home',revision:1,serverTime:now,outfit:{},farm:{
    coins:30000,gems:0,owned:6,chests:{main:1,home:1},inventory:{seed:0,strawberry:0,potato:500,egg:100},seeds:{},
    fedAt:{poultry:now,livestock:null,pond:null},
    plots:Array.from({length:60},(_,i)=>({stage:i<6?'growing':'dry',cropId:i<6?'potato':undefined,wateredAt:i<6?now-crops.potato.growMs+(i+1)*20000:null})),
    poultry:[{id:'hen-demo',species:'hen',boughtAt:now-30*3600000,ageMs:animals.hen.maturityMs,productionMs:animals.hen.cycleMs-45000,careAt:now}],
    animals:[],fish:[],kitchen:[],
  }};
}

export class DemoTransport {
  constructor(){this.demo=true;this.snapshot=fixture();this.receipts=new Map();}
  async open(){}
  async close(){}
  advance(){
    const now=Date.now(),f=this.snapshot.farm;
    for(const [unit,u] of Object.entries(units))for(const a of f[u.key]){
      const d=animals[a.species],fed=f.fedAt[unit];
      const elapsed=fed===null?0:Math.max(0,Math.min(now,fed+FOOD_MS)-Math.max(a.careAt,fed));
      const growth=Math.min(elapsed,Math.max(0,d.maturityMs-a.ageMs));
      a.ageMs+=growth;a.productionMs=Math.min(d.cycleMs,a.productionMs+elapsed-growth);a.careAt=now;
    }
    this.snapshot.serverTime=now;
  }
  async request(path,body){
    this.advance();
    if(path==='/player')return{id:'demo-player',name:'Khu vườn mẫu',level:1};
    if(path==='/inventory')return structuredClone(this.snapshot);
    if(path!=='/commands')throw new Error('INVALID_COMMAND');
    if(this.receipts.has(body.requestId))return structuredClone(this.receipts.get(body.requestId));
    const f=this.snapshot.farm,now=this.snapshot.serverTime;
    const fail=()=>{throw Object.assign(new Error('NOT_ALLOWED'),{code:'NOT_ALLOWED',definitive:true});};
    if(body.type==='plot'){
      const p=f.plots[body.index];if(!p||body.index>=f.owned)fail();
      if(body.action==='harvest'){
        if(p.stage!=='ripe'&&!(p.stage==='growing'&&now>=p.wateredAt+crops[p.cropId].growMs))fail();
        f.inventory[p.cropId]=(f.inventory[p.cropId]??0)+crops[p.cropId].yield;
        p.stage='tilled';delete p.cropId;p.wateredAt=null;
      }else if(body.action==='till'&&p.stage==='dry')p.stage='tilled';
      else if(body.action==='sow'&&p.stage==='tilled'){
        if(f.coins<10)fail();f.coins-=10;p.cropId=body.cropId;p.stage='seeded';
      }else if(body.action==='water'&&p.stage==='seeded'){p.stage='growing';p.wateredAt=now;}
      else fail();
    }else if(body.type==='cook'){
      const r=recipes[body.recipeId];
      if(!r||f.kitchen.length||Object.entries(r.ingredients).some(([k,n])=>(f.inventory[k]??0)<n))fail();
      for(const [k,n]of Object.entries(r.ingredients))f.inventory[k]-=n;
      f.kitchen.push({id:body.requestId,recipeId:body.recipeId,readyAt:now+r.cookMs,startedAt:now});
    }else if(body.type==='collect-dish'){
      const job=f.kitchen.find(j=>j.id===body.jobId);if(!job||job.readyAt>now)fail();
      f.inventory[job.recipeId]=(f.inventory[job.recipeId]??0)+1;f.kitchen=[];
    }else if(body.type==='sell'){
      if(!recipes[body.product]||(f.inventory[body.product]??0)<body.count)fail();
      f.inventory[body.product]-=body.count;f.coins+=recipes[body.product].price*body.count;
    }else if(body.type==='feed'){
      f.coins-=units[body.unit].feed;f.fedAt[body.unit]=now;
    }else if(body.type==='collect'){
      for(const a of f[units[body.unit].key]){
        const d=animals[a.species];
        if(a.ageMs>=d.maturityMs&&a.productionMs>=d.cycleMs){f.inventory[d.product]=(f.inventory[d.product]??0)+d.yield;a.productionMs=0;}
      }
    }else fail();
    this.snapshot.revision++;
    const result={...structuredClone(this.snapshot),completed:1,eligible:1};this.receipts.set(body.requestId,result);return result;
  }
}
