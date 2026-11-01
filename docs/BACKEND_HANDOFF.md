# Bàn giao cho backend SmartRent

Tài liệu cho team ASP.NET Core Web API + EF Core + Npgsql + PostgreSQL. Mỗi trang code ở đâu xem `backend/HUONG_DAN_THEO_TRANG.md`. Frontend đã chạy được hoàn toàn bằng mock trong trình duyệt; mock dùng **đúng** đường dẫn, DTO và mã lỗi trong `docs/api/openapi.yaml`. Mọi đường dẫn, tên trường và quy ước dưới đây là **đề xuất để thống nhất**, chưa phải API đã tồn tại.

Trạng thái kiểm chứng tại lần cập nhật gần nhất (01/11/2026, sau khi làm lại khu khách):

- `openapi.yaml`: 240 thao tác, OpenAPI 3.1, `npx @redocly/cli@1.34.5 lint` báo hợp lệ (1 cảnh báo không quan trọng về license).
- `npm run check:contract` (trong `frontend/`): route mock ⇄ openapi.yaml ⇄ lời gọi trong `src/` khớp nhau.
- `npm run test:mock`: 158 kiểm tra nghiệp vụ đạt; cả 240 route mock đều được gọi thành công ít nhất một lần.
- Schema request/response trong YAML được suy ra từ response thật của mock rồi rút gọn thành schema dùng chung; ví dụ request lấy từ kịch bản kiểm thử.

## 0. Thay đổi khi thiết kế lại khu quản trị (31/10/2026)

Khu quản trị rút còn 10 khu: Tổng quan, Cơ sở, Phòng, Lịch xem phòng, Tính tiền phòng, Khách thuê, Hợp đồng, Hóa đơn, Ticket, Cài đặt. Các trang khác đã xóa. **Route mock và `openapi.yaml` của phần đã xóa vẫn giữ** (báo cáo, sổ cọc, công nợ, nhân sự, nhật ký, AI, chi phí...) vì đây là hợp đồng đề xuất và cổng khách vẫn phát sinh dữ liệu cho chúng; team backend quyết định có làm hay không. `npm run check:contract` liệt kê các thao tác hiện chưa có giao diện gọi.

Thao tác mới:

| Thao tác | Dùng ở | Ghi chú cho backend |
|---|---|---|
| `POST/PUT /rooms` với `occupant` | Form phòng, mục Đã thuê | "Đã thuê" không phải trạng thái lưu trên `rooms`. Backend tạo trong cùng transaction: `tenancies` với `status='active'`, `onboarding_mode='import'` và số đầu `reading_kind='baseline'`. Phần còn thiếu suy từ dữ liệu: chưa có hợp đồng ký. Không tạo `contracts`. Cần thêm quyền `tenancies.checkin`. |
| `POST /tenancies/{id}/contracts` thêm `readings`, `deposit` | Bổ sung hợp đồng | Nhập hợp đồng đã ký thật cho khách đang ở, kèm số đầu còn thiếu và cọc thực thu, trong một transaction. Phát hành hóa đơn vẫn yêu cầu bản ký như `02_rules.sql`. |
| `POST /tenancies/{id}/cancel-import` | Chi tiết phòng | Gỡ khách khi chưa có hợp đồng, hóa đơn, tiền cọc: tenancy `cancelled`, chỉ số `void` có lý do. Không xóa dòng nào. |
| `roomTypeId` không còn bắt buộc | Form phòng | Cột `rooms.room_type_id` vẫn NOT NULL. Backend gán loại `STANDARD`, loại này có sẵn nhờ `initialize_organization()`. |
| `PUT /me/profile` | Cài đặt | Đổi email là đổi email đăng nhập: nên xác minh email mới qua `UserManager` thay vì đổi thẳng như mock. Ảnh đại diện ở `users.avatar_file_id`. |
| `POST /tenants/{id}/password` | Hồ sơ khách | Quản trị đặt mật khẩu cho khách. Yêu cầu từ chủ dự án. Khi làm thật: thu hồi mọi phiên, buộc đổi ở lần đăng nhập kế tiếp, ghi nhật ký, không lưu hay trả lại mật khẩu rõ. Cân nhắc thay bằng liên kết đặt lại mật khẩu. |
| `POST /contracts/{id}/attachments`, `DELETE .../{attachmentId}` | Hồ sơ hợp đồng | Tệp bổ sung sau khi ký. Phiên bản đã ký bị trigger khóa nên dùng bảng `contract_attachments`. |
| `GET`, `PUT /settings/billing-schedule` | Cài đặt, Tính tiền, Tổng quan | Ngày nhập số và ngày tạo hóa đơn hằng tháng. Hiện chỉ nhắc trên giao diện; gửi email/đẩy là việc của tác vụ nền. |

Thao tác đã có nhưng nhận thêm trường:

| Thao tác | Thay đổi |
|---|---|
| `POST`, `PUT /properties` | `rates: [{ chargeTypeId, unitPrice }]`. `code` không bắt buộc khi tạo; máy chủ sinh từ tên (Nhà trọ Bình Thạnh → NTBT, thêm số nếu trùng). Tạo cơ sở và bảng giá trong một transaction. |
| `POST`, `PUT /rooms` | `rates`, `imageFileIds`; `POST` thêm `operatingStatus`; `PUT` thêm `rent`. Giá trùng giá cơ sở thì **không** tạo giá riêng (đóng giá riêng nếu đang có) để phòng tiếp tục theo cơ sở. Phòng mới luôn được tạo công tơ điện và nước; serial tự sinh nếu không gửi. |
| `POST /payment-allocations/{id}/reverse` | `reversePayment: true` đảo luôn số tiền trên khoản thu trong cùng transaction, cần quyền `payments.reverse`. Dùng cho nút Hoàn tác ở hóa đơn. |
| `GET /billing-periods/{id}/worksheet` | Mỗi dòng có `estimate` (`lines`, `fixedTotal`, `total`, `unitPrices`) để xem trước. Chỉ là tạm tính. |
| `GET /invoices` | Lọc thêm `hasPending`, `outstanding`; kèm `summary` tính trên toàn bộ tập đã lọc. DTO hóa đơn có `pendingPaymentCount`, `pendingPaymentAmount`. |
| `GET /dashboard` | Thêm `billing` (tiến độ tháng hiện tại, lịch nhắc), `viewings`, `tickets`, `contracts`, `recent.viewings`, `recent.overdueInvoices`, `recent.expiringContracts`; `rooms.strip` có tên khách và cờ `needsReading`, `overdue`. |
| `GET /contracts/{id}` | Thêm `tenant`, `roomInfo`, `deposit`, `attachments`, `invoices`, `requests`, `meters`. |

Quyết định luồng cần team backend nắm:

- **Tạo hóa đơn là phát hành luôn**: trang Tính tiền gọi `POST /invoice-batches` với `action: issue`. Nháp cũ vẫn phát hành được từ trang chi tiết hóa đơn.
- **Tạo hợp đồng là nhận phòng**: `POST /tenancies/check-in` chế độ `new`. Vì vậy ngày vào ở không được ở tương lai, và bản đã ký là bắt buộc (`database/02_rules.sql` chặn ký khi thiếu tệp).
- **"Chuyển trạng thái" hóa đơn không sửa trường trạng thái**: đánh dấu đã thanh toán tạo khoản thu đã xác nhận rồi phân bổ; hoàn tác tạo dòng đảo; hủy cần lý do và bị chặn khi còn phân bổ. Khi nối ngân hàng, webhook đi theo đúng luồng này.

## 0a. Khu khách làm lại (01/11/2026)

Luồng mới: khách tự tạo tài khoản, đăng nhập rồi mới đặt lịch xem phòng. Admin thêm phòng và hợp đồng cho khách thì Hóa đơn, Hỗ trợ, Hợp đồng mới có nội dung.

| Thay đổi | Ở đâu | Ghi chú cho backend |
|---|---|---|
| `POST /auth/register` (mới) | Đăng ký | Tạo `users` và `tenants` ở đơn vị đang hoạt động đầu tiên, trả phiên. Không tự nối vào hồ sơ có sẵn trùng email/điện thoại khi chưa xác minh email: nếu nối sẽ lộ hóa đơn của người khác. Cần chốt đơn vị nhận khách khi có nhiều chủ trọ |
| `POST`, `GET /portal/inquiries` (mới) | Đặt lịch xem phòng | Bắt buộc đăng nhập, chỉ nhận phòng đang trống, chặn trùng theo khách và phòng (`room_not_available`, `inquiry_exists`). Ghi `rental_inquiries.tenant_id`. Đặt phòng đơn vị khác thì tạo hồ sơ khách ở đơn vị đó |
| `POST /public/inquiries`, `POST /public/contact` (bỏ) | Công khai | Không còn đường đặt lịch khi chưa đăng nhập; form liên hệ không còn |
| `GET /public/contact-info` (mới) | Trang Liên hệ | Điện thoại và email lấy từ tài khoản chủ trọ (`users`, sửa ở Cài đặt), thiếu thì lấy của `organizations` |
| `GET /public/rooms`, `/public/filters` | Trang Thuê phòng | Chỉ trả phòng còn trống: không có đợt thuê, không giữ chỗ trong 1 tháng tới, không bảo trì, tin chưa bị admin ẩn. Bỏ tham số `availableOnly`. Chi tiết `/public/rooms/:slug` vẫn mở được kèm trạng thái thật |
| Tạo phòng | `POST /rooms` | Tự tạo tin đăng `published` để phòng trống hiện ngay ở trang khách |
| `feeSummary`, `depositRange`, `properties` | `GET /public/filters` | Tính từ bảng giá đang áp dụng của các phòng trống, không gồm tiền thuê |
| `hasVideo`, `videoUrl` | Tin đăng công khai | `room_listings.video_url` |
| `paymentStatus`, `hasPending` | `GET /portal/invoices` | Lọc ở máy chủ để phân trang đúng |
| `rent`, `room.areaM2` | Đợt thuê ở cổng khách | `rent` theo hợp đồng hiệu lực, chưa có hợp đồng thì theo bảng giá phòng. Người ở cùng nhận `null` |
| `handovers[].readings` | `GET /portal/tenancies/:id` | Chỉ số công tơ ghi khi bàn giao, chỉ người đại diện thấy |

Đường dẫn trong thông báo cho khách đổi sang `/invoices`, `/tickets/:id`, `/contract`, `/account`. `/portal` chỉ còn chuyển tiếp sang `/invoices`; đường dẫn API `/api/v1/portal/*` giữ nguyên.

## 0b. Database thiết kế lại (01/11/2026)

`database/` được thiết kế lại theo đúng website: **74 bảng, 12 view**, bản 103 bảng cũ ở `database/archive/v1-103-bang/`. Đọc `database/THIET_KE_DATABASE.md` §2 cho danh sách thay đổi, §4 cho bảng theo màn hình.

Điều team backend cần lưu ý:

- **Lịch phòng nằm trên `tenancies`** (`room_id`, cột sinh `stay`), không còn `room_allocations`. Giá nằm thẳng trên `charge_rates` theo một trong ba phạm vi, không còn `rate_plans`. Địa chỉ là cột của `properties` và `tenants`.
- **Tổng số liệu đã có view:** `v_public_rooms`, `v_room_status`, `v_contract_status`, `v_tenant_status`, `v_invoice_balances`, `v_tenant_debts`, `v_deposit_balances`, `v_payment_balances`, `v_cash_movements`. Không tính lại ở API.
- **Cấp mã chứng từ:** `next_document_no(organization_id, series)`.
- **Sai lệch đã phát hiện và sửa so với bản cũ:** hóa đơn cuối chỉ điện nước được trùng ngày hóa đơn tháng; bản ký khi gia hạn nhận cả `appendix`.

Các route trong `openapi.yaml` và mock không còn bảng tương ứng, vì không có màn hình nào gọi. Khi cần phải thêm migration, không gọi được ngay:

| Nhóm route | Bảng đã bỏ |
|---|---|
| `/reservations` (trừ `cancel`, xem dưới) | `reservations`, `room_allocations` |
| `/tenancies/{id}/transfer`, `/deposit/transfers` | `room_transfers`, dòng chuyển cọc |
| `/expenses`, `/expense-categories` | `expenses`, `expense_categories` |
| `/ai/*` | `ai_conversations`, `ai_messages` |
| `/integrations`, `/settings/email`, `/settings/templates`, `/settings/reminder-rules`, `/jobs`, `/deliveries` | Các bảng cấu hình và tác vụ nền |
| `/rooms/{id}/assets` | `room_assets` |
| `/invoice-batches/{id}`, `/invoice-batches/{id}/retry` | `invoice_issue_batches` (`POST /invoice-batches` vẫn dùng được, trả kết quả ngay) |
| `/meters/{id}/replace` | Không cần bảng riêng: chốt `meters.removed_at`, thêm công tơ mới, chỉ số `replacement` |

`reservationsApi.cancel` ở trang chi tiết phòng chỉ hiện khi có giữ chỗ, nên sẽ không xuất hiện khi dùng database mới. Có thể gỡ khỏi frontend khi nối API.

## 1. Chuyển frontend từ mock sang API thật

| Việc | Cách làm |
|---|---|
| Bật API | `frontend/.env.local`: `VITE_DATA_SOURCE=api`, `VITE_API_BASE_URL=https://api...` (hoặc để trống khi cùng origin). Khi dev: `VITE_DEV_API_PROXY=http://localhost:5080` để Vite proxy `/api`. Build lại sau khi đổi. |
| Không tự fallback | Ở chế độ `api`, lỗi mạng/máy chủ hiển thị cho người dùng (trạng thái lỗi + nút thử lại); frontend **không** quay về dữ liệu giả. |
| Một lớp HTTP | `src/services/client.js` + `http-transport.js`: gắn `Authorization: Bearer`, `X-Organization-Id`, `Idempotency-Key`; `credentials: 'include'` (gửi cookie refresh); timeout `VITE_API_TIMEOUT_MS`; hủy request khi rời trang; 204 → `null`. |
| 401 | Client gọi `POST /api/v1/auth/refresh` **một lần** rồi gửi lại request (an toàn vì request bị từ chối ở bước xác thực chưa được xử lý); nếu vẫn 401 → về `/login?expired=1`. |
| 403 / 404 | Hiển thị trang "không có quyền" / "không tìm thấy". Dữ liệu ngoài phạm vi cơ sở nên trả **404** để không lộ sự tồn tại. |
| Lỗi | `application/problem+json`: `title`, `status`, `detail` (tiếng Việt cho người dùng), `code` (máy đọc, xem `ErrorCode` trong YAML), `errors` theo đường dẫn trường. Client tự đổi khóa kiểu ASP.NET (`Contract.EndsOn`, `Lines[0].Amount`, có thể kèm tiền tố `$.`) sang dạng form dùng (`contract.endsOn`, `lines.0.amount`) để gắn lỗi đúng ô. |
| Ngày, tiền | Ngày nghiệp vụ `YYYY-MM-DD` (DateOnly), thời điểm ISO 8601 UTC có `Z` (timestamptz). Khoảng nửa mở `[from, to)`: `endsOn`, `serviceTo` là ngày **không tính**. Tiền VND là số nguyên JSON. |

Không cần sửa trang/component khi chuyển: mọi trang chỉ gọi `src/services/api.js`.

## 2. Xác thực, phiên và CORS

- ASP.NET Core Identity; mật khẩu chỉ lưu băm. `POST /auth/login` trả access token ngắn hạn (JWT hoặc opaque) trong body; refresh token đặt trong cookie `HttpOnly; Secure; SameSite=Lax` (hoặc `Strict` khi cùng site), đường dẫn `/api/v1/auth`.
- Ở chế độ API frontend **không** lưu access token vào localStorage (chỉ mock làm vậy để xem trước); khi tải lại trang, frontend gọi `/auth/refresh` để lấy token mới.
- `GET /me` trả: các đơn vị đang là thành viên (vai trò, danh sách quyền, phạm vi `all`/`assigned`, cơ sở được giao), hồ sơ khách thuê (vai trò đại diện/người ở cùng theo đợt thuê), cờ `isSystemAdmin`. Frontend chỉ dùng để ẩn/hiện; **máy chủ kiểm tra lại mọi API**.
- Đổi mật khẩu, khóa tài khoản, tạm khóa thành viên: thu hồi các phiên khác (`user_sessions`).
- `POST /auth/forgot-password` luôn trả cùng một kết quả (không lộ email tồn tại); token đặt lại một lần, có hạn.
- Rate limit: đăng nhập, quên mật khẩu, `POST /public/*` (trả 429 kèm `Retry-After`).
- CORS khi khác origin: `AllowedOrigins` = origin frontend; `AllowCredentials`; header cho phép `Authorization, Content-Type, X-Organization-Id, Idempotency-Key`; phương thức GET/POST/PUT/PATCH/DELETE; expose `Retry-After`. Không dùng `*` cùng credentials.

## 3. Quyền và phạm vi dữ liệu

- Nhân sự: mọi API nghiệp vụ nhận `X-Organization-Id`; kiểm tra membership `active`, quyền (`x-permission` từng thao tác trong YAML, mã quyền theo `database/03_seed.sql`) và phạm vi cơ sở (`membership_properties`). Truy vấn danh sách phải lọc theo phạm vi **trước** khi đếm/phân trang; xuất dữ liệu, báo cáo và AI dùng cùng bộ lọc.
- Không có RLS: dùng EF global query filter theo đơn vị + kiểm tra bản ghi ở từng handler; raw SQL/export cũng phải lọc.
- Cấp quyền: không cho cấp vai trò/quyền mà người cấp không có (`403 privilege_escalation`); không gỡ chủ trọ cuối cùng (`last_owner`); không tự đổi vai trò của mình.
- Khách thuê: đi qua `tenants.user_id`, không dùng quyền nhân sự. Người đại diện xem hóa đơn/thanh toán/cọc của đợt thuê mình; **người ở cùng** chỉ xem phòng, thời hạn/điều khoản hợp đồng, ticket; không xem công nợ, bảng giá, bản ký của người đại diện; không gửi đề nghị gia hạn/chuyển/trả.
- Quản trị hệ thống chỉ xem số liệu tổng quát của đơn vị; đọc dữ liệu nghiệp vụ cần `support_access_grants` đang hiệu lực, có lý do, có hạn và ghi nhật ký.
- Vai trò mặc định do `initialize_organization()` tạo. Bản demo có thêm vai trò tự tạo "Kỹ thuật" để chứng minh vai trò tùy biến.

## 4. Danh sách, lọc, sắp xếp, phân trang

- Tham số chung: `page` (từ 1), `pageSize` (≤ 200), `sort` (`field` hoặc `-field`, nhiều trường cách dấu phẩy, chỉ nhận trường trong danh sách cho phép), `q` (tìm không phân biệt hoa thường và **không dấu**: dùng `unaccent`/cột chuẩn hóa).
- Response: `{ items, page, pageSize, totalItems, totalPages, totalAll }`. `totalAll` là tổng trước lọc trong phạm vi quyền, để hiển thị "x trên y". Một số danh sách trả thêm tổng hợp (ví dụ `netTotal` của chi phí, `unreadCount` của thông báo, tổng công nợ theo tuổi nợ).
- Lọc/tìm/sắp xếp **trên toàn bộ tập ở máy chủ** (tiêu chí §10.2.14). Bảng DataTables ở frontend tự chuyển `start/length/order/search` thành các tham số trên; backend không cần hiểu tham số DataTables.
- Xuất CSV hiện do frontend phân trang gọi API (pageSize 200) để lấy toàn bộ tập theo bộ lọc và ghi một bản ghi `POST /exports`. Mỗi lần xuất ghi vào `audit_logs`. Excel/PDF là việc của máy chủ, chưa có bảng riêng: frontend đang hiển thị trạng thái "chờ máy chủ (mô phỏng)".

## 5. Tệp tải lên

- `POST /api/v1/files` dạng `multipart/form-data`: `file`, `visibility` (`private`/`public`), `purpose` (`identity_front`, `identity_back`, `contract_signed`, `payment_proof`, `handover`, `ticket`, `room_image`, `expense`, `other`). Kiểm tra loại (JPG, PNG, WEBP, PDF), kích thước (≤ 10 MB), quét mã độc (`scan_status`) trước khi cho dùng; trả `FileRef`.
- Tệp riêng tư **không** nằm trong `public/` hay URL cố định. `GET /files/{id}/download-url` trả URL có hạn ngắn (ví dụ 5 phút, presigned/SAS) sau khi kiểm tra quyền **theo chứng từ gắn tệp**: giấy tờ tùy thân cần `tenants.identity.read`; hợp đồng ký cần `contracts.read`; chứng từ thu cần `payments.read`; khách thuê chỉ tải tệp thuộc ticket/hợp đồng (khi là đại diện)/chứng từ thanh toán của chính mình, không tải tệp của ghi chú nội bộ. Mock đã áp dụng đúng các quy tắc này để kiểm thử giao diện.
- Ảnh phòng công khai phải là tệp `public` đã quét an toàn.

## 6. Chống lặp và giao dịch

- Thao tác đánh dấu `x-idempotent: true` trong YAML nhận header `Idempotency-Key` (UUID do client tạo, **giữ nguyên khi thử lại**, đổi sau khi thành công). Cùng khóa + cùng nội dung → trả lại kết quả cũ; cùng khóa + nội dung khác → `422 idempotency_key_reused`. Các bảng `invoices`, `payments`, `payment_reversals`, `deposit_entries`, `payment_allocations` có cột `idempotency_key`; các thao tác khác (đặt lịch, tạo hợp đồng, trả phòng, ticket) dùng bảng `api_idempotency_keys`.
- Frontend chặn gửi trùng (khóa nút, khóa chống lặp ổn định) và không tự thử lại thao tác ghi.
- Mỗi thao tác trong `THIET_KE_DATABASE.md §8` chạy trong **một transaction**; đặt `smartrent.actor_id`, `smartrent.reason`, `smartrent.correlation_id` bằng `set_config(..., true)`. Ghi sự kiện/outbox cùng transaction.
- Ánh xạ SQLSTATE: `23505` trùng/replay → 409 (hoặc trả kết quả cũ nếu là replay hợp lệ); `23503` đang được tham chiếu → 409; `23514` vi phạm quy tắc → 422; `23P01` chồng lịch phòng/giá/công tơ → 409 (`room_overlap`...); `40001`/`40P01` → thử lại **cả transaction** ở máy chủ.
- Concurrency token `xmin` cho bản ghi sửa được (hồ sơ, phòng, nháp) → 409 khi dữ liệu đã đổi.

## 7. Quy tắc máy chủ mà giao diện đang dựa vào

Frontend chỉ tính để **xem trước**; số liệu xác nhận lấy từ response.

| Nhóm | Quy tắc |
|---|---|
| Phòng, tin đăng | Tin đăng độc lập trạng thái ở. Không đổi phòng đang có người sang ngừng khai thác (`room_occupied`); không xóa phòng/cơ sở đã có lịch sử. Phòng công khai chỉ khi đã có ảnh. |
| Giữ chỗ | Không còn trong database (xem §0b). Website không tạo được giữ chỗ. |
| Nhận phòng | Một transaction: đợt thuê, hợp đồng đã ký (bắt buộc bản ký), chỉ số đầu (thiếu chỉ số là lỗi, không coi 0), bàn giao, cọc thực thu (khác mức cọc yêu cầu). Hai yêu cầu nhận cùng phòng chỉ một thành công. |
| Giá | `effective_rates` (hợp đồng đã ký → phòng → cơ sở); giá 0 hợp lệ; đổi giá = đóng `effective_to` + dòng mới, trả danh sách đợt thuê bị ảnh hưởng; không sửa hóa đơn cũ. |
| Chỉ số | Không nhỏ hơn lần trước trong cùng chuỗi công tơ (`reading_decreased`), không ở tương lai; sửa bằng bản ghi sửa có lý do; thay công tơ chốt hai đoạn. Ghi chỉ số đánh dấu nháp liên quan "cần tính lại". |
| Hóa đơn | Nháp → phát hành (cấp mã, khóa nội dung). Đã phát hành chỉ: gửi, in, điều chỉnh tăng/giảm có lý do, hủy có lý do (khi chưa có tiền phân bổ còn hiệu lực), thay thế. Phí một lần là `charge_instances`, không lặp. Kỳ khóa chặn ghi; mở khóa bắt buộc lý do. |
| Thu tiền | Báo chuyển khoản là `pending`, **không** tính đã thu. Chỉ tiền `confirmed` mới phân bổ; xác nhận lại không cộng lần hai, **không** gia hạn hóa đơn. Phân bổ không vượt số còn nợ, không chéo khách (`payer_mismatch`). Đảo phân bổ/đảo tiền bằng bút toán liên kết có lý do. Hóa đơn thu một phần vẫn quá hạn khi qua hạn; quá hạn không tự hủy nợ. |
| Cọc | Sổ cọc theo từng phiếu nguồn: nhận, hoàn (lý do, quyền `deposits.refund`), bù trừ vào hóa đơn (lý do). |
| Chuyển phòng | Không còn luồng riêng (xem §0b): kết thúc hợp đồng cũ, tạo hợp đồng mới, hoàn cọc rồi thu cọc mới. |
| Trả phòng | `POST .../checkout/preview` **không ghi**. Xác nhận: chỉ số cuối, hóa đơn cuối (tính tới hết ngày trước ngày trả), bù trừ/hoàn cọc, kết thúc đợt thuê, trạng thái phòng sau trả. Cọc chưa xử lý hết → `deposit_not_settled`; còn nợ sau quyết toán cần quyền + lý do. |
| Ticket | SLA liên tục 4/12/48/96 giờ theo ưu tiên; chuyển trạng thái theo bảng cho phép; mở lại có lý do và hạn mới; ghi chú nội bộ không trả cho khách; chi phí sửa ghi sổ chi phí, không tự vào hóa đơn khách. |
| Tác vụ nền | Chạy ở máy chủ theo giờ cấu hình (Asia/Ho_Chi_Minh), kể cả khi không ai mở trình duyệt: `daily_reminders` chống gửi trùng theo khóa sự kiện + mốc ngày (`409 job_already_ran` khi chạy tay lần hai, `force=true` để chạy lại mà vẫn bỏ qua nhắc đã gửi); Lỗi email không làm mất hóa đơn; có thử lại và nhật ký gửi. |

Các mã lỗi nghiệp vụ mà giao diện xử lý riêng được liệt kê trong `ErrorCode` (YAML) và `x-error-codes` của từng thao tác.

## 8. Phần đang mô phỏng (cần tích hợp thật)

| Chức năng | Hiện trạng ở frontend | Backend cần |
|---|---|---|
| Gửi email (mời nhân sự/khách, hóa đơn, nhắc nợ, đặt lại mật khẩu) | Ghi lịch sử gửi "mô phỏng", không gửi thật | SMTP qua bảng `email_outbox` và tiến trình nền, thử lại, ghi lỗi |
| Mật khẩu SMTP, khóa API tích hợp | Chỉ ghi, không trả lại giao diện (`hasSecret`) | Kho bí mật; không lưu dạng rõ trong bảng |
| Ngân hàng/cổng thanh toán, ký số, hóa đơn điện tử | Chỉ lưu cấu hình, "kiểm tra kết nối" báo chưa có adapter | Đặc tả và nghiệm thu riêng từng nhà cung cấp; webhook kiểm chữ ký + chống lặp theo mã sự kiện |
| Xuất Excel/PDF | Mô phỏng trạng thái chờ | Tạo tệp ở máy chủ, lưu riêng tư, cấp link tải có hạn; cần thêm bảng khi làm |
| Sao lưu, kiểm thử khôi phục | Ghi dòng minh họa | Sao lưu PostgreSQL định kỳ ngoài máy ứng dụng, kiểm thử khôi phục |
| Trợ lý AI | Trả lời bằng luật cố định, chỉ đọc | Lọc dữ liệu theo quyền/cơ sở trước khi gửi mô hình, không gửi giấy tờ, ghi nhật ký; lỗi AI không chặn vận hành |
| Quét mã độc tệp | Giả lập "an toàn" | Quét thật trước khi cho tải/hiển thị |
| Mã VietQR ở hộp thoại thanh toán | Ô chờ có nhãn mô phỏng; `bankAccounts` chỉ có số tài khoản che | Trả số tài khoản đầy đủ cho khách đã đăng nhập và tạo mã VietQR ở máy chủ; không gọi dịch vụ QR ngoài từ trình duyệt |

## 9. Đề xuất dữ liệu

Các đề xuất của bản trước đã áp dụng vào `database/`: `proposed_emergency_contact_*` và `review_notes`, `payment_intended_invoices`, `rental_inquiries.source`, `api_idempotency_keys`, `contract_attachments`, `users.avatar_file_id`, `organization_settings.meter_reading_day`, `invoice_create_day`, `billing_reminder_enabled`, `room_listings.video_url`, `rental_inquiries.preferred_viewing_at`, chứng từ số dư đầu kỳ (`opening_balance`).

Còn lại cần chốt:

1. **Phí theo số lượng** (`per_quantity`): chưa có chỗ nhập số lượng trên đợt thuê; mock tính lượng = 1.
2. **Khách ghi nhận từ form phòng rồi chuyển đi:** khi chưa có chứng từ thì dùng `cancel-import`. Muốn giữ lịch sử ở thật của khách không có hợp đồng thì cần luồng trả phòng không hợp đồng.
3. **Xác minh email khi đăng ký:** `users.email_confirmed` đang để `false`, frontend chưa có bước xác minh. Cần có trước khi cho nối tài khoản tự đăng ký vào hồ sơ khách do admin tạo.
4. **Khóa mã hóa số giấy tờ:** hàm nhập SQL dùng `pgp_sym_encrypt`. Backend cần dùng cùng cách, hoặc thống nhất cách khác trước khi nhập giấy tờ thật.

## 10. Giả định demo cho chính sách chưa chốt (đặc tả §10.3)

Đây là **cấu hình/giả định để xem trước**, không phải nghiệp vụ đã được chủ trọ phê duyệt. Cần chốt trước khi chạy thật.

| Câu hỏi §10.3 | Giả định trong bản demo |
|---|---|
| Nội bộ hay cả công khai/cổng khách; một hay nhiều chủ trọ? | Có cả khu công khai và cổng khách; nhiều đơn vị (An Cư, Hòa Bình), một tài khoản có thể thuộc nhiều đơn vị. |
| Thuê phòng hay giường; một đại diện nhiều phòng? | Thuê nguyên phòng; một đại diện một đợt thuê đang hoạt động trong một đơn vị (đúng giả định của database). |
| Tính giữa tháng, phí theo phòng/người, ngày chuyển, làm tròn? | Lẻ tháng chia theo số ngày thực ở / số ngày của tháng (`actual_days`), có thể chọn trọn tháng trên hợp đồng; phí cố định theo phòng; phí theo người = đại diện + người ở cùng tại đầu kỳ; ngày nhận tính, ngày trả không tính; ngày chuyển thuộc phòng mới; làm tròn từng dòng về đồng, nửa ra xa 0. |
| Giữ chỗ có thu tiền không; hạn, hủy/hoàn? | Giữ chỗ không thu phí; hạn giữ do nhân viên đặt (gia hạn phải có lý do); điều kiện hủy ghi dạng văn bản trên giữ chỗ; hết hạn tự giải phóng bởi tác vụ nền. |
| Ai duyệt thu, hủy/điều chỉnh, hoàn/bù trừ cọc? | Theo quyền: chủ trọ đủ quyền; quản lý xác nhận thu, điều chỉnh, bù trừ cọc nhưng không hoàn cọc, không đảo tiền, không mở khóa kỳ; nhân viên chỉ báo thu (pending), không xác nhận. |
| Ở tiếp khi hết hợp đồng, giá mới, chấm dứt sớm? | Hết hạn mà khách còn ở: đợt thuê vẫn hoạt động, hợp đồng hiện "hết hạn, khách vẫn ở", giá của phiên bản đã ký cuối tiếp tục áp dụng cho tới khi lập phiên bản/hợp đồng mới. Chấm dứt sớm không tự hoàn tiền thuê ngày chưa ở; mọi khoản hoàn/bồi thường phải nhập rõ khi trả phòng. Chấm dứt hợp đồng không tự trả phòng. |
| Chứng từ nội bộ hay tích hợp ngân hàng/ký điện tử/hóa đơn điện tử? | Chứng từ nội bộ; ký bản giấy hoặc ký điện tử bên ngoài (tải bản ký lên); không phát hành hóa đơn điện tử thuế; không đối soát ngân hàng tự động. |
| Mức cọc chuyển thành bồi thường | Không tự chuyển; bồi thường lập bằng dòng phát sinh có căn cứ trên hóa đơn cuối rồi bù trừ cọc có lý do. |
| Phạt trễ hạn | Không có phạt trễ (database không giả định phạt trễ). |
| SLA ticket | Tính liên tục 24/7, chưa trừ giờ nghỉ. |

## 11. Dữ liệu mẫu

Seed của mock (`frontend/src/mocks/seed.js`, phiên bản `v7-2026-11-01`) là dữ liệu **chỉ dành cho demo**, không dùng cho database thật (`initialize_organization()` không tạo dữ liệu mẫu). Có thể dùng làm kịch bản kiểm thử tích hợp: ví dụ hóa đơn `HD-BT2609-001` của phòng A101 = 3.655.000 đ (thu 2.000.000, còn 1.655.000, có khoản báo chuyển khoản 1.655.000 đang chờ xác minh), giá rác 0 đ, phí một lần 30.000 đ chỉ ở tháng 9, giá nước cơ sở Bình Thạnh đổi 22.000 → 25.000 từ 01/09/2026.
