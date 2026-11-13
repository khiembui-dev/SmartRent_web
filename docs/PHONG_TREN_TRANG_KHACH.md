# Phòng trống trên trang khách

Phòng trong danh sách admin là toàn bộ phòng quản lý. Trang chủ và trang Thuê phòng
cùng gọi `GET /api/v1/public/rooms`, chỉ hiển thị phòng thỏa cả ba điều kiện:

1. Tin của phòng đã được đăng (`listing_status=published`).
2. Phòng còn trống theo hợp đồng/giữ chỗ và đang được khai thác.
3. Cơ sở đang hoạt động.

Trong admin → Phòng có cột **Tin trên trang khách**. Bấm biểu tượng loa để đăng tin,
hoặc biểu tượng mắt gạch để ẩn. Các thao tác này cũng có trong trang chi tiết phòng.
Phòng mới mặc định ẩn để admin kiểm tra thông tin trước khi đăng.

## Tin đăng đi theo hợp đồng (từ 13/11/2026)

- Khi phòng có hợp đồng hiệu lực hoặc sắp vào ở (nhận phòng, nhập khách đang thuê,
  chuyển phòng đến, chốt giữ chỗ thành hợp đồng), tin tự chuyển **Tạm ẩn**. Admin không
  đăng lại được cho tới khi trả phòng; form Sửa phòng khóa lựa chọn "Đang công khai".
- Khi admin bấm **Kết thúc và trả phòng** (hoặc hủy hợp đồng nhập, chuyển khách sang
  phòng khác) và phòng không còn hợp đồng nào khác, tin tự **Đang công khai** lại nếu phòng
  đang khai thác, cơ sở hoạt động và có giá thuê. Thiếu một điều kiện thì tin giữ nguyên
  trạng thái tạm ẩn để admin kiểm tra.
- Quy tắc nằm ở trigger `contract_listing_sync` (database), nên mọi đường ghi hợp đồng đều
  áp dụng như nhau; backend chỉ đổi thông báo lỗi cho dễ hiểu.

## Đổi cơ sở của phòng

Form Sửa phòng cho đổi ô **Cơ sở** khi phòng chưa từng có hợp đồng (kể cả hợp đồng đã
kết thúc). Phòng đã có hợp đồng giữ cơ sở cũ vì hóa đơn và tháng tính tiền gắn với cơ
sở đó; API trả `409 room_property_locked_by_contracts`. Mã phòng phải chưa có ở cơ sở mới.
Giá chưa đặt riêng cho phòng sẽ theo bảng giá của cơ sở mới.

Cho phép đăng khi chưa có ảnh; trang khách hiển thị biểu tượng chưa có ảnh và thông
tin thật của phòng. Bổ sung ảnh bằng Sửa phòng. Ảnh gắn vào phòng vẫn phải có metadata,
đúng quyền công khai và qua kiểm tra định dạng; không tạo ảnh minh họa giả.

Trường hợp đã thuê, giữ chỗ, bảo trì hoặc cơ sở ngừng hoạt động sẽ không nằm trong
danh sách phòng trống, dù trạng thái tin là đã đăng.

## Cập nhật database đã cài

Baseline `02_rules.sql` đã cập nhật quy tắc ảnh tùy chọn. Với database đang dùng,
chạy migration này tại thư mục gốc, không cần xóa dữ liệu hoặc Docker volume:

```powershell
docker compose exec -T db psql -U postgres -d smartrent -v ON_ERROR_STOP=1 -f /smartrent-database/08_room_listings.sql
```

Database cài trước ngày 13/11/2026 chạy thêm `11_room_listing_sync.sql` (trigger tin đăng theo
hợp đồng, khóa đổi cơ sở; tạm ẩn ngay tin của phòng đang có hợp đồng). Chạy lại nhiều lần
không đổi dữ liệu:

```powershell
docker compose exec -T db psql -U postgres -d smartrent -v ON_ERROR_STOP=1 -f /smartrent-database/11_room_listing_sync.sql
```

Migration 08 chỉ cập nhật trigger kiểm tra phòng, không tự đăng tin hoặc đổi ảnh. Trên
máy hiện tại đã áp dụng migration và đăng hai phòng A102/A103 theo yêu cầu ngày
07/11/2026. Các tài khoản và hồ sơ thuê được giữ nguyên.

Regression: `backend/tests/public_listing_flow.py`, chạy cùng bộ
`python backend/tests/run_full_backend.py` sau khi dừng backend local. Bộ kiểm tra
dùng source gốc với database tạm để không ghi dữ liệu kiểm thử vào database làm việc.
