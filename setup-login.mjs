import {createInterface} from 'node:readline/promises';
import {emitKeypressEvents} from 'node:readline';
import {mkdir,writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {validateCredentials} from './credentials.mjs';

async function secret(){
  const input=process.stdin,wasRaw=!!input.isRaw;
  emitKeypressEvents(input);input.setRawMode(true);input.resume();
  process.stdout.write('Mật khẩu (ẩn khi nhập): ');
  return new Promise((resolve,reject)=>{
    let value='';
    function done(error){
      input.removeListener('keypress',key);input.setRawMode(wasRaw);input.pause();process.stdout.write('\n');
      if(error)reject(error);else resolve(value);
      value='';
    }
    function key(text,info={}){
      if(info.ctrl&&info.name==='c')return done(new Error('Đã hủy nhập đăng nhập.'));
      if(info.name==='return'||info.name==='enter')return done();
      if(info.name==='backspace'){value=Array.from(value).slice(0,-1).join('');return;}
      if(info.ctrl&&info.name==='u'){value='';return;}
      if(text&&!info.ctrl&&!info.meta&&!/[\r\n\x00-\x1f\x7f]/.test(text))value+=text;
    }
    input.on('keypress',key);
  });
}
try{
  if(!process.stdin.isTTY||!process.stdout.isTTY)throw new Error('Chạy --setup-login trực tiếp trong Terminal để nhập mật khẩu ẩn.');
  const file=resolve(process.argv[2]??join(homedir(),'.config/chibi-farm-helper/login.json'));
  console.log('Lưu thông tin đăng nhập chỉ trên máy này, quyền 600. Không đưa file vào Git hoặc chat.');
  const rl=createInterface({input:process.stdin,output:process.stdout});
  let username;
  try{username=await rl.question('Username hoặc email: ');}finally{rl.close();}
  const password=await secret();
  const credentials={version:1,...validateCredentials({version:1,username,password})};
  await mkdir(dirname(file),{recursive:true,mode:0o700});
  await writeFile(file,JSON.stringify(credentials)+'\n',{mode:0o600,flag:'wx'});
  console.log(`Đã lưu file đăng nhập: ${file}`);
  console.log('Dùng --terminal --credentials <file> --check để kiểm tra trước khi chạy.');
}catch(error){console.error(error.code==='EEXIST'?'File đăng nhập đã tồn tại. Chọn tên mới hoặc chỉnh file hiện có.':error.message);process.exitCode=1;}
