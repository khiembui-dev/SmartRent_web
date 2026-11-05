# Khách thuê, lịch xem, hợp đồng và trả phòng

Tài liệu này mô tả phần đã triển khai trong `src/SmartRent.Api/Features`. Thiết kế dùng baseline 13 bảng: **không tạo** bảng `tenants`, `viewings`, `tenancies`, `contract_versions`, `meters` hay bảng cọc riêng.

## Bản đồ dữ liệu

| Chức năng | Nơi lưu dữ liệu |
|---|---|
| Khách thuê | `users`, với `role = 'user'` |
| Lời mời/phiên đăng nhập | `auth_tokens` |
| Yêu cầu và lịch xem | `bookings`, `kind = 'viewing'`, lịch hẹn ở `appointments` |
| Đề nghị sửa hồ sơ | `bookings`, `kind = 'profile_change'` |
| Hợp đồng/nhận phòng | `contracts`; phiên bản, người ở, bàn giao, số đầu ở JSONB |
| Gia hạn/trả phòng do khách đề nghị | `bookings`, `kind = 'renewal'` hoặc `checkout` |
| Cọc/quyết toán | `payments`; hóa đơn cuối là `invoices.kind = 'final'` |

`tenantId` là `users.id`; `tenancyId` và `contractId` cùng là `contracts.id`.

## Hạ tầng chung

`Common/LeasingInfrastructure.cs` đăng ký PostgreSQL và Bearer authentication. Token gửi qua `Authorization: Bearer <token>` được SHA-256 trước khi so với `auth_tokens.token_hash`; chỉ token loại `session`, chưa hết hạn, chưa thu hồi và người dùng đang hoạt động mới hợp lệ.

`LeasingController.BeginAsync` bắt buộc lấy actor từ token, kiểm tra admin khi cần, mở transaction `Serializable` và gọi `set_config('smartrent.user_id', ...)`. Vì vậy trigger trong `database/02_rules.sql` biết chính xác ai đang thao tác; client không thể tự gửi `userId` để giả danh.

Mỗi thao tác ghi gọi `CommitAsync`. Hàm này bắt lỗi ở thời điểm commit, kể cả deferred constraint của cọc/hóa đơn/trả phòng. Không trả `200` khi database từ chối quyết toán ở cuối transaction.

## Khách thuê

`Features/Tenants/TenantsController.cs` xử lý CRUD admin cho `users.role='user'`:

- `GET/POST /api/v1/tenants`, `GET/PUT /api/v1/tenants/{id}`: danh sách, tìm kiếm, tạo và sửa hồ sơ. Khi trùng điện thoại/email, API trả `409 possible_duplicate_tenant` trừ khi client xác nhận `confirmDuplicate`.
- `POST .../password`: băm mật khẩu bằng `PasswordHasher`; chỉ bật `login_enabled` khi đã có email, đúng rule schema.
- `POST .../portal-invitation`: lưu token lời mời có hạn 7 ngày. Hiện trả `invitationToken` cho admin để gửi thủ công; khi nối dịch vụ email, thay phần trả token bằng email sender.
- `PortalProfileController`: khách chỉ đọc hồ sơ của chính mình, gửi/hủy đề nghị sửa phone/email.
- `ProfileChangeRequestsController`: admin duyệt/từ chối. Khi duyệt mới cập nhật `users`; client không được tự sửa hồ sơ trực tiếp.

## Lịch xem phòng

`Features/Viewings` làm việc với `bookings.kind='viewing'`.

- Khách tạo yêu cầu qua `POST /api/v1/portal/inquiries`; server lấy `user_id` từ token, gọi `expire_holds()` trước khi thao tác, và lấy tên/liên hệ mặc định từ hồ sơ.
- Admin dùng `GET /api/v1/inquiries`, `POST /{id}/viewings` để xếp lịch. Khi hẹn lại, lịch `scheduled` cũ được đổi sang `cancelled`, sau đó mới thêm lịch mới. Trigger database kiểm tra chỉ có một lịch scheduled và `hostId` phải là admin.
- `GET /api/v1/viewings` tách từng phần tử trong JSON `appointments` thành danh sách lịch. `POST /api/v1/viewings/{appointmentId}/result` ghi `completed`, `no_show` hoặc `cancelled` mà không nhận cả mảng lịch từ browser.
- Chuyển trạng thái yêu cầu `reject`, `convert`, `cancel` đều chạy trong transaction và ghi người duyệt/lý do.

## Hợp đồng và nhận phòng

`ContractsController` trả DTO từ `contracts` cùng khách, phòng và cơ sở. Các phiên bản là mảng `versions`: bản đã ký không bị database cho sửa/xóa. Tệp đính kèm là UUID trong `attachments`; trigger kiểm tra tệp private/clean.

`TenanciesController.CheckIn` thực hiện một transaction:

1. Khóa phòng và hết hạn giữ chỗ.
2. Tạo `contracts` active, version đã ký, snapshot giá/điều khoản, số điện nước đầu và biên bản nhận phòng.
3. Nếu có cọc, thêm payment `deposit_receipt` đã xác nhận; không cộng/sửa số tiền cọc trực tiếp ở hợp đồng.
4. Commit. Trigger chặn phòng đã có người/giữ chỗ, file không sạch, thiếu giá thuê hoặc thiếu số đầu của dịch vụ metered.

Check-in hỗ trợ `Idempotency-Key`: cùng key trả lại hợp đồng đã tạo; key nằm trong metadata của chính hợp đồng vì schema không có bảng idempotency tổng quát.

## Trả phòng

`POST /api/v1/tenancies/{id}/checkout` không tin `total` hay danh sách bù trừ từ browser. Nó tạo lines cuối từ snapshot giá hợp đồng và chỉ số cuối, phát hành invoice final, tự lấy cọc đang giữ từ `v_deposit_balances`, ưu tiên bù các hóa đơn còn nợ rồi hoàn phần dư bằng `deposit_refund`. Sau đó API đóng người ở, hợp đồng và đổi trạng thái phòng.

Commit cuối cùng còn đi qua trigger `validate_checkout`: phải có invoice final, số cuối khớp invoice, cọc đã quyết toán và phải ghi lý do nếu vẫn còn nợ. Đây là lớp bảo vệ quan trọng nhất: nếu một bước sai toàn bộ transaction rollback.

## Cấu hình và chạy

1. Tạo database từ `database/01_schema.sql`, `02_rules.sql`, `03_seed.sql`.
2. Tạo tài khoản runtime và chạy `select smartrent.configure_runtime('smartrent_runtime');`. API không nên kết nối bằng postgres/superuser.
3. Đặt secret, không commit mật khẩu thật:

```powershell
dotnet user-secrets set "ConnectionStrings:SmartRent" "Host=...;Database=...;Username=smartrent_runtime;Password=..." --project .\src\SmartRent.Api
dotnet run --project .\src\SmartRent.Api
```

`appsettings.json` chỉ là giá trị mẫu cục bộ. AuthController cần phát session token dùng cùng `TokenAuthenticationHandler.TokenHash`; phần login/email/files thuộc module khác vẫn cần hoàn thiện trước khi đưa production.

## Kiểm tra đã chạy

```powershell
dotnet build .\src\SmartRent.Api\SmartRent.Api.csproj
dotnet test .\tests\SmartRent.Api.Tests\SmartRent.Api.Tests.csproj
```

Kết quả tại thời điểm viết: build thành công, 4/4 test cấu trúc API thành công.
