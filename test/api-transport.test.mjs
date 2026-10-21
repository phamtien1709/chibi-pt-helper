import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ApiTransport, SITE, validateSession } from '../api-transport.mjs';
import { GameTransport } from '../transport.mjs';

const fake=()=>({version:1,origin:new URL(SITE).origin,token:'fixture-only-not-a-real-cookie-1234567890',expiresAt:Date.now()+3600000});
test('Phiên bị giới hạn domain, định dạng cookie và hạn sử dụng',()=>{
  assert.equal(validateSession(fake()).version,1);
  assert.throws(()=>validateSession({...fake(),origin:'https://other.test'}));
  assert.throws(()=>validateSession({...fake(),token:'value; injected=1'}));
  assert.throws(()=>validateSession({...fake(),expiresAt:0}));
});
test('Chế độ API không cần Chrome, không theo redirect hoặc gửi cookie sang host khác',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'chibi-api-test-')),file=join(dir,'session.json');
  const session=fake();await writeFile(file,JSON.stringify(session),{mode:0o600});
  let calls=0;
  try{
    const t=new ApiTransport(file,{fetch:async(url,options)=>{
      calls++;assert.equal(url,`${SITE}/api/player`);assert.equal(options.redirect,'manual');
      assert.equal(options.headers.Cookie,`chibi_session=${session.token}`);
      return new Response(JSON.stringify({id:'fixture',name:'Mẫu'}),{status:200});
    }});
    assert.equal((await t.request('/player')).id,'fixture');assert.equal(calls,1);
    await assert.rejects(t.request('https://other.test'),/không được hỗ trợ/);assert.equal(calls,1);
    await chmod(file,0o644);
    await assert.rejects(new ApiTransport(file).open(),/chmod 600/);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('401 và redirect không được xem là thành công hoặc tự đăng nhập',async()=>{
  const t=new ApiTransport('unused',{fetch:async()=>new Response(JSON.stringify({code:'UNAUTHENTICATED'}),{status:401})});
  t.session=fake();await assert.rejects(t.request('/inventory'),e=>e.code==='UNAUTHENTICATED'&&e.definitive);
  t.fetch=async()=>new Response('',{status:302,headers:{Location:'https://other.test'}});
  await assert.rejects(t.request('/inventory'),e=>e.code==='NETWORK_ERROR');
});
test('Xuất phiên chỉ lấy chibi_session sau khi kiểm tra tài khoản',async()=>{
  const t=new GameTransport();let checked=false;
  t.browser={isConnected:()=>true};
  t.request=async(path)=>{assert.equal(path,'/player');checked=true;return{id:'fixture'};};
  t.context={cookies:async()=>[
    {name:'unrelated',value:'never-export',expires:Date.now()/1000+3600},
    {name:'chibi_session',value:fake().token,expires:Date.now()/1000+3600},
  ]};
  const s=await t.exportSession();assert(checked);assert.equal(s.token,fake().token);
  assert(!JSON.stringify(s).includes('never-export'));validateSession(s);
});
