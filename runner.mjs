import { randomUUID } from 'node:crypto';
import { crops } from './catalog.mjs';
import { autopilotSettings, defaultSettings, plan, validateSettings, validateSnapshot } from './planner.mjs';

export class Runner {
  constructor(transport, clock=Date.now, store=null) {
    this.transport=transport; this.clock=clock; this.settings=structuredClone(defaultSettings);
    this.running=false; this.busy=false; this.snapshot=null; this.player=null;
    this.logs=[]; this.spent=0; this.revenue=0; this.pending=null; this.timer=null; this.nextCheckAt=null;
    this.status='Mở cửa sổ game và đăng nhập để kết nối.';
    this.store=store;
    const saved=store?.load();
    if(saved){
      this.settings=validateSettings(saved.settings);this.spent=saved.spent;this.revenue=saved.revenue??0;
      this.pending=saved.pending??null;this.budgetDay=saved.budgetDay;this.expectedPlayerId=saved.playerId;
    }
    if(this.expectedPlayerId)this.transport.accountId=this.expectedPlayerId;
  }
  persist(){this.store?.save({settings:this.settings,spent:this.spent,revenue:this.revenue,pending:this.pending,budgetDay:this.budgetDay,playerId:this.player?.id??this.expectedPlayerId});}
  log(message,kind='info') {
    this.logs.unshift({at:this.clock(),message,kind}); this.logs.length=Math.min(this.logs.length,150);
  }
  pause(message='Đã tạm dừng. Một thao tác đang gửi có thể hoàn tất.') {
    this.running=false; clearTimeout(this.timer); this.timer=null; this.nextCheckAt=null;
    this.status=message; this.log(message);
    this.persist();
  }
  configure(value) {
    if (this.running||this.busy) throw new Error('Tạm dừng và chờ thao tác hoàn tất trước khi đổi cấu hình.');
    this.settings=validateSettings(value);
    this.persist();
  }
  acceptSnapshot(value) {
    this.snapshot=validateSnapshot(value);
    if(this.settings.budgetPeriod==='day'){
      const day=new Date(this.snapshot.serverTime+7*3600000).toISOString().slice(0,10);
      if(this.budgetDay&&day>this.budgetDay)this.spent=0;
      this.budgetDay=day;
    }
    for (let i=0;i<this.snapshot.farm.owned;i++) {
      const crop=this.snapshot.farm.plots[i].cropId;
      if (!this.settings.autoPlan&&crop&&this.settings.plotCrops[i]===undefined) {
        // Giữ giống cũ qua thao tác thu hoạch (server xóa cropId sau khi thu).
        if (Object.hasOwn(crops,crop)) this.settings.plotCrops[i]=crop;
      }
    }
    this.snapshotReceivedAt=this.clock();
  }
  async read() {
    const player=await this.transport.request('/player');
    if (!player || typeof player.id!=='string' || typeof player.name!=='string') throw new Error('Không đọc được tài khoản.');
    if ((this.player&&player.id!==this.player.id)||(this.expectedPlayerId&&player.id!==this.expectedPlayerId)) {
      this.pause('Tài khoản đã đổi. Khởi động lại công cụ để kết nối tài khoản khác.');
      throw new Error('ACCOUNT_CHANGED');
    }
    this.player=player;
    this.acceptSnapshot(await this.transport.request('/inventory'));
    this.persist();
  }
  async sync() {
    if (this.busy) throw new Error('Đang xử lý, vui lòng chờ.');
    this.busy=true;
    try { await this.read(); this.status='Đã kết nối. Xem lịch và cấu hình trước khi bắt đầu.'; }
    catch(error) {this.status=friendly(error); throw error;}
    finally {this.busy=false;}
  }
  view() {
    const planned=this.snapshot?plan(this.snapshot,this.settings,this.spent):{actions:[],events:[],warnings:[]};
    return {
      running:this.running,busy:this.busy,status:this.status,player:this.player,
      snapshot:this.snapshot,settings:this.snapshot?autopilotSettings(this.snapshot,this.settings):this.settings,spent:this.spent,revenue:this.revenue,
      logs:this.logs,planned,nextCheckAt:this.nextCheckAt,now:this.clock(),
      estimatedServerTime:this.snapshot?this.snapshot.serverTime+this.clock()-this.snapshotReceivedAt:null,
      pending:!!this.pending,demo:!!this.transport.demo,
      loginMode:this.transport.credentialsFile?'password':'browser',
    };
  }
  async start() {
    if (this.busy) throw new Error('Đang xử lý, vui lòng chờ.');
    if (this.running) return;
    await this.sync();
    this.running=true; this.status='Đang chăm trại'; this.log('Bắt đầu chăm trại theo cấu hình đã chọn.');
    void this.cycle();
  }
  async send(action) {
    if (!this.pending) this.pending={...action,body:{...action.command,mapInstanceId:'home',requestId:randomUUID()}};
    const pending=this.pending;
    this.persist();
    const before=this.snapshot.farm.coins;
    this.log(`Gửi thao tác: ${pending.label}; lệnh=${JSON.stringify(pending.command)}; revision=${this.snapshot.revision}`);
    // Transport không tự retry POST. Giữ nguyên requestId nếu mất phản hồi.
    const result=await this.transport.request('/commands',pending.body);
    this.acceptSnapshot(result);
    this.spent+=pending.cost;
    if (pending.command.type==='sell') this.revenue+=Math.max(0,result.farm.coins-before);
    this.log(pending.label,'success'); this.pending=null; this.rejections=0;
    this.persist();
  }
  async cycle() {
    if (!this.running||this.busy) return;
    this.busy=true;
    let delay=60_000;
    try {
      await this.read();
      if (!this.running) return;
      if (this.pending) await this.send(this.pending);
      // Một lệnh mỗi lần; luôn tính lại từ snapshot server sau lệnh trước.
      for(let n=0;n<100&&this.running;n++) {
        const action=plan(this.snapshot,this.settings,this.spent).actions[0];
        if (!action) break;
        await this.send(action);
        await new Promise(resolve=>setTimeout(resolve,200));
        if (n===99) delay=1000;
      }
      const p=plan(this.snapshot,this.settings,this.spent);
      const serverNow=this.snapshot.serverTime+this.clock()-this.snapshotReceivedAt;
      const next=p.events.find(e=>e.at>serverNow);
      if (next) delay=Math.min(delay,Math.max(500,next.at-serverNow+250));
      this.failures=0;
      this.status=p.warnings.length?p.warnings.join(' '):'Đang chờ mốc tiếp theo';
    } catch(error) {
      const code=error.code??error.message;
      this.lastErrorCode=code;
      const rejected=this.pending;
      this.log(`${friendly(error)} [mã=${code}${error.status?`; HTTP=${error.status}`:''}${error.path?`; API=${error.path}`:''}]${rejected?`; thao tác=${rejected.label}; lệnh=${JSON.stringify(rejected.command)}; trạng thái=${JSON.stringify(commandContext(this.snapshot,rejected.command))}`:''}`,'error');
      if (['NETWORK_ERROR','RATE_LIMITED','SERVER_ERROR'].includes(code)) {
        this.failures=(this.failures??0)+1;
        delay=code==='RATE_LIMITED'?60_000:Math.min(60_000,5000*2**(this.failures-1));
        this.status='Kết nối gián đoạn; đang đợi để thử lại với cùng mã thao tác.';
        if (this.failures>=5) this.pause('Đã dừng sau 5 lỗi kết nối liên tiếp. Kiểm tra mạng rồi bắt đầu lại.');
      } else if (code==='NOT_ALLOWED' && error.definitive && rejected) {
        // Server xác nhận không thực hiện: bỏ requestId cũ, đọc lại trước khi lập lệnh mới.
        // Mất phản hồi/mất mạng tuyệt đối không đi vào nhánh này.
        this.pending=null;
        this.rejections=(this.rejections??0)+1;
        this.persist();
        if(this.rejections>=3) {
          this.pause(`Server từ chối 3 lần liên tiếp: ${rejected.label}. Xem lệnh và trạng thái chi tiết trong nhật ký.`);
        } else {
          delay=5000;
          this.status='Server từ chối thao tác; sẽ đồng bộ và tính lại sau 5 giây.';
          this.log(this.status);
        }
      } else {
        // Lỗi nghiệp vụ là kết quả xác định; không gửi lại lệnh đã bị từ chối.
        if (error.definitive) this.pending=null;
        this.pause(friendly(error));
      }
    } finally {
      this.busy=false;
      if (this.running) {
        this.nextCheckAt=this.clock()+delay;
        this.timer=setTimeout(()=>void this.cycle(),delay);
      }
    }
  }
}

export function friendly(error) {
  return ({UNAUTHENTICATED:'Phiên đăng nhập hết hạn. Đăng nhập lại rồi kết nối.',
    LOGIN_FAILED:'Đăng nhập tự động thất bại. Kiểm tra file tài khoản/mật khẩu và API đăng nhập.',
    NOT_ALLOWED:'Server từ chối thao tác.',
    INSUFFICIENT_COINS:'Không đủ xu khả dụng. Đã dừng.',
    INVENTORY_FULL:'Kho đầy. Bán hoặc chuyển bớt đồ trong game rồi kết nối lại.',
    INVALID_COMMAND:'API khác phiên bản hỗ trợ. Đã dừng để kiểm tra.',
    NETWORK_ERROR:'Không kết nối được với game.',
    RATE_LIMITED:'Server yêu cầu giảm tần suất; chờ 60 giây.',
    SERVER_ERROR:'Server game đang gặp lỗi.',
    ACCOUNT_CHANGED:'Tài khoản đã đổi. Khởi động lại công cụ.',
  })[error.code??error.message]??error.message;
}

// Chỉ ghi dữ liệu trại cần chẩn đoán; không ghi token, cookie hoặc file đăng nhập.
function commandContext(snapshot,command) {
  if(!snapshot)return null;
  const f=snapshot.farm;
  const context={serverTime:snapshot.serverTime,revision:snapshot.revision,coins:f.coins};
  if(command.type==='plot')context.plot=f.plots[command.index];
  if(command.unit){
    const key={poultry:'poultry',livestock:'animals',pond:'fish'}[command.unit];
    context.fedAt=f.fedAt[command.unit];
    context.herd=f[key]?.map(({species,ageMs,productionMs,careAt})=>({species,ageMs,productionMs,careAt}));
  }
  if(['cook','collect-dish','sell'].includes(command.type)){
    context.inventory=f.inventory;context.kitchen=f.kitchen;
  }
  return context;
}
