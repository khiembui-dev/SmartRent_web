# Hướng dẫn code backend theo từng trang — baseline 13 bảng

Nguồn: router/routes.js, trang và helper hiện tại; 40 route, 63 mục chức năng. Tên endpoint/DTO cũ được giữ để tích hợp giao diện, không dùng làm lý do tạo lại bảng đã gộp. Backend hiện còn khung controller.

Đọc [database](../database/README.md), [JSONB](../database/JSON_DATA.md), [quy tắc transaction](../database/THIET_KE_DATABASE.md), [adapter API](../docs/BACKEND_HANDOFF.md).

## Bảng và module nghiệp vụ

| Module hiện có | Bảng/cột triển khai |
|---|---|
| Auth, Tenants | users + auth_tokens; hồ sơ và đăng nhập trên cùng user |
| Catalog, Properties, Rooms, PublicSite | properties, rooms; danh mục/ảnh/giá là JSONB |
| Viewings | bookings, appointments và hold_* |
| Contracts | contracts; versions, attachments, occupants, bàn giao; đề nghị dùng bookings |
| Billing, Invoices | billing_periods, invoices; chỉ số và lines cùng dòng hóa đơn |
| Payments | payments; kind phân biệt thu/cọc/hoàn tác, allocations là JSONB |
| Tickets | tickets; loại cố định, messages/history trong hồ sơ |
| Files, Settings, Notifications | files, settings, notifications |
| Dashboard, Exports | Truy vấn tổng hợp/CSV; không thêm bảng |

## Từng route

Bảng ghi API gọi trực tiếp từ file trang. Lời gọi qua component/helper, trường form và bảng/cột chi tiết được lưu trong [SOURCE_AUDIT.json](../database/SOURCE_AUDIT.json) và [checklist](../database/DOI_CHIEU_TUNG_TRANG.md).

| Route | Chức năng | Bảng | API gọi trực tiếp |
|---|---|---|---|
| `/` | Tìm/xem phòng và liên hệ | `files`, `properties`, `rooms`, `settings`, `users` | `publicApi.filters`, `publicApi.rooms` |
| `/rooms` | Tìm/xem phòng và liên hệ; Yêu cầu/lịch xem/giữ chỗ | `bookings`, `contracts`, `files`, `properties`, `rooms`, `settings`, `users` | `portalApi.inquiries`, `publicApi.filters`, `publicApi.rooms` |
| `/rooms/:slug` | Tìm/xem phòng và liên hệ; Yêu cầu/lịch xem/giữ chỗ | `bookings`, `contracts`, `files`, `properties`, `rooms`, `settings`, `users` | `portalApi.createInquiry`, `portalApi.inquiries`, `publicApi.room` |
| `/contact` | Tìm/xem phòng và liên hệ | `files`, `properties`, `rooms`, `settings`, `users` | `publicApi.contactInfo` |
| `/invoices` | Đăng nhập/đăng ký/phục hồi mật khẩu; Hóa đơn, thu tiền, báo chuyển khoản | `auth_tokens`, `invoices`, `payments`, `settings`, `users` | `portalApi.invoices`, `portalApi.overview` |
| `/invoices/:id` | Đăng nhập/đăng ký/phục hồi mật khẩu; Hóa đơn, thu tiền, báo chuyển khoản | `auth_tokens`, `invoices`, `payments`, `settings`, `users` | `portalApi.catalog`, `portalApi.invoice`, `portalApi.reportPayment` |
| `/tickets` | Đăng nhập/đăng ký/phục hồi mật khẩu; Sự cố và trao đổi | `auth_tokens`, `tickets`, `users` | `portalApi.tickets` |
| `/tickets/new` | Đăng nhập/đăng ký/phục hồi mật khẩu; Sự cố và trao đổi | `auth_tokens`, `tickets`, `users` | `portalApi.catalog`, `portalApi.createTicket` |
| `/tickets/:id` | Đăng nhập/đăng ký/phục hồi mật khẩu; Sự cố và trao đổi | `auth_tokens`, `tickets`, `users` | `filesApi.downloadUrl`, `portalApi.confirmTicket`, `portalApi.messageTicket`, `portalApi.reopenTicket`, `portalApi.ticket` |
| `/contract` | Đăng nhập/đăng ký/phục hồi mật khẩu; Hợp đồng, nhận phòng, gia hạn, trả phòng | `auth_tokens`, `bookings`, `contracts`, `files`, `invoices`, `payments`, `users` | `filesApi.downloadUrl`, `portalApi.cancelRequest`, `portalApi.createRequest`, `portalApi.requests`, `portalApi.tenancy` |
| `/account` | Đăng nhập/đăng ký/phục hồi mật khẩu; Hồ sơ và cài đặt | `auth_tokens`, `bookings`, `files`, `settings`, `users` | `authApi.changePassword`, `portalApi.cancelProfileChange`, `portalApi.profile`, `portalApi.requestProfileChange` |
| `/notifications` | Thông báo | `notifications` | `notificationsApi.list`, `notificationsApi.read`, `notificationsApi.readAll` |
| `/admin/login` | Đăng nhập/đăng ký/phục hồi mật khẩu | `auth_tokens`, `users` | Qua helper/component dùng chung |
| `/admin/forgot-password` | Đăng nhập/đăng ký/phục hồi mật khẩu | `auth_tokens`, `users` | `authApi.forgotPassword` |
| `/admin/reset-password` | Đăng nhập/đăng ký/phục hồi mật khẩu | `auth_tokens`, `users` | `authApi.resetPassword` |
| `/login` | Đăng nhập/đăng ký/phục hồi mật khẩu | `auth_tokens`, `users` | Qua helper/component dùng chung |
| `/register` | Đăng nhập/đăng ký/phục hồi mật khẩu | `auth_tokens`, `users` | Qua helper/component dùng chung |
| `/forgot-password` | Đăng nhập/đăng ký/phục hồi mật khẩu | `auth_tokens`, `users` | `authApi.forgotPassword` |
| `/reset-password` | Đăng nhập/đăng ký/phục hồi mật khẩu | `auth_tokens`, `users` | `authApi.resetPassword` |
| `/admin` | Tổng quan; Thông báo | `bookings`, `contracts`, `invoices`, `notifications`, `payments`, `rooms`, `settings`, `tickets` | `dashboardApi.get` |
| `/admin/properties` | Cơ sở và giá mặc định | `properties`, `rooms` | `propertiesApi.list`, `propertiesApi.remove` |
| `/admin/properties/new` | Cơ sở và giá mặc định | `properties`, `rooms` | `propertiesApi.create`, `propertiesApi.get`, `propertiesApi.update` |
| `/admin/properties/:id` | Cơ sở và giá mặc định; Phòng, tiện ích, ảnh, giá, tin đăng | `bookings`, `contracts`, `files`, `properties`, `rooms`, `tickets` | `propertiesApi.activate`, `propertiesApi.deactivate`, `propertiesApi.get`, `propertiesApi.remove`, `roomsApi.list` |
| `/admin/properties/:id/edit` | Cơ sở và giá mặc định | `properties`, `rooms` | `propertiesApi.create`, `propertiesApi.get`, `propertiesApi.update` |
| `/admin/rooms` | Phòng, tiện ích, ảnh, giá, tin đăng | `bookings`, `contracts`, `files`, `properties`, `rooms`, `tickets` | `roomsApi.list`, `roomsApi.remove`, `roomsApi.setStatus` |
| `/admin/rooms/new` | Phòng, tiện ích, ảnh, giá, tin đăng; Cơ sở và giá mặc định; Hồ sơ và tài khoản khách | `auth_tokens`, `bookings`, `contracts`, `files`, `invoices`, `payments`, `properties`, `rooms`, `tickets`, `users` | `catalogApi.create`, `propertiesApi.get`, `roomsApi.arrangeImages`, `roomsApi.create`, `roomsApi.get`, `roomsApi.removeImage`, `roomsApi.setStatus`, `roomsApi.update` |
| `/admin/rooms/:id` | Phòng, tiện ích, ảnh, giá, tin đăng; Hợp đồng, nhận phòng, gia hạn, trả phòng; Sự cố và trao đổi | `bookings`, `contracts`, `files`, `invoices`, `payments`, `properties`, `rooms`, `tickets` | `contractsApi.list`, `reservationsApi.cancel`, `roomsApi.get`, `roomsApi.remove`, `roomsApi.saveListing`, `roomsApi.setStatus`, `tenanciesApi.cancelImport` |
| `/admin/rooms/:id/edit` | Phòng, tiện ích, ảnh, giá, tin đăng; Cơ sở và giá mặc định; Hồ sơ và tài khoản khách | `auth_tokens`, `bookings`, `contracts`, `files`, `invoices`, `payments`, `properties`, `rooms`, `tickets`, `users` | `catalogApi.create`, `propertiesApi.get`, `roomsApi.arrangeImages`, `roomsApi.create`, `roomsApi.get`, `roomsApi.removeImage`, `roomsApi.setStatus`, `roomsApi.update` |
| `/admin/viewings` | Yêu cầu/lịch xem/giữ chỗ | `bookings`, `contracts`, `users` | `inquiriesApi.list`, `inquiriesApi.scheduleViewing`, `inquiriesApi.transition`, `viewingsApi.list`, `viewingsApi.result` |
| `/admin/billing` | Nhập điện nước, khóa tháng, tạo hóa đơn | `billing_periods`, `contracts`, `invoices`, `properties`, `rooms` | `invoicesApi.createBatch`, `metersApi.correct`, `metersApi.recordBatch`, `periodsApi.create`, `periodsApi.list`, `periodsApi.lock`, `periodsApi.unlock`, `periodsApi.worksheet`, `settingsApi.billingSchedule` |
| `/admin/tenants` | Hồ sơ và tài khoản khách; CSV/in | `auth_tokens`, `bookings`, `contracts`, `invoices`, `payments`, `tickets`, `users` | `tenantsApi.list` |
| `/admin/tenants/:id` | Hồ sơ và tài khoản khách; Hợp đồng, nhận phòng, gia hạn, trả phòng; Hóa đơn, thu tiền, báo chuyển khoản; Sự cố và trao đổi | `auth_tokens`, `bookings`, `contracts`, `files`, `invoices`, `payments`, `settings`, `tickets`, `users` | `contractsApi.list`, `profileRequestsApi.approve`, `profileRequestsApi.reject`, `tenantsApi.get`, `tenantsApi.invitePortal` |
| `/admin/contracts` | Hợp đồng, nhận phòng, gia hạn, trả phòng | `bookings`, `contracts`, `files`, `invoices`, `payments` | `contractsApi.list` |
| `/admin/contracts/new` | Hợp đồng, nhận phòng, gia hạn, trả phòng; Hồ sơ và tài khoản khách; Phòng, tiện ích, ảnh, giá, tin đăng | `auth_tokens`, `bookings`, `contracts`, `files`, `invoices`, `payments`, `properties`, `rooms`, `tickets`, `users` | `contractsApi.addAttachment`, `inquiriesApi.get`, `inquiriesApi.linkTenant`, `propertiesApi.get`, `roomsApi.get`, `roomsApi.list`, `tenanciesApi.checkIn`, `tenanciesApi.get`, `tenanciesApi.importContract`, `tenantsApi.get` |
| `/admin/contracts/:id` | Hợp đồng, nhận phòng, gia hạn, trả phòng; Hóa đơn, thu tiền, báo chuyển khoản | `bookings`, `contracts`, `files`, `invoices`, `payments`, `settings` | `contractsApi.addAttachment`, `contractsApi.archive`, `contractsApi.createVersion`, `contractsApi.get`, `contractsApi.removeAttachment`, `contractsApi.signVersion`, `contractsApi.updateVersion`, `filesApi.downloadUrl`, `tenanciesApi.checkout`, `tenanciesApi.checkoutPreview`, `tenanciesApi.depositReceipt`, `tenancyRequestsApi.approve`, `tenancyRequestsApi.reject` |
| `/admin/invoices` | Hóa đơn, thu tiền, báo chuyển khoản; CSV/in | `invoices`, `payments`, `settings`, `users` | `invoicesApi.list` |
| `/admin/invoices/:id` | Hóa đơn, thu tiền, báo chuyển khoản | `invoices`, `payments`, `settings` | `invoicesApi.get`, `invoicesApi.issue`, `invoicesApi.recompute`, `invoicesApi.removeDraft`, `invoicesApi.void`, `paymentsApi.confirm`, `paymentsApi.create`, `paymentsApi.reject`, `paymentsApi.reverseAllocation` |
| `/admin/tickets` | Sự cố và trao đổi | `tickets` | `filesApi.downloadUrl`, `ticketsApi.assign`, `ticketsApi.get`, `ticketsApi.list`, `ticketsApi.message`, `ticketsApi.transition` |
| `/admin/tickets/:id` | Sự cố và trao đổi | `tickets` | `filesApi.downloadUrl`, `ticketsApi.assign`, `ticketsApi.get`, `ticketsApi.list`, `ticketsApi.message`, `ticketsApi.transition` |
| `/admin/settings` | Hồ sơ và cài đặt; Đăng nhập/đăng ký/phục hồi mật khẩu | `auth_tokens`, `bookings`, `files`, `settings`, `users` | `authApi.changePassword`, `authApi.updateProfile`, `filesApi.upload`, `settingsApi.billingSchedule`, `settingsApi.saveBillingSchedule` |

## Quy tắc triển khai bắt buộc

- Chỉ admin/user; kiểm tra đúng cửa đăng nhập và quyền sở hữu mỗi dữ liệu. Không có mô hình thành viên tổ chức.
- users.login_enabled=false là hồ sơ chưa kích hoạt; kích hoạt trên cùng ID sau xác minh email/lời mời.
- DTO tenantId và tenancyId ánh xạ lần lượt users.id và contracts.id. Hợp đồng import có thể chưa có bản ký.
- Lịch xem lọc bookings.kind=viewing; đề nghị sửa hồ sơ/gia hạn/trả phòng dùng các kind khác trong cùng bảng.
- JSONB phải được kiểm tra theo JSON_DATA.md; SELECT FOR UPDATE hoặc UPDATE nguyên tử trước khi sửa mảng.
- Giá được tính lại ở server; invoice total do SQL sinh. Nhập số trước tạo lines dùng hóa đơn draft.
- payments confirmed mới giảm nợ/tăng cọc; hoàn tác thêm dòng mới. Bù/hoàn cọc không ghi trùng dòng tiền.
- Gia hạn nối versions. Trả phòng là transaction gồm final invoice, bù/hoàn cọc, số cuối, đóng occupants/contracts.
- Context smartrent.user_id phải lấy từ phiên và SET LOCAL; view khách không thay kiểm tra ownership trên API.
- File private không trả URL công khai. Loại ghi chú nội bộ khỏi tickets.messages và lọc tài chính với người ở cùng.
- Idempotency nằm trong invoices/payments; batch trả kết quả theo phòng, CSV không tạo tác vụ.
- Bắt lỗi Commit của deferred constraints; chỉ trả thành công khi transaction đã commit.

## Thứ tự hoàn thiện API

Auth/files → cơ sở/phòng → hồ sơ/lịch xem → hợp đồng → tính tiền/hóa đơn → thanh toán/cọc → ticket/thông báo/tổng quan. Sau đó thêm integration tests và chuyển frontend sang API.

Không thực hiện theo hướng dẫn mô hình tổ chức, công tơ hay bảng con của cấu trúc trước. Danh sách schema chính xác nằm trong ERD và từ điển hiện hành.
