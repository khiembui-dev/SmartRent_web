# Thiết kế cơ sở dữ liệu SmartRent

Tài liệu đi cùng DDL, không thay thế DDL. Kiểu, khóa và CHECK chính xác của từng bảng nằm trong [từ điển dữ liệu](TU_DIEN_DU_LIEU.md).

## 1. Căn cứ thiết kế

Bản này được thiết kế lại ngày 01/11/2026 từ **website đang chạy**, không phải từ đặc tả rộng như bản cũ. Nguồn đối chiếu, theo thứ tự ưu tiên:

1. Route và màn hình trong `frontend/src/router/routes.js`, `frontend/src/pages/`.
2. Lời gọi API thật: quét toàn bộ mã nguồn cho thấy **130 trên 205 hàm** trong `src/services/api.js` được màn hình gọi. Đây là phạm vi "đúng tính năng".
3. Quy tắc nghiệp vụ trong `frontend/src/mocks/engine.js` và các handler.
4. Đặc tả `DAC_TA_LUONG_VA_CHUC_NANG_WEBSITE_PHONG_TRO.md` cho những phần website chưa thể hiện hết.

Giả định đã chọn: nhiều chủ trọ bằng `organizations`, một tài khoản tham gia được nhiều đơn vị; thuê nguyên phòng; một đợt thuê có một khách đại diện và có thể có người ở cùng; một khách đại diện chỉ có một đợt thuê đang hoạt động; thu tiền thủ công có chứng từ. Các chính sách chưa chốt ở §10.3 của đặc tả xem [§10](#10-chính-sách-chờ-chủ-trọ-chốt).

## 2. Thay đổi so với bản 103 bảng

Còn **74 bảng**. Bản cũ nằm ở `archive/v1-103-bang/`.

| Bỏ | Lý do | Nếu cần lại |
|---|---|---|
| `reservations`, `room_allocations` | Website không tạo được giữ chỗ. Lịch phòng gộp vào `tenancies` | Thêm bảng giữ chỗ, mở rộng EXCLUDE |
| `room_transfers`, chuyển cọc giữa đợt thuê | Không còn luồng chuyển phòng: kết thúc hợp đồng cũ, tạo hợp đồng mới, hoàn cọc rồi thu cọc mới | Thêm lại bảng nối hai đợt thuê |
| `expenses`, `expense_categories` | Không còn màn hình chi phí | Migration riêng |
| `ai_conversations`, `ai_messages`, `integration_connections`, `integration_events` | Không còn màn hình, chưa tích hợp | Thêm khi làm tính năng |
| `email_configurations`, `message_templates`, `reminder_rules`, `background_job_runs` | Không còn màn hình cấu hình; SMTP đặt ở cấu hình máy chủ | Thêm khi có màn hình |
| `outbox_messages`, `notification_deliveries`, `delivery_attempts` | Gộp thành `email_outbox` | |
| `address_datasets`, `administrative_units`, `addresses` | Website nhập địa chỉ tay ba trường, đưa thẳng vào `properties` và `tenants` | |
| `room_assets`, `handover_assets` | Không có màn hình tài sản. Trang Hợp đồng chỉ hiện tài sản trong biên bản, nay là `handover_items` | |
| `inquiry_events`, `onboarding_gaps`, `meter_replacements`, `meter_reading_files`, `invoice_files`, `invoice_issue_batches`, `invoice_issue_batch_items`, `settlement_invoices`, `export_jobs`, `business_hours`, `business_holidays` | Không có màn hình dùng, hoặc suy ra được từ dữ liệu khác. Xuất CSV ghi vào `audit_logs` | |

| Gộp | Thành |
|---|---|
| `rate_plans` + `charge_rates` | `charge_rates` với đúng một phạm vi: cơ sở, phòng hoặc phiên bản hợp đồng |
| `property_billing_settings` | Cột của `properties` |
| `contract_terminations` | Cột của `contracts` |
| `room_allocations` | Cột `room_id`, `stay` của `tenancies` |

| Thêm | Phục vụ |
|---|---|
| `contract_attachments` | Tệp bổ sung sau khi ký ở chi tiết hợp đồng |
| `payment_intended_invoices` | Hóa đơn khách chọn khi báo chuyển khoản, để gợi ý cho quản lý |
| `handover_items` | Tài sản trong biên bản bàn giao |
| `email_outbox` | Hàng đợi email đặt lại mật khẩu, hóa đơn, nhắc nợ |
| `api_idempotency_keys` | Chống gửi trùng ở tầng API |
| `document_counters` | Cấp mã chứng từ an toàn khi nhiều người cùng thao tác |
| `room_listings.video_url`, `rental_inquiries.preferred_viewing_at`, `rental_inquiries.source`, `rental_inquiries.code`, `users.avatar_file_id`, `payments.code`, `invoice_lines.source_scope`, `invoices.needs_recompute`, các cột `proposed_emergency_contact_*`, `organization_settings.meter_reading_day`, `invoice_create_day`, `billing_reminder_enabled`, `tenant_identity_documents.number_last4` | Các trường website đang dùng mà bản cũ thiếu |
| Loại hóa đơn `opening_balance`, khoản thu `OPENING_BALANCE` | Nợ cũ khi chuyển từ sổ tay sang hệ thống |

**Lỗi của bản cũ đã sửa**, phát hiện khi đối chiếu với website, cả hai đều làm luồng thật hỏng khi nối backend:

- Trả phòng sau khi tháng đã có hóa đơn: website lập hóa đơn cuối chỉ có điện nước, trùng ngày với hóa đơn tháng, ràng buộc cũ từ chối. Nay chỉ chặn trùng ngày khi cả hai đều có tiền thuê.
- Gia hạn: bản ký của phiên bản gia hạn là phụ lục, trigger cũ chỉ nhận loại `signed`. Nay nhận cả `signed` và `appendix`.

## 3. Vì sao đạt 3NF

**1NF:** danh sách ảnh, tiện ích, người ở, vai trò, khoản thu đều là bảng con hoặc bảng liên kết, không nằm trong một cột.

**2NF:** bảng liên kết có khóa ghép như `room_amenities(room_id, amenity_id)` và không mang thuộc tính của từng bên.

**3NF:** bảng con không lặp `organization_id`, `property_id`. Đơn vị suy theo đường sở hữu:

```text
invoice -> tenancy -> room -> property -> organization
payment -> tenant -> organization
contract_version -> contract -> tenancy
```

Tên người, địa chỉ, đơn giá trên chứng từ đã ký hoặc đã phát hành là **ảnh chụp lịch sử**, không phải bản sao của hồ sơ hiện tại, nên không vi phạm 3NF và không đồng bộ ngược.

Không lưu `total_debt`, `paid_amount`, `current_tenant_id`, `paid_until`. Số suy ra chỉ có một nguồn là view. `rooms.operating_status` chỉ nói phòng được khai thác hay không; Đã thuê suy từ `tenancies`.

`jsonb` chỉ dùng cho nhật ký và phản hồi lưu lại của khóa chống trùng; dữ liệu nghiệp vụ đều có cột và khóa ngoại thật. Mọi bảng đều có khóa chính.

## 4. Màn hình nào dùng bảng nào

| Khu website | Bảng chính | View, hàm |
|---|---|---|
| Đăng ký, đăng nhập, quên mật khẩu, phiên | `users`, `user_sessions`, `user_tokens`, `tenants`, `email_outbox` | |
| Trang chủ, Thuê phòng, chi tiết phòng | `room_listings`, `rooms`, `room_images`, `room_amenities`, `room_types`, `properties` | `v_public_rooms`, `room_rates` |
| Đặt lịch xem phòng | `rental_inquiries` | |
| Liên hệ | `users` của chủ trọ, `organizations`, `properties` | |
| Hóa đơn của khách, thanh toán | `invoices`, `invoice_lines`, `invoice_meter_segments`, `payments`, `payment_files`, `payment_intended_invoices`, `bank_accounts` | `v_invoice_balances` |
| Hỗ trợ | `tickets`, `ticket_messages`, `ticket_files`, `ticket_events`, `ticket_categories`, `sla_policies` | |
| Hợp đồng của khách | `contracts`, `contract_versions`, `contract_files`, `handovers`, `handover_items`, `tenancy_residents`, `tenancy_requests` | `v_contract_status`, `v_deposit_balances` |
| Tài khoản, thông báo | `tenants`, `tenant_identity_documents`, `tenant_profile_change_requests`, `notifications` | |
| Admin: Tổng quan | Không có bảng riêng, tính từ các bảng khác | Mọi view |
| Admin: Cơ sở | `properties`, `charge_rates`, `charge_types` | |
| Admin: Phòng | `rooms`, `room_images`, `amenities`, `room_amenities`, `room_listings`, `room_status_events`, `meters`, `charge_rates` | `v_room_status`, `room_rates` |
| Admin: Lịch xem phòng | `rental_inquiries`, `room_viewings` | |
| Admin: Tính tiền phòng | `billing_periods`, `billing_period_events`, `meter_readings`, `invoices`, `invoice_lines`, `charge_instances` | `effective_rates` |
| Admin: Khách thuê | `tenants`, `tenant_identity_documents`, `tenant_profile_change_requests` | `v_tenant_status`, `v_tenant_debts` |
| Admin: Hợp đồng | `tenancies`, `contracts`, `contract_versions`, `contract_parties`, `contract_files`, `contract_attachments`, `handovers`, `deposit_entries`, `checkout_settlements`, `tenancy_requests` | `v_contract_status`, `v_deposit_balances` |
| Admin: Hóa đơn | `invoices`, `payments`, `payment_allocations`, `payment_reversals` | `v_invoice_balances`, `v_payment_balances`, `v_cash_movements` |
| Admin: Ticket | Như Hỗ trợ của khách, có ghi chú nội bộ | |
| Admin: Cài đặt | `users`, `organization_settings` | |
| Phân quyền theo vai trò | `organization_memberships`, `business_roles`, `business_role_permissions`, `membership_roles`, `membership_properties`, `permissions` | |
| Quản trị hệ thống | `organizations`, `users`, `support_access_grants`, `backup_runs`, `notifications` | |
| Nền tảng | `stored_files`, `audit_logs`, `api_idempotency_keys`, `document_counters`, các bảng Identity | `next_document_no` |

## 5. Phòng, đợt thuê, hợp đồng

**Lịch phòng nằm ngay trên `tenancies`.** Cột `stay` là khoảng `[ngày vào, ngày trả)` tính tự động. `EXCLUDE USING gist` chặn hai đợt thuê chồng nhau trên một phòng, kể cả hai transaction chạy cùng lúc, và không bỏ qua đợt đã kết thúc nên lịch sử không bị chèn đè. Ngày trả là biên mở nên người sau vào cùng ngày hợp lệ. Đợt đã hủy không chiếm lịch.

**Tạo hợp đồng là nhận phòng.** Với đợt thuê thường, lúc COMMIT phải đủ hợp đồng đã ký có hiệu lực tại ngày vào, biên bản nhận phòng đã xác nhận, và chỉ số đầu cho mỗi khoản tính theo công tơ. Thiếu chỉ số là lỗi, không coi là 0.

**Khách đã ở sẵn** từ mục Đã thuê của form phòng hoặc từ dữ liệu cũ dùng `onboarding_mode = 'import'`: không cần hợp đồng giả, nhưng chưa có hợp đồng ký thì không phát hành được hóa đơn tháng.

**Hợp đồng đã ký bị khóa** cùng các bên, tệp và giá của phiên bản. Gia hạn là phiên bản mới có bản ký hoặc phụ lục riêng. Tệp bổ sung sau khi ký vào `contract_attachments`. `ends_on` là ngày đầu tiên hết hiệu lực; ngày ghi trên hợp đồng là `ends_on - 1`. Hết hạn không tự trả phòng: `v_contract_status` báo `still_occupied_after_expiry`.

**Phòng không đổi trạng thái để gỡ khách.** Trigger chặn ngừng khai thác phòng đang có người và chặn nhận khách vào phòng bảo trì hoặc đã ngừng. Xóa được phòng chưa có lịch sử, dữ liệu đi kèm xóa theo; phòng đã có đợt thuê thì khóa ngoại từ chối.

## 6. Giá, chỉ số, hóa đơn

`effective_rates(tenancy, ngày)` chọn giá theo thứ tự: phiên bản hợp đồng đã ký, riêng phòng, cơ sở. Giá 0 là giá thật và vẫn được ưu tiên. `room_rates(phòng, ngày)` dùng cho phòng chưa có đợt thuê. Đổi giá là đóng `effective_to` rồi thêm dòng mới; `unit_price` không sửa được. Dòng giá nhập nhầm chưa lên hóa đơn thì xóa được.

Chỉ số không giảm theo thời gian trên cùng công tơ, kiểm tra cả lần trước và lần sau. Sửa số là hủy bản cũ có lý do rồi ghi bản mới; số đã lên hóa đơn phát hành thì không sửa được. Thay công tơ: chốt `removed_at`, thêm công tơ mới; một dòng điện có thể gồm nhiều đoạn trong `invoice_meter_segments`.

| `kind` | Quy tắc |
|---|---|
| `periodic` | Hóa đơn tháng; duy nhất theo đợt thuê và tháng; khoảng ngày không chồng |
| `final` | Hóa đơn cuối. Chỉ có điện nước thì được trùng ngày với hóa đơn tháng; có tiền thuê thì không |
| `one_time` | Phát sinh riêng |
| `replacement` | Liên kết hóa đơn đã hủy |
| `debit_adjustment`, `credit_adjustment` | Điều chỉnh liên kết hóa đơn gốc đang hiệu lực; không nhận phân bổ tiền trực tiếp |
| `opening_balance` | Nợ cũ từ sổ tay; không cần hợp đồng và bảng giá |

Tổng hóa đơn = tổng `sign × round(quantity × unit_price × tử / mẫu)`, làm tròn từng dòng về đồng, nửa ra xa 0. Sau phát hành chỉ được hủy có lý do, và phải đảo hết phân bổ trước. Phí một lần là `charge_instances` dùng lại khi lập lại; `invoice_charge_claims` có khóa chính chặn thu hai lần, hóa đơn hủy thì nhả ra. Khóa tháng chặn ghi chỉ số và hóa đơn của tháng đó; mở khóa bắt buộc có `smartrent.reason`.

## 7. Thu tiền, cọc, công nợ

Báo chuyển khoản là `pending`, không tính đã thu. Chỉ `confirmed` mới phân bổ được. Một khoản thu chia được cho nhiều hóa đơn, một hóa đơn nhận được nhiều lần thu. Mỗi phân bổ có đúng một nguồn: khoản thu hoặc bù trừ cọc.

Sổ cọc giữ khoản thu gốc của từng dòng nên không dùng một khoản hai lần. Ba khái niệm tách riêng: cọc đề xuất ở `rooms`, cọc thỏa thuận ở `contract_versions`, cọc thực thu ở `deposit_entries`. Hoàn cọc gắn với một giao dịch tiền ra. `payments` đã xác nhận, `payment_reversals`, `deposit_entries`, `payment_allocations` không sửa, không xóa; sai thì ghi dòng đảo.

Kiểm tra lúc COMMIT, sau khi khóa hồ sơ khách để hai thao tác đồng thời không cùng dùng số dư cũ:

```text
Tiền đã dùng = phân bổ ròng + cọc đang giữ từ khoản đó <= tiền xác nhận - đảo, hoàn
Cọc theo từng nguồn >= 0
Bù trừ cọc ròng = phân bổ từ bù trừ đó
Phân bổ ròng vào hóa đơn <= số phải thu sau điều chỉnh
```

Trigger là `DEFERRABLE INITIALLY DEFERRED` nên các dòng đối ứng ghi theo thứ tự nào cũng được trong một transaction.

| View | Dùng cho |
|---|---|
| `v_invoice_totals` | Tổng mặt chứng từ từ dòng hóa đơn |
| `v_invoice_balances` | Phải thu, đã thu, còn nợ, Chưa thu / Thu một phần / Đã thu đủ, Quá hạn |
| `v_allocation_movements`, `v_deposit_movements` | Phân bổ và sổ cọc có dấu |
| `v_tenant_debts` | Nợ theo khách, gồm cả khách đã rời |
| `v_deposit_balances` | Cọc đang giữ theo đợt thuê |
| `v_payment_balances` | Tiền nhận, đảo, đã phân bổ, chưa phân bổ |
| `v_cash_movements` | Dòng tiền theo ngày giao dịch |
| `v_room_status` | Còn trống, Đã thuê, Bảo trì, Ngừng khai thác |
| `v_contract_status` | Trạng thái hợp đồng, số ngày còn lại, sắp hết hạn |
| `v_tenant_status` | Chưa thuê, Đang thuê, Đã trả phòng |
| `v_public_rooms` | Phòng hiện ở trang Thuê phòng |

## 8. Giao dịch máy chủ cần thực hiện

| Thao tác | Các bước trong cùng một transaction |
|---|---|
| Tạo hợp đồng, nhận phòng | Khóa phòng; `tenancies`; `contracts`, phiên bản, các bên, tệp, giá; ký; `handovers`; chỉ số đầu; `active`; cọc nếu thu; đóng yêu cầu xem phòng |
| Phát hành | Khóa tháng, hóa đơn, khách; lấy giá, chỉ số; tạo dòng, claim, đoạn công tơ; cấp mã bằng `next_document_no`; `issued`; thông báo |
| Xác nhận tiền | Kiểm khóa chống trùng; `pending` sang `confirmed`; phân bổ hoặc nhận cọc; thông báo |
| Hoàn, bù trừ cọc | Khóa khách và nguồn tiền; thêm các dòng đối ứng; kiểm tra lúc COMMIT |
| Gia hạn | Khóa hợp đồng; phiên bản mới, các bên, tệp, giá; ký |
| Trả phòng | Chốt chỉ số, biên bản; hóa đơn cuối; quyết toán; thu, hoàn, bù trừ; `ended`; chấm dứt hợp đồng; trạng thái phòng |
| Mở lại ticket | Kiểm quyền và lý do; trạng thái mới; hạn mới; `ticket_events` |

Không `SaveChanges` rời rạc rồi bỏ lại dữ liệu dở dang. Trong transaction, đặt `smartrent.actor_id`, `smartrent.reason`, `smartrent.correlation_id` bằng `set_config(..., true)`.

## 9. Database bảo vệ gì, API phải làm gì

**Database đã có:** khóa chính, khóa ngoại, giới hạn giá trị, mã duy nhất, lịch không chồng, cùng đơn vị cho mọi liên kết chéo, chứng từ bất biến sau ký và phát hành, cân đối tiền và cọc, khóa tháng, chỉ số theo chuỗi, nhật ký tự động.

**API vẫn phải làm:** kiểm tra quyền ở mọi truy cập theo vai trò và cơ sở; chỉ cho khách xem dữ liệu của mình qua `tenants.user_id`; không cấp quyền vượt người cấp; chuyển trạng thái đúng thứ tự; sức chứa; kiểm tra tệp và quét mã độc; hồ sơ và thẩm quyền ký; điều kiện đóng đợt thuê còn nợ; tính SLA; cấp mã; tác vụ nền gửi email.

**Chưa bật Row Level Security.** Trigger cùng đơn vị chặn nối sai dữ liệu nhưng không giới hạn SELECT. EF query filter và kiểm tra theo bản ghi là bắt buộc, kể cả raw SQL và xuất file.

Số giấy tờ lưu mã hóa, không lưu dạng rõ. Khóa mã hóa do backend giữ, không đặt trong database. Hàm nhập SQL dùng `pgp_sym_encrypt`; nếu backend dùng thuật toán khác thì phải thống nhất trước khi nhập giấy tờ thật. `audit_logs` chứa liên hệ khách nên phải bảo vệ như dữ liệu riêng tư.

## 10. Chính sách chờ chủ trọ chốt

Database có chỗ lưu nhưng không tự quyết định thay chủ trọ: cách tính giữa tháng (`proration_policy`), phí theo người, ai được duyệt tiền (cấu hình theo vai trò), xử lý khi ở tiếp sau hết hợp đồng, chấm dứt sớm, mức cọc chuyển thành bồi thường, phạt trễ (không có sẵn), SLA theo giờ làm việc (hiện tính liên tục 24/7).
