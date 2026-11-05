# Phân tích luồng theo source hiện tại

Phạm vi: 40 route trong frontend/src/router/routes.js, 10 nhóm quản trị và khu khách; chỉ admin/user. [Audit](SOURCE_AUDIT.json) lưu dấu vết 164 file source và các lời gọi API. [Checklist](DOI_CHIEU_TUNG_TRANG.md) nối 63 mục chức năng tới 13 bảng.

## Hành trình khách

1. Xem trang chủ, tìm/lọc phòng, xem ảnh/giá/nội quy và liên hệ: properties, rooms, settings, thông tin công khai admin trong users.
2. Đăng ký/đăng nhập: users + auth_tokens. Admin không đăng nhập cửa khách.
3. Gửi lịch xem từ trang phòng: bookings kind=viewing với giờ mong muốn, số người và liên hệ. Xem yêu cầu đã gửi; chưa phát sinh hợp đồng hoặc cọc.
4. Sau khi thuê: xem hợp đồng của mình, hóa đơn, báo chuyển khoản có ảnh chứng từ, gửi hỗ trợ và nhận thông báo.
5. Xin gia hạn/trả phòng hoặc đổi phone/email: bookings kind tương ứng. Admin duyệt đề nghị rồi thực hiện nghiệp vụ hợp đồng riêng.

Người ở cùng được xác định từ contracts.occupants, không có role riêng. Chỉ người đại diện xem tài chính của hợp đồng.

## Hành trình chủ trọ

1. Cơ sở: thêm địa chỉ, giá mặc định, ngày tính tiền. Chỉ một bảng properties.
2. Phòng: thêm thông tin, kế thừa/đặt giá riêng, tiện ích, ảnh, cọc; đăng/ẩn tin ngay trên rooms. Không có trang tin đăng riêng.
3. Lịch xem: danh sách bookings kind=viewing; xếp/hẹn lại lịch bằng appointments; ghi đã xem/không đến/hủy; tạo hợp đồng từ yêu cầu phù hợp. Giữ chỗ là các cột hold_* trên cùng dòng.
4. Khách thuê: thêm/sửa users role=user; hồ sơ chưa có tài khoản là login_enabled=false. Mời kích hoạt, xem giấy tờ che, hợp đồng/nợ/cọc/sự cố.
5. Hợp đồng: một dòng contracts cho cả đợt ở và hồ sơ hợp đồng; bản ký/gia hạn trong versions, người ở cùng trong occupants, tệp bổ sung trong attachments. Nhập khách đang ở nhưng thiếu giấy tờ dùng onboarding_mode=import.
6. Tính tiền: chọn cơ sở/tháng billing_periods; nhập đầu/cuối điện nước vào hóa đơn nháp. Bấm tạo hóa đơn tính lại lines rồi phát hành.
7. Hóa đơn: lọc nháp/đã phát hành/nợ/quá hạn; in/CSV; xác nhận hoặc từ chối báo chuyển khoản; ghi thu và hoàn tác bằng payments.
8. Trả phòng: ghi số cuối trong contracts.final_readings và invoices final, bù cọc vào hóa đơn, hoàn phần dư, đóng người ở cùng và hợp đồng. Có lý do nếu còn nợ.
9. Hỗ trợ: tickets chứa loại, ảnh, hội thoại, ghi chú nội bộ và tiến độ. Admin nhận/xử lý/chờ/giải quyết/đóng/mở lại.
10. Cài đặt: sửa thông tin admin, mật khẩu, avatar và lịch nhắc nhập số/tạo hóa đơn.

## Tổng quan và trạng thái

Dashboard truy vấn rooms/contracts/bookings/invoices/payments/tickets; không có bảng dashboard. Phòng đã thuê được suy ra từ hợp đồng đang active. Sắp hết hạn dựa ends_on; quá hạn hóa đơn dựa due_on và số dư. Cọc là tiền đang giữ, không tự coi là doanh thu.

Thông báo dùng notifications của từng user. Tài liệu/thông tin ngân hàng dùng files/settings. Tệp nhị phân ở storage, không đặt giấy tờ riêng trong thư mục public.

## Phần gộp theo yêu cầu

| Phần | Cách lưu hiện hành |
|---|---|
| Hồ sơ khách và tài khoản | users |
| Tiện ích, ảnh, loại phí, giá, tin phòng | rooms; giá/danh mục mặc định trong properties |
| Yêu cầu xem, lịch hẹn, giữ chỗ, đề nghị | bookings, phân biệt kind và hold_status |
| Đợt thuê, bản ký, gia hạn, tệp và ở cùng | contracts |
| Chỉ số điện nước và chi tiết hóa đơn | invoices; trạng thái tháng trong billing_periods |
| Thu tiền, phân bổ, thu/hoàn/bù cọc | payments |
| Loại sự cố, hội thoại và tiến độ | tickets |
| Lịch sử cần hiện trên trang | JSONB trên chính hồ sơ liên quan |
| Batch và xuất CSV | Kết quả trả ngay; không có bảng lưu tác vụ |

Không còn bảng công tơ và chỉ số riêng. Giao diện vẫn nhập điện/nước; DTO hiện có meterId/readingId cần adapter trên backend. Không duy trì vòng đời thay/lắp công tơ vì source hiện tại không có trang quản lý thiết bị.

Baseline chỉ phục vụ chức năng hiện tại: không có tổ chức/nhân viên/quản trị hệ thống, tích hợp AI/ngân hàng/ký số/SMTP hoặc danh mục phân quyền. Một số API cũ trong mock/OpenAPI chưa được trang gọi không mở rộng phạm vi database.

## Trạng thái thực thi

SQL mới được kiểm tra độc lập trên PostgreSQL 16. Frontend vẫn dùng mock/localStorage và chưa được kết nối với schema. Số route và feature là kiểm tra phạm vi lưu trữ; chưa phải kết quả kiểm thử tích hợp API thật.
