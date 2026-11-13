# Hợp đồng, địa chỉ, cọc giữ phòng và bộ lọc — 13/11/2026

Các thay đổi chạy trên frontend Vite, backend ASP.NET và PostgreSQL hiện có. Không tạo thêm bảng; database vẫn có 13 bảng. Không cần reset volume hoặc nhập lại dữ liệu.

## Cập nhật database của các thành viên

Sau khi lấy source mới, bật Docker Desktop rồi chạy ở gốc dự án:

```powershell
docker compose up -d db
docker compose exec -T db psql -U postgres -d smartrent -v ON_ERROR_STOP=1 -f /smartrent-database/13_room_address_and_schedule.sql
```

Migration 13 chạy lại được, bổ sung hai cột JSONB và mở rộng ràng buộc trạng thái/ngày nhắc. Database cài mới từ `01_schema.sql` đã có các thay đổi này. Database cũ cần các migration trước đó tương ứng phiên bản đang dùng; xem [database README](../database/README.md).

Trên máy đang thực hiện thay đổi, migration 13 đã được áp dụng sau khi sao lưu database trong `backend/src/SmartRent.Api/App_Data/maintenance/`. Không đưa backup hoặc phiên kiểm tra vào Git.

Khởi động backend và frontend theo [README](../README.md). Giao diện tại `http://localhost:5174`, API tại `http://localhost:5080`.

## 1. Chọn khách và tạo hợp đồng

Mở `/admin/contracts/new`, bấm ô Khách thuê để tải danh sách hoặc gõ tên/số điện thoại. API `GET /api/v1/tenants?availableForContract=true` chỉ lấy user đang hoạt động, chưa là đại diện/người ở cùng trong hợp đồng `active` hoặc `planned`; lọc trước phân trang. Khách đã trả phòng được chọn lại.

Ngày sinh không bắt buộc. Khi có ngày sinh, vẫn kiểm tra đủ 18 tuổi; số điện thoại hợp lệ và bản hợp đồng đã ký vẫn bắt buộc. Frontend và backend cùng dùng quy tắc này. Dropdown phòng chỉ lấy phòng phù hợp; phòng được giữ qua lịch xem chỉ ký cho đúng khách giữ phòng.

Nhận phòng, chuyển trạng thái giữ phòng và tạo hợp đồng nằm trong cùng transaction. Nếu tệp ký hoặc hợp đồng không hợp lệ, trạng thái phòng được rollback.

Các file chính: `components/select.js`, `pages/admin/contract-new.js`, `utils/contract-tenant.js`, `TenantsController.cs`, `ContractTenantRules.cs`, `TenanciesController.cs`.

## 2. Trạng thái và địa chỉ phòng

Trong form thêm/sửa phòng có **Đang cọc giữ phòng** (`reserved`). Phòng đang ở không đổi thủ công sang trạng thái này. Khi sửa trạng thái, admin nhập lý do rồi lưu một lần. Đánh dấu này không tự tạo khoản thu cọc; chứng từ thu tiền vẫn theo luồng thanh toán/hợp đồng.

Địa chỉ có hai cách:

1. Giữ **Dùng địa chỉ của cơ sở** để phòng cập nhật theo cơ sở.
2. Bỏ chọn để nhập địa chỉ riêng: tỉnh/thành → phường/xã/đặc khu → số nhà/ngõ → tên đường/thôn/ấp.

Backend kiểm tra mã phường thuộc tỉnh, tự dựng tên địa chỉ và lưu `rooms.address_override`. Cơ sở lưu dữ liệu tương tự trong `properties.address_details`. Địa chỉ cũ vẫn hiển thị và không bị suy đoán sang phường mới; khi sửa cần chọn lại mã hành chính.

Danh mục đóng gói tại `backend/src/SmartRent.Api/Data/Reference/vietnam-addresses.json`: 34 tỉnh/thành, 3.321 đơn vị cấp xã, lấy ngày 13/11/2026 từ [API tỉnh thành Việt Nam v2](https://provinces.open-api.vn/). Cấu trúc mã theo [Quyết định 19/2025/QĐ-TTg](https://vanban.chinhphu.vn/?classid=1&docid=214409&pageid=27160&typegroupid=5). API `/api/v1/public/administrative-units` đọc bản đóng gói nên dropdown không phụ thuộc dịch vụ bên ngoài khi sử dụng.

Link Google Maps tự tạo từ địa chỉ đầy đủ theo [Maps URLs](https://developers.google.com/maps/documentation/urls/get-started). Đây là tìm địa chỉ, không phải geocoding có xác minh tọa độ; Google có thể nhận sai số nhà hoặc tên phường mới. Admin dùng **Xem trước bản đồ** / **Mở Google Maps**, và có thể dán link Chia sẻ của ghim đúng vào ô tùy chọn. Đổi địa chỉ sẽ bỏ ghim cũ để tránh dẫn nhầm.

Trang chi tiết phòng của khách nhận địa chỉ và link mới từ API. Các file chính: `address-editor.js`, `room-form.js`, `property-form.js`, `HousingAddress.cs`, `HousingData.cs`, `RoomsController.cs`, `PropertiesController.cs`, `PublicListings.cs`.

## 3. Tổng quan và cài đặt

Sơ đồ phòng được thay bằng ba ô thống kê: **Phòng trống**, **Phòng đang ở**, **Đang cọc giữ phòng**. Bấm vào ô mở danh sách phòng theo trạng thái và cơ sở đang lọc. Thống kê phòng là hiện tại; bộ lọc tháng dành cho tài chính. Phòng giữ cọc không bị cộng vào phòng trống.

Ngày nhắc nhập điện/nước và tạo hóa đơn chọn được 1–31. Ngày tạo hóa đơn không trước ngày nhập số. Nếu tháng thiếu ngày đã chọn, nhắc vào ngày cuối tháng: ngày 31 thành 30/11, 28/02 hoặc 29/02 năm nhuận. Mục **Tài khoản nhận tiền** đã được bỏ khỏi trang Cài đặt; không xóa thông tin lịch sử thanh toán trong SQL.

Các file chính: `dashboard.js`, `DashboardOverviewQuery.cs`, `settings.js`, `SettingsService.cs`, `_admin.scss`.

## 4. Tìm phòng ở trang khách

`/rooms` hỗ trợ từ khóa không dấu, tỉnh/thành, phường/xã, khoảng ngân sách; phần chi tiết có giá từ–đến, diện tích tối thiểu, số người, loại phòng và nhiều tiện ích. Nhiều tiện ích nghĩa là phòng phải có đủ các tiện ích đã chọn. Giá biên được chia để các khoảng ngân sách không chồng nhau.

Lọc/sắp xếp trước phân trang ở backend, giữ điều kiện trên URL để tải lại/chia sẻ. Đổi tỉnh xóa phường cũ; đổi điều kiện về trang 1. Tìm từ khóa có debounce và hủy truy vấn cũ; kết quả trả chậm không ghi đè lựa chọn mới. Có chip bỏ từng điều kiện và nút xóa tất cả.

Mặc định chỉ hiện phòng trống đã đăng, thuộc cơ sở hoạt động và chưa có hợp đồng hiện tại. Phòng giữ cọc có thể xem qua link chi tiết/yêu thích với nhãn đang giữ, nhưng không được liệt kê là phòng trống. Backend lấy dữ liệu tin công khai bằng một truy vấn, tránh gọi chi tiết admin cho từng phòng.

Các file chính: `pages/customer/rooms/list.js`, `common.js`, `_customer.scss`, `PublicRoomSearch.cs`, `PublicListings.cs`, `PublicController.cs`.

## Kiểm tra

```powershell
cd frontend
npm run build
npm run test:access
cd ..
dotnet test backend/SmartRent.sln
python backend/tests/run_full_backend.py
```

Trên Windows, tắt tiến trình API đang chạy trước khi build lại DLL. Runner HTTP dùng đúng source gốc và database kiểm thử tạm, không nhập dữ liệu giả vào database đang dùng. Runner kiểm tra hợp đồng thiếu ngày sinh, khách đủ điều kiện, giữ cọc/rollback, địa chỉ, lọc phòng, dashboard, ngày nhắc 31 và SQL dashboard ở tháng 28/29/30/31 ngày. `database/tests/run_checks.py` kiểm tra baseline mới, nghiệp vụ, quyền runtime và giao dịch đồng thời.

Kết quả kiểm tra ngày 13/11/2026: build frontend/backend thành công; 273 thao tác HTTP cùng các assertion qua; 103 kiểm tra SQL, 10 kịch bản nghiệp vụ, 3 kiểm tra đồng thời và 5 kiểm tra quyền runtime qua. Bộ xUnit: 147 qua, 12 integration test tùy chọn bị bỏ qua do chưa bật cấu hình riêng. `test:access` và `check:contract` qua.

Giới hạn của bộ kiểm tra cũ: `npm run test:mock` vẫn dừng tại kịch bản tạo lịch xem trực tiếp (`confirmation_required`), vì fixture gọi endpoint cũ thay vì luồng hai bên xác nhận. Đây là bộ mock riêng; các luồng API/PostgreSQL nêu trên đã được chạy và đạt. Không coi bộ mock là đã đạt.
