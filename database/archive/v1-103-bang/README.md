# Cơ sở dữ liệu SmartRent

Thiết kế dựa trên toàn bộ [đặc tả website](../DAC_TA_LUONG_VA_CHUC_NANG_WEBSITE_PHONG_TRO.md), gồm các chức năng cốt lõi, cho thuê trực tuyến/cổng khách và nền tảng mở rộng. Schema hiện có **103 bảng, 9 view, 226 khóa ngoại, 144 CHECK và 5 EXCLUDE**, dùng PostgreSQL **16 trở lên**, phù hợp ASP.NET Core + EF Core + Npgsql.

## Các file

| File | Nội dung |
|---|---|
| `00_create_database.sql` | Tạo database mới, chạy từ database `postgres` |
| `01_schema.sql` | Toàn bộ bảng, PK, FK, UNIQUE, CHECK, EXCLUDE và index |
| `02_rules.sql` | View công nợ/cọc, giá hiệu lực, trigger nghiệp vụ, khóa tài chính, audit |
| `03_seed.sql` | Quyền, phương thức thu, vai trò hệ thống; hàm khởi tạo đơn vị |
| [THIET_KE_DATABASE.md](THIET_KE_DATABASE.md) | Quyết định 3NF, bảng theo chức năng, quy tắc và giao dịch |
| [ERD.md](ERD.md) | Sơ đồ quan hệ các phân hệ |
| [TU_DIEN_DU_LIEU.md](TU_DIEN_DU_LIEU.md) | Mọi cột, kiểu, null/default, PK/FK và ràng buộc thực tế |
| [EF_CORE_NPGSQL.md](EF_CORE_NPGSQL.md) | Scaffold, Identity, kiểu dữ liệu, concurrency và migration |
| [tests/acceptance.sql](tests/acceptance.sql) | Kiểm tra nghiệp vụ, rollback dữ liệu thử |
| [tests/run_checks.py](tests/run_checks.py) | Tạo DB thử, cài schema, kiểm thử hai kết nối rồi xóa DB thử |
| [KIEM_THU.md](KIEM_THU.md) | Kết quả và giới hạn kiểm tra |

Các script là **bộ khởi tạo một lần**. Không chạy lại 01/02/03 trên database đã cài; thay đổi sau này phải viết migration. Mỗi file 01–03 có transaction riêng; nếu một file lỗi thì sửa lỗi và tiếp tục từ file đó. `CREATE DATABASE` phải chạy ngoài transaction.

## Cài bằng psql trên Windows

Mở PowerShell tại thư mục dự án. Thay tài khoản/host/port theo PostgreSQL của bạn; không đưa mật khẩu vào mã nguồn hoặc lệnh được chia sẻ.

```powershell
$psql = 'C:\Program Files\PostgreSQL\16\bin\psql.exe'
$env:PGHOST = 'localhost'
$env:PGPORT = '5432'
$env:PGUSER = 'postgres'
$env:PGCLIENTENCODING = 'UTF8'

# psql sẽ hỏi mật khẩu khi cần, hoặc dùng pgpass đã cấu hình.
& $psql -X -d postgres -v ON_ERROR_STOP=1 -f database/00_create_database.sql
# Dừng ngay nếu lệnh trước báo lỗi. Sau đó chạy lần lượt:
& $psql -X -d smartrent -v ON_ERROR_STOP=1 -f database/01_schema.sql
& $psql -X -d smartrent -v ON_ERROR_STOP=1 -f database/02_rules.sql
& $psql -X -d smartrent -v ON_ERROR_STOP=1 -f database/03_seed.sql
```

Trong pgAdmin, thực hiện `00` từ Query Tool nối `postgres`, rồi mở Query Tool **nối `smartrent`** và chạy lần lượt `01`, `02`, `03`. Không có lệnh `\connect` dành riêng cho psql bên trong các file nên cũng chạy được bằng Npgsql/migration executor; riêng `00` phải chạy với autocommit.

`btree_gist` là extension bắt buộc cho lịch phòng/giá/công tơ không chồng lấn. Tài khoản cài schema cần quyền tạo schema và extension. Tách tài khoản triển khai với tài khoản ứng dụng khi đưa vào vận hành.

## Khởi tạo dữ liệu thật

1. Tạo tài khoản chủ trọ bằng ASP.NET Core Identity `UserManager`; hệ thống tự băm mật khẩu.
2. Tạo một dòng `organizations`, rồi gọi `SELECT smartrent.initialize_organization(@organization_id, @owner_user_id);` bằng tham số Npgsql. Đây là thao tác quản trị của máy chủ.
3. Tạo địa chỉ, cơ sở và `property_billing_settings`; tạo loại phòng, phòng, `rate_plans` và `charge_rates` của cơ sở/phòng.
4. Tạo/mời nhân viên, gán `membership_roles` và `membership_properties`. Cổng khách dùng liên kết `tenants.user_id`, không dùng quyền nhân viên.
5. Nhập khách và hợp đồng nháp; lưu bên ký, bản ký, giá chốt rồi xác nhận ký. Nhận phòng trong một transaction có bàn giao và chỉ số đầu.

Không có tài khoản/mật khẩu mặc định, dữ liệu cá nhân demo hoặc danh mục địa giới bị cố định theo bộ cũ. Không mặc định doanh thu từ mức cọc yêu cầu trên hợp đồng.

## Kiểm tra lại

```powershell
# Cần kết nối không tương tác qua pgpass/biến môi trường và role có CREATEDB.
python database/tests/run_checks.py --psql 'C:\Program Files\PostgreSQL\16\bin\psql.exe'
```

Runner tạo tên database ngẫu nhiên `smartrent_test_<uuid>` rồi xóa đúng database đó. Có thể dùng `--keep` để giữ database thử. Nếu chỉ cần kiểm tra trong database đã cài:

```powershell
& $psql -X -d smartrent -v ON_ERROR_STOP=1 -f database/tests/acceptance.sql
```

File acceptance không commit dữ liệu thử. Nên chạy trong môi trường phát triển/kiểm thử.
