import test from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { buildServer } from '../server.mjs';
import { DemoTransport } from './demo-transport.mjs';

test('HTTP local chặn thiếu token, Origin khác, Host khác; chỉ đăng nhập không ghi game',async()=>{
  const port=4188;const transport=new DemoTransport();let writes=0;
  const request=transport.request.bind(transport);
  transport.request=async(path,body)=>{if(body)writes++;return request(path,body);};
  const app=buildServer({port,transport});
  await new Promise((resolve,reject)=>{app.server.once('error',reject);app.server.listen(port,'127.0.0.1',resolve);});
  try{
    const url=app.origin;
    assert.equal((await fetch(`${url}/api/state`)).status,403);
    assert.equal((await fetch(`${url}/api/start`,{method:'POST',headers:{Origin:'https://other.test','X-Helper-Token':app.token}})).status,403);
    const wrongHost=await new Promise((resolve,reject)=>{
      const req=httpRequest(url,{headers:{Host:'other.test'}},res=>{res.resume();resolve(res.statusCode);});
      req.on('error',reject);req.end();
    });
    assert.equal(wrongHost,403);
    assert.equal((await fetch(`${url}/api/start`,{method:'POST',headers:{'X-Helper-Token':app.token}})).status,405);
    const headers={Origin:url,'X-Helper-Token':app.token,'Content-Type':'application/json'};
    const state=await(await fetch(`${url}/api/sync`,{method:'POST',headers,body:'{}'})).json();
    assert.equal(state.player.id,'demo-player');assert.equal(state.running,false);assert.equal(writes,0);
    assert.equal((await fetch(`${url}/api/proxy`,{method:'POST',headers,body:'{}'})).status,404);
    const html=await(await fetch(url)).text();assert(!html.includes('__TOKEN__'));assert(!html.includes('__CATALOG__'));
  }finally{await app.close();}
});
