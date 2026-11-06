# Bàn giao backend — baseline 13 bảng

Backend ASP.NET hiện còn khung; frontend đang chạy mock. Database mới dùng 13 bảng, một admin và các user. Đọc [schema và bộ cài](../database/README.md), [JSONB](../database/JSON_DATA.md), [quy tắc transaction](../database/THIET_KE_DATABASE.md) trước khi viết API.

## Ánh xạ API hiện tại

| Tên đang có trong frontend/DTO | Nơi lưu mới |
|---|---|
| tenants, tenantId, hồ sơ tài khoản | users; tenantId trả bằng users.id; fullName dựng từ display_name |
| organizations một phần tử | Dựng từ settings + admin + properties; không lưu tổ chức |
| roomTypes | Các cột room_type trên rooms |
| amenities/roomAmenities, roomImages | properties.amenity_options, rooms.amenities/images |
| chargeTypes/ratePlans/chargeRates | Các mục properties.rates, rooms.rates, contracts.versions[].rates |
| inquiries/viewings/reservations | bookings kind=viewing, appointments và hold_* |
| profileRequests/tenancyRequests | bookings kind=profile_change/renewal/checkout/transfer |
| tenancies/tenancyId | contracts; tenancyId dùng contracts.id |
| contract versions/attachments/residents | contracts.versions/attachments/occupants |
| meters/readings | Chỉ số trực tiếp trên invoices và snapshot contracts; không có bảng thiết bị |
| invoice lines | invoices.lines; total_amount do SQL sinh |
| allocations/deposits | payments.allocations và payments.kind |
| categories/ticket messages/events | tickets.category_code/messages/history |
| batch/export operations | Trả kết quả trực tiếp; idempotency trên invoices/payments |

Trang billing hiện cần meterId/readingId để xác định ô nhập. Khi triển khai adapter, tạo ID logic ổn định khác nhau cho điện và nước từ roomId + kind; readingId từ invoiceId + kind. Có thể dùng UUID xác định nếu giữ kiểu Guid trên controller. Xác minh các ID đó thuộc phòng/tháng được phép trước khi ghi. API sửa số cập nhật invoices draft và correction_reason. Không tạo lại bảng công tơ theo tên endpoint.

Tháng vừa mở có thể chưa có hóa đơn. API nhập số tạo placeholder draft với lines rỗng cho contract/tháng. API tạo hóa đơn tính lại giá, lượng, ngày và lines rồi phát hành. Đây là cùng dòng invoices, không tạo bản nháp thứ hai.

## Công việc triển khai

1. Map 13 entity và các JSONB theo [từ điển](../database/TU_DIEN_DU_LIEU.md). users là store riêng; không tự sinh thêm các bảng Identity/RBAC.
2. Triển khai auth, hash password, token một lần, đúng cửa đăng nhập; kiểm tra ownership.
3. Cơ sở/phòng → lịch xem → khách/hợp đồng → kỳ/hóa đơn → thanh toán/cọc → hỗ trợ/thông báo/cài đặt.
4. Khóa dòng trước khi cập nhật mảng JSONB; không tin authorId/confirmedBy/userId từ client.
5. Dùng transaction bao cả SaveChanges và Commit; số dư có deferred constraint. Xử lý lỗi PostgreSQL thành Problem Details.
6. Thêm integration tests API rồi mới chuyển VITE_DATA_SOURCE=api.

Đăng ký khách có thể trùng hồ sơ chưa kích hoạt: xác minh email/invitation token trước khi cập nhật dòng users; không gộp chỉ theo phone. File private cần URL tải có thời hạn sau kiểm tra quan hệ tới users/contracts/payments/tickets.

Trả phòng là một transaction: final invoice, offset/refund, final_readings, đóng occupants/contracts. Gia hạn nối phiên bản ký mới, giữ nguyên snapshot cũ. Duyệt đề nghị chỉ đổi trạng thái đề nghị, không tự ký hoặc trả phòng.

Idempotency-Key cho hóa đơn/khoản thu được lưu trên chính chứng từ với request_hash. Cùng key khác hash trả 409. Batch trả {summary,items} theo phòng; không lưu bảng tác vụ. CSV truy vấn theo bộ lọc rồi trả file.

Runtime SQL cấp qua configure_runtime; không dùng postgres trong API. SET LOCAL smartrent.user_id từ phiên đã xác thực. View hỗ trợ không phải RLS toàn bộ; API vẫn kiểm tra truy vấn bảng gốc, JSONB và download. Không gửi toàn bộ contracts/JSON phiên bản cho người ở cùng.

[Phạm vi trang](FRONTEND_COVERAGE.md), [chi tiết theo route](../database/DOI_CHIEU_TUNG_TRANG.md), [hướng dẫn theo controller](<../backend/HUONG_DAN_CODE _BACKEND_THEO_TRANG.md>).
