import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateSession } from './api-transport.mjs';

const file=process.argv[2];
if(!file) {console.error('Cần chỉ định file đích. File này cấp quyền truy cập tài khoản; chỉ chép lên VPS của bạn.');process.exit(1);}
let origin;
let stage='connect';
try {
  const port=Number(process.env.PORT??4179);
  if(!Number.isInteger(port)||port<1024||port>65535) throw new Error('PORT không hợp lệ.');
  origin=`http://127.0.0.1:${port}`;
  const page=await fetch(origin,{redirect:'error',signal:AbortSignal.timeout(5000)});
  const token=(await page.text()).match(/name="helper-token" content="([a-f0-9]{64})"/)?.[1];
  if(!token) throw new Error('Cần mở công cụ local và đăng nhập trong Chrome trước.');
  stage='export';
  const response=await fetch(`${origin}/api/export-session`,{
    method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),
    headers:{Origin:origin,'X-Helper-Token':token,'Content-Type':'application/json'},body:'{}',
  });
  const session=await response.json();
  if(!response.ok) throw new Error(session.error??'Không xuất được phiên.');
  validateSession(session);
  await writeFile(resolve(file),JSON.stringify(session)+'\n',{mode:0o600,flag:'wx'});
  console.log(`Đã xuất phiên vào ${resolve(file)} (quyền 600). Không gửi file này vào chat hoặc Git.`);
  console.log(`Hết hạn: ${new Date(session.expiresAt).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}. Đăng xuất trong game có thể thu hồi phiên sớm hơn.`);
} catch(error) {
  if(error.message==='fetch failed'||['TimeoutError','AbortError'].includes(error.name)) {
    if(stage==='connect') {
      console.error(`Không kết nối được công cụ local tại ${origin}. Công cụ chưa chạy, khác cổng hoặc kết nối bị chặn.`);
      console.error('Terminal thứ nhất: source /Users/phamtien/Work/PT/chibi-farm-helper/run.sh');
      console.error('Giữ Terminal đó mở, vào bảng điều khiển, mở cửa sổ Chrome và đăng nhập; sau đó tạm dừng bot.');
      console.error('Terminal thứ hai: chạy lại lệnh --export-session. Nếu dùng cổng khác, đặt PORT giống công cụ local.');
    } else {
      console.error(`Kết nối tới ${origin} bị gián đoạn khi xuất phiên. Giữ công cụ local mở và thử lại.`);
    }
  } else {
    console.error(error.code==='EEXIST'?'File đích đã tồn tại. Chọn tên mới để tránh ghi đè.':error.message);
  }
  process.exitCode=1;
}
