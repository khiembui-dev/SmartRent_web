# Sửa trả phòng và ảnh phòng — 14/11/2026

## Kết thúc hợp đồng và trả phòng

Lỗi được báo có ngày trả 12/11 trong khi nhận phòng 13/11. Ngày trả trước ngày nhận vẫn phải bị chặn. Ngoài ra, quy tắc cũ chặn cả nhận và trả trong cùng ngày, nên chọn đúng ngày nhận cũng chưa thể quyết toán.

Đã cho phép ngày trả từ ngày nhận đến hôm nay, đồng bộ frontend, API và CHECK database. Ô lịch có ngày tối thiểu và kiểm tra ngay trong form. Ngày/giờ ban đầu khi nhận phòng hôm nay dùng thời điểm thực tế, hoạt động cả trước 07:00.

- Trả cùng ngày: không phát sinh ngày thuê mới; hóa đơn cuối chốt điện nước chưa tính. Hóa đơn đã phát hành giữ nguyên; không tự hoàn tiền thuê hoặc bỏ công nợ đã có.
- Đã có hóa đơn chốt điện nước trong ngày trả: lấy chỉ số đã chốt đó làm đầu kỳ, tránh thu lại phần tiêu thụ đã tính.
- Chốt hôm nay lấy giờ thực tế; chốt ngày đã qua lấy cuối ngày đó. Không cho lùi thời gian trước chỉ số gần nhất hoặc giảm chỉ số.
- Hợp đồng không phát sinh khoản mới vẫn tạo được hồ sơ quyết toán 0 đồng; không tự thêm đơn giá cho loại điện/nước hợp đồng không thu.
- Quyết toán, bù cọc, hoàn cọc và giải phóng phòng nằm trong cùng transaction. Lệnh gửi lại không tạo hóa đơn/hoàn cọc lần hai.
- Khi hoàn cọc bằng ngân hàng, form yêu cầu mã giao dịch và gửi đúng `refund.externalReference`.

Khoảng ngày kỹ thuật của hóa đơn chốt điện nước trong ngày có thể là `[ngày nhận, ngày nhận + 1)`, để đáp ứng CHECK `service_to > service_from`. Hóa đơn này mang `metered_only=true`, không dùng khoảng đó để thu thêm ngày tiền phòng. Ngày trả thực tế trên hợp đồng vẫn là ngày admin chọn.

Database cũ chạy bằng owner, không reset:

```powershell
docker compose exec -T db psql -U postgres -d smartrent -v ON_ERROR_STOP=1 -f /smartrent-database/15_same_day_checkout.sql
```

Máy local hiện tại đã sao lưu database trong `backend/src/SmartRent.Api/App_Data/maintenance/` và áp dụng migration. Không tự kết thúc hợp đồng thật của anh trong quá trình kiểm tra.

Các file chính: `CheckoutService.cs`, `BillingEngine.cs`, `TenanciesController.cs`, `frontend/src/pages/admin/contract-detail.js`, baseline `01_schema.sql`/`02_rules.sql` và migration `15_same_day_checkout.sql`.

## Ảnh phòng

Hai ảnh được báo đã có metadata và file thật trên ổ đĩa. Tin phòng đang ẩn; trang admin dùng nhầm URL `/files/:id/public`, nên ảnh bị 404.

Trang sửa phòng, chi tiết phòng, danh sách phòng và chi tiết cơ sở nay lấy link có hạn qua `filesApi.downloadUrl` bằng phiên admin. Nội dung ảnh vẫn kiểm tra phiên và quyền; ảnh của tin ẩn không được mở công khai. Bổ sung `referrerpolicy=no-referrer` cho ảnh quản trị. Khi có ảnh tải lên thất bại, trang sửa phòng chặn lưu thay vì bỏ qua ảnh lỗi. Tệp thật bị mất sẽ hiện thông báo để tải lại.

Files: `frontend/src/services/room-images.js`, `services/api.js`, các trang `room-form.js`, `room-detail.js`, `rooms.js`, `property-detail.js` và `components/admin-kit.js`. Không đổi quyền public của FilesController để chữa ảnh quản trị.

## Kiểm tra

`backend/tests/checkout_images_flow.py` chạy cùng `run_full_backend.py` trên source gốc với PostgreSQL tạm, bao gồm: trả cùng ngày có/không có điện nước, quyết toán 0 đồng, hóa đơn đã chốt số trong ngày, hoàn cọc chuyển khoản, chống gửi lặp, ngày không hợp lệ, upload và quyền đọc ảnh tin ẩn.

Kết quả: 76 kiểm tra HTTP mới đạt; các bộ hồi quy phòng/hợp đồng/thanh toán/Ticket đều đạt. Build backend và frontend đạt, xUnit chung 163 đạt/17 bỏ qua do cần cấu hình DB riêng, kiểm tra API contract và quyền truy cập frontend đạt. Đã mở bộ chọn tệp và thử uploader/ảnh xem trước trong trình duyệt với response thử. Kiểm tra chỉ đọc trên dữ liệu anh báo: xem quyết toán thành công (168.000đ điện nước phát sinh), hai ảnh thật đọc được qua link admin; hợp đồng, hóa đơn và thanh toán thực tế không thay đổi.

```powershell
# Dừng backend đang chạy trước build trên Windows nếu DLL đang bị khóa.
python backend/tests/run_full_backend.py
dotnet test backend/tests/SmartRent.Api.Tests --no-build
cd frontend
npm run build
npm run check:contract
npm run test:access
```
