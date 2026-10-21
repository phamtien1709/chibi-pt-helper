import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ApiTransport,SITE} from '../api-transport.mjs';
import {serviceUnit} from '../deploy/service-unit.mjs';

const old='old-fixture-session-abcdefghijklmnop';
const fresh='new-fixture-session-abcdefghijklmnop';
const password='fixture-password-never-log';
const session=(expiresAt=Date.now()+3600000)=>({version:1,origin:new URL(SITE).origin,token:old,expiresAt});
function loggedIn(id='one'){
 return new Response(JSON.stringify({player:{id,name:'Mẫu'}}),{status:200,headers:{'Set-Cookie':`chibi_session=${fresh}; Max-Age=2592000; Path=/farm; HttpOnly; Secure; SameSite=Lax`}});
}
async function withCredentials(work){
 const dir=await mkdtemp(join(tmpdir(),'chibi-login-test-')),file=join(dir,'login.json');
 try{await writeFile(file,JSON.stringify({version:1,username:'fixture',password}),{mode:0o600});await work(file);}
 finally{await rm(dir,{recursive:true,force:true});}
}
test('Hết hạn tự đăng nhập bằng API cố định, không gửi cookie cũ hay dùng Chrome',()=>withCredentials(async file=>{
 let login=0;
 const t=new ApiTransport(undefined,{credentialsFile:file,fetch:async(url,options)=>{
  assert.equal(options.redirect,'manual');assert.equal(options.headers.Origin,new URL(SITE).origin);
  if(url===SITE+'/api/auth/login'){
   login++;assert.equal(options.headers.Cookie,undefined);assert.deepEqual(JSON.parse(options.body),{username:'fixture',password});return loggedIn();
  }
  assert.equal(url,SITE+'/api/player');assert.equal(options.headers.Cookie,`chibi_session=${fresh}`);
  return new Response(JSON.stringify({id:'one'}));
 }});
 t.session=session(Date.now()-1);
 assert.equal((await t.request('/player')).id,'one');assert.equal(login,1);
 assert(t.session.expiresAt>Date.now()+29*86400000);
}));
test('Phiên bị thu hồi: login rồi retry đúng một lần, giữ nguyên requestId/body',()=>withCredentials(async file=>{
 const seen=[];
 const t=new ApiTransport(undefined,{credentialsFile:file,fetch:async(url,options)=>{
  if(url.endsWith('/auth/login'))return loggedIn();
  seen.push(JSON.parse(options.body));
  return options.headers.Cookie===`chibi_session=${old}`?new Response('{}',{status:401}):new Response('{"completed":1}');
 }});
 t.session=session();t.accountId='one';
 const command={type:'cook',recipeId:'fries',mapInstanceId:'home',requestId:'fixed-request'};
 assert.equal((await t.request('/commands',command)).completed,1);
 assert.deepEqual(seen,[command,command]);
}));
test('Nhiều request 401 chỉ tạo một lần đăng nhập mới',()=>withCredentials(async file=>{
 let count=0;
 const t=new ApiTransport(undefined,{credentialsFile:file,fetch:async(url,options)=>{
  if(url.endsWith('/auth/login')){count++;return loggedIn();}
  return options.headers.Cookie===`chibi_session=${old}`?new Response('{}',{status:401}):new Response('{"ok":true}');
 }});t.session=session();
 await Promise.all(Array.from({length:5},()=>t.request('/inventory')));assert.equal(count,1);
}));
test('Nhiều request cùng đọc file cookie bị thu hồi vẫn dùng chung một lần đăng nhập',()=>withCredentials(async file=>{
 const cached=file+'.session';await writeFile(cached,JSON.stringify(session()),{mode:0o600});
 let count=0;
 const t=new ApiTransport(cached,{credentialsFile:file,fetch:async(url,options)=>{
  if(url.endsWith('/auth/login')){count++;return loggedIn();}
  return options.headers.Cookie===`chibi_session=${old}`?new Response('{}',{status:401}):new Response('{"ok":true}');
 }});
 await Promise.all(Array.from({length:5},()=>t.request('/inventory')));assert.equal(count,1);
}));
test('Đổi tài khoản trong file đăng nhập không gửi lại lệnh vào tài khoản khác',()=>withCredentials(async file=>{
 let commands=0;
 const t=new ApiTransport(undefined,{credentialsFile:file,fetch:async url=>{
  if(url.endsWith('/auth/login'))return loggedIn('other');commands++;return new Response('{}',{status:401});
 }});t.session=session();t.accountId='one';
 await assert.rejects(t.request('/commands',{requestId:'same'}),e=>e.code==='ACCOUNT_CHANGED');assert.equal(commands,1);
}));
test('Sai mật khẩu không lặp login, không lộ phản hồi chứa bí mật',()=>withCredentials(async file=>{
 let count=0;
 const t=new ApiTransport(undefined,{credentialsFile:file,fetch:async()=>{count++;return new Response(JSON.stringify({error:password}),{status:401});}});
 await assert.rejects(t.request('/inventory'),e=>e.code==='LOGIN_FAILED'&&!e.message.includes(password));assert.equal(count,1);
}));
test('401 sau login không tạo vòng lặp; 429 login đi theo backoff',()=>withCredentials(async file=>{
 let count=0;
 const t=new ApiTransport(undefined,{credentialsFile:file,fetch:async url=>{
  if(url.endsWith('/auth/login')){count++;return loggedIn();}return new Response('{}',{status:401});
 }});t.session=session();
 await assert.rejects(t.request('/inventory'),e=>e.code==='UNAUTHENTICATED');assert.equal(count,1);
 const limited=new ApiTransport(undefined,{credentialsFile:file,fetch:async()=>new Response('{}',{status:429})});
 await assert.rejects(limited.request('/inventory'),e=>e.code==='RATE_LIMITED');
}));
test('File mật khẩu bắt buộc quyền riêng tư; systemd chỉ giữ đường dẫn file',()=>withCredentials(async file=>{
 await chmod(file,0o644);
 const t=new ApiTransport(undefined,{credentialsFile:file,fetch:async()=>{throw new Error('Không được gọi mạng');}});
 await assert.rejects(t.open(),/chmod 600/);
 const unit=serviceUnit({node:'/usr/bin/node',cli:'/srv/chibi/cli.mjs',credentials:file,state:'/srv/state.json'});
 assert(unit.includes('--credentials'));assert(!unit.includes('--session'));assert(!unit.includes(password));
}));
