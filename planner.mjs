import { animals, crops, FOOD_MS, recipes, units } from './catalog.mjs';

export const defaultSettings = {
  harvest:true, replant:true, feed:true, collectAnimals:true, cook:true, sellDishes:true,
  defaultCrop:'potato', plotCrops:{}, recipePriority:['fries','starfruitYogurt','ketchup'],
  reserveCoins:1000, spendLimit:5000,
  autoPlan:false, autoHens:false, budgetPeriod:'process',
};

export function validateSettings(value) {
  const s = {...defaultSettings,...value};
  for (const k of ['harvest','replant','feed','collectAnimals','cook','sellDishes','autoPlan','autoHens'])
    if (typeof s[k] !== 'boolean') throw new Error('Cấu hình bật/tắt không hợp lệ.');
  if (!Object.hasOwn(crops,s.defaultCrop)) throw new Error('Giống cây chưa được hỗ trợ.');
  if (!['process','day'].includes(s.budgetPeriod)) throw new Error('Chu kỳ hạn mức không hợp lệ.');
  for (const k of ['reserveCoins','spendLimit'])
    if (!Number.isSafeInteger(s[k]) || s[k]<0 || s[k]>10_000_000) throw new Error('Giới hạn xu không hợp lệ.');
  if (!s.plotCrops || typeof s.plotCrops!=='object' || Array.isArray(s.plotCrops) ||
      Object.entries(s.plotCrops).some(([k,v])=>!/^\d+$/.test(k)||Number(k)>=60||!Object.hasOwn(crops,v)))
    throw new Error('Cấu hình ô đất không hợp lệ.');
  if (!Array.isArray(s.recipePriority) || s.recipePriority.length>18 ||
      new Set(s.recipePriority).size!==s.recipePriority.length ||
      s.recipePriority.some(k=>!Object.hasOwn(recipes,k))) throw new Error('Danh sách món không hợp lệ.');
  return Object.fromEntries(Object.keys(defaultSettings).map(k=>[k,s[k]]));
}

export function validateSnapshot(s) {
  const f=s?.farm;
  if (s?.mapInstanceId!=='home' || !Number.isFinite(s.serverTime) || !Number.isSafeInteger(s.revision) ||
      !f || !Number.isSafeInteger(f.coins) || !Array.isArray(f.plots) ||
      !Number.isInteger(f.owned) || f.owned<6 || f.owned>60 || f.plots.length<f.owned ||
      !f.inventory || !f.fedAt || !f.chests || !f.seeds || !Array.isArray(f.kitchen) ||
      Object.values(units).some(u=>!Array.isArray(f[u.key])))
    throw new Error('Dữ liệu game khác phiên bản hỗ trợ; đã dừng để kiểm tra.');
  return s;
}

function canStore(f, additions) {
  const slots=[12,18,24,30,36,48][f.chests.main-1];
  if (!slots) return false;
  const occupied=Object.values(f.inventory).filter(n=>n>0).length - Number((f.inventory.seed??0)>0);
  const newTypes=Object.keys(additions).filter(k=>!(f.inventory[k]>0)).length;
  return newTypes===0 || occupied+newTypes<=slots;
}

export function animalEvent(a, fedAt, now) {
  const d=animals[a.species];
  if (!d || a.species==='dog') return null;
  // Snapshot đã được server cập nhật: chỉ dự đoán phần thời gian sau snapshot.
  const remaining=Math.max(0,d.maturityMs-(a.ageMs??0)) + Math.max(0,d.cycleMs-(a.productionMs??0));
  const at=now+remaining;
  return {at,ready:remaining===0,paused:remaining>0&&(fedAt===null || at>fedAt+FOOD_MS),product:d.product,count:d.yield};
}

export function plan(snapshot, settings, spent=0) {
  validateSnapshot(snapshot);
  settings=autopilotSettings(snapshot,settings);
  const f=snapshot.farm, now=snapshot.serverTime, actions=[], events=[], warnings=[];
  const add=(command,label,cost=0)=>actions.push({command,label,cost});
  const afford=(cost)=>f.coins-cost>=settings.reserveCoins && spent+cost<=settings.spendLimit;
  if (settings.sellDishes) for (const [id,r] of Object.entries(recipes)) {
    const count=f.inventory[id]??0;
    if (count>0) add({type:'sell',product:id,count},`Bán ${count} ${r.label}`);
  }
  for (const job of f.kitchen) {
    events.push({at:job.readyAt,label:`Nhận ${recipes[job.recipeId]?.label??job.recipeId}`});
    if (settings.cook && job.readyAt<=now) {
      if (canStore(f,{[job.recipeId]:1})) add({type:'collect-dish',jobId:job.id},'Nhận món đã nấu');
      else warnings.push('Kho đầy: cần chỗ cho món đã nấu.');
    }
  }
  for (const [unit,u] of Object.entries(units)) {
    const herd=f[u.key];
    if (!herd.length) continue;
    const fed=f.fedAt[unit];
    const feedAt=fed===null?now:fed+FOOD_MS*0.75;
    if (settings.feed) {
      events.push({at:feedAt,label:`Cho ăn: ${u.label}`});
      if (feedAt<=now) {
        if (afford(u.feed)) add({type:'feed',unit},`Cho ăn: ${u.label}`,u.feed);
        else warnings.push(`Chưa thể cho ${u.label} ăn: kiểm tra số dư và hạn mức chi.`);
      }
    }
    const ready=herd.map(a=>animalEvent(a,fed,now)).filter(Boolean);
    for (const e of ready) if (!e.paused && settings.collectAnimals) events.push({at:e.at,label:`Thu sản phẩm: ${u.label}`});
    const additions={};
    for (const e of ready.filter(e=>e.ready)) additions[e.product]=(additions[e.product]??0)+e.count;
    if (settings.collectAnimals && Object.keys(additions).length) {
      if (canStore(f,additions)) add({type:'collect',unit},`Thu sản phẩm: ${u.label}`);
      else warnings.push(`Kho đầy: chưa thể thu ${u.label}.`);
    }
  }
  if(settings.autoHens) {
    const target=Math.min(6,f.capacity?.poultry??6);
    if(f.poultry.length<target && afford(500))
      add({type:'buy-animal',unit:'poultry',species:'hen'},'Mua gà mái để cung cấp trứng',500);
  }
  for (let index=0;index<f.owned;index++) {
    const p=f.plots[index], d=crops[p.cropId??'strawberry'];
    const ripe=p.stage==='ripe'||(p.stage==='growing'&&d&&now>=p.wateredAt+d.growMs);
    if (p.stage==='growing'&&!d) warnings.push(`Ô ${index+1}: giống chưa hỗ trợ, giữ nguyên cây.`);
    if (p.stage==='growing'&&d&&settings.harvest) events.push({at:p.wateredAt+d.growMs,label:`Thu ô ${index+1}: ${d.label}`});
    if (ripe&&settings.harvest) {
      if (canStore(f,{[p.cropId??'strawberry']:1})) add({type:'plot',index,action:'harvest'},`Thu hoạch ô ${index+1}`);
      else warnings.push(`Kho đầy: chưa thể thu ô ${index+1}.`);
    }
    if (!settings.replant) continue;
    const cropId=settings.plotCrops[index]??p.cropId??settings.defaultCrop;
    if (p.stage==='seeded') add({type:'plot',index,action:'water'},`Tưới ô ${index+1}`);
    if (p.stage==='dry') add({type:'plot',index,action:'till'},`Xới ô ${index+1}`);
    if (p.stage==='tilled'&&crops[cropId]) {
      const stock=cropId==='strawberry'?(f.inventory.seed??0):(f.seeds[cropId]??0);
      const cost=stock>0?0:crops[cropId].seedPrice;
      if (cost===0||afford(cost)) add({type:'plot',index,action:'sow',cropId},`Gieo ${crops[cropId].label}: ô ${index+1}`,cost);
      else warnings.push(`Chưa thể gieo ô ${index+1}: kiểm tra số dư và hạn mức chi.`);
    }
  }
  if (settings.cook&&!f.kitchen.length) {
    const recipeId=settings.recipePriority.find(id=>Object.entries(recipes[id].ingredients).every(([k,n])=>(f.inventory[k]??0)>=n));
    if (recipeId) {
      // Nấu trước các thao tác gieo để bếp chạy ngay và giải phóng nguyên liệu.
      const action={command:{type:'cook',recipeId},label:`Nấu ${recipes[recipeId].label}`,cost:0};
      const firstSow=actions.findIndex(a=>a.command.type==='plot'&&['till','sow','water'].includes(a.command.action));
      actions.splice(firstSow<0?actions.length:firstSow,0,action);
    }
  }
  return {actions,events:events.sort((a,b)=>a.at-b.at),warnings:[...new Set(warnings)]};
}

export function autopilotSettings(snapshot,settings) {
  if(!settings.autoPlan)return settings;
  const f=snapshot.farm;
  const hens=f.poultry.filter(a=>a.species==='hen').length;
  const expectedHens=settings.autoHens?Math.max(hens,Math.max(0,Math.min(6,f.capacity?.poultry??6)-f.poultry.filter(a=>a.species!=='hen').length)):hens;
  // Một ô khoai cho 480 củ/ngày; một gà cho tối đa 80 trứng/ngày.
  const potatoCount=Math.min(f.owned,Math.floor(expectedHens*80/96));
  const cows=f.animals.filter(a=>a.species==='cow').length;
  const starfruitCount=Math.min(f.owned-potatoCount,Math.ceil(cows*120/72*96/360));
  const plotCrops={};
  for(let i=0;i<f.owned;i++)plotCrops[i]=i<potatoCount?'potato':i<potatoCount+starfruitCount?'starfruit':'tomato';
  return {...settings,plotCrops,defaultCrop:'tomato',recipePriority:[
    'fries','starfruitYogurt','riceMeal','eggCake','milkCake','eggRice','carrotRice',
    'beefBalls','fishBalls','mangoSalad','fruitJuice','watermelonJuice','chiliSauce',
    'ketchup','cheese','butterCorn','pancake','pizza',
  ]};
}
