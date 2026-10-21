import { mkdirSync, readFileSync, writeFileSync, renameSync, openSync, fsyncSync, closeSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';

export class StateStore {
  constructor(file){this.file=file;}
  acquire(){
    mkdirSync(dirname(this.file),{recursive:true,mode:0o700});
    const lock=this.file+'.lock';
    for(let attempt=0;attempt<2;attempt++){
      try{writeFileSync(lock,String(process.pid),{flag:'wx',mode:0o600});this.ownsLock=true;return;}
      catch(error){
        if(error.code!=='EEXIST')throw error;
        let pid;
        try{pid=Number(readFileSync(lock,'utf8'));}catch{throw new Error('Không đọc được khóa tiến trình.');}
        if(!Number.isInteger(pid)||pid<=0)throw new Error('Khóa tiến trình không hợp lệ; cần kiểm tra.');
        try{process.kill(pid,0);throw new Error('Đã có tiến trình công cụ dùng cùng trạng thái. Dừng tiến trình cũ trước.');}
        catch(cause){if(cause.code!=='ESRCH')throw cause;}
        unlinkSync(lock);
      }
    }
    throw new Error('Không lấy được khóa tiến trình.');
  }
  release(){if(this.ownsLock){try{unlinkSync(this.file+'.lock');}catch{}this.ownsLock=false;}}
  load(){
    try{
      const data=JSON.parse(readFileSync(this.file,'utf8'));
      if(data.version!==1||!Number.isSafeInteger(data.spent)||data.spent<0||!data.settings)
        throw new Error('Trạng thái lưu không hợp lệ; cần kiểm tra trước khi chạy.');
      return data;
    }catch(error){if(error.code==='ENOENT')return null;throw error;}
  }
  save(data){
    mkdirSync(dirname(this.file),{recursive:true,mode:0o700});
    const temp=this.file+'.tmp';
    writeFileSync(temp,JSON.stringify({version:1,...data})+'\n',{mode:0o600});
    const fd=openSync(temp,'r');try{fsyncSync(fd);}finally{closeSync(fd);}
    renameSync(temp,this.file);
    const dirfd=openSync(dirname(this.file),'r');try{fsyncSync(dirfd);}finally{closeSync(dirfd);}
  }
}
