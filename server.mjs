import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { StateStore } from './state-store.mjs';
import { crops, recipes, labels } from './catalog.mjs';
import { Runner } from './runner.mjs';
import { GameTransport } from './transport.mjs';
import { ApiTransport } from './api-transport.mjs';

export function buildServer({transport=new GameTransport(),port=4179,store=null}={}) {
  const token=randomBytes(32).toString('hex');
  const runner=new Runner(transport,Date.now,store);
  if(store&&!store.load())runner.configure(JSON.parse(readFileSync(new URL('./autopilot.json',import.meta.url),'utf8')));
  const origin=`http://127.0.0.1:${port}`;
  const server=createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const send=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
    // Chỉ nhận loopback + đúng Origin; ngăn web khác điều khiển phiên đăng nhập.
    if(req.headers.host!==`127.0.0.1:${port}`) return send(403,{error:'Host không được phép.'});
    if(req.headers.origin&&req.headers.origin!==origin) return send(403,{error:'Origin không được phép.'});
    const path=new URL(req.url,origin).pathname;
    if(path.startsWith('/api/')) {
      const provided=Buffer.from(String(req.headers['x-helper-token']??''));
      const expected=Buffer.from(token);
      if(provided.length!==expected.length||!timingSafeEqual(provided,expected)) return send(403,{error:'Phiên công cụ không hợp lệ. Tải lại trang.'});
      try {
        if(req.method==='GET'&&path==='/api/state') return send(200,runner.view());
        if(req.method!=='POST'||req.headers.origin!==origin) return send(405,{error:'Phương thức không được phép.'});
        let body='';
        for await(const part of req) {
          body+=part;
          if(Buffer.byteLength(body)>20000) return send(413,{error:'Dữ liệu quá lớn.'});
        }
        const input=body?JSON.parse(body):{};
        switch(path) {
          case '/api/export-session':
            if(runner.running||runner.busy) throw new Error('Tạm dừng trước khi xuất phiên.');
            if(typeof transport.exportSession!=='function') throw new Error('Chỉ xuất phiên từ bản Chrome trên máy cá nhân.');
            return send(200,await transport.exportSession());
          case '/api/open':
            if(runner.running||runner.busy) throw new Error('Tạm dừng trước khi mở lại đăng nhập.');
            if(server.opening) throw new Error('Đang mở cửa sổ đăng nhập.');
            server.opening=true;
            try {await transport.open();} finally {server.opening=false;}
            break;
          case '/api/sync':
            if(runner.running) throw new Error('Tạm dừng trước khi kết nối lại.');
            await runner.sync(); break;
          case '/api/settings': runner.configure(input); break;
          case '/api/start': await runner.start(); break;
          case '/api/pause': runner.pause(); break;
          default:return send(404,{error:'Không tìm thấy.'});
        }
        return send(200,runner.view());
      } catch(error) {return send(400,{error:error.message});}
    }
    if(req.method!=='GET') return send(405,{error:'Phương thức không được phép.'});
    const files={'/':['index.html','text/html'],'/app.js':['app.js','text/javascript'],'/style.css':['style.css','text/css']};
    if(!Object.hasOwn(files,path)) return send(404,{error:'Không tìm thấy.'});
    try {
      const [file,type]=files[path];
      let content=await readFile(new URL(`./public/${file}`,import.meta.url),'utf8');
      if(path==='/') content=content.replace('__TOKEN__',token).replace('__CATALOG__',JSON.stringify({crops,recipes,labels}).replaceAll('<','\\u003c'));
      res.writeHead(200,{'Content-Type':`${type}; charset=utf-8`});res.end(content);
    } catch {send(500,{error:'Không đọc được giao diện.'});}
  });
  return {server,runner,token,origin,async close(){runner.pause();await transport.close();await new Promise(resolve=>server.close(resolve));}};
}

if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const port=Number(process.env.PORT??4179);
  if(!Number.isInteger(port)||port<1024||port>65535) throw new Error('PORT không hợp lệ.');
  let transport;
  const credentialsAt=process.argv.indexOf('--credentials');
  if(credentialsAt>=0){
    const credentialsFile=process.argv[credentialsAt+1];
    if(!credentialsFile||credentialsFile.startsWith('--'))throw new Error('Cần đường dẫn sau --credentials.');
    transport=new ApiTransport(undefined,{credentialsFile});
  }
  if(process.argv.includes('--demo')) {const {DemoTransport}=await import('./test/demo-transport.mjs');transport=new DemoTransport();}
  const store=transport?.demo?null:new StateStore(process.env.CHIBI_STATE_FILE??fileURLToPath(new URL('./.private/runtime.json',import.meta.url)));
  if(store){store.acquire();process.on('exit',()=>store.release());}
  const app=buildServer({port,transport,store});
  app.server.on('error',error=>{console.error(`Không mở được công cụ: ${error.code}`);process.exitCode=1;});
  app.server.listen(port,'127.0.0.1',()=>console.log(`Chibi Farm Helper${transport?.demo?' — DỮ LIỆU MẪU':''}: ${app.origin}`));
  for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>void app.close().then(()=>process.exit(0)));
}
