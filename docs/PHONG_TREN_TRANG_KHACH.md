# Phòng trống trên trang khách

Phòng trong danh sách admin là toàn bộ phòng quản lý. Trang chủ và trang Thuê phòng
cùng gọi `GET /api/v1/public/rooms`, chỉ hiển thị phòng thỏa cả ba điều kiện:

1. Tin của phòng đã được đăng (`listing_status=published`).
2. Phòng còn trống theo hợp đồng/giữ chỗ và đang được khai thác.
3. Cơ sở đang hoạt động.

Trong admin → Phòng có cột **Tin trên trang khách**. Bấm biểu tượng loa để đăng tin,
hoặc biểu tượng mắt gạch để ẩn. Các thao tác này cũng có trong trang chi tiết phòng.
Phòng mới mặc định ẩn để admin kiểm tra thông tin trước khi đăng. Không tự công khai
mọi phòng còn trống; tin đã ẩn phải được admin chủ động đăng lại.

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

Migration chỉ cập nhật trigger kiểm tra phòng, không tự đăng tin hoặc đổi ảnh. Trên
máy hiện tại đã áp dụng migration và đăng hai phòng A102/A103 theo yêu cầu ngày
07/11/2026. Các tài khoản và hồ sơ thuê được giữ nguyên.

Regression: `backend/tests/public_listing_flow.py`, chạy cùng bộ
`python backend/tests/run_full_backend.py` sau khi dừng backend local. Bộ kiểm tra
dùng source gốc với database tạm để không ghi dữ liệu kiểm thử vào database làm việc.
