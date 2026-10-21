# Chibi Farm Helper

Trợ lý tự chăm nông trại chính trên https://musicque.politetech.com/farm. Chạy local có bảng theo dõi hoặc chạy trên VPS Linux chỉ bằng Node.js >=22, không cần Chrome/Playwright ở VPS.

## Chế độ mặc định: tự chăm trại

Không cần chọn cây hoặc công thức. Khi lần đầu chạy, công cụ đọc `autopilot.json`:

- Giữ cây đã trồng đến lúc chín, tự thu và chế biến nguyên liệu sẵn có. Lúa được nấu thành Cơm; nhận món rồi bán.
- Mua gà mái bằng xu vào chỗ trống, chuẩn bị tối đa 6 gia cầm (không bán con đang có). Không mua thêm đất, nâng chuồng/kho hoặc tiêu Gem.
- Chia ô vụ sau theo đàn gà/bò: với 10 ô, 6 gà và chưa có bò, chọn 5 ô khoai để nấu khoai tây chiên + 5 ô cà chua để nấu tương cà. Nếu có bò thì dành đất trồng khế cho sữa chua.
- Mỗi lần chỉ nấu một món đủ nguyên liệu. Bán món đã nấu, giữ nguyên liệu để chế biến.
- Cho ăn khi còn tối đa 25%; thu sản phẩm đúng mốc server. Mỗi con chỉ giữ một chu kỳ chờ nhận.
- Giới hạn 5.000 xu chi mỗi ngày theo giờ Việt Nam, luôn giữ 2.000 xu. Hạn mức gồm mua gà, giống và thức ăn. Reset theo ngày, không reset khi restart trong cùng ngày.
- Lưu cấu hình, số xu đã chi, ID tài khoản và lệnh chưa rõ kết quả vào `.private/runtime.json` (quyền 600). Không lưu cookie trong file trạng thái. Ghi lệnh trước khi gửi để retry cùng requestId sau restart. Khóa ngăn hai tiến trình dùng chung file trạng thái.

Đây là chiến lược cho thu nhập ổn định theo catalogue hiện tại, không phải chứng minh tối ưu toàn cục. Chưa tự đầu tư nâng cấp hoặc tối ưu theo giá thị trường. Khi luật/giá game đổi cần kiểm tra lại catalogue. Luật đối chiếu [musicque-farm @193d8bcc](https://github.com/PoliceTeam/musicque-farm/tree/193d8bcc5de547a1128d7b574d8f10af9b1be271).

## Chạy local

```sh
source /Users/phamtien/Work/PT/chibi-farm-helper/run.sh
```

Mở http://127.0.0.1:4179, mở cửa sổ Chrome riêng để đăng nhập, bấm Kết nối rồi Bắt đầu. Không cần chọn ô hoặc món. Giữ Terminal và phiên Chrome mở; launcher dùng caffeinate để ngăn tự ngủ trên Mac. Tắt máy/đóng nắp/mất mạng vẫn gây gián đoạn. CLI VPS là cách chạy độc lập với máy cá nhân.

Cần Node >=22 và Google Chrome trên máy local. Launcher ưu tiên runtime Node/Playwright có sẵn trong Codex, nếu không sẽ cài dependency trong thư mục riêng. Không cài gì ở Musicque.

## Xuất phiên để chuyển lên VPS

Khi đã đăng nhập local, tạm dừng bot. Mở Terminal thứ hai:

```sh
mkdir -p ~/.config/chibi-farm-helper
chmod 700 ~/.config/chibi-farm-helper
source /Users/phamtien/Work/PT/chibi-farm-helper/run.sh --export-session ~/.config/chibi-farm-helper/session.json
```

File có quyền 600, cấp quyền truy cập tài khoản. Không đưa vào Git/chat/log. Không ghi đè file đã có; chọn tên mới khi gia hạn. Chép file lên VPS qua SCP/SSH của bạn. Chỉ chạy một bot cho một tài khoản: sau khi chuyển sang VPS, tắt bot local; không bấm Đăng xuất game vì có thể thu hồi phiên đã xuất.

## Clone repo rồi cài trên VPS Linux

Cần VPS có Node.js >=22, Git, systemd và kết nối HTTPS tới game. Bạn tạo repo từ thư mục này, rồi clone repo đó trên VPS. Không cần npm install cho chế độ terminal.

Chép file phiên lên `~/.config/chibi-farm-helper/session.json`, đặt quyền 600. Từ thư mục repo vừa clone:

```sh
chmod 600 ~/.config/chibi-farm-helper/session.json
# Chỉ kiểm tra tài khoản và kế hoạch, không chăm trại:
source ./run.sh --terminal --session ~/.config/chibi-farm-helper/session.json --check
# Cài dịch vụ và bắt đầu tự chăm:
bash ./install-vps.sh ~/.config/chibi-farm-helper/session.json
```

Installer kiểm tra phiên, sinh user service với đường dẫn Node/repo tuyệt đối, xác minh unit rồi bật systemd. Nếu chưa bật linger, installer chạy `sudo loginctl enable-linger` cho đúng user để dịch vụ sống sau logout và chạy cùng VPS khi boot. Cần quyền sudo cho bước này. Cài bằng user SSH bình thường; không cần `sudo` cho toàn bộ script. VPS không có systemd thì dùng `source ./run.sh --terminal --session ...` trong tmux.

```sh
systemctl --user status chibi-farm-helper
journalctl --user -u chibi-farm-helper -f
systemctl --user stop chibi-farm-helper
systemctl --user restart chibi-farm-helper
```

Dịch vụ tự khởi động lại khi gặp lỗi mạng kéo dài hoặc tiến trình chết; không restart vòng lặp khi hết phiên, sai tài khoản, lỗi cấu hình hoặc lỗi nghiệp vụ (exit 78). Không mở cổng web nào trên VPS. Trạng thái nằm ở `~/.local/state/chibi-farm-helper/runtime.json`, tách khỏi repo và giữ qua git pull.

Sau khi xuất phiên mới, chép tới đường dẫn file phiên cũ trên VPS bằng cách an toàn, giữ quyền 600 rồi restart service. Phiên hiện tại thường tối đa 30 ngày theo luật backend; có thể bị thu hồi sớm. Không cam kết chạy vĩnh viễn không cần can thiệp: hết phiên, đầy kho, thay API hoặc VPS hỏng vẫn cần xử lý. Xem `systemctl status` và nhật ký khi nghi ngờ bot dừng.

## Cập nhật code

```sh
systemctl --user stop chibi-farm-helper
git pull --ff-only
systemctl --user start chibi-farm-helper
```

Nếu chuyển repo/đổi đường dẫn Node hoặc file phiên, dừng service rồi chạy lại installer để ghi đường dẫn mới. Installer không ghi đè cookie, không cần mật khẩu game.

## Kiểm tra

```sh
source ./run.sh --test
PORT=4180 source ./run.sh --demo
```

Demo không chạm tài khoản thật. Tests kiểm tra mốc giờ server, nguyên liệu, sức chứa, hạn mức, retry không chi trùng, phục hồi trạng thái, khóa tài khoản, phân bổ cây và transport API. Cài systemd thực tế cần kiểm chứng trên VPS Linux của bạn; môi trường phát triển hiện tại là macOS.

`.gitignore` loại `.private/`, file phiên theo mẫu `session*.json` / `*.session.json` và node_modules. Đặt mọi bí mật trong `.private/` hoặc ngoài repo; kiểm tra git status trước khi push. Không đưa file phiên tên tùy ý vào repo.
