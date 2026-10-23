import { readPrivateJson,validateCredentials } from './credentials.mjs';

export const SITE='https://musicque.politetech.com/farm';
export function validateSession(session,now=Date.now()) {
  if(session?.version!==1 || session.origin!==new URL(SITE).origin ||
    typeof session.token!=='string' || !/^[A-Za-z0-9_-]{22,200}$/.test(session.token) ||
    !Number.isFinite(session.expiresAt) || session.expiresAt<=now)
    throw new Error('File phiên không hợp lệ hoặc hết hạn. Xuất lại phiên từ máy cá nhân.');
  return session;
}

export class ApiTransport {
  constructor(file,{fetch:transport=fetch,clock=Date.now,credentialsFile}={}) {
    this.file=file;this.fetch=transport;this.clock=clock;this.credentialsFile=credentialsFile;
  }
  async open() {
    if(this.session&&this.session.expiresAt>this.clock())return;
    if(!this.opening)this.opening=this.loadSession().finally(()=>{this.opening=null;});
    return this.opening;
  }
  async loadSession() {
    if(this.file){
      let session;
      try{session=await readPrivateJson(this.file,'phiên');}
      catch(error){if(error.code!=='ENOENT'||!this.credentialsFile)throw error;}
      if(session){
        validateSession(session,0);
        if(session.expiresAt>this.clock()){this.session=session;return;}
        if(!this.credentialsFile)validateSession(session,this.clock());
      }
    }
    if(!this.credentialsFile)throw Object.assign(new Error('UNAUTHENTICATED'),{code:'UNAUTHENTICATED',definitive:true});
    await this.authenticate();
  }
  async authenticate(){
    if(!this.authentication){
      this.authentication=this.login().finally(()=>{this.authentication=null;});
    }
    return this.authentication;
  }
  async login(){
    const credentials=validateCredentials(await readPrivateJson(this.credentialsFile,'đăng nhập'));
    // Không gửi cookie cũ: phiên mới riêng cho bot, không thu hồi phiên browser đã xuất.
    const response=await this.fetchResponse('/auth/login',credentials);
    const data=await response.json().catch(()=>null);
    if(!response.ok){
      if(response.status===429)this.fail('RATE_LIMITED');
      if(response.status>=500)this.fail('SERVER_ERROR');
      this.fail('LOGIN_FAILED',true);
    }
    if(typeof data?.player?.id!=='string')this.fail('LOGIN_FAILED',true);
    if(this.accountId&&data.player.id!==this.accountId)this.fail('ACCOUNT_CHANGED',true);
    const cookie=response.headers.getSetCookie().find(c=>/^chibi_session=/.test(c));
    const token=cookie?.match(/^chibi_session=([A-Za-z0-9_-]{22,200})(?:;|$)/)?.[1];
    const age=cookie?.match(/;\s*Max-Age=(\d+)/i)?.[1];
    const expires=cookie?.match(/;\s*Expires=([^;]+)/i)?.[1];
    const expiresAt=age?this.clock()+Number(age)*1000:Date.parse(expires??'');
    if(!token||!Number.isFinite(expiresAt)||expiresAt<=this.clock())this.fail('LOGIN_FAILED',true);
    this.session=validateSession({version:1,origin:new URL(SITE).origin,token,expiresAt},this.clock());
    this.accountId=data.player.id;
  }
  fail(code,definitive=false){
    const messages={LOGIN_FAILED:'Đăng nhập tự động thất bại. Kiểm tra tài khoản/mật khẩu hoặc API đăng nhập.',ACCOUNT_CHANGED:'Tài khoản đã đổi. Đã dừng trước khi gửi lại thao tác.'};
    throw Object.assign(new Error(messages[code]??code),{code,definitive});
  }
  async fetchResponse(path,body,session){
    let response;
    try {
      response=await this.fetch(`${SITE}/api${path}`,{
        method:body?'POST':'GET',redirect:'manual',signal:AbortSignal.timeout(15000),
        headers:{Origin:new URL(SITE).origin,'Content-Type':'application/json',...(session?{Cookie:`chibi_session=${session.token}`}:{})},
        ...(body?{body:JSON.stringify(body)}:{}),
      });
    } catch {this.fail('NETWORK_ERROR');}
    return response;
  }
  async request(path,body) {
    if(!['/player','/inventory','/commands'].includes(path)) throw new Error('Đường dẫn không được hỗ trợ.');
    if(!this.session||this.session.expiresAt<=this.clock()) await this.open();
    const usedSession=this.session;
    let response=await this.fetchResponse(path,body,usedSession);
    if(response.status===401&&this.credentialsFile){
      await response.arrayBuffer();
      if(this.session?.token===usedSession?.token)await this.authenticate();
      // Retry đúng một lần với nguyên body/requestId, không tạo thêm giao dịch.
      response=await this.fetchResponse(path,body,this.session);
    }
    const data=await response.json().catch(()=>null);
    if(response.ok&&data){
      if(path==='/player'&&typeof data.id==='string'){
        if(this.accountId&&data.id!==this.accountId)this.fail('ACCOUNT_CHANGED',true);
        this.accountId=data.id;
      }
      return data;
    }
    const status=response.status;
    const code=status===401?'UNAUTHENTICATED':status===429?'RATE_LIMITED':status>=500?'SERVER_ERROR':status>=400&&status<500?(data?.code??'INVALID_COMMAND'):'NETWORK_ERROR';
    throw Object.assign(new Error(code),{code,status,path,definitive:status>=400&&status<500&&status!==429});
  }
  async close() {this.session=null;}
}
