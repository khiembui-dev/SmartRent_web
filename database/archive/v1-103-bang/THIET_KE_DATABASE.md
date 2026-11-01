# Thiết kế cơ sở dữ liệu SmartRent

Nguồn nghiệp vụ: `DAC_TA_LUONG_VA_CHUC_NANG_WEBSITE_PHONG_TRO.md`, ngày 20/10/2026. Tài liệu này đi cùng DDL, không thay cho DDL. Kiểu, khóa và CHECK chính xác của từng bảng nằm trong [từ điển dữ liệu](TU_DIEN_DU_LIEU.md).

## 1. Phạm vi và giả định đã chọn

- Hỗ trợ nhiều chủ trọ bằng `organizations`. Một tài khoản có thể tham gia nhiều đơn vị; hồ sơ khách và dữ liệu nghiệp vụ thuộc từng đơn vị.
- Thuê nguyên phòng. Một đợt thuê có một khách đại diện; người ở cùng được lưu riêng. Một hồ sơ khách đại diện chỉ có một đợt thuê dự kiến/đang hoạt động trong đơn vị.
- Có cả tìm phòng công khai, yêu cầu thuê, lịch xem, giữ chỗ, cổng khách, ticket, lịch nhắc và thông báo.
- Thu tiền thủ công có chứng từ. Báo chuyển khoản là `pending`, chỉ `confirmed` mới có thể phân bổ. Tiền thu dư nằm ở số dư chưa phân bổ, không tự trở thành doanh thu.
- Thời gian thuê/tính tiền dùng khoảng **[ngày đầu, ngày cuối)**: tính ngày nhận, không tính ngày trả. Ngày kết thúc hiển thị trên bản hợp đồng là `ends_on - 1 ngày`. Tiền lẻ tháng mặc định chia số ngày thực trong tháng; có thể chọn trọn tháng trên bản hợp đồng.
- Số tiền chứng từ VND là `numeric(18,0)`. Đơn giá có 4 chữ số thập phân, lượng công tơ có 3; làm tròn từng dòng về VND bằng quy tắc nửa ra xa 0.
- Phân hệ chi phí có dữ liệu đầu vào để làm báo cáo thu/chi. AI, cổng thanh toán, đối soát ngân hàng, ký số và hóa đơn thuế chỉ có bảng nền tảng tích hợp; chưa khẳng định đã tích hợp nhà cung cấp.
- Nhập dữ liệu người đang ở dùng `onboarding_mode='import'` và `onboarding_gaps`; không tạo giả hợp đồng đã ký. Có thể nhập hợp đồng thật sau; phát hành hóa đơn vẫn yêu cầu bản ký. Nếu cần công nợ đầu kỳ, bổ sung chứng từ số dư đầu kỳ riêng trước khi vận hành.

Các chính sách cần chủ trọ chốt trước khi làm API: hủy/hoàn giữ chỗ, mức cọc được chuyển thành bồi thường, ai duyệt tiền, cách xử lý ở tiếp sau hết hợp đồng, ngày chuyển phòng, có chia phí theo người hay không. Schema có chỗ lưu chính sách/phiên bản; không tự giả định có phạt trễ hay có chữ ký điện tử.

## 2. Vì sao thiết kế đáp ứng 3NF

**1NF:** Không lưu danh sách ảnh, người ở, tiện nghi, vai trò hay khoản thu trong một cột chuỗi. Mỗi danh sách là một bảng con/bảng liên kết. Nội dung điều khoản, mô tả và địa chỉ văn bản là giá trị văn bản của chứng từ, không dùng để thay FK.

**2NF:** Bảng liên kết có khóa ghép như `room_amenities(room_id, amenity_id)`; không đặt tên phòng/tên tiện nghi trên bảng liên kết. Các thuộc tính mô tả phụ thuộc toàn bộ khóa. Bảng nghiệp vụ có PK UUID để tham chiếu ổn định và khóa tự nhiên UNIQUE khi cần.

**3NF:** Cơ sở giữ `organization_id`; phòng giữ `property_id`; đợt thuê giữ `allocation_id`; hóa đơn giữ `tenancy_id`. Không lặp cả `organization_id`, `property_id`, `room_id`, `tenant_id` trên tất cả bảng con. Đường suy ra là:

```text
invoice -> tenancy -> allocation -> room -> property -> organization
invoice -> tenancy -> representative_tenant
payment -> tenant -> organization
contract_version -> contract -> tenancy
charge_rate -> rate_plan -> property / room / contract_version
```

Tên người, địa chỉ và đơn giá **snapshot** trên chứng từ đã ký/phát hành là sự kiện lịch sử độc lập, có thể khác hồ sơ hiện tại. Vì vậy `full_name_snapshot`, `description_snapshot`, `unit_price` trên dòng hóa đơn không được đồng bộ ngược từ danh mục. Đây là dữ liệu của chứng từ, không phải bản sao cache của hồ sơ hiện tại.

Không lưu `total_debt`, `paid_amount`, `current_tenant_id`, `paid_until` trên khách/phòng. Các tổng được tính bằng view từ chứng từ có hiệu lực. `operating_status` chỉ nói phòng được khai thác/bảo trì/ngừng; trạng thái đang ở được suy từ đợt thuê qua `v_room_status`.

`jsonb` chỉ dùng cho payload sự kiện, ảnh trước/sau audit, bộ lọc xuất báo cáo và ngữ cảnh AI. Khách, phòng, hợp đồng, tiền, cọc, hóa đơn và file nghiệp vụ đều có bảng/FK thực. Audit và tham chiếu nguồn câu trả lời AI không đóng vai trò FK nghiệp vụ.

## 3. Danh mục toàn bộ bảng theo chức năng

### 3.1. Đăng nhập, nhân sự, vai trò

| Bảng | Ý nghĩa và quan hệ chính |
|---|---|
| `users` | Tài khoản Identity; khóa UUID; username/email chuẩn hóa duy nhất; mật khẩu băm |
| `roles` | Vai trò toàn hệ thống, ví dụ SystemAdmin; không dùng để cấp quyền chủ trọ xuyên đơn vị |
| `user_roles` | N–N users–roles |
| `user_claims` | Claim của tài khoản; PK integer identity theo chuẩn Identity |
| `role_claims` | Claim của vai trò toàn hệ thống |
| `user_logins` | Tài khoản đăng nhập ngoài, khóa ghép provider/key |
| `user_tokens` | Token store của Identity, khóa ghép user/provider/name |
| `user_sessions` | Phiên/refresh token băm, hết hạn/thu hồi, phiên kế tiếp |
| `organizations` | Đơn vị kinh doanh/chủ trọ |
| `organization_memberships` | N–N users–organizations; trạng thái nhân sự; phạm vi all/assigned |
| `permissions` | Danh mục quyền nhỏ, phân biệt xem/sửa/phát hành/duyệt/đảo/hoàn |
| `business_roles` | Vai trò trong một đơn vị, mã duy nhất theo đơn vị |
| `business_role_permissions` | N–N vai trò nghiệp vụ–quyền |
| `membership_roles` | N–N nhân sự–vai trò cùng đơn vị |
| `membership_properties` | N–N nhân sự–cơ sở được phân công |
| `support_access_grants` | Quyền hỗ trợ truy cập đơn vị có lý do, hạn và người cấp |

Luồng kiểm tra nhân viên: tài khoản hoạt động → membership hoạt động → có permission → cơ sở trong phạm vi → bản ghi thuộc cơ sở/đơn vị đó. Với khách thuê, lọc theo `tenants.user_id` và vai trò đại diện/thành viên được công bố. Người ở cùng không tự có quyền xem công nợ hay giấy tờ của đại diện.

### 3.2. Địa chỉ, file, cơ sở và phòng

| Bảng | Ý nghĩa |
|---|---|
| `address_datasets` | Bộ địa giới theo nguồn và khoảng hiệu lực; không cố định mô hình ba cấp |
| `administrative_units` | Cây đơn vị hành chính trong một phiên bản; FK parent cùng dataset |
| `addresses` | Địa chỉ đường/số nhà, đơn vị hành chính tùy chọn, địa phương nhập tay, tọa độ |
| `stored_files` | Metadata file; file thật ở storage; riêng tư/công khai, trạng thái quét/thiếu file |
| `properties` | Cơ sở, mã duy nhất trong đơn vị, địa chỉ/liên hệ |
| `property_billing_settings` | 1–0..1 cơ sở–lịch lập hóa đơn/hạn/mốc cảnh báo/chính sách chia ngày |
| `room_types` | Loại phòng riêng theo đơn vị |
| `rooms` | Phòng, mã duy nhất trong cơ sở, diện tích, sức chứa, mức cọc chào thuê, trạng thái khai thác |
| `room_status_events` | Lịch sử thao tác bảo trì/ngừng/đưa vào khai thác |
| `amenities` | Danh mục tiện nghi riêng theo đơn vị |
| `room_amenities` | N–N phòng–tiện nghi |
| `room_images` | Ảnh phòng, thứ tự, bìa; tối đa một ảnh bìa mỗi phòng |
| `room_assets` | Nội thất/tài sản với số lượng, mã trong phòng, tình trạng |
| `room_listings` | 1–0..1 phòng–tin đăng; slug duy nhất; nháp/công khai/ẩn độc lập khách đang ở |

Giá thuê và các phí nằm ở `charge_rates`, không nhân đôi giá thuê trên `rooms`. `rooms.required_deposit` là mức chào thuê hiện tại; mức đã thỏa thuận nằm ở `contract_versions.required_deposit`; thực thu nằm ở sổ cọc. Đây là ba khái niệm riêng.

Không xóa cơ sở còn phòng hay phòng có lịch sử vì FK mặc định `NO ACTION`. Đổi cơ sở của phòng bị chặn ở database; mã/nội dung có thể sửa theo quyền. Trang công khai chỉ lấy field được phép và file sạch/công khai, không trả toàn bộ entity.

### 3.3. Tìm/đặt phòng, khách và lịch thuê

| Bảng | Ý nghĩa |
|---|---|
| `tenants` | Hồ sơ khách thuộc đơn vị, liên kết tài khoản tùy chọn; liên hệ không buộc duy nhất |
| `tenant_identity_documents` | Giấy tờ, số mã hóa + fingerprint tra trùng, ngày/nơi cấp, hai mặt, người xác minh |
| `tenant_profile_change_requests` | Khách đề nghị đổi dữ liệu; duyệt trước khi áp dụng vào hồ sơ |
| `rental_inquiries` | Yêu cầu xem/thuê, liên hệ, ngày nhận, số người, tư vấn và kết quả |
| `inquiry_events` | Nhật ký liên hệ/xử lý yêu cầu |
| `room_viewings` | Lịch xem, người hẹn, kết quả/vắng/hủy |
| `room_allocations` | Lịch chiếm dụng dùng chung giữ chỗ và thuê; EXCLUDE chống chồng khoảng |
| `reservations` | Giữ chỗ cho khách, liên kết lịch chiếm dụng, điều kiện hủy, trạng thái và người xử lý |
| `tenancies` | Đợt thuê, đại diện, liên kết giữ chỗ, ngày dự kiến/nhận/trả thực tế, trạng thái |
| `tenancy_residents` | Người ở cùng và khoảng thời gian ở; không mặc định nghĩa vụ tài chính |
| `onboarding_gaps` | Hồ sơ còn thiếu khi nhập khách cũ và lịch hoàn thiện |

`room_allocations` là nơi quyết định phòng bị giữ trong thời gian nào. Hai bảng giữ chỗ/thuê cùng tham chiếu nó, nên giữ chỗ có xung đột với hợp đồng/đợt thuê. `EXCLUDE USING gist` chặn cả hai transaction chạy đồng thời, thay vì chỉ kiểm tra phòng bằng SELECT trước INSERT.

Trạng thái allocation: `held` giữ chỗ, `reserved` thuê dự kiến, `occupied` đang ở, `completed` đã thuê xong và vẫn giữ lịch sử, `released` hủy/giải phóng lịch chưa sử dụng. Các khoảng `completed` vẫn chống chèn đè quá khứ. Đợt đang ở để `ends_on=NULL`; không giải phóng phòng chỉ vì hợp đồng hết hạn. Cách này thận trọng: đặt lịch tương lai sau một đợt đang ở chưa chốt trả sẽ bị chặn.

Hết hạn giữ chỗ phải chạy `expire_reservations()` bằng worker. Không dùng `now()` trong điều kiện index vì thời gian trôi không tự cập nhật index. Worker dùng `FOR UPDATE SKIP LOCKED`. Khi chuyển giữ chỗ thành thuê phải khóa reservation/allocation, kiểm tra hạn và chuyển trạng thái trong cùng transaction.

Email/điện thoại tài khoản có chính sách riêng: email tài khoản duy nhất toàn hệ thống; liên hệ hồ sơ khách có thể trùng do người thân dùng chung số. Fingerprint giấy tờ nên là HMAC với khóa máy chủ, không phải hash trần của số định danh dễ dò. Khóa giải mã và file riêng tư không trả ra API công khai.

### 3.4. Hợp đồng, gia hạn, chuyển/trả, bàn giao

| Bảng | Ý nghĩa |
|---|---|
| `contracts` | Chứng từ hợp đồng có mã riêng; liên kết đợt thuê và hợp đồng tiền nhiệm |
| `contract_versions` | Phiên bản/phụ lục: ngày hiệu lực/kết thúc, cọc, lịch thu, điều khoản và xác nhận ký |
| `contract_parties` | Các bên ở thời điểm ký, lưu snapshot tên/địa chỉ/giấy tờ |
| `contract_files` | Bản nháp/ký/phụ lục/chứng cứ chữ ký, FK file thật |
| `contract_terminations` | Chấm dứt có ngày, lý do, người xác nhận; giữ nguyên bản ký |
| `tenancy_requests` | Đề nghị gia hạn/chuyển/trả của khách; chưa thay đổi thuê khi chỉ mới gửi |
| `room_transfers` | Nối đợt cũ đã kết thúc với đợt mới đang ở cùng đại diện, cùng ngày chuyển |
| `handovers` | Bàn giao nhận/trả/chuyển, thời điểm, xác nhận, hiện trạng |
| `handover_assets` | Tài sản, số lượng/tên/tình trạng lúc bàn giao |
| `handover_files` | Ảnh/tệp biên bản bàn giao |
| `checkout_settlements` | Bảng quyết toán, biên bản trả, duyệt giữ nợ và lý do |
| `settlement_invoices` | Các hóa đơn được đưa vào quyết toán, kể cả nợ cũ |

Soạn phiên bản nháp → thêm bên ký, bản ký và bộ giá chốt → cập nhật `signed_at/confirmed_by/signature_method`. Upload file riêng lẻ không tự ký. Sau ký, nội dung, bên ký, file phiên bản và giá của phiên bản bị khóa; thay đổi bằng phiên bản mới. Mã hợp đồng/hóa đơn/ticket đang dùng UNIQUE toàn hệ thống; có thể cấp mã kèm tiền tố đơn vị để dễ đọc.

Gia hạn cùng phòng giữ nguyên đợt thuê; tạo hợp đồng kế tiếp hoặc phiên bản phụ lục mới. Phiên bản có `effective_from` khác nhau; khi chồng thời hạn pháp lý, phiên bản đã ký có ngày hiệu lực mới nhất là bản áp dụng kể từ ngày đó. Backend kiểm tra thứ tự phiên bản/phụ lục, thời gian và thẩm quyền ký. Cần chốt cách thu tiền khi hết hợp đồng nhưng chưa trả; hàm giá hiện lấy bộ giá đã ký gần nhất cho tới khi có bộ giá kế tiếp, không tự tăng giá.

Chuyển phòng mở đợt thuê mới, không ghi đè allocation của đợt cũ. Sổ cọc chuyển bằng hai dòng đối ứng và giữ payment gốc. Nợ vẫn trên hóa đơn/đợt cũ. Chi phí hư hỏng đưa vào hóa đơn cuối với chứng cứ; chi phí sửa thực chi không tự thành khoản thu khách.

## 4. Giá, công tơ và hóa đơn

| Bảng | Ý nghĩa |
|---|---|
| `charge_types` | Danh mục tiền thuê, điện, nước, dịch vụ, phí tự đặt, bồi thường |
| `rate_plans` | Một phạm vi duy nhất: cơ sở hoặc phòng hoặc phiên bản hợp đồng |
| `charge_rates` | Giá theo khoản thu/khoảng ngày; cách tính, chu kỳ, cờ chia ngày; không chồng khoảng trong cùng plan/khoản |
| `billing_periods` | Kỳ tháng của cơ sở, ngày đầu tháng, khóa/mở |
| `billing_period_events` | Khóa/mở có lý do/người/thời điểm |
| `meters` | Công tơ điện/nước, serial, khoảng lắp/tháo; không chồng công tơ cùng loại trong phòng |
| `meter_readings` | Chỉ số không âm theo thời điểm, đợt thuê, kỳ, bàn giao; sửa bằng void + bản ghi kế tiếp |
| `meter_reading_files` | Ảnh/chứng cứ chỉ số |
| `meter_replacements` | Công tơ cũ/mới, chỉ số chốt/mở và thời điểm thay |
| `invoices` | Header chứng từ nháp/phát hành/hủy, kỳ, ngày tính, hạn, chứng từ gốc, idempotency |
| `invoice_lines` | Từng khoản thu/giảm, lượng, giá snapshot, nguồn giá, tỷ lệ chia ngày |
| `charge_instances` | Một lần phát sinh phí của đợt thuê; phí một lần không có kỳ |
| `invoice_charge_claims` | Claim đang sử dụng phát sinh phí; một phát sinh chỉ xuất hiện trên một dòng có hiệu lực |
| `invoice_meter_segments` | Các đoạn chỉ số đầu/cuối của dòng điện/nước, kể cả thay công tơ |
| `invoice_files` | Bản in PDF và chứng cứ |
| `invoice_issue_batches` | Một yêu cầu phát hành hàng loạt, có khóa chống lặp |
| `invoice_issue_batch_items` | Kết quả thành công/lỗi/thử lại cho từng đợt thuê |

`effective_rates(tenancy_id, date)` trả giá theo thứ tự phiên bản hợp đồng đã ký → riêng phòng → cơ sở. Dòng giá bằng 0 vẫn là giá hợp lệ. Khi ký, nên chép toàn bộ giá đã thỏa thuận vào rate plan của phiên bản để giá hợp đồng được cố định. Nếu cố ý cho một khoản kế thừa giá cơ sở, cần nêu rõ điều khoản này. Mọi dòng phát hành vẫn chụp giá thực tế.

Đổi giá bằng cách đóng khoảng `effective_to` của dòng cũ rồi INSERT dòng mới, không sửa `unit_price`. Nếu thay đổi giữa kỳ, tách dòng theo đoạn ngày/nguồn giá. Dòng hóa đơn dùng `proration_numerator/proration_denominator` để giữ tỷ lệ ngày chính xác; không cần xấp xỉ 1/31 vào quantity.

Chỉ số có thứ tự không giảm trên cùng công tơ, kiểm tra cả lần trước và lần sau; thiếu đầu kỳ không được mặc định 0. Thay công tơ tạo serial/bản ghi mới; chốt công tơ cũ và mở mới trong một transaction. Một dòng điện có thể gồm nhiều segment, quantity bằng tổng mức chênh. Chỉ số đã thuộc chứng từ phát hành/hủy giữ nguyên, sửa tiền bằng điều chỉnh.

Một hóa đơn `periodic` gốc chưa hủy duy nhất theo đợt thuê–kỳ. Khoảng tính hóa đơn periodic/final/replacement đã phát hành không chồng trong cùng đợt. Hai khách lần lượt cùng phòng có hai đợt thuê và hai chứng từ hợp lệ; ngày chuyển thuộc khách mới theo biên mở.

Phí một lần tạo `charge_instances(tenancy,charge_type,NULL,'default')` và dùng lại ID đó khi thử lại. Không tạo occurrence_key mới mỗi tháng để lách kiểm tra. Hóa đơn hủy giải phóng claim nhưng giữ dòng lịch sử; lập lại dùng cùng instance. Nếu nghiệp vụ cho phép phát sinh lại một khoản nhiều lần, mỗi occurrence_key mới phải ứng với một sự kiện thực có căn cứ.

Các loại chứng từ:

| `kind` | Quy tắc |
|---|---|
| `periodic` | Hóa đơn định kỳ gốc, bắt buộc kỳ |
| `final` | Hóa đơn cuối đợt thuê |
| `one_time` | Chứng từ phát sinh riêng, không dùng để tính lại tiền thuê trùng kỳ |
| `replacement` | Liên kết chứng từ đã hủy, có số/mã riêng |
| `debit_adjustment` | Điều chỉnh tăng, liên kết hóa đơn gốc đang có hiệu lực |
| `credit_adjustment` | Điều chỉnh giảm, giá trị chứng từ không âm, được trừ khỏi số phải thu gốc |

Tổng mặt chứng từ = SUM(sign × ROUND(quantity × unit_price × numerator / denominator)). `sign=-1` biểu diễn giảm giá trong chứng từ. Điều chỉnh giảm dùng face amount dương; không đặt mọi dòng của chứng từ credit thành âm lần nữa. Không phát hành tổng âm và không tự ép âm về 0. Điều chỉnh vượt số đang phải thu cần nghiệp vụ ghi có/hoàn riêng, không thực hiện bằng phân bổ âm tùy ý.

Sau phát hành chỉ cho phép hủy với thông tin/lý do hợp lệ; không sửa giá/tổng/ngày đến hạn. Cần đảo/chuyển phân bổ và xử lý các điều chỉnh đang hiệu lực trước khi hủy. Khóa kỳ ngăn sửa/lập/phát hành dữ liệu kỳ đó; mở khóa cần quyền và `smartrent.reason`, đồng thời ghi `billing_period_events` trong cùng transaction.

## 5. Thu tiền, cọc và công nợ

| Bảng | Ý nghĩa |
|---|---|
| `payment_methods` | Danh mục phương thức thu/hoàn |
| `bank_accounts` | Tài khoản nhận theo đơn vị |
| `payments` | Tiền thực nhận/báo nhận, chờ xác minh/xác nhận/từ chối, chứng từ giao dịch, idempotency |
| `payment_files` | Ảnh báo chuyển khoản/biên nhận |
| `payment_reversals` | Đảo sai hoặc hoàn tiền, giữ receipt gốc, số tiền/ngày/lý do/người/chứng cứ |
| `deposit_entries` | Sổ cọc bất biến: nhận/hoàn/bù trừ/chuyển/đảo; giữ nguồn payment gốc |
| `payment_allocations` | Phân bổ tiền trực tiếp hoặc bù trừ cọc vào hóa đơn; đảo có liên kết dòng gốc |

Một payment có thể phân bổ cho nhiều hóa đơn. Một hóa đơn nhận nhiều lần thu. Mỗi allocation chỉ có **một** nguồn: payment hoặc deposit offset. Người ở cùng không tự có nghĩa vụ trả thay đại diện. Cọc chuyển giữa các đợt của cùng đại diện; chuyển sang người khác cần nghiệp vụ khác, không được đổi payer để lách kiểm tra.

Sổ cọc theo từng nguồn payment giúp không dùng cùng khoản thu hai lần. Ví dụ receipt 3 triệu → nhận cọc 3 triệu; bù trừ 100 nghìn → sổ cọc -100 nghìn và phân bổ hóa đơn +100 nghìn; hoàn 200 nghìn → cash refund 200 nghìn và sổ cọc -200 nghìn. Còn giữ 2,7 triệu, tiền hóa đơn nhận từ cọc 100 nghìn, tiền hoàn 200 nghìn. Tổng khớp receipt gốc.

Quy tắc database kiểm tra cuối transaction:

```text
Tiền còn có thể sử dụng = payment xác nhận - đảo/hoàn tiền
Tiền đã sử dụng = phân bổ hóa đơn ròng + cọc đang giữ từ payment đó
Tiền đã sử dụng <= tiền còn có thể sử dụng
Cọc từng đợt thuê và từng nguồn tiền >= 0
Tiền bù trừ cọc ròng = phân bổ từ bù trừ đó
Phân bổ hóa đơn ròng <= số phải thu sau điều chỉnh
Tổng đảo phân bổ/cọc <= giao dịch gốc tương ứng
```

Các trigger `DEFERRABLE INITIALLY DEFERRED` cho phép viết các dòng đối ứng theo thứ tự trong cùng transaction. Chỉ khi `COMMIT` hoặc `SET CONSTRAINTS ALL IMMEDIATE` thì kiểm tra cân đối toàn bộ. Bất kỳ lỗi nào phải rollback cả nghiệp vụ. Trigger khóa hàng hồ sơ khách để hai thao tác tiền đồng thời không cùng dùng số dư cũ.

Đảo một offset: thêm allocation reversal với đúng nguồn/hóa đơn, thêm deposit reversal liên kết offset cùng số tiền, cùng transaction. Đảo receipt cọc chỉ khi đã giải phóng sử dụng tương ứng. Không sửa/xóa allocation/deposit/payment reversal đã ghi. Hoàn tiền và sai sót của giao dịch hoàn cần chứng từ bù mới, không sửa giao dịch tiền ra cũ.

Thu dư nằm ở `v_payment_balances.unapplied_amount`. Khi phân bổ tiếp phải kiểm tra quyền và nguồn. Payment chưa được xác nhận không xuất hiện trong dòng thu tiền; receipt đã xác nhận không được sửa và cùng idempotency key không tạo lại được.

## 6. Ticket, chi phí, thông báo, vận hành và mở rộng

| Bảng | Ý nghĩa |
|---|---|
| `ticket_categories` | Danh mục sự cố |
| `sla_policies` | Ưu tiên, giờ xử lý, liên tục/giờ làm việc |
| `business_hours`, `business_holidays` | Lịch làm việc/ngày nghỉ để máy chủ tính SLA |
| `tickets` | Sự cố theo phòng/đợt thuê, báo/nhận việc, ưu tiên, hạn, kết quả |
| `ticket_messages` | Hội thoại và ghi chú nội bộ; khách không thấy ghi chú nội bộ |
| `ticket_files` | File sự cố hoặc một tin nhắn trong cùng ticket |
| `ticket_events` | Lịch sử trạng thái/phân công/mở lại; append-only |
| `expense_categories` | Phân loại chi phí đầu vào |
| `expenses` | Chi phí phát sinh/thực trả, chứng cứ, liên kết ticket; sai thì ghi đảo bằng reversal_of_id |
| `organization_settings` | Múi giờ, lịch worker, lưu trữ |
| `email_configurations` | SMTP, kiểu bảo mật, tham chiếu secret; không lưu mật khẩu rõ |
| `message_templates` | Nội dung theo phiên bản và kênh |
| `reminder_rules` | Sự kiện/mốc ngày/mẫu/bật tắt |
| `notifications` | Chuông thông báo theo người, đọc/chưa đọc, liên kết nội bộ |
| `outbox_messages` | Sự kiện gửi được ghi cùng transaction nghiệp vụ |
| `notification_deliveries` | Lần gửi logic theo người/kênh/mẫu, khóa chống lặp |
| `delivery_attempts` | Từng lần thử, kết quả/lỗi/thời gian |
| `background_job_runs` | Tác vụ nền, khóa chống lặp, trạng thái/lỗi |
| `export_jobs` | Xuất CSV/XLSX/PDF với bộ lọc và file kết quả riêng tư |
| `backup_runs` | Tham chiếu bản backup và lần thử khôi phục; không tự tạo backup chỉ bằng INSERT |
| `audit_logs` | Ai/lúc nào/bản ghi nào/trước sau/lý do/correlation |
| `ai_conversations`, `ai_messages` | Một kho hội thoại; phạm vi dữ liệu, nguồn trả lời, model |
| `integration_connections` | Nhà cung cấp ngân hàng/thanh toán/ký số/hóa đơn thuế, secret reference |
| `integration_events` | Webhook được chống lặp theo connection/provider_event_id, kết quả xử lý |

Chi phí và khoản khách bồi thường là hai sự kiện khác nhau. Báo cáo lợi nhuận cần định nghĩa rõ tiền thuê ghi nhận hay tiền đã thu, cách phân bổ chi phí, và có đủ dữ liệu đầu vào; không lấy tiền điện thu khách làm giá vốn.

Worker xử lý outbox theo `available_at`, lease `locked_until`, `FOR UPDATE SKIP LOCKED`; chỉ đánh dấu đã xử lý sau kết quả. Gửi email ngoài database, lưu retry; lỗi email không rollback hóa đơn đã phát hành. Khóa chống lặp giảm gửi lặp khi retry nhưng SMTP không bảo đảm exactly-once nếu worker mất kết nối sau khi nhà cung cấp đã nhận thư; dùng idempotency của provider khi có.

AI mặc định đọc qua service đã lọc quyền. `data_scope` chỉ ghi lại phạm vi đã dùng, không phải cơ chế cấp quyền. Hành động tiền/hợp đồng vẫn đi qua cùng API nghiệp vụ.

## 7. Views và nguồn số liệu báo cáo

| View | Dùng cho |
|---|---|
| `v_invoice_totals` | Tổng mặt từng chứng từ từ snapshot dòng |
| `v_allocation_movements` | Phân bổ có dấu, payment nguồn kể cả bù trừ cọc |
| `v_deposit_movements` | Sổ cọc có dấu |
| `v_invoice_balances` | Hóa đơn gốc/thay thế, tăng/giảm, đã thu, còn nợ, nhãn quá hạn độc lập |
| `v_tenant_debts` | Nợ đại diện qua mọi đợt thuê, kể cả đã rời |
| `v_deposit_balances` | Cọc đang giữ từng đợt thuê |
| `v_payment_balances` | Tiền nhận, đảo/hoàn, phân bổ, đang giữ cọc, chưa phân bổ |
| `v_room_status` | Trạng thái hiển thị và trạng thái khai thác gốc |
| `v_cash_movements` | Dòng thu/đảo/hoàn theo ngày giao dịch |

Không cộng cả hóa đơn điều chỉnh và số phải thu đã điều chỉnh của hóa đơn gốc lần nữa. Báo cáo theo kỳ dùng invoice/period/allocations; báo cáo theo ngày tiền dùng cash movements. Tiền cọc trình bày riêng bằng sổ cọc; bù trừ cọc là phân bổ không có tiền mặt mới. Receipt có cả tiền thuê/cọc/chưa phân bổ phải tách theo các dòng sử dụng tiền, không gắn toàn receipt vào doanh thu một hóa đơn.

Lấp đầy lịch sử tính khoảng giao nhau của đợt thuê thực tế với tháng/ngày báo cáo, không dùng trạng thái phòng hiện tại cho mọi tháng. Phòng bảo trì đang có người vẫn có occupancy_status='occupied' và operating_status='maintenance'; giao diện có thể hiển thị thêm nhãn bảo trì.

## 8. Giao dịch máy chủ cần thực hiện

| Thao tác | Các bước phải nằm cùng transaction |
|---|---|
| Giữ chỗ | Kiểm quyền/khả dụng; khóa phòng; giải phóng giữ hết hạn; allocation held; reservation; audit/outbox |
| Nhận phòng | Khóa phòng/allocation/giữ chỗ; tenancy planned; hợp đồng đã ký; handover/chỉ số; active + occupied; cọc nếu thu; outbox |
| Phát hành | Khóa kỳ/hóa đơn và khách; resolve giá/chỉ số; tạo lines/claims/segments; kiểm tra; cấp code; issued; outbox |
| Xác nhận tiền | Kiểm idempotency; pending → confirmed; thêm allocations và/hoặc nhận cọc; outbox |
| Hoàn/bù trừ | Khóa khách/nguồn tiền; thêm các dòng tiền/cọc/phân bổ đối ứng; kiểm tra deferred; chứng cứ/audit |
| Gia hạn | Khóa hợp đồng/đợt thuê; phiên bản mới + bên ký/file/giá; xác nhận ký; outbox |
| Chuyển phòng | Khóa hai phòng theo thứ tự ID; chốt chỉ số/handover cũ; invoice cuối; ended/completed; tenancy/hợp đồng/handover mới; chuyển cọc; room_transfers |
| Trả phòng | Chốt chỉ số/tài sản; invoice cuối; settlement/liên kết invoice; thu/hoàn/offset; kiểm quyền còn nợ; ended/completed; trạng thái khai thác |
| Mở lại ticket | Quyền + lý do; trạng thái mới; due_at/SLA mới; ticket_events; outbox |

SQL hỗ trợ các transaction trên nhưng không phải toàn bộ code xử lý nghiệp vụ. Không thực hiện SaveChanges rời rạc rồi bỏ lại dữ liệu dở dang khi bước sau lỗi. Với chuyển phòng, các lần SaveChanges ở giữa vẫn phải ở trong cùng transaction; unique đại diện đang thuê yêu cầu đóng đợt cũ trước khi INSERT đợt mới.

## 9. Phần database bảo vệ và phần API phải làm

Database đã có PK/FK, giới hạn null/giá trị, duy nhất mã, giới hạn lịch không chồng, cùng đơn vị cho các liên kết chéo, snapshot bất biến sau phát hành/ký, cân đối tiền/cọc, khóa kỳ, chỉ số theo chuỗi và audit ở các bảng lõi.

API vẫn cần kiểm tra quyền trên mọi truy cập; phạm vi cơ sở và tài khoản khách; không cấp quyền vượt người cấp; lịch trạng thái được phép; chưa hết hạn giữ khi chuyển; không nhận phòng bảo trì/ngừng; sức chứa và thành viên trùng đại diện; xác thực file/virus/storage; hiệu lực giá theo từng đoạn; hồ sơ/thẩm quyền ký; điều kiện quyết toán/cho rời khi còn nợ; tính SLA; webhook chữ ký; phát hành mã; scheduler và retry.

**Schema này chưa bật PostgreSQL Row Level Security.** FK/trigger cùng đơn vị chặn nối sai dữ liệu nhưng không giới hạn người dùng SELECT bản ghi. EF query filters và authorization theo bản ghi là bắt buộc; các đường raw SQL/export/AI cũng phải kiểm tra. Nếu triển khai RLS sau này, cần migration và test pooling/SET LOCAL riêng; không dùng role owner/BYPASSRLS cho ứng dụng rồi coi đã có cô lập.

Các trigger audit tự ghi thay đổi bảng lõi; ứng dụng phải bổ sung log nghiệp vụ cho phân quyền/cài đặt/phân bổ/nhắc/gửi và sự kiện có lý do. Các bảng sự kiện không tự sinh đầy đủ chỉ vì cập nhật status ở bảng chính. Luôn ghi sự kiện và outbox cùng transaction; đặt `smartrent.actor_id`, `smartrent.reason`, `smartrent.correlation_id` bằng tham số và phạm vi transaction. Bảo vệ audit như dữ liệu riêng tư vì ảnh trước/sau có thể chứa liên hệ khách.

Mô hình không cung cấp bảng tìm kiếm/tổng KPI riêng vì đây là dữ liệu suy ra. Đo truy vấn thật rồi bổ sung index/materialized view bằng migration khi cần. Thuê giường, một đại diện thuê nhiều phòng, chuyển cọc giữa các khách khác nhau hoặc tích hợp thuế cần mở rộng mô hình/quy tắc trước khi phát triển chức năng đó.
