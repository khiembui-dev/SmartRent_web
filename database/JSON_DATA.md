# Định dạng JSONB trong baseline 13 bảng

Các cột chính dùng snake_case; khóa bên trong JSON dùng camelCase để dựng DTO. Backend sinh ID ổn định cho phần tử, kiểm tra input và khóa hồ sơ trước khi sửa mảng. JSONB không chứa file nhị phân hoặc mật khẩu/token rõ.

## Tiện ích, ảnh và giá

properties.amenity_options và rooms.amenities là mảng:

```json
[{"code":"WIFI","name":"Wi-Fi","icon":"wifi"}]
```

Options là lựa chọn của cơ sở; amenities là các mục đã chọn cho phòng. Thêm tiện ích trong form cập nhật danh sách cơ sở và phòng trong transaction. Danh mục không tạo thêm bảng.

rooms.images:

```json
[{"fileId":"00000000-0000-0000-0000-000000000001","caption":"Ảnh phòng","sortOrder":0,"isCover":true}]
```

fileId trỏ files public/clean. Không lặp fileId, tối đa một ảnh bìa. Khi trả DTO, join metadata files và sắp theo sortOrder.

properties.rates, rooms.rates và contracts.versions[].rates dùng cùng định dạng:

```json
[{"id":"rate-rent-1","code":"RENT","name":"Tiền phòng","category":"rent","unit":"tháng","method":"fixed","cycle":"monthly","unitPrice":3000000,"effectiveFrom":"2026-09-01","effectiveTo":null,"proration":"actual_days"}]
```

id, code, name, category, unit, method, cycle, unitPrice, effectiveFrom bắt buộc. category: rent/electricity/water/service/other. method: fixed/metered/per_person/per_quantity. cycle: monthly/once. Giá nguyên VND không âm. Các khoảng cùng code trong một mảng không chồng nhau. Sửa giá: đóng effectiveTo cũ và thêm phần tử mới; hóa đơn giữ snapshot giá đã chốt. Backend áp dụng proration, ưu tiên hợp đồng → phòng → cơ sở. Các khoản phổ biến: RENT, ELECTRICITY, WATER, GARBAGE, SERVICE, INTERNET, PARKING, KEY; code/name/unit/category ở ngay từng mục giá.

## Lịch xem và đề nghị

bookings.kind=viewing dùng room_id, contact_name, phone/email, occupants, preferred_viewing_at, desired_on, message. appointments là lịch sử lịch hẹn:

```json
[{"id":"appointment-1","startsAt":"2026-11-05T02:00:00Z","endsAt":"2026-11-05T02:30:00Z","hostId":"00000000-0000-0000-0000-000000000002","status":"scheduled","resultNotes":null}]
```

Một lịch scheduled tại một thời điểm trên mỗi yêu cầu. Trạng thái scheduled/completed/no_show/cancelled; hostId là admin. Khi hẹn lại, đổi lịch cũ sang cancelled và thêm lịch mới. hold_status/from/to/expires_at trên dòng bookings lưu giữ chỗ nếu có; gửi yêu cầu xem không tự điền hold_*.

kind=profile_change dùng changes:

```json
{"phone":{"from":"0900000000","to":"0900000001"}}
```

Chỉ phone/email được đề nghị sửa. kind=renewal/checkout/transfer tham chiếu contract_id và desired_on; các mục này không xuất hiện trong danh sách lịch xem. Transfer chỉ phục vụ dữ liệu đề nghị mà DTO hiện còn hiển thị, không thêm trang chuyển phòng.

## Hợp đồng

contracts.versions:

```json
[{"id":"version-1","versionNo":1,"effectiveFrom":"2026-09-01","endsOn":"2027-09-01","requiredDeposit":3000000,"invoiceDay":1,"dueAfterDays":5,"prorationPolicy":"actual_days","termsText":"Điều khoản đã thỏa thuận","changeReason":null,"signedAt":"2026-09-01T01:00:00Z","signedBy":"00000000-0000-0000-0000-000000000002","fileIds":["00000000-0000-0000-0000-000000000003"],"partiesSnapshot":{"customerName":"Tên đã chốt"},"rates":[]}]
```

rates dùng cấu trúc ở trên; ví dụ để trống chỉ minh họa hình dạng. Bản đã ký thực tế phải có giá rent dương, file private/clean và signedBy admin. Bản nháp có signedAt/signedBy null. Các bản ký không được sửa/xóa, khoảng hiệu lực không chồng nhau, tối đa một bản nháp. Khi nối DTO có versionId dạng UUID, backend sinh UUID cho id phần tử. ends_on/required_deposit ở cột contracts được trigger đồng bộ từ bản ký mới nhất.

attachments là mảng fileId cho tệp bổ sung có thể quản lý độc lập với bản ký. occupants:

```json
[{"userId":"00000000-0000-0000-0000-000000000004","joinedOn":"2026-09-01","leftOn":null,"relationship":"Ở cùng"}]
```

Đại diện nằm ở contracts.user_id, không lặp trong occupants. userId phải tồn tại, role user; không vượt sức chứa cùng thời gian. Mỗi user một mục trong hợp đồng hiện tại. Trả phòng đóng leftOn.

initial_readings và final_readings:

```json
{"electricity":{"value":100,"observedAt":"2026-09-01T01:00:00Z"},"water":{"value":20,"observedAt":"2026-09-01T01:00:00Z"}}
```

Không có bảng công tơ. Thiếu số khác với số 0. Nhận phòng mới cần số đầu cho khoản metered; nhập phòng cũ có thể thiếu và được ghi onboarding_gaps. Số đầu đã ký bất biến. checkout_handover/checkin_handover chứa snapshot hiện trạng và ghi chú từ form, không phải danh mục tài sản. checkout_summary ví dụ {finalAmount,offset,refund,remainingDebt}; onboarding_gaps là danh sách thông tin còn thiếu.

## Điện nước và hóa đơn

Các số đầu/cuối và thời điểm điện/nước là cột trực tiếp của invoices. Nháp có thể chưa đủ số hoặc chưa có lines. readings_history giữ giá trị trước khi sửa và lý do; issued bất biến.

invoices.lines:

```json
[{"id":"line-rent","code":"RENT","category":"rent","description":"Tiền phòng","unit":"tháng","quantity":1,"unitPrice":3000000,"sign":1,"numerator":1,"denominator":1,"sourceScope":"contract","sourceRateId":"rate-rent-1","oneTime":false}]
```

Bắt buộc id/code/category/description/unit/quantity/unitPrice. sign mặc định 1, numerator/denominator mặc định 1. Tổng tiền sinh bằng tổng round(sign × quantity × unitPrice × numerator / denominator). Lượng không âm, mẫu số dương. sourceRateId là định danh snapshot JSON, không phải FK tới bảng giá.

Dòng electricity/water có tổng quantity bằng chênh lệch số đầu/cuối tương ứng. Khi đổi giá trong kỳ, backend có thể chia lượng thành các dòng cùng category; tổng lượng vẫn phải khớp. Backend chịu trách nhiệm phân chia giá theo hiệu lực; SQL chặn tính trùng khoảng tiêu thụ giữa chứng từ đã phát hành.

customer_snapshot chứa tên/địa chỉ phòng và khách đã chốt để in lại hóa đơn không đổi theo hồ sơ mới.

## Thu tiền và cọc

payments.allocations:

```json
[{"invoiceId":"00000000-0000-0000-0000-000000000005","amount":1000000}]
```

Không trùng invoiceId, số tiền nguyên dương, hóa đơn phải phát hành và cùng khách. contract_id nếu đặt giới hạn phân bổ trong hợp đồng đó. receipt cho phép tiền chưa phân bổ; deposit_offset và deposit_offset_reversal yêu cầu tổng phân bổ bằng amount. deposit_receipt/deposit_refund có allocations rỗng. Các dòng reversal trỏ reverses_id và nêu phần phân bổ được đảo; tổng đảo không vượt gốc.

proof_file_ids là mảng UUID tệp private/clean. Không dùng file trong phòng thay cho chứng từ thanh toán. idempotency_key và request_hash nằm trên payments/invoices.

## Hỗ trợ và lịch sử

tickets.category_code là ELECTRICITY/WATER/INTERNET/OTHER. Nhãn tiếng Việt do DTO dựng; không có bảng danh mục. priority low/normal/high/urgent. Backend tính due_at khi tạo theo quy tắc hiện tại 120/48/24/4 giờ.

messages:

```json
[{"id":"message-1","authorId":"00000000-0000-0000-0000-000000000002","body":"Tôi sẽ kiểm tra","createdAt":"2026-11-04T10:00:00Z","isInternal":false,"fileIds":[]}]
```

isInternal=true chỉ admin được ghi. Tin nhắn cũ bất biến; nối phần tử mới. v_user_tickets bỏ các mục nội bộ. attachment_file_ids là ảnh/tệp của yêu cầu ban đầu.

Các mảng history/status_history do trigger nối sự kiện tối thiểu gồm thời điểm, trạng thái và actorId khi có context. Chúng phục vụ phần lịch sử của từng trang, không phải nhật ký hệ thống toàn cục. Backend không nhận nguyên mảng history từ client.

users.identity_documents chỉ chứa bản hiển thị đã che và trạng thái xác minh, không lưu số CCCD rõ. Backend lọc dữ liệu riêng tư trước khi tạo DTO.
