# Cơ sở dữ liệu SmartRent

PostgreSQL 16+, schema `smartrent`, **74 bảng, 12 view**, chuẩn 3NF. Thiết kế lại ngày 01/11/2026 theo đúng tính năng và luồng website đang chạy; bản 103 bảng cũ nằm ở `archive/v1-103-bang/`.

## Cài đặt

Mở PowerShell tại thư mục dự án. Script hỏi mật khẩu PostgreSQL ngay tại máy, không ghi ra file, và **từ chối chạy nếu database đã tồn tại** nên không thể ghi đè dữ liệu.

```powershell
# Chỉ cấu trúc, sẵn sàng nhập dữ liệu thật
powershell -ExecutionPolicy Bypass -File database\install.ps1

# Kèm dữ liệu mẫu (34 phòng, 38 hóa đơn...) cho team backend phát triển
powershell -ExecutionPolicy Bypass -File database\install.ps1 -SampleData

# Server khác cổng hoặc khác tài khoản
powershell -ExecutionPolicy Bypass -File database\install.ps1 -Port 5433 -User ten_tai_khoan
```

Cài bằng tay nếu không dùng script: chạy `00` từ database `postgres`, rồi `01`, `02`, `03`, `04` trên database `smartrent`.

## Chạy bằng Docker cho team backend

Mỗi người chạy một bản database riêng trên máy mình, cùng cấu trúc và cùng dữ liệu mẫu. Các bước cài, thông tin kết nối và cách xử lý lỗi nằm ở **[HUONG_DAN_CAI_DAT.md](HUONG_DAN_CAI_DAT.md)**.

Bản Docker này chỉ để phát triển. Server thật cài bằng `install.ps1` hoặc migration, không dùng `database/docker/init.sql` vì file đó nạp dữ liệu giả và mật khẩu mẫu.

## Nhập dữ liệu thật

Sửa `05_du_lieu_thuc.sql` rồi chạy một lần:

```powershell
$env:PGCLIENTENCODING = 'UTF8'
& 'C:\Program Files\PostgreSQL\16\bin\psql.exe' -X -U postgres -d smartrent -v ON_ERROR_STOP=1 -f database\05_du_lieu_thuc.sql
```

File dùng các hàm trong `04_import_tools.sql`, gọi theo mã tự đặt thay vì UUID. Mỗi hàm tự tạo các dòng đi kèm và đi qua toàn bộ ràng buộc như dữ liệu từ website. Cả file là một giao dịch: sai một dòng thì không có gì được ghi.

| Hàm | Dùng để |
|---|---|
| `import_organization` | Tạo đơn vị, tài khoản chủ trọ, quyền, khoản thu, loại phòng, tiện ích |
| `import_bank_account` | Tài khoản nhận tiền hiện ở trang thanh toán |
| `import_property` | Cơ sở và bảng giá điện, nước, rác, dịch vụ, internet |
| `import_room` | Phòng, giá thuê, hai công tơ, tiện ích, tin đăng |
| `import_room_image` | Gắn ảnh phòng; ảnh đầu tiên là ảnh bìa |
| `import_tenant` | Hồ sơ khách |
| `import_tenancy` | Khách đang ở: ngày vào, số điện nước đầu, cọc đang giữ |
| `import_resident` | Người ở cùng |
| `import_contract` | Hợp đồng giấy đã ký, cần đường dẫn bản scan |
| `import_opening_balance` | Nợ cũ từ sổ tay |
| `import_identity_document` | Giấy tờ, số được mã hóa; thiếu khóa thì từ chối |

Không hàm nào nhận mật khẩu. Tài khoản tạo bằng SQL chưa có mật khẩu, đăng nhập lần đầu bằng chức năng Quên mật khẩu.

Nếu cần nhập nhiều dòng từ Excel, lưu thành CSV rồi sinh các lệnh `SELECT import_room(...)`, không `INSERT` thẳng vào bảng: đi qua hàm mới có đủ giá, công tơ và tin đăng.

## Các file

| File | Nội dung |
|---|---|
| [HUONG_DAN_CAI_DAT.md](HUONG_DAN_CAI_DAT.md) | Hướng dẫn team cài database bằng Docker |
| `install.ps1` | Cài vào PostgreSQL thật, hỏi mật khẩu tại máy, không ghi đè database có sẵn |
| `../docker-compose.yml`, `docker/init.sql` | Database dev bằng Docker cho team |
| `migrations/` | Thay đổi cấu trúc sau khi team bắt đầu code |
| `00_create_database.sql` | Tạo database |
| `01_schema.sql` | 74 bảng, khóa chính, khóa ngoại, UNIQUE, CHECK, EXCLUDE, index, mô tả từng bảng |
| `02_rules.sql` | View số liệu, hàm tính giá, trigger bảo vệ dữ liệu, nhật ký tự động |
| `03_seed.sql` | Quyền, phương thức thanh toán, vai trò hệ thống, hàm khởi tạo đơn vị |
| `04_import_tools.sql` | Bộ hàm nhập dữ liệu thật |
| `05_du_lieu_thuc.sql` | **Mẫu nhập dữ liệu thật**, sửa rồi chạy |
| `06_du_lieu_mau.sql` | Dữ liệu giả cho phát triển, sinh từ mock của frontend. Không chạy cùng dữ liệu thật |
| [THIET_KE_DATABASE.md](THIET_KE_DATABASE.md) | Quyết định thiết kế, màn hình nào dùng bảng nào, quy tắc, giao dịch |
| [ERD.md](ERD.md) | Sơ đồ quan hệ |
| [TU_DIEN_DU_LIEU.md](TU_DIEN_DU_LIEU.md) | Mọi cột, kiểu, khóa, index; sinh từ database thật |
| [EF_CORE_NPGSQL.md](EF_CORE_NPGSQL.md) | Hướng dẫn nối ASP.NET Core |
| [KIEM_THU.md](KIEM_THU.md) | Cách kiểm tra và kết quả |
| `tests/` | Kiểm thử nghiệp vụ, đồng thời, đối chiếu số liệu với website |
| `tools/` | Sinh từ điển dữ liệu, sinh `06_du_lieu_mau.sql` |
| `archive/v1-103-bang/` | Bản thiết kế cũ, giữ để tra cứu, không dùng nữa |

Các script 01 đến 04 là **bộ cài một lần**. Từ khi team bắt đầu code, mọi thay đổi phải viết thành migration, không sửa hay chạy lại các file này.

## Kết nối từ ứng dụng

Không đưa mật khẩu vào mã nguồn. Tạo tài khoản riêng cho ứng dụng thay vì dùng `postgres`, và đặt `search_path` về `smartrent, public` vì các extension nằm ở `public`:

```sql
CREATE ROLE smartrent_app LOGIN PASSWORD '...';
GRANT CONNECT ON DATABASE smartrent TO smartrent_app;
GRANT USAGE ON SCHEMA smartrent TO smartrent_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA smartrent TO smartrent_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA smartrent TO smartrent_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA smartrent TO smartrent_app;
ALTER ROLE smartrent_app SET search_path = smartrent, public;
```
