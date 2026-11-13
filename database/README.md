# Database SmartRent — 13 bảng nghiệp vụ + 2 bảng ApiPay

Tích hợp ApiPay thêm `apipay_requests` và `apipay_events` bằng `14_apipay.sql` (tổng 15 bảng khi cài đầy đủ). Xem [cài đặt, mô hình dữ liệu và đối soát](../docs/APIPAY.md). Hai bảng kỹ thuật giữ yêu cầu thanh toán và inbox chống ghi thu trùng; không thay thế `payments`/`invoices`.

Baseline thu gọn theo yêu cầu ngày 04/11/2026. Một database dùng chung cho khu admin và khu khách, chỉ hai role `admin` và `user`, tối đa một admin.

Chuyển tài khoản đã đăng ký thành admin bằng [script và hướng dẫn chuyển quyền](../docs/CHUYEN_QUYEN_ADMIN.md). Không chạy UPDATE role riêng lẻ; admin trước chuyển về user trong cùng transaction.

Tin phòng chỉ hiện trên trang khách khi đã đăng, phòng còn trống và cơ sở hoạt động.
Ảnh có thể bổ sung sau. Database đã cài trước thay đổi này chạy migration
`08_room_listings.sql` bằng owner; không reset database. Xem [luồng đăng phòng](../docs/PHONG_TREN_TRANG_KHACH.md).

Migration cho database đã cài (chạy bằng owner, chạy lại được, không reset dữ liệu):

| File | Nội dung |
|---|---|
| `10_property_maps.sql` | Liên kết Google Maps của cơ sở |
| `11_room_listing_sync.sql` | Tin phòng tự tạm ẩn khi có hợp đồng, tự công khai khi trả phòng; phòng đã có hợp đồng không đổi cơ sở |
| `12_favorite_rooms.sql` | Cột `users.favorite_rooms` cho trang Phòng yêu thích (không thêm bảng) |
| `13_room_address_and_schedule.sql` | Địa chỉ tỉnh/phường mới, địa chỉ riêng của phòng, trạng thái cọc giữ phòng và lịch nhắc 1–31 |

```powershell
docker compose exec -T db psql -U postgres -d smartrent -v ON_ERROR_STOP=1 -f /smartrent-database/12_favorite_rooms.sql
docker compose exec -T db psql -U postgres -d smartrent -v ON_ERROR_STOP=1 -f /smartrent-database/13_room_address_and_schedule.sql
```

| Bảng | Dữ liệu |
|---|---|
| users | Tài khoản và toàn bộ hồ sơ khách thuê |
| auth_tokens | Phiên đăng nhập, token đặt lại mật khẩu, lời mời |
| files | Metadata tệp dùng chung |
| settings | Thương hiệu, lịch nhắc, ngân hàng mặc định |
| properties | Cơ sở, tiện ích có thể chọn, giá mặc định |
| rooms | Phòng, tin đăng, tiện ích đã chọn, ảnh và giá riêng |
| bookings | Yêu cầu xem, lịch hẹn, giữ chỗ và đề nghị của khách |
| contracts | Đợt thuê và hợp đồng, các bản ký/gia hạn, tệp, người ở cùng, bàn giao |
| billing_periods | Tháng tính tiền và khóa/mở tháng |
| invoices | Hóa đơn, chỉ số điện nước, lịch sử sửa số và các dòng tính tiền |
| payments | Thu tiền, thu/hoàn/bù cọc, hoàn tác và phân bổ hóa đơn |
| tickets | Sự cố, loại, ảnh, trao đổi, ghi chú nội bộ và tiến độ |
| notifications | Thông báo và trạng thái đọc |

Các bảng đã gộp được thay bằng cột JSONB trên hồ sơ chính. Cơ sở/phòng/giá đúng 2 bảng; lịch xem 1 bảng; hợp đồng 1 bảng; thanh toán/cọc 1 bảng; hỗ trợ 1 bảng. Điện nước/hóa đơn giữ 2 bảng vì cần khóa được cả tháng chưa có hóa đơn.

## Tài liệu

- [Danh sách bảng và sơ đồ](ERD.md), [từ điển cột](TU_DIEN_DU_LIEU.md).
- [Cấu trúc JSONB](JSON_DATA.md): định dạng ảnh, giá, lịch hẹn, bản ký, dòng tiền và tin nhắn.
- [Luồng hiện tại](PHAN_TICH_SOURCE_VA_LUONG.md), [đối chiếu 40 route / 63 mục chức năng](DOI_CHIEU_TUNG_TRANG.md).
- [Quy tắc ghi dữ liệu](THIET_KE_DATABASE.md), [kiểm thử](KIEM_THU.md).
- [Bàn giao API](../docs/BACKEND_HANDOFF.md), [chức năng các trang](../docs/FRONTEND_COVERAGE.md).

## Cài đặt

Database đã cài từ phiên bản trước khi có backend Ticket: chạy migration bổ sung, không xóa volume:

```powershell
docker compose exec -T db psql -U postgres -d smartrent -v ON_ERROR_STOP=1 -f /smartrent-database/06_ticket_backend.sql
```

Migration thêm `tickets.idempotency_key/request_hash` và cập nhật history trigger; vẫn 13 bảng. Database mới dùng baseline 01/02 đã có sẵn thay đổi.

PostgreSQL 16, extension `btree_gist`. Chạy tại gốc repository:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\database\install.ps1 -DatabaseName smartrent -Port 5432
# Có thể thêm -WithDemo cho database dùng thử.
```

Installer tạo database mới và chạy `01_schema.sql`, `02_rules.sql`, `03_seed.sql`, `14_apipay.sql`. Nó từ chối database đã tồn tại. Database đang sử dụng chỉ chạy migration cần bổ sung, không nạp lại baseline. Bộ test SQL cũ kiểm tra 13 bảng nghiệp vụ; `backend/tests/run_apipay.py` kiểm tra thêm hai bảng ApiPay và ghi nhận thanh toán.

`03_seed.sql` chỉ tạo cấu hình. Danh mục tiện ích/loại phí nằm trong JSONB của cơ sở/phòng; loại sự cố là bốn giá trị cố định. `05_demo.sql` tùy chọn cung cấp dữ liệu minh họa nhỏ. Hash tài khoản demo cố ý không dùng đăng nhập; tệp demo chỉ có metadata.

Tạo admin đầu tiên bằng tài khoản sở hữu database, sau khi backend tạo password hash:

```text
psql ... -d smartrent -v admin_email=EMAIL -v admin_name=NAME -v admin_hash=PASSWORD_HASH -f database/04_create_admin.sql
```

Backend dùng SQL login riêng, cấp quyền bằng owner:

```sql
SELECT smartrent.configure_runtime('smartrent_app');
ALTER ROLE smartrent_app IN DATABASE smartrent SET search_path=smartrent,public;
```

Runtime không được ghi `users.role`; đăng ký luôn là user. Hồ sơ khách do admin tạo có thể để `login_enabled=false` và chưa có email/password. Kích hoạt tài khoản sau trên chính dòng đó.

Docker: làm theo [hướng dẫn cài từ đầu cho backend](../docs/CAI_DAT_DOCKER_BACKEND.md). Volume của baseline này là `smartrent-compact-db-data`; không tự nhập demo hoặc chuyển dữ liệu từ volume cũ.

## Chạy kiểm tra

```powershell
python database/tools/audit_source.py
python database/tests/run_checks.py --host 127.0.0.1 --port 55440 --user postgres
```

Chọn port PostgreSQL kiểm thử đang chạy. Runner tạo database ngẫu nhiên, nạp schema và demo, kiểm tra ràng buộc/nghiệp vụ/giao dịch đồng thời rồi xóa database do chính nó tạo. `--keep` giữ lại để kiểm tra.

**Trạng thái ứng dụng:** frontend ở chế độ `VITE_DATA_SOURCE=api` gọi backend ASP.NET Core và PostgreSQL thật. Xem [cập nhật hợp đồng, phòng, địa chỉ và tìm kiếm](../docs/CAP_NHAT_PHONG_HOP_DONG_20261113.md).
