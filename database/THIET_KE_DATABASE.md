# Quy tắc sử dụng database 13 bảng

Nguồn chuẩn là 01_schema.sql, 02_rules.sql và [JSON_DATA.md](JSON_DATA.md). Dữ liệu có quan hệ nhiều dòng được đặt trong JSONB của hồ sơ chính theo yêu cầu thu gọn.

## Tài khoản và phạm vi dữ liệu

`users` vừa là tài khoản vừa là hồ sơ khách. `role=user` mặc định; admin duy nhất do owner tạo. SQL runtime không được đổi role hoặc tạo thêm admin. `login_enabled=false` cho hồ sơ chưa kích hoạt; không tạo email/mật khẩu giả để đáp ứng NOT NULL.

Backend phải kiểm tra password hash, is_active, login_enabled, locked_until và đúng cửa đăng nhập. Khu admin chỉ nhận admin; khu khách chỉ nhận user. Tên audience `customer` trong DTO là tên khu, không phải role. Đổi mật khẩu/khóa tài khoản thu hồi token.

Khi đăng ký trùng email hồ sơ chưa kích hoạt, phải xác minh quyền sở hữu email hoặc dùng invitation token trỏ đúng user; không tự gộp tài khoản chỉ vì trùng số điện thoại. Token reset/invitation dùng một lần, lưu hash và consumed_at trong transaction.

Đặt `smartrent.user_id` bằng `SET LOCAL`/set_config(...,true) từ phiên xác thực trong transaction. Các view v_user_* lọc theo context này. Đây là view hỗ trợ, chưa phải RLS cho mọi bảng. API kiểm tra ownership cho mọi truy vấn, mutation, CSV và download; không nhận user_id/authorId/confirmedBy từ client làm danh tính tin cậy.

Người ở cùng nằm trong contracts.occupants, vẫn role user. v_user_contracts chỉ trả thông tin ở và finance_visible; người ở cùng không được đọc giá/cọc/hóa đơn/bản ký của người đại diện. v_user_tickets loại tin nhắn nội bộ và không trả ghi chú xử lý nội bộ không cần thiết.

## Ghi JSONB an toàn

Khóa dòng hồ sơ bằng SELECT ... FOR UPDATE trước khi đọc-sửa danh sách JSONB trong transaction, hoặc dùng một UPDATE ghép JSONB trực tiếp. Không ghi đè mảng từ một bản đọc cũ vì có thể mất tin nhắn, phiên bản hoặc ảnh vừa được người khác thêm.

ID trong JSONB không có FOREIGN KEY tự động. Trigger kiểm tra các tham chiếu tệp, khách ở cùng, người ký và hóa đơn được phân bổ; backend vẫn kiểm tra cấu trúc DTO, loại tệp và quyền truy cập. Tài liệu JSON ghi rõ trường bắt buộc. Tệp gắn hồ sơ phải sạch; ảnh phòng public, chứng từ private. File đã gắn không xóa được; metadata nội dung của file bản ký bị khóa.

Bản đã ký trong contracts.versions và tin nhắn cũ trong tickets.messages không sửa/xóa. Giá và số tiền trên hóa đơn đã phát hành không đổi. Gia hạn thêm phiên bản mới. Hóa đơn đọc giá chốt trong phiên bản ký, sau đó giá phòng, rồi giá cơ sở; giá 0 là miễn phí, thiếu khoản mới là kế thừa.

Ngày dùng date, sự kiện dùng timestamptz, hiển thị Asia/Ho_Chi_Minh. Khoảng ngày [đầu,cuối); ngày hết hạn bao gồm trên form cần cộng một ngày khi lưu endsOn. Tiền VND numeric(16,0), chỉ số numeric(16,3); backend dùng decimal. Tổng hóa đơn sinh từ lines, không lấy total từ trình duyệt.

## Transaction theo thao tác

| Thao tác | Các bản ghi thay đổi cùng transaction |
|---|---|
| Đăng ký/kích hoạt | users, auth_tokens, notifications |
| Sửa phòng/ảnh/tiện ích/giá | rooms; properties nếu thêm lựa chọn tiện ích chung |
| Đặt lịch/hẹn lại | Một dòng bookings, mảng appointments, thông báo |
| Duyệt sửa liên hệ | Khóa bookings pending, so sánh changes.from, cập nhật users và trạng thái duyệt |
| Nhận phòng | contracts có versions/occupants/initial_readings; chuyển bookings; thu cọc bằng payments; notifications |
| Nhập phòng đang có khách | contracts onboarding_mode=import, có thể chưa có bản ký; onboarding_gaps ghi thông tin thiếu |
| Gia hạn | Khóa contracts; thêm versions, giữ nguyên các bản ký cũ |
| Nhập/sửa điện nước | Tạo/cập nhật invoices draft của hợp đồng/tháng; correction_reason khi sửa số đã nhập; trigger lưu readings_history |
| Phát hành hóa đơn | Tính lại giá/chỉ số ở server, điền lines/snapshot, chuyển issued và thông báo |
| Xác nhận khách báo chuyển | Chuyển payments pending sang confirmed với allocations đã kiểm tra |
| Thu tiền trực tiếp | Một payments receipt confirmed với allocations |
| Thu/hoàn cọc | Một payments deposit_receipt/deposit_refund, không có allocations |
| Bù cọc | Một payments deposit_offset, tổng allocations đúng amount |
| Hoàn tác | Thêm receipt_reversal hoặc deposit_offset_reversal trỏ giao dịch gốc; không sửa dòng đã xác nhận |
| Trả phòng | Hóa đơn cuối, bù nợ/hoàn cọc, final_readings, đóng occupants và contracts, thông báo |
| Hỗ trợ | Khóa tickets; nối messages, cập nhật trạng thái; history và notifications |

Hết hạn hợp đồng không tự trả phòng. `contracts.status=active` vẫn giữ phòng cho đến khi quyết toán. Chỉ có một hợp đồng chiếm phòng trong cùng khoảng ngày; giữ chỗ thật cũng chặn nhận phòng khác. Gọi expire_holds() để đóng giữ chỗ hết hạn trước các thao tác liên quan. Yêu cầu xem tự nó không giữ phòng.

Kỳ tháng vẫn là billing_periods riêng để khóa cả lúc chưa có invoices. Hóa đơn nháp có thể chưa có lines: dùng để lưu số đã nhập trước khi bấm tạo hóa đơn. Khi phát hành phải đủ dòng, giá trị đọc và quyền admin.

Số đầu phải khớp số cuối đã phát hành gần nhất hoặc số bàn giao ban đầu. Hóa đơn tháng/cuối cần đủ chỉ số cho các khoản metered trong bản ký áp dụng; sửa số nháp phải ghi lý do. Khoản thu đã phân bổ khi hoàn tác phải đồng thời giải phóng phần phân bổ tương ứng, không chỉ đảo số tiền thu.

Trả phòng sau khi đã thu trọn tháng dùng final + metered_only=true, chỉ thu điện nước chưa chốt. Khoảng ngày hiển thị có thể trùng hóa đơn tháng, đoạn điện nước thực tế không được tính lại. Hóa đơn 0 đồng được coi đã thanh toán; không tạo khoản thu 0.

## Sổ tiền và chống lặp

payments.kind có receipt, receipt_reversal, deposit_receipt, deposit_refund, deposit_offset, deposit_offset_reversal. Chỉ confirmed mới tác động số dư. Pending là thông tin khách báo chuyển, không giảm nợ.

v_invoice_balances = tổng hóa đơn + điều chỉnh đã phát hành - phân bổ ròng. v_deposit_balances = thu cọc - hoàn cọc - bù cọc + đảo bù cọc. Hoàn cọc không đồng thời tạo receipt_reversal, tránh trừ tiền hai lần. Doanh thu thuê lấy phân bổ hóa đơn, không cộng cọc đang giữ.

Trigger khóa users của khách để tuần tự hóa ghi tiền. Ràng buộc số dư chạy tại COMMIT: không thu vượt hóa đơn, không hoàn vượt cọc, không đảo vượt khoản gốc. API chỉ trả thành công sau khi Commit thành công; retry toàn bộ transaction khi deadlock/serialization failure. Khóa theo thứ tự nhất quán trong dịch vụ.

Idempotency-Key và hash payload nằm ngay trên invoices/payments; unique key chặn ghi trùng. Backend gặp cùng key phải so sánh request_hash rồi trả kết quả cũ hoặc 409 nếu payload khác. Nhận phòng có code/booking_id unique và khóa phòng; yêu cầu đang chờ có unique theo khách/loại. Không có bảng tác vụ dùng chung.

Batch trả {summary,items} ngay từ dịch vụ, mỗi phòng dùng transaction hoặc savepoint riêng. CSV/in truy vấn dữ liệu hiện tại và dựng tệp; không lưu một tác vụ xuất vào database. Lịch sử cần hiển thị nằm trong rooms.status_history, bookings.history, billing_periods.history, invoices.readings_history, tickets.history.

## Giới hạn và tích hợp

Schema không thay dịch vụ tính giá kế thừa, tính lẻ ngày, gửi email, upload/quét tệp, xác minh phiên hoặc tính DTO. Giá từng dòng phải được server tính lại; database kiểm tra cấu trúc, tổng, lượng tiêu thụ và ràng buộc tài chính.

Frontend vẫn có tên API/DTO tenancy, tenant, meter, inquiry; [bàn giao](../docs/BACKEND_HANDOFF.md) mô tả ánh xạ sang 13 bảng. Mock/localStorage chưa chuyển sang SQL. Không tạo thêm bảng theo tên endpoint cũ.
