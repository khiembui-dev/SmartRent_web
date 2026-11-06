# Các file tạo và sửa cho Ticket

Đường dẫn backend trong bảng tính từ thư mục `backend`. Comment tại từng hàm/nhóm lệnh giải thích mục đích, dữ liệu và kiểm tra quyền.

| File | Thao tác | Chức năng |
|---|---|---|
| `src/SmartRent.Api/Features/Tickets/TicketContracts.cs` | Tạo | Request/query models, lỗi nghiệp vụ, SLA và state machine. |
| `src/SmartRent.Api/Features/Tickets/TicketApiController.cs` | Tạo | Xác thực token, kiểm tra role, lỗi HTTP và lỗi ô form. |
| `src/SmartRent.Api/Features/Tickets/TicketSql.cs` | Tạo | Ownership, JSON DTO, lọc ghi chú nội bộ, dựng tác giả/ảnh/timeline. |
| `src/SmartRent.Api/Features/Tickets/TicketRepository.cs` | Tạo | Tìm/lọc/phân trang/chi tiết, phòng khách và danh mục Ticket. |
| `src/SmartRent.Api/Features/Tickets/TicketRepository.Writes.cs` | Tạo | Tạo chống trùng, hội thoại, phân công, trạng thái, khóa dòng và notification. |
| `src/SmartRent.Api/Features/Tickets/TicketsController.cs` | Sửa | API quản trị Ticket cho admin. |
| `src/SmartRent.Api/Features/Tickets/PortalTicketsController.cs` | Sửa | API khách tạo/xem/trả lời/xác nhận/mở lại. |
| `src/SmartRent.Api/Features/Files/TicketFileStore.cs` | Tạo | Lưu ảnh private, kiểm tra định dạng/dung lượng và quyền đọc/gắn ảnh. |
| `src/SmartRent.Api/Features/Files/FilesController.cs` | Sửa | Upload multipart, link xem ảnh có hạn, content có kiểm tra quyền. |
| `src/SmartRent.Api/Features/Contracts/PortalTenanciesController.cs` | Sửa | Trả hợp đồng/phòng để form khách chọn đúng nơi đang ở. |
| `src/SmartRent.Api/Features/Catalog/PortalCatalogController.cs` | Sửa | Bốn loại sự cố cho form khách. |
| `src/SmartRent.Api/Features/Catalog/CatalogController.cs` | Sửa | Danh mục Ticket và admin cho hộp phân công. |
| `src/SmartRent.Api/Features/Notifications/NotificationsController.cs` | Sửa | Số chưa đọc, danh sách, đánh dấu notification của đúng người nhận. |
| `src/SmartRent.Api/Features/Auth/AdminPasswordSetup.cs` | Bổ sung | Lệnh Development đặt hash mật khẩu khách có sẵn bằng email, thu hồi phiên cũ. |
| `src/SmartRent.Api/Program.cs` | Bổ sung | DI repository/store, DataProtection, lệnh đặt mật khẩu khách. |
| `../frontend/src/pages/admin/tickets.js` | Sửa | expectedStatus chống thao tác cũ; bỏ phản hồi cũ khi đổi lựa chọn nhanh. |
| `../frontend/src/pages/customer/tickets/new.js` | Sửa | Chặn gửi khi ảnh chưa upload xong hoặc bị lỗi. |
| `../frontend/src/components/uploader.js` | Sửa | Trạng thái hasErrors để form không bỏ ảnh lỗi âm thầm. |
| `../database/01_schema.sql` | Sửa | Hai cột chống trùng và unique index trong tickets; không thêm bảng. |
| `../database/02_rules.sql` | Sửa | Trigger history lưu loại sự kiện, actor và reason. |
| `../database/06_ticket_backend.sql` | Tạo | Migration database có sẵn, không xóa dữ liệu. |
| `tests/SmartRent.Api.Tests/TicketRulesTests.cs` | Tạo | Test trạng thái hợp lệ/sai và SLA. |
| `tests/ticket_flow.py` | Tạo | Kiểm thử HTTP + PostgreSQL thật, fixture riêng và tự dọn. |
| `HUONG_DAN_TICKET_ADMIN_KHACH.md` | Cập nhật | Luồng code đã chạy, phân quyền và lệnh kiểm tra. |
| `README.md` | Cập nhật | Trạng thái backend và hướng dẫn bắt đầu Ticket. |
| `../.gitignore` | Sửa | Không đưa ảnh private App_Data lên GitHub. |
| `../database/README.md`, `../database/JSON_DATA.md` | Cập nhật | Migration, JSON history và chống trùng. |
| `../database/schema.catalog.json`, `../database/TU_DIEN_DU_LIEU.md` | Sinh lại | Đồng bộ hai cột/index Ticket với PostgreSQL sau migration. |

ERD được đối chiếu lại; quan hệ vẫn như cũ và số bảng vẫn 13 nên sơ đồ không đổi.

Các file Auth/Dashboard đã sửa ở lượt trước vẫn có trong working tree; chúng không phải phần Ticket mới của lượt này.
