# Kiểm thử database

Kết quả lần chạy gần nhất nằm ở [tests/latest-run.txt](tests/latest-run.txt). Chạy lại:

```powershell
$env:PGHOST = 'localhost'; $env:PGPORT = '5432'; $env:PGUSER = 'postgres'; $env:PGPASSWORD = 'mật khẩu của bạn'
python database/tests/run_checks.py --psql "C:/Program Files/PostgreSQL/16/bin/psql.exe"
```

Script tự tạo database tạm tên ngẫu nhiên rồi xóa, không đụng database `smartrent`. Tài khoản cần quyền `CREATEDB`, máy cần Python và Node.js.

## Script kiểm tra những gì

| Bước | Nội dung | Kết quả 01/11/2026, PostgreSQL 16.13 |
|---|---|---|
| Cài đặt | 01, 02, 03, 04 trên database mới | Đạt |
| Nghiệp vụ | `tests/acceptance.sql` đi theo luồng website, dữ liệu rollback | 98 kiểm thử đạt |
| Mẫu dữ liệu thật | Chạy nguyên `05_du_lieu_thuc.sql`, đọc lại bằng các view | Đạt: 3 phòng, 1 đang ở, 2 công khai, cọc 3.000.000, nợ 500.000, giá thuê lấy từ hợp đồng |
| Mã hóa giấy tờ | Giải mã đúng, không lộ số rõ; thiếu khóa thì từ chối | Đạt |
| Đồng thời | Hai kết nối nhận cùng một phòng; hai kết nối dùng vượt cùng một khoản thu | 2 kiểm thử đạt |
| Nạp dữ liệu website | `06_du_lieu_mau.sql`, mọi dòng qua hết ràng buộc và trigger | Đạt |
| Đối chiếu website | Engine của website và view của database tính trên cùng dữ liệu | Lệch 0 |

Phần đối chiếu là phép thử quan trọng nhất vì không do thiết kế tự chứng minh cho chính nó: `tests/compare_with_website.mjs` gọi trực tiếp engine của frontend rồi so từng số với database.

| Đối chiếu | Số dòng | Lệch |
|---|---|---|
| Tổng, phải thu, đã thu, còn nợ, trạng thái thanh toán, quá hạn của hóa đơn | 38 | 0 |
| Cọc đang giữ theo đợt thuê | 19 | 0 |
| Công nợ và nợ quá hạn theo khách | 22 | 0 |
| Trạng thái phòng | 34 | 0 |
| Trạng thái, ngày hết hạn, sắp hết hạn của hợp đồng | 18 | 0 |
| Giá hiệu lực từng khoản của đợt thuê đang ở | 93 | 0 |

Tổng phải thu 134.583.586 đồng, đã thu 115.069.666 đồng. Ví dụ đối chiếu của đặc tả: `HD-BT2609-001` tổng 3.655.000, đã thu 2.000.000, còn 1.655.000.

## Bản Docker

Máy soạn thảo chưa cài Docker nên **chưa chạy `docker compose up` thật**. Đã kiểm tra thay thế:

- Image `postgres:16.13` có trên Docker Hub cho cả `amd64` và `arm64`, trùng phiên bản đã kiểm thử.
- `docker-compose.yml` đạt schema chính thức của Compose; thử một khóa sai thì bị từ chối đúng. Các đường dẫn mount và biến môi trường đều có đủ.
- Một migration viết đúng hướng dẫn ở `migrations/README.md` được `run_checks.py` tự chạy, cột mới có trong database và toàn bộ kiểm thử vẫn đạt. File thử đã xóa.
- Chạy nguyên nội dung `docker/init.sql` trên PostgreSQL 16.13: tạo đủ 74 bảng, 34 phòng, 38 hóa đơn.
- Chương trình .NET 10 dùng Npgsql và `PasswordHasher` kết nối bằng `smartrent_app`: mật khẩu `demo1234` xác minh đúng, đọc view, ghi dữ liệu, nhật ký tự động chạy, tìm không dấu chạy; tạo bảng và xóa bảng bị từ chối với mã 42501.

- Lệnh healthcheck trong compose chỉ đạt khi `init.sql` đã chạy tới cuối: database trống và nạp lỗi giữa chừng đều không đạt, nạp xong thì đạt. Nếu chỉ kiểm tra máy chủ đã bật thì bản nạp lỗi vẫn báo `healthy`, vì container khởi động lại sẽ không nạp lần nữa.
- Lệnh kiểm tra và 7 tài khoản mẫu trong `HUONG_DAN_CAI_DAT.md` chạy đúng trên database đã nạp.

Người đầu tiên chạy Docker nên làm theo `HUONG_DAN_CAI_DAT.md` đến hết bước 5 rồi mới gửi cho cả nhóm.

## Lỗi kiểm thử đã phát hiện

Hai lỗi thiết kế có từ bản cũ, chỉ lộ ra khi nạp dữ liệu thật của website:

- Hóa đơn cuối chỉ có điện nước bị ràng buộc từ chối vì trùng ngày với hóa đơn tháng.
- Phiên bản gia hạn ký bằng phụ lục bị trigger từ chối vì chỉ nhận loại `signed`.

## Giới hạn

- Chạy trên một cụm PostgreSQL tạm, chưa chạy với backend thật vì backend chưa có.
- Dữ liệu đối chiếu là bộ mẫu của frontend. Các thao tác của backend tương lai vẫn cần kiểm thử tích hợp riêng.
- Website không còn tạo giữ chỗ, nên hai giữ chỗ trong dữ liệu mock không được nạp; số phòng công khai ở database có thể nhiều hơn mock đúng bằng các phòng đó.
- Một đơn chuyển phòng trong dữ liệu mock được đổi thành hoàn cọc và thu cọc mới, đúng cách website hiện làm.
- Chưa đo hiệu năng với dữ liệu lớn. Index đã có cho mọi khóa ngoại và các màn hình danh sách; nên đo lại khi có dữ liệu thật.
