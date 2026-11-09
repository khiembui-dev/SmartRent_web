# Chuyển tài khoản thành admin

Hệ thống chỉ có hai role `admin`, `user` và tối đa **một admin**. Cấp admin cho một
tài khoản khác là chuyển quyền chủ trọ: admin trước trở thành `user`. Giữ nguyên
email, UUID và mật khẩu của hai tài khoản; không xóa tài khoản hoặc dữ liệu thuê.

## Thực hiện trên máy local Docker

1. Tài khoản đích phải được đăng ký, đang hoạt động và có mật khẩu. Chọn tài khoản
   riêng của chủ trọ, chưa có hợp đồng, yêu cầu xem phòng, khoản thanh toán hoặc lịch
   sử ở cùng; script sẽ từ chối nếu tài khoản đã gắn với các hồ sơ khách này.
2. Sao lưu database trước khi chuyển quyền. Chạy PowerShell tại thư mục gốc dự án.
3. Ví dụ chuyển quyền sang `khiem@gmail.com`:

```powershell
docker compose exec -T db psql -U postgres -d smartrent -v ON_ERROR_STOP=1 -v target_email=khiem@gmail.com -f /smartrent-database/tools/transfer_admin.sql
```

4. Script in tài khoản admin sau khi chuyển. Kiểm tra lại:

```powershell
docker compose exec -T db psql -U postgres -d smartrent -c "SELECT email, display_name, role FROM smartrent.users WHERE role='admin';"
```

5. Đăng nhập lại tại `http://localhost:5174/admin/login`, dùng email đích và **mật
   khẩu hiện tại của tài khoản đó**. Các phiên/token cũ của cả admin trước và tài
   khoản đích đã bị thu hồi. Không cần restart backend/frontend.

Muốn chuyển sang tài khoản khác, thay giá trị `target_email` trong lệnh. Tài khoản
phải tồn tại; script không tự tạo tài khoản hoặc đặt lại mật khẩu.

## Cơ chế bảo vệ

Không chạy riêng `UPDATE users SET role='admin'`: database chặn đổi role bằng
trigger `protect_user`, runtime `smartrent_app` không được ghi cột role và unique
index `users_one_admin` chặn admin thứ hai. Đây là các bảo vệ được giữ nguyên.

Script dùng quyền sở hữu database (`postgres` trong Docker local), khóa bảng trong
transaction, tạm dừng đúng trigger bảo vệ lúc đổi hai role, bật lại trước commit
và thu hồi phiên cũ. Khi lỗi, PostgreSQL rollback cả dữ liệu lẫn trạng thái trigger.
Không có API web cho khách tự nâng role.

Script tự nạp `database/07_admin_history.sql`. Migration này giữ nguyên người ký
hợp đồng, người viết ghi chú và các thông tin lịch sử dù họ không còn là admin.
Người ký/duyệt/viết ghi chú nội bộ mới vẫn phải là admin hiện tại. Các Ticket đang
xử lý và lịch xem đang hẹn được giao lại cho chủ trọ mới, có lịch sử thay đổi.

Trên production, dùng tài khoản quản trị database qua kênh vận hành riêng và sao
lưu trước; không đưa mật khẩu DB vào frontend hoặc cấp quyền database owner cho API.
