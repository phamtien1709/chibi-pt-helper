const $=id=>document.getElementById(id);
const catalog=JSON.parse($('catalog').textContent);
const token=document.querySelector('meta[name=helper-token]').content;
const format=n=>new Intl.NumberFormat('vi-VN').format(n);
const time=n=>new Date(n).toLocaleTimeString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit',second:'2-digit'});
const bools=['harvest','replant','feed','collectAnimals','cook','sellDishes'];
let state=null,dirty=false,pending=false,formSignature='';
function node(tag,text,className) {const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;}
function select(options,value) {const s=node('select');for(const [id,label] of options){const o=node('option',label);o.value=id;s.append(o);}s.value=value;return s;}
const cropOptions=Object.entries(catalog.crops).map(([k,v])=>[k,v.label]);
for(const [id,label] of cropOptions){const o=node('option',label);o.value=id;$('default-crop').append(o);}
function error(message){$('error').textContent=message??'';$('error').hidden=!message;}
async function api(path,body){
  const res=await fetch(`/api/${path}`,{method:body===undefined?'GET':'POST',headers:{'X-Helper-Token':token,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const data=await res.json();if(!res.ok)throw new Error(data.error??'Không kết nối được công cụ.');return data;
}
function fillForm(){
  if(!state)return;
  const s=state.settings;
  $('saved').textContent=s.autoPlan?'Tự chọn cây và món theo trại':'Đã lưu';
  for(const k of bools)$('settings').elements[k].checked=s[k];
  for(const k of ['reserveCoins','spendLimit','defaultCrop'])$('settings').elements[k].value=s[k];
  const owned=state.snapshot?.farm.owned??0;
  $('plots').replaceChildren();
  for(let i=0;i<owned;i++){
    const box=node('div',undefined,'plot');box.append(node('span',`Ô ${i+1}`));
    const choice=select(cropOptions,s.plotCrops[i]??s.defaultCrop);choice.dataset.plot=String(i);choice.setAttribute('aria-label',`Giống ô ${i+1}`);box.append(choice);$('plots').append(box);
  }
  if(!owned)$('plots').append(node('p','Kết nối để chọn giống cho từng ô.','muted'));
  $('recipes').replaceChildren();
  const options=[['','Không chọn'],...Object.entries(catalog.recipes).map(([id,r])=>[id,`${r.label} · ${format(r.price)} xu`])];
  for(let i=0;i<Math.max(3,s.recipePriority.length+1);i++){
    const row=node('div',undefined,'recipe-row');row.append(node('span',String(i+1)));
    const choice=select(options,s.recipePriority[i]??'');choice.dataset.recipe='';choice.setAttribute('aria-label',`Món ưu tiên ${i+1}`);row.append(choice);$('recipes').append(row);
  }
  dirty=false;formSignature=JSON.stringify([s,owned]);
}
function remaining(at){const delta=Math.max(0,at-state.estimatedServerTime);return delta<1000?'Đã đến giờ':`Còn ${Math.ceil(delta/60000)} phút`;}
function render(){
  if(!state)return;
  const f=state.snapshot?.farm;
  $('badge').textContent=state.running?'● Đang chăm trại':state.player?'Đã kết nối · Tạm dừng':'Chưa kết nối';$('badge').classList.toggle('active',state.running);
  $('demo').hidden=!state.demo;$('player').textContent=state.player?.name??'Chưa đăng nhập';
  $('coins').textContent=f?format(f.coins):'—';$('spent').textContent=`${format(state.spent)} / ${format(state.settings.spendLimit)}`;
  $('budget-note').textContent=state.settings.budgetPeriod==='day'?'Giống, thức ăn và gà · Trong ngày (giờ Việt Nam)':'Giống và thức ăn từ khi mở công cụ';
  $('budget-label').textContent=state.settings.budgetPeriod==='day'?'Tổng chi tối đa mỗi ngày':'Tổng chi tối đa mỗi lần mở công cụ';
  $('clock').textContent=state.estimatedServerTime?time(state.estimatedServerTime):'—';
  $('next-check').textContent=state.nextCheckAt?`Kiểm tra lúc ${time(state.nextCheckAt)}`:'Đồng bộ theo giờ server';
  $('status').textContent=state.status;
  $('settings').hidden=!!state.settings.autoPlan;
  $('auto-summary').hidden=!state.settings.autoPlan;
  if(state.settings.autoPlan){
    const counts={};for(const crop of Object.values(state.settings.plotCrops))counts[crop]=(counts[crop]??0)+1;
    const next=Object.entries(counts).map(([id,n])=>`${n} ô ${catalog.crops[id]?.label??id}`).join(', ');
    $('auto-summary').textContent=`Trợ lý tự chọn cây và món theo nguyên liệu. Giữ cây hiện tại đến khi chín; vụ sau: ${next||'sẽ tính khi kết nối'}. Chuẩn bị tối đa 6 gà mái. Giữ ${format(state.settings.reserveCoins)} xu và chi tối đa ${format(state.settings.spendLimit)} xu/ngày. Bạn chỉ cần bấm Bắt đầu.`;
  }
  $('start').disabled=!f||state.running||state.busy||pending||dirty;
  $('pause').disabled=!state.running;
  for(const id of ['open','sync','save','preset'])$(id).disabled=state.running||state.busy||pending;
  if(!dirty&&JSON.stringify([state.settings,f?.owned??0])!==formSignature)fillForm();
  for(const el of $('settings').querySelectorAll('input,select'))el.disabled=state.running||state.busy||pending||state.settings.autoPlan;
  const list=$('schedule');list.replaceChildren();
  if(!state.running&&state.planned.actions.length){
    for(const a of state.planned.actions.slice(0,4)){const row=node('div',undefined,'event');row.append(node('span',a.label),node('strong','Khi bắt đầu'));list.append(row);}
  }
  for(const e of state.planned.events.slice(0,12)){
    const row=node('div',undefined,'event');const description=node('div',e.label);description.append(node('br'),node('small',time(e.at)));row.append(description,node('strong',remaining(e.at)));list.append(row);
  }
  for(const w of state.planned.warnings)list.append(node('p',w,'hint'));
  if(!list.children.length)list.append(node('p',f?'Chưa có mốc đang chạy. Kiểm tra cây, vật nuôi và nguyên liệu.':'Lịch sẽ hiện sau khi kết nối.','muted'));
  $('stock').replaceChildren();for(const [id,count] of Object.entries(f?.inventory??{}))if(count>0)$('stock').append(node('span',`${catalog.labels[id]??id} · ${format(count)}`));
  if(!$('stock').children.length)$('stock').append(node('p','Kho chưa có sản phẩm.','muted'));
  $('logs').replaceChildren();for(const entry of state.logs){const row=node('div',undefined,`log ${entry.kind}`);row.append(node('time',time(entry.at)),node('span',entry.message));$('logs').append(row);}
  if(!state.logs.length)$('logs').append(node('p','Mọi thao tác sẽ được ghi tại đây.','muted'));
}
async function action(path,body={}){
  pending=true;error();render();
  try{state=await api(path,body);render();}catch(e){error(e.message);}finally{pending=false;render();}
}
$('open').onclick=()=>action('open');$('sync').onclick=()=>action('sync');$('start').onclick=()=>action('start');$('pause').onclick=()=>action('pause');
$('settings').addEventListener('change',()=>{dirty=true;$('saved').textContent='Chưa lưu';render();});
$('settings').onsubmit=event=>{
  event.preventDefault();const form=event.currentTarget;const s={autoPlan:state.settings.autoPlan,autoHens:state.settings.autoHens,budgetPeriod:state.settings.budgetPeriod};for(const k of bools)s[k]=form.elements[k].checked;
  for(const k of ['reserveCoins','spendLimit'])s[k]=Number(form.elements[k].value);
  s.defaultCrop=form.elements.defaultCrop.value;s.plotCrops={};
  for(const choice of $('plots').querySelectorAll('select'))s.plotCrops[choice.dataset.plot]=choice.value;
  s.recipePriority=[...$('recipes').querySelectorAll('select')].map(el=>el.value).filter(Boolean);
  if(new Set(s.recipePriority).size!==s.recipePriority.length)return error('Mỗi món chỉ chọn một lần.');
  void action('settings',s).then(()=>{if(!$('error').hidden)return;fillForm();render();});
};
$('preset').onclick=()=>{for(const choice of $('plots').querySelectorAll('select'))choice.value=Number(choice.dataset.plot)%6===5?'starfruit':'potato';dirty=true;$('saved').textContent='Chưa lưu';render();};
async function poll(){try{if(!pending){state=await api('state');render();}}catch(e){error(e.message);}setTimeout(poll,2000);}
void poll();
