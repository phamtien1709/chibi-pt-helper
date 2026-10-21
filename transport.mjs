import { createRequire } from 'node:module';

const SITE='https://musicque.politetech.com/farm';
export class GameTransport {
  async open() {
    if (this.page&&!this.page.isClosed()) {await this.page.bringToFront();return;}
    let chromium;
    try { ({chromium}=await import('playwright')); }
    catch {
      if (!process.env.CHIBI_PLAYWRIGHT_PATH) throw new Error('Cần cài thư viện: chạy npm install trong thư mục công cụ.');
      ({chromium}=createRequire(import.meta.url)(process.env.CHIBI_PLAYWRIGHT_PATH));
    }
    if (!this.browser?.isConnected()) {
      this.browser=await chromium.launch({channel:'chrome',headless:false});
      this.context=await this.browser.newContext();
    }
    this.page=await this.context.newPage();
    await this.page.goto(SITE,{waitUntil:'domcontentloaded',timeout:45_000});
  }
  async request(path,body) {
    if (!this.context||!this.browser?.isConnected()) throw new Error('Mở cửa sổ game và đăng nhập trước.');
    if (!['/player','/inventory','/commands'].includes(path)) throw new Error('Đường dẫn không được hỗ trợ.');
    let response;
    try {
      response=await this.context.request.fetch(`${SITE}/api${path}`,{
        method:body?'POST':'GET',data:body,
        headers:{Origin:new URL(SITE).origin,'Content-Type':'application/json'},
        timeout:15_000,maxRedirects:0,
      });
    } catch {throw Object.assign(new Error('NETWORK_ERROR'),{code:'NETWORK_ERROR'});}
    const status=response.status();
    let data;
    try {data=await response.json();} catch {data=null;}
    await response.dispose();
    if (status>=200&&status<300&&data) return data;
    const code=status===401?'UNAUTHENTICATED':status===429?'RATE_LIMITED':status>=500?'SERVER_ERROR':status>=400&&status<500?(data?.code??'INVALID_COMMAND'):'NETWORK_ERROR';
    throw Object.assign(new Error(code),{code,definitive:status>=400&&status<500&&status!==429});
  }
  async exportSession() {
    if(!this.context||!this.browser?.isConnected()) throw new Error('Đăng nhập trong cửa sổ game trước khi xuất phiên.');
    await this.request('/player');
    const cookies=await this.context.cookies(`${SITE}/api/inventory`);
    const cookie=cookies.find(c=>c.name==='chibi_session');
    if(!cookie||cookie.expires<=Date.now()/1000) throw new Error('Không tìm thấy phiên có hạn sử dụng. Đăng nhập lại.');
    return {version:1,origin:new URL(SITE).origin,token:cookie.value,expiresAt:Math.floor(cookie.expires*1000)};
  }
  async close() {await this.browser?.close();}
}
