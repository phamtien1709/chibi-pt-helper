import { readFile, stat } from 'node:fs/promises';

export const SITE='https://musicque.politetech.com/farm';
export function validateSession(session,now=Date.now()) {
  if(session?.version!==1 || session.origin!==new URL(SITE).origin ||
    typeof session.token!=='string' || !/^[A-Za-z0-9_-]{22,200}$/.test(session.token) ||
    !Number.isFinite(session.expiresAt) || session.expiresAt<=now)
    throw new Error('File phiên không hợp lệ hoặc hết hạn. Xuất lại phiên từ máy cá nhân.');
  return session;
}

export class ApiTransport {
  constructor(file,{fetch:transport=fetch,clock=Date.now}={}) {this.file=file;this.fetch=transport;this.clock=clock;}
  async open() {
    const info=await stat(this.file);
    if(!info.isFile() || info.size>4096) throw new Error('File phiên không hợp lệ.');
    if(process.platform!=='win32' && (info.mode&0o077)!==0) throw new Error('File phiên cần quyền riêng tư: chmod 600 <file-phiên>.');
    let session;
    try{session=JSON.parse(await readFile(this.file,'utf8'));}catch{throw new Error('Không đọc được file phiên JSON; xuất lại phiên đăng nhập.');}
    this.session=validateSession(session,this.clock());
  }
  async request(path,body) {
    if(!['/player','/inventory','/commands'].includes(path)) throw new Error('Đường dẫn không được hỗ trợ.');
    if(!this.session) await this.open();
    if(this.session.expiresAt<=this.clock()) throw Object.assign(new Error('UNAUTHENTICATED'),{code:'UNAUTHENTICATED',definitive:true});
    let response;
    try {
      response=await this.fetch(`${SITE}/api${path}`,{
        method:body?'POST':'GET',redirect:'manual',signal:AbortSignal.timeout(15000),
        headers:{Origin:new URL(SITE).origin,'Content-Type':'application/json',Cookie:`chibi_session=${this.session.token}`},
        ...(body?{body:JSON.stringify(body)}:{}),
      });
    } catch {throw Object.assign(new Error('NETWORK_ERROR'),{code:'NETWORK_ERROR'});}
    const data=await response.json().catch(()=>null);
    if(response.ok&&data) return data;
    const status=response.status;
    const code=status===401?'UNAUTHENTICATED':status===429?'RATE_LIMITED':status>=500?'SERVER_ERROR':status>=400&&status<500?(data?.code??'INVALID_COMMAND'):'NETWORK_ERROR';
    throw Object.assign(new Error(code),{code,definitive:status>=400&&status<500&&status!==429});
  }
  async close() {this.session=null;}
}
