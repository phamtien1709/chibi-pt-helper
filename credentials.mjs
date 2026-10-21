import {readFile,stat} from 'node:fs/promises';

export function validateCredentials(data){
  if(data?.version!==1||typeof data.username!=='string'||!data.username.trim()||data.username.length>254||
    typeof data.password!=='string'||!data.password||data.password.length>200)
    throw new Error('File đăng nhập không hợp lệ. Chạy --setup-login để tạo lại.');
  return {username:data.username.trim(),password:data.password};
}
export async function readPrivateJson(file,label){
  const info=await stat(file);
  if(!info.isFile()||info.size>4096)throw new Error(`File ${label} không hợp lệ.`);
  if(process.platform!=='win32'&&(info.mode&0o077)!==0)throw new Error(`File ${label} cần quyền riêng tư: chmod 600 <file>.`);
  try{return JSON.parse(await readFile(file,'utf8'));}
  catch{throw new Error(`Không đọc được file ${label} JSON; cần tạo lại.`);}
}
