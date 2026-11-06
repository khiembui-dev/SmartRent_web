# Trang và chức năng hiện tại

Source có **40 route**, thuộc khu khách và khu admin; chỉ hai role admin/user. Subpage thêm/sửa/chi tiết vẫn giữ trong từng khu. Không có khu quản trị hệ thống hoặc màn hình phân quyền nhân viên.

Database hiện hành **13 bảng**. Bảng dưới mô tả chức năng đang có; [checklist từng route](../database/DOI_CHIEU_TUNG_TRANG.md) chỉ rõ cột lưu trữ và [audit](../database/SOURCE_AUDIT.json) ghi lời gọi API.

## Khu khách

| Trang | Chức năng | Dữ liệu mới |
|---|---|---|
| / | Giới thiệu, tìm nhanh, phòng nổi bật, thông tin liên hệ | properties, rooms, settings, users (admin công khai) |
| /rooms | Tìm/lọc theo khu vực, giá, loại, diện tích/tiện ích, phân trang; xem yêu cầu đã gửi | properties, rooms, bookings |
| /rooms/:slug | Ảnh/video, thông tin, nội quy, giá/cọc; đăng nhập để gửi lịch xem | rooms, properties, bookings, files |
| /contact | Thông tin và cách liên hệ chủ trọ | users, settings, properties |
| /login, /register | Đăng nhập/tạo tài khoản khách; admin không vào cửa khách | users, auth_tokens |
| /forgot-password, /reset-password | Yêu cầu và đặt lại mật khẩu | users, auth_tokens |
| /contract | Thông tin phòng/hợp đồng; người đại diện xem tài chính/bản ký; đề nghị gia hạn/trả phòng và hủy đề nghị | contracts, bookings, payments, files |
| /invoices, /invoices/:id | Danh sách/chi tiết, số điện nước, tiền còn nợ, in, báo chuyển khoản và ảnh chứng từ | invoices, payments, settings, files |
| /tickets, /tickets/new, /tickets/:id | Tạo/xem hỗ trợ theo phòng, gửi ảnh/tin nhắn, xem tiến độ/xác nhận giải quyết | tickets, files |
| /account | Hồ sơ, giấy tờ che, đề nghị sửa email/phone | users, bookings |
| /notifications | Thông báo, đánh dấu đã đọc | notifications |

Khách chưa thuê phòng vẫn được tìm phòng và gửi yêu cầu xem. Các trang hợp đồng/hóa đơn/hỗ trợ yêu cầu quan hệ thuê phù hợp. Người ở cùng không có quyền tài chính của người đại diện.

## Khu admin

| Nhóm trang | Chức năng đang có | Dữ liệu mới |
|---|---|---|
| /admin/login, /admin/forgot-password, /admin/reset-password | Cửa đăng nhập và phục hồi tài khoản chủ trọ duy nhất | users, auth_tokens |
| /admin | Tổng quan phòng/thu/nợ/cọc, lịch xem, việc cần xử lý, tiến độ tháng | Truy vấn tổng hợp các bảng nghiệp vụ |
| /admin/properties, /new, /:id, /:id/edit | Cơ sở, địa chỉ, giá mặc định, ngày tính tiền, bật/tắt; xem phòng của cơ sở | properties, rooms |
| /admin/rooms, /new, /:id, /:id/edit | Phòng, giá/cọc, tiện ích, ảnh/bìa, tin đăng, trạng thái, khách hiện tại, nhập phòng đã có khách, hủy giữ chỗ | rooms, properties, contracts, bookings, tickets, files |
| /admin/viewings | Danh sách yêu cầu, xếp/hẹn lại lịch, kết quả, từ chối/hủy và tạo hợp đồng | bookings, users, rooms, contracts |
| /admin/tenants, /:id | Tìm/lọc khách, hồ sơ, cảnh báo trùng, tài khoản/lời mời, đề nghị sửa liên hệ, hợp đồng/nợ/cọc/ticket, CSV | users, auth_tokens, bookings, contracts, invoices, payments, tickets |
| /admin/contracts, /new, /:id | Nhận phòng/bổ sung bản ký, giá chốt, cọc, ở cùng, bàn giao, tệp, gia hạn, duyệt đề nghị, trả phòng và lưu trữ | contracts, users, rooms, bookings, invoices, payments, files |
| /admin/billing | Chọn cơ sở/tháng, xem số trước, nhập/sửa số điện/nước, cảnh báo bất thường, tạo hóa đơn một/nhiều phòng, khóa/mở tháng | billing_periods, invoices, contracts, rooms, properties |
| /admin/invoices, /:id | Lọc/tìm, chi tiết, nháp/phát hành/hủy, tiền thu/nợ, báo chuyển khoản chờ xác nhận, thu/hoàn tác, in/CSV | invoices, payments, contracts, users, settings, files |
| /admin/tickets, /:id | Hộp thư, lọc, phân công cho admin, hạn xử lý, đổi trạng thái, trao đổi/ảnh, ghi chú nội bộ, giải quyết/đóng/mở lại | tickets, files |
| /admin/settings | Hồ sơ admin, avatar/mật khẩu và lịch nhắc nhập số/tạo hóa đơn | users, auth_tokens, files, settings |

/new, /:id và /:id/edit trong bảng là hậu tố của đường dẫn nhóm. Danh sách chính xác 40 route ở checklist.

## Cách lưu sau khi gộp

Cơ sở/phòng/giá đúng 2 bảng. Tiện ích/ảnh/giá/tin đăng nằm trong rooms, giá/danh mục mặc định trong properties. Hồ sơ khách nằm ngay users. bookings giữ cả yêu cầu, lịch hẹn, giữ chỗ và đề nghị; trang lịch xem chỉ lọc kind=viewing.

contracts chứa các bản ký và gia hạn trong versions, tệp trong attachments, người ở cùng trong occupants. invoices chứa số điện/nước và lines; billing_periods giữ trạng thái tháng. payments gom thanh toán, cọc và allocations. tickets gom loại và messages/history.

Không còn bảng nhật ký/tác vụ chung. Lịch sử cần hiện nằm ở hồ sơ tương ứng. Batch trả kết quả ngay; xuất CSV/in không cần bảng riêng. Loại sự cố cố định; các chức năng chưa có form quản lý không tạo thêm phân hệ.

## Trạng thái kết nối

Thay database chưa đổi cách frontend lưu mock/localStorage. Các tên API/DTO tenant/tenancy/meter còn trong source; backend cần [adapter](BACKEND_HANDOFF.md) sang 13 bảng. Kiểm tra SQL/checklist không thay thế integration tests API thật. OpenAPI/mock còn phương thức không được trang gọi; xem audit trước khi triển khai.
