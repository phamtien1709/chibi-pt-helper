import { mkdtemp,writeFile,rm,mkdir,realpath } from 'node:fs/promises';
import { homedir,tmpdir,userInfo } from 'node:os';
import { join,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { serviceUnit } from './service-unit.mjs';

function run(command,args,options={}){
  const result=spawnSync(command,args,{stdio:'inherit',...options});
  if(result.status!==0)throw new Error(`Lệnh ${command} chưa thành công; đã dừng cài đặt.`);
}
try{
  if(process.platform!=='linux')throw new Error('Lệnh cài dịch vụ chỉ dùng trên VPS Linux có systemd.');
  if(Number(process.versions.node.split('.')[0])<22)throw new Error('Cần Node.js >=22.');
  const sessionArg=process.argv[2];
  if(!sessionArg)throw new Error('Dùng: bash install-vps.sh /duong-dan/session.json');
  const session=await realpath(resolve(sessionArg));
  const cli=fileURLToPath(new URL('../cli.mjs',import.meta.url));
  const state=join(homedir(),'.local/state/chibi-farm-helper/runtime.json');
  // --check chỉ đọc tài khoản; khóa trạng thái chặn khi một bot khác đang chạy.
  run(process.execPath,[cli,'--session',session,'--check'],{env:{...process.env,CHIBI_STATE_FILE:state}});
  const linger=spawnSync('loginctl',['show-user',userInfo().username,'-p','Linger','--value'],{encoding:'utf8'});
  if(linger.stdout?.trim()!=='yes')run('sudo',['loginctl','enable-linger',userInfo().username]);
  const dir=join(homedir(),'.config/systemd/user');await mkdir(dir,{recursive:true,mode:0o700});
  const unit=join(dir,'chibi-farm-helper.service');
  const temp=await mkdtemp(join(tmpdir(),'chibi-service-'));
  try{
    const content=serviceUnit({node:process.execPath,cli,session,state});
    const candidate=join(temp,'chibi-farm-helper.service');await writeFile(candidate,content,{mode:0o600});
    run('systemd-analyze',['--user','verify',candidate]);
    await writeFile(unit,content,{mode:0o600});
  }finally{await rm(temp,{recursive:true,force:true});}
  run('systemctl',['--user','daemon-reload']);
  run('systemctl',['--user','enable','--now','chibi-farm-helper.service']);
  console.log('Đã bật dịch vụ. Có thể ngắt SSH và tắt máy cá nhân.');
  console.log('Xem: systemctl --user status chibi-farm-helper');
  console.log('Nhật ký: journalctl --user -u chibi-farm-helper -f');
  console.log('Dừng: systemctl --user stop chibi-farm-helper');
}catch(error){console.error(error.message);process.exitCode=1;}
