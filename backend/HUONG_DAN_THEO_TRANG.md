# Hướng dẫn code backend theo từng trang

Mỗi trang của website được ghi rõ: ai làm, code ở thư mục nào, file nào, gọi API gì, dùng bảng nào, cần nhớ gì. Tài liệu này đối chiếu từ code thật của frontend (`router/routes.js`, `services/api.js`), `docs/api/openapi.yaml` và `database/`. Đường dẫn API trong tài liệu đều bắt đầu bằng `/api/v1`.

Website có 42 route. Màn hình đang gọi 130 trong 205 hàm API, cộng `POST /auth/refresh` do lớp HTTP gọi. **Chỉ làm các API này.** Phần còn lại ở [mục 11](#11-không-làm).

## 1. Cấu trúc thư mục

```text
backend/
├── SmartRent.sln                 # Mở file này bằng Visual Studio hoặc Rider
├── HUONG_DAN_THEO_TRANG.md       # File bạn đang đọc
├── dotnet-tools.json             # Khóa phiên bản dotnet-ef
├── src/SmartRent.Api/
│   ├── Program.cs                # Người 1 giữ
│   ├── Common/                   # Phần nền dùng chung, Người 1 giữ
│   │   ├── Auth/                 # Người dùng hiện tại, đơn vị, kiểm tra quyền
│   │   ├── Errors/               # Problem Details, đổi mã SQLSTATE thành lỗi API
│   │   ├── Idempotency/          # Xử lý header Idempotency-Key
│   │   ├── Paging/               # page, pageSize, sort, q
│   │   └── Transactions/         # Mở transaction, đặt smartrent.actor_id, reason
│   ├── Data/                     # DbContext và entity sinh từ database, Người 1 giữ
│   └── Features/                 # Code nghiệp vụ, mỗi thư mục một nhóm trang
│       ├── Auth/             # Người 1: Đăng nhập, đăng ký, tài khoản
│       ├── Files/            # Người 1: Tải tệp lên, cấp link tải
│       ├── Settings/         # Người 1: Cài đặt
│       ├── SystemAdmin/      # Người 1: Quản trị hệ thống
│       ├── Catalog/          # Người 2: Danh mục dùng chung
│       ├── Properties/       # Người 2: Cơ sở
│       ├── Rooms/            # Người 2: Phòng
│       ├── PublicSite/       # Người 2: Trang công khai
│       ├── Viewings/         # Người 3: Lịch hẹn xem phòng
│       ├── Tenants/          # Người 3: Khách thuê
│       ├── Contracts/        # Người 3: Hợp đồng, nhận phòng, trả phòng
│       ├── Billing/          # Người 4: Tính tiền phòng
│       ├── Invoices/         # Người 4: Hóa đơn
│       ├── Payments/         # Người 4: Thu tiền, cọc
│       ├── Tickets/          # Người 5: Ticket
│       ├── Notifications/    # Người 5: Thông báo
│       ├── Dashboard/        # Người 5: Tổng quan
│       └── Exports/          # Người 5: Ghi nhận xuất CSV
└── tests/SmartRent.Api.Tests/    # Kiểm thử, đặt theo cùng tên thư mục Features
```

## 2. Phân công

| Người | Thư mục trong `Features/` | Trang |
|---|---|---|
| [Người 1 (giữ database)](#nguoi-1) | `Auth`, `Files`, `Settings`, `SystemAdmin` | 9 mục trang |
| [Người 2](#nguoi-2) | `Catalog`, `Properties`, `Rooms`, `PublicSite` | 10 mục trang |
| [Người 3](#nguoi-3) | `Viewings`, `Tenants`, `Contracts` | 8 mục trang |
| [Người 4](#nguoi-4) | `Billing`, `Invoices`, `Payments` | 5 mục trang |
| [Người 5](#nguoi-5) | `Tickets`, `Notifications`, `Dashboard`, `Exports` | 6 mục trang |

### Tra nhanh theo trang

Cột Thư mục tính từ `backend/src/SmartRent.Api/Features/`. Chi tiết API, bảng và lưu ý nằm ở mục của từng người.

| Trang | Tên | Người | Thư mục |
|---|---|---|---|
| `/login` | Đăng nhập | 1 | `Auth/` |
| `/register` | Đăng ký | 1 | `Auth/` |
| `/forgot-password` | Quên mật khẩu | 1 | `Auth/` |
| `/reset-password` | Đặt lại mật khẩu | 1 | `Auth/` |
| `/admin/settings` | Admin: Cài đặt | 1 | `Settings/`, `Files/`, `Auth/` |
| `/system` | Hệ thống: Đơn vị | 1 | `SystemAdmin/` |
| `/system/users` | Hệ thống: Tài khoản | 1 | `SystemAdmin/` |
| `/system/operations` | Hệ thống: Vận hành | 1 | `SystemAdmin/` |
| `/system/account` | Hệ thống: Tài khoản của tôi | 1 | `Auth/` |
| `/` | Trang chủ | 2 | `PublicSite/` |
| `/rooms` | Thuê phòng | 2 | `PublicSite/` |
| `/rooms/:slug` | Chi tiết phòng | 2 | `PublicSite/` |
| `/contact` | Liên hệ | 2 | `PublicSite/` |
| `/admin/properties` | Admin: Danh sách cơ sở | 2 | `Properties/` |
| `/admin/properties/new`, `/admin/properties/:id/edit` | Admin: Thêm, sửa cơ sở | 2 | `Properties/` |
| `/admin/properties/:id` | Admin: Chi tiết cơ sở | 2 | `Properties/`, `Rooms/` |
| `/admin/rooms` | Admin: Danh sách phòng | 2 | `Rooms/` |
| `/admin/rooms/new`, `/admin/rooms/:id/edit` | Admin: Thêm, sửa phòng | 2 | `Rooms/`, `Properties/`, `Catalog/` |
| `/admin/rooms/:id` | Admin: Chi tiết phòng | 2 | `Rooms/` |
| `/admin/viewings` | Admin: Lịch hẹn xem phòng | 3 | `Viewings/` |
| `/admin/tenants` | Admin: Danh sách khách thuê | 3 | `Tenants/` |
| `/admin/tenants/:id` | Admin: Hồ sơ khách | 3 | `Tenants/`, `Contracts/` |
| `/admin/contracts` | Admin: Danh sách hợp đồng | 3 | `Contracts/` |
| `/admin/contracts/new` | Admin: Tạo hợp đồng, nhận phòng | 3 | `Viewings/`, `Tenants/`, `Contracts/` |
| `/admin/contracts/:id` | Admin: Chi tiết hợp đồng | 3 | `Contracts/` |
| `/contract` | Khách: Hợp đồng | 3 | `Contracts/` |
| `/account` | Khách: Tài khoản | 3 | `Tenants/` |
| `/admin/billing` | Admin: Tính tiền phòng | 4 | `Billing/`, `Invoices/` |
| `/admin/invoices` | Admin: Danh sách hóa đơn | 4 | `Invoices/` |
| `/admin/invoices/:id` | Admin: Chi tiết hóa đơn | 4 | `Invoices/`, `Payments/` |
| `/invoices` | Khách: Hóa đơn | 4 | `Invoices/` |
| `/invoices/:id` | Khách: Chi tiết hóa đơn | 4 | `Invoices/`, `Payments/` |
| `/admin` | Admin: Tổng quan | 5 | `Dashboard/` |
| `/admin/tickets`, `/admin/tickets/:id` | Admin: Ticket | 5 | `Tickets/` |
| `/tickets` | Khách: Hỗ trợ | 5 | `Tickets/` |
| `/tickets/new` | Khách: Gửi yêu cầu hỗ trợ | 5 | `Tickets/` |
| `/tickets/:id` | Khách: Chi tiết hỗ trợ | 5 | `Tickets/` |
| `/notifications`, `/system/notifications` | Thông báo | 5 | `Notifications/` |

Quy tắc để không dẫm chân nhau:

- Chỉ sửa file trong thư mục của mình. Cần thứ gì ở thư mục người khác thì nhờ người đó, hoặc gọi service họ đã viết (mục 4).
- Một trang có thể gọi API của người khác. Bảng API của mỗi trang ghi rõ file nào, thuộc ai.
- `Common/`, `Data/`, `Program.cs` và `database/` chỉ Người 1 sửa.
- Cần đổi bảng thì báo Người 1, xem `database/migrations/README.md`.
- Đổi đường dẫn, tên trường hoặc mã lỗi thì phải sửa cả `docs/api/openapi.yaml`, `frontend/src/services/api.js` và mock, rồi chạy `npm run check:contract` trong `frontend/`.

## 3. Phần nền Người 1 làm trước

Bốn người còn lại phụ thuộc phần này, nên phải đưa lên Git đầu tiên. Trong lúc chờ, các bạn cài database theo `database/HUONG_DAN_CAI_DAT.md` và đọc mục của mình.

1. Sinh entity từ database. Chạy tại `backend/src/SmartRent.Api/` sau khi đã lưu connection string (bước 7 của hướng dẫn cài database):
   ```powershell
   dotnet tool restore
   dotnet restore
   dotnet ef dbcontext scaffold 'Name=ConnectionStrings:SmartRent' Npgsql.EntityFrameworkCore.PostgreSQL --schema smartrent --context SmartRentDbContext --context-dir Data --output-dir Data/Entities --no-onconfiguring
   ```
   Lệnh sinh khoảng 78 file trong `Data/Entities/`. Các dòng báo `Expression index ... cannot be scaffolded` là bình thường: ràng buộc `EXCLUDE` vẫn nằm trong database, chỉ không có trong code C#.
2. Thêm `Data/AuthDbContext.cs`, `Data/ApplicationUser.cs` và đăng ký trong `Program.cs`, theo `database/EF_CORE_NPGSQL.md` mục 2 và 3.
3. Viết `Common/Auth`: lấy người dùng hiện tại, đọc `X-Organization-Id`, kiểm tra thành viên, quyền và phạm vi cơ sở.
4. Viết `Common/Errors`, `Common/Paging`, `Common/Idempotency`, `Common/Transactions`.
5. Viết `POST /auth/login`, `GET /me` để cả nhóm đăng nhập được, rồi đưa lên Git.

Chỉ Người 1 chạy scaffold. Người khác không tự sửa file trong `Data/Entities`, vì scaffold lại sẽ ghi đè. Phần mở rộng của entity đặt ở partial class.

## 4. Cách viết một API

Lấy ví dụ `GET /api/v1/rooms`. Mỗi controller đã có sẵn file rỗng, đúng tên và đúng đường dẫn gốc. Bạn thêm hai file bên cạnh nó:

```text
Features/Rooms/
├── RoomsController.cs   # Có sẵn. Nhận request, kiểm quyền, gọi service, trả response
├── RoomsService.cs      # Bạn tạo. Nghiệp vụ và truy vấn database
└── RoomDtos.cs          # Bạn tạo. Request, response của API
```

Thứ tự làm một API:

1. Tìm trang trong tài liệu này để biết API, file, quyền và bảng.
2. Đọc API đó trong `docs/api/openapi.yaml` để biết chính xác request, response, mã lỗi.
3. Đọc code trong `frontend/src/mocks/handlers/` ghi ở mục của trang. Đó là logic website đang chạy và đã được kiểm thử.
4. Viết DTO, service, rồi thêm action vào controller.
5. Thử với frontend: trong `frontend/.env.local` đặt `VITE_DATA_SOURCE=api` và `VITE_DEV_API_PROXY=http://localhost:5080`, rồi chạy `npm run dev`.

**Mock chỉ để tham khảo logic, không chép nguyên cấu trúc dữ liệu.** Mock còn dùng `roomAllocations`, `reservations`, `ratePlans`; database thật thì lịch phòng nằm trên `tenancies`, giá nằm trên `charge_rates`. Tên bảng lấy từ `database/TU_DIEN_DU_LIEU.md`.

Quy tắc áp dụng cho mọi API:

| Việc | Cách làm |
|---|---|
| Số liệu suy ra (đã thu, còn nợ, cọc, tình trạng phòng) | Đọc từ view `v_*`, không tính lại, không lưu thêm cột |
| Thao tác nhiều bước | Một transaction, theo `database/THIET_KE_DATABASE.md` mục 8 |
| Phân quyền | Không có RLS. Mọi truy vấn phải lọc theo đơn vị và cơ sở được giao, dữ liệu ngoài phạm vi trả 404 |
| Khu khách | Lọc qua `tenants.user_id`, không dùng quyền nhân sự |
| Chống gửi trùng | API có đánh dấu "Có" trong cột Chống trùng phải nhận header `Idempotency-Key` |
| Ngày, giờ, tiền | Ngày dùng `DateOnly`, thời điểm dùng `DateTime` UTC, tiền dùng `decimal` |
| Lỗi | Trả `application/problem+json`, `detail` bằng tiếng Việt, kèm `code` đúng trong `openapi.yaml` |
| Không dùng | `EnsureCreated()`, EF Core Migrations, entity trả thẳng ra API |

### Service dùng chung giữa các thư mục

Các việc sau nhiều người cần, nên một người viết rồi người khác gọi. Thống nhất chữ ký hàm sớm.

| File cần tạo | Người viết | Ai gọi | Làm gì |
|---|---|---|---|
| `Features/Invoices/InvoiceBuilder.cs` | Người 4 | Tính tiền, trả phòng | Tạo dòng hóa đơn từ giá và chỉ số |
| `Features/Payments/DepositService.cs` | Người 4 | Tạo hợp đồng, trả phòng | Thu, hoàn, bù trừ cọc |
| `Features/Notifications/NotificationSender.cs` | Người 5 | Mọi thư mục | Tạo thông báo và ghi `email_outbox` trong cùng transaction |
| `Features/Files/FileAccessService.cs` | Người 1 | Mọi thư mục có tệp | Gắn tệp vào chứng từ, kiểm tra quyền tải |

## 5. Thành phần dùng ở nhiều trang

Các API này xuất hiện ở nhiều trang nên chỉ ghi ở đây, không lặp lại trong từng mục.

| API | Viết ở | Dùng ở | Ghi chú |
|---|---|---|---|
| `GET /catalog` | `Catalog/CatalogController.cs` (Người 2) | Hầu hết trang admin | Nạp danh sách cơ sở, loại phòng, tiện ích, khoản thu, nhân viên, phương thức thanh toán. Trường `expenseCategories` trả mảng rỗng vì không còn bảng chi phí. |
| `GET /rooms` | `Rooms/RoomsController.cs` (Người 2) | Ô chọn phòng | Tìm phòng khi gõ. |
| `GET /tenants` | `Tenants/TenantsController.cs` (Người 3) | Ô chọn khách | Tìm khách khi gõ. |
| `POST /files` | `Files/FilesController.cs` (Người 1) | Mọi ô tải tệp | Nhận `multipart/form-data`, kiểm tra loại và kích thước (≤ 10 MB), trả `FileRef`. |
| `GET /files/{fileId}/download-url` | `Files/FilesController.cs` (Người 1) | Mọi nơi tải tệp riêng tư | Kiểm tra quyền theo chứng từ gắn tệp rồi mới cấp link có hạn. |
| `POST /exports` | `Exports/ExportsController.cs` (Người 5) | Các nút xuất CSV | Frontend tự tạo CSV. API chỉ ghi lại lần xuất vào `audit_logs`. |
| `GET /portal/tenancies` | `Contracts/PortalTenanciesController.cs` (Người 3) | Mọi trang khách | Biết khách có phòng chưa để hiện nội dung phù hợp. |
| `GET /portal/catalog` | `Catalog/PortalCatalogController.cs` (Người 2) | Trang khách | Trả danh mục ticket và tài khoản nhận tiền. Trường `transferTargets` trả mảng rỗng vì không còn luồng chuyển phòng. |
| `GET /notifications/unread-count` | `Notifications/NotificationsController.cs` (Người 5) | Chuông thông báo | Gọi ở khung trang. |
| `GET /notifications` | `Notifications/NotificationsController.cs` (Người 5) | Chuông thông báo | Gọi ở khung trang. |
| `GET /dashboard` | `Dashboard/DashboardController.cs` (Người 5) | Menu admin | Lấy `tasks` để hiện số việc cần làm. |
| `GET /public/contact-info` | `PublicSite/PublicController.cs` (Người 2) | Chân trang khách | Hiện thông tin liên hệ. |
| `POST /auth/logout` | `Auth/AuthController.cs` (Người 1) | Nút đăng xuất | Thu hồi phiên, xóa cookie refresh. |
| `POST /auth/refresh` | `Auth/AuthController.cs` (Người 1) | Lớp HTTP của frontend | Gọi một lần khi gặp 401 và khi tải lại trang |

## 6. Người 1 (giữ database)
<a id="nguoi-1"></a>

Làm phần nền trước (mục 3), rồi đến tài khoản, tải tệp, Cài đặt và Quản trị hệ thống.

### Đăng nhập: `/login`

Đăng nhập rồi nạp thông tin người dùng, đơn vị và quyền.

- **Giao diện:** `frontend/src/pages/auth/login.js`
- **Code backend:** `backend/src/SmartRent.Api/Features/Auth/`
- **Bảng, view:** `users`, `user_sessions`, `organization_memberships`, `business_roles`, `membership_roles`, `business_role_permissions`, `membership_properties`, `tenants`
- **Logic mẫu:** `frontend/src/mocks/handlers/auth.js`

| API | Việc | File trong `Features/` | Quyền | Chống trùng |
|---|---|---|---|---|
| `POST /auth/login` | Đăng nhập | `Auth/AuthController.cs` | Công khai |  |
| `GET /me` | Người dùng hiện tại, đơn vị, quyền | `Auth/MeController.cs` | Đã đăng nhập |  |

Cần nhớ:

- Access token trả trong body. Refresh token đặt trong cookie `HttpOnly`, đường dẫn `/api/v1/auth`.
- `GET /me` trả các đơn vị đang là thành viên, vai trò, quyền, phạm vi cơ sở, hồ sơ khách và cờ `isSystemAdmin`. Frontend chỉ dùng để ẩn hiện, máy chủ vẫn kiểm tra lại ở mọi API.
- Cần rate limit, vượt giới hạn trả 429 kèm `Retry-After`.

### Đăng ký: `/register`

Khách tự tạo tài khoản.

- **Giao diện:** `frontend/src/pages/auth/register.js`
- **Code backend:** `backend/src/SmartRent.Api/Features/Auth/`
- **Bảng, view:** `users`, `tenants`, `user_sessions`
- **Logic mẫu:** `frontend/src/mocks/handlers/auth.js`

| API | Việc | File trong `Features/` | Quyền | Chống trùng |
|---|---|---|---|---|
| `POST /auth/register` | Khách tự tạo tài khoản | `Auth/AuthController.cs` | Công khai |  |

Cần nhớ:

- Tạo `users` và `tenants` ở đơn vị đang hoạt động đầu tiên rồi trả phiên. Tạo tài khoản qua `UserManager`, không ghi thẳng bảng `users`.
- Không tự nối vào hồ sơ có sẵn trùng email hoặc điện thoại khi chưa xác minh email, vì sẽ lộ hóa đơn của người khác.
- Đơn vị nhận khách khi có nhiều chủ trọ chưa chốt (`docs/BACKEND_HANDOFF.md` mục 0a).

### Quên mật khẩu: `/forgot-password`

Gửi email đặt lại mật khẩu.

- **Giao diện:** `frontend/src/pages/auth/forgot.js`
- **Code backend:** `backend/src/SmartRent.Api/Features/Auth/`
- **Bảng, view:** `users`, `email_outbox`
- **Logic mẫu:** `frontend/src/mocks/handlers/auth.js`

| API | Việc | File trong `Features/` | Quyền | Chống trùng |
|---|---|---|---|---|
| `POST /auth/forgot-password` | Yêu cầu đặt lại mật khẩu | `Auth/AuthController.cs` | Công khai |  |

Cần nhớ:

- Luôn trả cùng một kết quả để không lộ email có tồn tại hay không.
- Ghi email vào `email_outbox`, không gửi trực tiếp trong request.
- Cần rate limit.

### Đặt lại mật khẩu: `/reset-password`

Đổi mật khẩu bằng token trong email.

- **Giao diện:** `frontend/src/pages/auth/reset.js`
- **Code backend:** `backend/src/SmartRent.Api/Features/Auth/`
- **Bảng, view:** `users`, `user_sessions`
- **Logic mẫu:** `frontend/src/mocks/handlers/auth.js`

| API | Việc | File trong `Features/` | Quyền | Chống trùng |
|---|---|---|---|---|
| `POST /auth/reset-password` | Đặt lại mật khẩu bằng token | `Auth/AuthController.cs` | Công khai |  |

Cần nhớ:

- Token dùng một lần và có hạn.
- Đổi mật khẩu qua `UserManager`, sau đó thu hồi các phiên khác trong `user_sessions`.

### Admin: Cài đặt: `/admin/settings`

Sửa hồ sơ chủ trọ, đổi mật khẩu, đặt lịch nhập số và tạo hóa đơn hằng tháng.

- **Giao diện:** `frontend/src/pages/admin/settings.js`
- **Code backend:** `backend/src/SmartRent.Api/Features/Settings/`, `backend/src/SmartRent.Api/Features/Files/`, `backend/src/SmartRent.Api/Features/Auth/`
- **Bảng, view:** `users`, `stored_files`, `organization_settings`
- **Logic mẫu:** `frontend/src/mocks/handlers/admin.js`, `frontend/src/mocks/handlers/auth.js`

| API | Việc | File trong `Features/` | Quyền | Chống trùng |
|---|---|---|---|---|
| `GET /settings/billing-schedule` | Lịch nhắc nhập số điện nước và tạo hóa đơn hằng tháng | `Settings/SettingsController.cs` | `billing.read` |  |
| `POST /files` | Tải tệp lên | `Files/FilesController.cs` | Đã đăng nhập |  |
| `PUT /me/profile` | Cập nhật thông tin tài khoản đang đăng nhập | `Auth/MeController.cs` | Đã đăng nhập |  |
| `POST /me/change-password` | Đổi mật khẩu | `Auth/MeController.cs` | Đã đăng nhập |  |
| `PUT /settings/billing-schedule` | Lưu lịch nhắc tính tiền | `Settings/SettingsController.cs` | `settings.manage` |  |

Cần nhớ:

- Đổi email là đổi email đăng nhập, nên xác minh email mới qua `UserManager`. Ảnh đại diện lưu ở `users.avatar_file_id`.
- Lịch nhắc chỉ lưu cấu hình. Gửi nhắc tự động là việc của tác vụ nền.
- `GET /settings/billing-schedule` còn được trang Tính tiền gọi nên đừng đổi DTO mà không báo Người 4.

### Hệ thống: Đơn vị: `/system`

Xem, tạo, tạm khóa và mở lại đơn vị chủ trọ.

- **Giao diện:** `frontend/src/pages/system/organizations.js`
- **Code backend:** `backend/src/SmartRent.Api/Features/SystemAdmin/`
- **Bảng, view:** `organizations`, `organization_memberships`, `users`
- **Hàm database:** `initialize_organization()`
- **Logic mẫu:** `frontend/src/mocks/handlers/system.js`

| API | Việc | File trong `Features/` | Quyền | Chống trùng |
|---|---|---|---|---|
| `GET /system/organizations` | Danh sách đơn vị | `SystemAdmin/SystemOrganizationsController.cs` | SystemAdmin |  |
| `POST /system/organizations` | Tạo đơn vị | `SystemAdmin/SystemOrganizationsController.cs` | SystemAdmin |  |
| `POST /system/organizations/{orgId}/suspend` | Tạm khóa đơn vị | `SystemAdmin/SystemOrganizationsController.cs` | SystemAdmin |  |
| `POST /system/organizations/{orgId}/activate` | Mở lại đơn vị | `SystemAdmin/SystemOrganizationsController.cs` | SystemAdmin |  |

Cần nhớ:

- Tạo đơn vị theo đúng thứ tự: tạo chủ trọ qua `UserManager`, thêm `organizations`, rồi gọi `SELECT smartrent.initialize_organization(@org, @owner)`.
- Tạm khóa cần lý do, lưu ở `organizations.suspended_reason`.
- SystemAdmin chỉ xem số tổng quát. Đọc dữ liệu nghiệp vụ của đơn vị cần `support_access_grants` còn hiệu lực.

### Hệ thống: Tài khoản: `/system/users`

Tìm tài khoản, khóa và mở khóa.

- **Giao diện:** `frontend/src/pages/system/users.js`
- **Code backend:** `backend/src/SmartRent.Api/Features/SystemAdmin/`
- **Bảng, view:** `users`, `user_roles`, `user_sessions`, `organization_memberships`
- **Logic mẫu:** `frontend/src/mocks/handlers/system.js`

| API | Việc | File trong `Features/` | Quyền | Chống trùng |
|---|---|---|---|---|
| `GET /system/users` | Danh sách tài khoản | `SystemAdmin/SystemUsersController.cs` | SystemAdmin |  |
| `POST /system/users/{userId}/lock` | Khóa tài khoản | `SystemAdmin/SystemUsersController.cs` | SystemAdmin |  |
| `POST /system/users/{userId}/unlock` | Mở khóa tài khoản | `SystemAdmin/SystemUsersController.cs` | SystemAdmin |  |

Cần nhớ:

- Khóa tài khoản phải thu hồi các phiên đang mở trong `user_sessions`.
- Khóa tài khoản đi qua `UserManager`.

### Hệ thống: Vận hành: `/system/operations`

Xem tình trạng hệ thống, sao lưu và các quyền hỗ trợ đang cấp.

- **Giao diện:** `frontend/src/pages/system/operations.js`
- **Code backend:** `backend/src/SmartRent.Api/Features/SystemAdmin/`
- **Bảng, view:** `support_access_grants`, `backup_runs`
- **Logic mẫu:** `frontend/src/mocks/handlers/system.js`

| API | Việc | File trong `Features/` | Quyền | Chống trùng |
|---|---|---|---|---|
| `GET /system/support-access` | Danh sách quyền hỗ trợ | `SystemAdmin/SystemOperationsController.cs` | SystemAdmin |  |
| `GET /system/backups` | Danh sách sao lưu | `SystemAdmin/SystemOperationsController.cs` | SystemAdmin |  |
| `GET /system/health` | Tình trạng hệ thống | `SystemAdmin/SystemOperationsController.cs` | SystemAdmin |  |
| `POST /system/backups` | Tạo sao lưu | `SystemAdmin/SystemOperationsController.cs` | SystemAdmin |  |

Cần nhớ:

- Sao lưu thật chưa làm. Giao diện đang ghi dòng minh họa, backend cần ghi rõ trạng thái thật vào `backup_runs`.

### Hệ thống: Tài khoản của tôi: `/system/account`

Đổi mật khẩu, xem và thu hồi phiên đăng nhập.

- **Giao diện:** `frontend/src/pages/shared/account.js`
- **Code backend:** `backend/src/SmartRent.Api/Features/Auth/`
- **Bảng, view:** `users`, `user_sessions`
- **Logic mẫu:** `frontend/src/mocks/handlers/auth.js`

| API | Việc | File trong `Features/` | Quyền | Chống trùng |
|---|---|---|---|---|
| `POST /me/change-password` | Đổi mật khẩu | `Auth/MeController.cs` | Đã đăng nhập |  |
| `GET /me/sessions` | Danh sách phiên đăng nhập | `Auth/MeController.cs` | Đã đăng nhập |  |
| `DELETE /me/sessions/{sessionId}` | Thu hồi phiên đăng nhập | `Auth/MeController.cs` | Đã đăng nhập |  |

Cần nhớ:

- Chỉ được thu hồi phiên của chính mình.

## 7. Người 2
<a id="nguoi-2"></a>

Cơ sở, Phòng và các trang công khai. Phần này ít phụ thuộc người khác nhất.

### Trang chủ: `/`

Hiện bộ lọc và các phòng còn trống. Không cần đăng nhập.

- **Giao diện:** `frontend/src/pages/customer/home/index.js`
- **Code backend:** `backend/src/SmartRent.Api/Features/PublicSite/`
- **Bảng, view:** `v_public_rooms`, `room_listings`, `room_images`, `room_amenities`, `amenities`, `properties`
- **Hàm database:** `room_rates()`
- **Logic mẫu:** `frontend/src/mocks/handlers/public.js`

| API | Việc | File trong `Features/` | Quyền | Chống trùng |
|---|---|---|---|---|
| `GET /public/filters` | Bộ lọc | `PublicSite/PublicController.cs` | Công khai |  |
| `GET /public/rooms` | Danh sách phòng | `PublicSite/PublicController.cs` | Công khai |  |

Cần nhớ:

- Dùng DTO riêng cho công khai, không trả entity đầy đủ.
- Chỉ trả phòng còn trống. Điều kiện đã nằm trong `v_public_rooms`, không viết lại.

### Thuê phòng: `/rooms`

Danh sách và bộ lọc phòng còn trống.

- **Giao diện:** `frontend/src/pages/customer/rooms/list.js`
- **Code backend:** `backend/src/SmartRent.Api/Features/PublicSite/`
- **Bảng, view:** `v_public_rooms`, `room_listings`, `room_images`, `room_amenities`, `amenities`, `properties`, `rental_inquiries`
- **Hàm database:** `room_rates()`
- **Logic mẫu:** `frontend/src/mocks/handlers/public.js`, `frontend/src/mocks/handlers/portal.js`

| API | Việc | File trong `Features/` | Quyền | Chống trùng |
|---|---|---|---|---|
| `GET /public/rooms` | Danh sách phòng | `PublicSite/PublicController.cs` | Công khai |  |
| `GET /public/filters` | Bộ lọc | `PublicSite/PublicController.cs` | Công khai |  |
| `GET /portal/inquiries` | Lịch xem phòng của tôi | `Viewings/PortalInquiriesController.cs` (Người 3) | Khách thuê |  |

Cần nhớ:

- Lọc, sắp xếp, phân trang ở máy chủ trên toàn bộ tập.
- `feeSummary`, `depositRange`, `properties` trong `/public/filters` tính từ bảng giá đang áp dụng của các phòng trống, không gồm tiền thuê.
- Khi khách đã đăng nhập, trang gọi thêm `GET /portal/inquiries` của Người 3 để biết phòng đã đặt lịch.

### Chi tiết phòng: `/rooms/:slug`

Xem phòng và đặt lịch xem. Đặt lịch phải đăng nhập.

- **Giao diện:** `frontend/src/pages/customer/rooms/detail.js`
- **Code backend:** `backend/src/SmartRent.Api/Features/PublicSite/`
- **Bảng, view:** `v_public_rooms`, `rooms`, `room_listings`, `room_images`, `room_amenities`, `rental_inquiries`, `tenants`
- **Hàm database:** `room_rates()`
- **Logic mẫu:** `frontend/src/mocks/handlers/public.js`, `frontend/src/mocks/handlers/portal.js`

| API | Việc | File trong `Features/` | Quyền | Chống trùng |
|---|---|---|---|---|
| `GET /public/rooms/{slug}` | Chi tiết phòng | `PublicSite/PublicController.cs` | Công khai |  |
| `GET /portal/inquiries` | Lịch xem phòng của tôi | `Viewings/PortalInquiriesController.cs` (Người 3) | Khách thuê |  |
| `POST /portal/inquiries` | Đặt lịch xem phòng | `Viewings/PortalInquiriesController.cs` (Người 3) | Khách thuê | Có |

Cần nhớ:

- `GET /public/rooms/{slug}` vẫn mở được phòng đã thuê, kèm trạng thái thật. Video lấy từ `room_listings.video_url`.
- Phần đặt lịch do Người 3 viết. Chỉ nhận phòng đang trống, chặn trùng theo khách và phòng (`room_not_available`, `inquiry_exists`). Đặt phòng của đơn vị khác thì tạo hồ sơ khách ở đơn vị đó.

### Liên hệ: `/contact`

Hiện điện thoại, email của chủ trọ. Khung trang khách cũng gọi API này cho chân trang.

- **Giao diện:** `frontend/src/pages/customer/contact.js`
- **Code backend:** `backend/src/SmartRent.Api/Features/PublicSite/`
- **Bảng, view:** `organizations`, `users`, `properties`
- **Logic mẫu:** `frontend/src/mocks/handlers/public.js`

| API | Việc | File trong `Features/` | Quyền | Chống trùng |
|---|---|---|---|---|
| `GET /public/contact-info` | Thông tin liên hệ | `PublicSite/PublicController.cs` | Công khai |  |

Cần nhớ:

- Điện thoại và email lấy từ tài khoản chủ trọ, thiếu thì lấy của `organizations`.

### Admin: Danh sách cơ sở: `/admin/properties`

Xem, tìm và xóa cơ sở.

- **Giao diện:** `frontend/src/pages/admin/properties.js`
- **Code backend:** `backend/src/SmartRent.Api/Features/Properties/`
- **Bảng, view:** `properties`, `rooms`
- **Logic mẫu:** `frontend/src/mocks/handlers/properties.js`

| API | Việc | File trong `Features/` | Quyền | Chống trùng |
|---|---|---|---|---|
| `GET /properties` | Danh sách cơ sở | `Properties/PropertiesController.cs` | `properties.read` |  |
| `DELETE /properties/{propertyId}` | Xóa cơ sở | `Properties/PropertiesController.cs` | `properties.write` |  |

Cần nhớ:

- Lọc theo phạm vi cơ sở được giao trước khi đếm và phân trang.
- Cơ sở đã có lịch sử thì không xóa được. Khóa ngoại trả `23503`, đổi thành lỗi 409.

### Admin: Thêm, sửa cơ sở: `/admin/properties/new`, `/admin/properties/:id/edit`

Nhập thông tin cơ sở và bảng giá chung.

- **Giao diện:** `frontend/src/pages/admin/property-form.js`
- **Code backend:** `backend/src/SmartRent.Api/Features/Properties/`
- **Bảng, view:** `properties`, `charge_rates`, `charge_types`
- **Logic mẫu:** `frontend/src/mocks/handlers/properties.js`

| API | Việc | File trong `Features/` | Quyền | Chống trùng |
|---|---|---|---|---|
| `GET /properties/{propertyId}` | Chi tiết cơ sở | `Properties/PropertiesController.cs` | `properties.read` |  |
| `PUT /properties/{propertyId}` | Cập nhật cơ sở | `Properties/PropertiesController.cs` | `properties.write` |  |
| `POST /properties` | Tạo cơ sở | `Properties/PropertiesController.cs` | `properties.write` |  |

Cần nhớ:

- Body có `rates: [{ chargeTypeId, unitPrice }]`. Tạo cơ sở và bảng giá trong một transaction.
- `code` không bắt buộc khi tạo: máy chủ sinh từ tên (Nhà trọ Bình Thạnh thành NTBT, thêm số nếu trùng).
- Đổi giá là đóng `effective_to` của dòng cũ rồi thêm dòng mới, không sửa `unit_price`. Giá 0 là giá hợp lệ.

### Admin: Chi tiết cơ sở: `/admin/properties/:id`

Xem cơ sở, các phòng, bảng giá; ngừng hoặc mở lại khai thác.

- **Giao diện:** `frontend/src/pages/admin/property-detail.js`
- **Code backend:** `backend/src/SmartRent.Api/Features/Properties/`, `backend/src/SmartRent.Api/Features/Rooms/`
- **Bảng, view:** `v_room_status`, `properties`, `rooms`, `charge_rates`, `charge_types`
- **Logic mẫu:** `frontend/src/mocks/handlers/properties.js`

| API | Việc | File trong `Features/` | Quyền | Chống trùng |
|---|---|---|---|---|
| `GET /properties/{propertyId}` | Chi tiết cơ sở | `Properties/PropertiesController.cs` | `properties.read` |  |
| `GET /rooms` | Danh sách phòng | `Rooms/RoomsController.cs` | `rooms.read` |  |
| `DELETE /properties/{propertyId}` | Xóa cơ sở | `Properties/PropertiesController.cs` | `properties.write` |  |
| `POST /properties/{propertyId}/deactivate` | Ngừng khai thác cơ sở | `Properties/PropertiesController.cs` | `properties.write` |  |
| `POST /properties/{propertyId}/activate` | Kích hoạt lại cơ sở | `Properties/PropertiesController.cs` | `properties.write` |  |

Cần nhớ:

- Dữ liệu ngoài phạm vi cơ sở trả 404 để không lộ sự tồn tại.
- Ngừng khai thác cần lý do.

### Admin: Danh sách phòng: `/admin/rooms`

Xem, lọc phòng, đổi trạng thái, xóa, xuất CSV.

- **Giao diện:** `frontend/src/pages/admin/rooms.js`
- **Code backend:** `backend/src/SmartRent.Api/Features/Rooms/`
- **Bảng, view:** `v_room_status`, `rooms`, `room_status_events`, `properties`, `tenancies`, `tenants`
- **Logic mẫu:** `frontend/src/mocks/handlers/properties.js`

| API | Việc | File trong `Features/` | Quyền | Chống trùng |
|---|---|---|---|---|
| `GET /rooms` | Danh sách phòng | `Rooms/RoomsController.cs` | `rooms.read` |  |
| `DELETE /rooms/{roomId}` | Xóa phòng | `Rooms/RoomsController.cs` | `rooms.write` |  |
| `POST /rooms/{roomId}/status` | Đổi trạng thái khai thác | `Rooms/RoomsController.cs` | `rooms.write` |  |

Cần nhớ:

- Tình trạng ở lấy từ `v_room_status`. `rooms.operating_status` chỉ nói phòng có khai thác hay không.
- Lọc `contract=missing` là phòng có khách nhưng đợt thuê chưa có hợp đồng.
- Không cho ngừng khai thác phòng đang có người (`room_occupied`). Không đổi nhãn phòng để gỡ khách.
- Phòng chưa có lịch sử thì xóa được, dữ liệu đi kèm xóa theo. Phòng đã có đợt thuê thì khóa ngoại từ chối.

### Admin: Thêm, sửa phòng: `/admin/rooms/new`, `/admin/rooms/:id/edit`

Nhập phòng, giá, ảnh, tiện ích. Mục Đã thuê gán khách đang ở.

- **Giao diện:** `frontend/src/pages/admin/room-form.js`
- **Code backend:** `backend/src/SmartRent.Api/Features/Rooms/`, `backend/src/SmartRent.Api/Features/Properties/`, `backend/src/SmartRent.Api/Features/Catalog/`
- **Bảng, view:** `rooms`, `room_types`, `room_images`, `room_amenities`, `amenities`, `room_listings`, `charge_rates`, `meters`, `meter_readings`, `tenancies`, `tenants`, `stored_files`
- **Logic mẫu:** `frontend/src/mocks/handlers/properties.js`, `frontend/src/mocks/handlers/tenants.js`

| API | Việc | File trong `Features/` | Quyền | Chống trùng |
|---|---|---|---|---|
| `GET /rooms/{roomId}` | Chi tiết phòng | `Rooms/RoomsController.cs` | `rooms.read` |  |
| `GET /properties/{propertyId}` | Chi tiết cơ sở | `Properties/PropertiesController.cs` | `properties.read` |  |
| `POST /catalog/amenities` | Tạo tiện nghi | `Catalog/CatalogController.cs` | `settings.manage` |  |
| `PATCH /rooms/{roomId}/images` | Sắp xếp/cập nhật ảnh phòng | `Rooms/RoomsController.cs` | `rooms.write` |  |
| `DELETE /rooms/{roomId}/images/{imageId}` | Xóa ảnh phòng | `Rooms/RoomsController.cs` | `rooms.write` |  |
| `PUT /rooms/{roomId}` | Cập nhật phòng | `Rooms/RoomsController.cs` | `rooms.write` |  |
| `POST /rooms` | Tạo phòng | `Rooms/RoomsController.cs` | `rooms.write` |  |
| `POST /rooms/{roomId}/status` | Đổi trạng thái khai thác | `Rooms/RoomsController.cs` | `rooms.write` |  |
| `PUT /tenants/{tenantId}` | Cập nhật khách thuê | `Tenants/TenantsController.cs` (Người 3) | `tenants.write` |  |
| `POST /tenants` | Tạo khách thuê | `Tenants/TenantsController.cs` (Người 3) | `tenants.write` |  |
| `POST /tenants/{tenantId}/password` | Quản trị đặt mật khẩu mới cho tài khoản khách | `Tenants/TenantsController.cs` (Người 3) | `tenants.write` |  |

Cần nhớ:

- `POST`, `PUT /rooms` có thể kèm `occupant`. "Đã thuê" không phải trạng thái lưu trên `rooms`: trong cùng transaction tạo `tenancies` với `status='active'`, `onboarding_mode='import'` và chỉ số đầu `reading_kind='baseline'`. Không tạo hợp đồng. Cần thêm quyền `tenancies.checkin`.
- Bỏ ô Loại phòng: `roomTypeId` không bắt buộc, backend gán loại `STANDARD` của đơn vị.
- Giá trùng giá cơ sở thì không tạo giá riêng, và đóng giá riêng nếu đang có.
- Phòng mới luôn được tạo công tơ điện và nước, serial tự sinh nếu không gửi, và tin đăng `published` để hiện ngay ở trang khách.
- Hộp thoại tạo khách ở trang này gọi API của Người 3.

### Admin: Chi tiết phòng: `/admin/rooms/:id`

Xem phòng, khách đang ở, hợp đồng, tin đăng; ẩn hiện tin, gỡ khách nhập nhầm.

- **Giao diện:** `frontend/src/pages/admin/room-detail.js`
- **Code backend:** `backend/src/SmartRent.Api/Features/Rooms/`
- **Bảng, view:** `v_room_status`, `rooms`, `room_listings`, `room_images`, `room_status_events`, `tenancies`, `contracts`
- **Hàm database:** `room_rates()`
- **Logic mẫu:** `frontend/src/mocks/handlers/properties.js`, `frontend/src/mocks/handlers/contracts.js`, `frontend/src/mocks/handlers/tenancies.js`, `frontend/src/mocks/handlers/leasing.js`

| API | Việc | File trong `Features/` | Quyền | Chống trùng |
|---|---|---|---|---|
| `GET /rooms/{roomId}` | Chi tiết phòng | `Rooms/RoomsController.cs` | `rooms.read` |  |
| `GET /contracts` | Danh sách hợp đồng | `Contracts/ContractsController.cs` (Người 3) | `contracts.read` |  |
| `DELETE /rooms/{roomId}` | Xóa phòng | `Rooms/RoomsController.cs` | `rooms.write` |  |
| `POST /rooms/{roomId}/status` | Đổi trạng thái khai thác | `Rooms/RoomsController.cs` | `rooms.write` |  |
| `PUT /rooms/{roomId}/listing` | Cập nhật tin đăng | `Rooms/RoomsController.cs` | `rooms.write` |  |
| `POST /tenancies/{tenancyId}/cancel-import` | Gỡ khách ghi nhận từ form phòng | `Contracts/TenanciesController.cs` (Người 3) | `tenancies.checkin` |  |
| `POST /reservations/{reservationId}/cancel` | Hủy giữ chỗ | **Không làm** | `inquiries.write` |  |

Cần nhớ:

- Tin đăng độc lập với tình trạng ở.
- `POST /tenancies/{id}/cancel-import` do Người 3 viết: chỉ gỡ khi chưa có hợp đồng, hóa đơn, tiền cọc; đợt thuê chuyển `cancelled`, chỉ số thành `void` có lý do, không xóa dòng nào.
- Nút hủy giữ chỗ chỉ hiện khi có giữ chỗ. Database không còn giữ chỗ nên **không làm** API này.

## 8. Người 3
<a id="nguoi-3"></a>

Khách thuê, Lịch hẹn xem phòng, Hợp đồng và luồng nhận phòng, trả phòng.

### Admin: Lịch hẹn xem phòng: `/admin/viewings`

Xem yêu cầu, xếp lịch, ghi kết quả, chuyển trạng thái.

- **Giao diện:** `frontend/src/pages/admin/viewings.js`
- **Code backend:** `backend/src/SmartRent.Api/Features/Viewings/`
- **Bảng, view:** `rental_inquiries`, `room_viewings`, `rooms`, `tenants`
- **Logic mẫu:** `frontend/src/mocks/handlers/leasing.js`

| API | Việc | File trong `Features/` | Quyền | Chống trùng |
|---|---|---|---|---|
| `GET /inquiries` | Danh sách yêu cầu thuê | `Viewings/InquiriesController.cs` | `inquiries.read` |  |
| `GET /viewings` | Danh sách lịch xem | `Viewings/ViewingsController.cs` | `inquiries.read` |  |
| `POST /inquiries/{inquiryId}/viewings` | Tạo lịch xem | `Viewings/InquiriesController.cs` | `inquiries.write` |  |
| `POST /inquiries/{inquiryId}/transitions` | Chuyển trạng thái yêu cầu | `Viewings/InquiriesController.cs` | `inquiries.write` |  |
| `POST /viewings/{viewingId}/result` | Ghi kết quả buổi xem | `Viewings/ViewingsController.cs` | `inquiries.write` |  |

Cần nhớ:

- API phải kiểm tra thứ tự chuyển trạng thái, database không tự kiểm tra việc này.
- Yêu cầu từ khách do `POST /portal/inquiries` tạo ra. Có ràng buộc duy nhất cho yêu cầu đang mở theo khách và phòng.
- Từ yêu cầu có thể chuyển sang tạo hợp đồng, xem trang `/admin/contracts/new`.

### Admin: Danh sách khách thuê: `/admin/tenants`

Xem, tìm, thêm, sửa khách và đặt mật khẩu, xuất CSV.

- **Giao diện:** `frontend/src/pages/admin/tenants.js`
- **Code backend:** `backend/src/SmartRent.Api/Features/Tenants/`
- **Bảng, view:** `v_tenant_status`, `v_tenant_debts`, `tenants`, `users`
- **Hàm database:** `normalize_text()`
- **Logic mẫu:** `frontend/src/mocks/handlers/tenants.js`

| API | Việc | File trong `Features/` | Quyền | Chống trùng |
|---|---|---|---|---|
| `GET /tenants` | Danh sách khách thuê | `Tenants/TenantsController.cs` | `tenants.read` |  |
| `PUT /tenants/{tenantId}` | Cập nhật khách thuê | `Tenants/TenantsController.cs` | `tenants.write` |  |
| `POST /tenants` | Tạo khách thuê | `Tenants/TenantsController.cs` | `tenants.write` |  |
| `POST /tenants/{tenantId}/password` | Quản trị đặt mật khẩu mới cho tài khoản khách | `Tenants/TenantsController.cs` | `tenants.write` |  |

Cần nhớ:

- Tìm không dấu bằng `normalize_text`, có sẵn index trigram.
- Trạng thái và công nợ lấy từ view, không tính lại.

### Admin: Hồ sơ khách: `/admin/tenants/:id`

Xem hồ sơ, hợp đồng, công nợ; duyệt yêu cầu sửa hồ sơ; mời vào cổng khách; đặt mật khẩu.

- **Giao diện:** `frontend/src/pages/admin/tenant-detail.js`
- **Code backend:** `backend/src/SmartRent.Api/Features/Tenants/`, `backend/src/SmartRent.Api/Features/Contracts/`
- **Bảng, view:** `v_tenant_status`, `v_tenant_debts`, `tenants`, `tenant_identity_documents`, `tenant_profile_change_requests`, `contracts`, `tenancies`, `users`
- **Logic mẫu:** `frontend/src/mocks/handlers/tenants.js`, `frontend/src/mocks/handlers/contracts.js`

| API | Việc | File trong `Features/` | Quyền | Chống trùng |
|---|---|---|---|---|
| `GET /tenants/{tenantId}` | Chi tiết khách thuê | `Tenants/TenantsController.cs` | `tenants.read` |  |
| `GET /contracts` | Danh sách hợp đồng | `Contracts/ContractsController.cs` | `contracts.read` |  |
| `POST /tenants/{tenantId}/portal-invitation` | Mời vào cổng khách thuê | `Tenants/TenantsController.cs` | `tenants.write` |  |
| `POST /profile-change-requests/{requestId}/approve` | Duyệt đề nghị sửa hồ sơ | `Tenants/ProfileChangeRequestsController.cs` | `tenants.write` |  |
| `POST /profile-change-requests/{requestId}/reject` | Từ chối đề nghị sửa hồ sơ | `Tenants/ProfileChangeRequestsController.cs` | `tenants.write` |  |
| `PUT /tenants/{tenantId}` | Cập nhật khách thuê | `Tenants/TenantsController.cs` | `tenants.write` |  |
| `POST /tenants` | Tạo khách thuê | `Tenants/TenantsController.cs` | `tenants.write` |  |
| `POST /tenants/{tenantId}/password` | Quản trị đặt mật khẩu mới cho tài khoản khách | `Tenants/TenantsController.cs` | `tenants.write` |  |

Cần nhớ:

- Số giấy tờ lưu mã hóa. Đọc cần quyền `tenants.identity.read`, chỉ hiện 4 số cuối ở `number_last4`.
- Đặt mật khẩu cho khách: qua `UserManager`, thu hồi mọi phiên, không lưu hay trả lại mật khẩu rõ.
- Mỗi khách chỉ có một yêu cầu sửa hồ sơ đang chờ. Duyệt thì áp vào `tenants` trong cùng transaction.
- Lời mời vào cổng khách ghi vào `email_outbox`, việc gửi thật chưa kết nối.

### Admin: Danh sách hợp đồng: `/admin/contracts`

Xem, lọc hợp đồng và xuất CSV.

- **Giao diện:** `frontend/src/pages/admin/contracts.js`
- **Code backend:** `backend/src/SmartRent.Api/Features/Contracts/`
- **Bảng, view:** `v_contract_status`, `contracts`, `contract_versions`, `tenancies`, `tenants`, `rooms`
- **Logic mẫu:** `frontend/src/mocks/handlers/contracts.js`

| API | Việc | File trong `Features/` | Quyền | Chống trùng |
|---|---|---|---|---|
| `GET /contracts` | Danh sách hợp đồng | `Contracts/ContractsController.cs` | `contracts.read` |  |

Cần nhớ:

- Trạng thái, số ngày còn lại và sắp hết hạn lấy từ `v_contract_status`.
- `ends_on` là ngày đầu tiên hết hiệu lực. Ngày ghi trên hợp đồng là `ends_on - 1`.

### Admin: Tạo hợp đồng, nhận phòng: `/admin/contracts/new`

Chọn phòng và khách, nhập hợp đồng, chỉ số đầu, cọc, bản ký. Tạo hợp đồng là nhận phòng.

- **Giao diện:** `frontend/src/pages/admin/contract-new.js`
- **Code backend:** `backend/src/SmartRent.Api/Features/Viewings/`, `backend/src/SmartRent.Api/Features/Tenants/`, `backend/src/SmartRent.Api/Features/Contracts/`
- **Bảng, view:** `tenancies`, `tenancy_residents`, `contracts`, `contract_versions`, `contract_parties`, `contract_files`, `contract_attachments`, `charge_rates`, `handovers`, `handover_items`, `meter_readings`, `deposit_entries`, `payments`, `rental_inquiries`
- **Logic mẫu:** `frontend/src/mocks/handlers/leasing.js`, `frontend/src/mocks/handlers/properties.js`, `frontend/src/mocks/handlers/tenants.js`, `frontend/src/mocks/handlers/tenancies.js`, `frontend/src/mocks/handlers/contracts.js`

| API | Việc | File trong `Features/` | Quyền | Chống trùng |
|---|---|---|---|---|
| `GET /inquiries/{inquiryId}` | Chi tiết yêu cầu thuê | `Viewings/InquiriesController.cs` | `inquiries.read` |  |
| `GET /rooms/{roomId}` | Chi tiết phòng | `Rooms/RoomsController.cs` (Người 2) | `rooms.read` |  |
| `GET /tenants/{tenantId}` | Chi tiết khách thuê | `Tenants/TenantsController.cs` | `tenants.read` |  |
| `GET /tenancies/{tenancyId}` | Chi tiết đợt thuê | `Contracts/TenanciesController.cs` | `tenants.read` |  |
| `GET /rooms` | Danh sách phòng | `Rooms/RoomsController.cs` (Người 2) | `rooms.read` |  |
| `GET /properties/{propertyId}` | Chi tiết cơ sở | `Properties/PropertiesController.cs` (Người 2) | `properties.read` |  |
| `POST /inquiries/{inquiryId}/tenant` | Gắn hoặc tạo hồ sơ khách cho yêu cầu xem phòng | `Viewings/InquiriesController.cs` | `inquiries.write` |  |
| `POST /tenancies/{tenancyId}/contracts` | Bổ sung hợp đồng cho khách đang ở | `Contracts/TenanciesController.cs` | `contracts.sign` | Có |
| `POST /tenancies/check-in` | Nhận phòng | `Contracts/TenanciesController.cs` | `tenancies.checkin` | Có |
| `POST /contracts/{contractId}/attachments` | Lưu thêm tệp vào hợp đồng (ảnh, PDF) | `Contracts/ContractsController.cs` | `contracts.write` |  |
| `PUT /tenants/{tenantId}` | Cập nhật khách thuê | `Tenants/TenantsController.cs` | `tenants.write` |  |
| `POST /tenants` | Tạo khách thuê | `Tenants/TenantsController.cs` | `tenants.write` |  |
| `POST /tenants/{tenantId}/password` | Quản trị đặt mật khẩu mới cho tài khoản khách | `Tenants/TenantsController.cs` | `tenants.write` |  |

Cần nhớ:

- `POST /tenancies/check-in` chạy một transaction: khóa phòng, tạo đợt thuê, hợp đồng, phiên bản, các bên, tệp, giá, ký, biên bản, chỉ số đầu, cọc, đóng yêu cầu xem phòng (`THIET_KE_DATABASE.md` mục 8).
- Ngày vào không được ở tương lai, bản ký là bắt buộc, thiếu chỉ số đầu là lỗi chứ không coi là 0.
- Hai người nhận cùng phòng thì chỉ một người thành công: `EXCLUDE` trả `23P01`, đổi thành 409.
- `POST /tenancies/{id}/contracts` dành cho khách đã ở sẵn từ form phòng, nhận thêm `readings` và `deposit`.
- Ghi cọc qua `DepositService` của Người 4, không tự ghi `deposit_entries`.

### Admin: Chi tiết hợp đồng: `/admin/contracts/:id`

Xem hợp đồng, gia hạn, ký, thêm tệp, thu cọc, duyệt đề nghị của khách, trả phòng.

- **Giao diện:** `frontend/src/pages/admin/contract-detail.js`
- **Code backend:** `backend/src/SmartRent.Api/Features/Contracts/`
- **Bảng, view:** `v_contract_status`, `v_deposit_balances`, `contracts`, `contract_versions`, `contract_parties`, `contract_files`, `contract_attachments`, `tenancies`, `tenancy_requests`, `handovers`, `handover_items`, `checkout_settlements`, `deposit_entries`, `invoices`, `meters`, `meter_readings`
- **Logic mẫu:** `frontend/src/mocks/handlers/contracts.js`, `frontend/src/mocks/handlers/admin.js`, `frontend/src/mocks/handlers/payments.js`, `frontend/src/mocks/handlers/tenancies.js`

| API | Việc | File trong `Features/` | Quyền | Chống trùng |
|---|---|---|---|---|
| `GET /contracts/{contractId}` | Chi tiết hợp đồng | `Contracts/ContractsController.cs` | `contracts.read` |  |
| `GET /files/{fileId}/download-url` | Lấy đường dẫn tải có thời hạn | `Files/FilesController.cs` (Người 1) | Đã đăng nhập |  |
| `POST /contracts/{contractId}/attachments` | Lưu thêm tệp vào hợp đồng (ảnh, PDF) | `Contracts/ContractsController.cs` | `contracts.write` |  |
| `DELETE /contracts/{contractId}/attachments/{attachmentId}` | Xóa tệp bổ sung của hợp đồng | `Contracts/ContractsController.cs` | `contracts.write` |  |
| `POST /tenancies/{tenancyId}/deposit/receipts` | Nhận cọc | `Contracts/TenanciesController.cs` | `deposits.receive` | Có |
| `PUT /contracts/{contractId}/versions/{versionId}` | Cập nhật phiên bản hợp đồng | `Contracts/ContractsController.cs` | `contracts.write` |  |
| `POST /contracts/{contractId}/versions` | Tạo phiên bản hợp đồng | `Contracts/ContractsController.cs` | `contracts.write` |  |
| `POST /contracts/{contractId}/versions/{versionId}/sign` | Ký xác nhận phiên bản | `Contracts/ContractsController.cs` | `contracts.sign` | Có |
| `POST /contracts/{contractId}/archive` | Lưu trữ hợp đồng | `Contracts/ContractsController.cs` | `contracts.write` |  |
| `POST /tenancy-requests/{requestId}/approve` | Duyệt đề nghị gia hạn, trả phòng | `Contracts/TenancyRequestsController.cs` | `contracts.write` |  |
| `POST /tenancy-requests/{requestId}/reject` | Từ chối đề nghị gia hạn, trả phòng | `Contracts/TenancyRequestsController.cs` | `contracts.write` |  |
| `POST /tenancies/{tenancyId}/checkout/preview` | Xem trước trả phòng, không ghi | `Contracts/TenanciesController.cs` | `tenancies.checkout` |  |
| `POST /tenancies/{tenancyId}/checkout` | Trả phòng và quyết toán | `Contracts/TenanciesController.cs` | `tenancies.checkout` | Có |

Cần nhớ:

- `GET /contracts/{id}` trả thêm `tenant`, `roomInfo`, `deposit`, `attachments`, `invoices`, `requests`, `meters`.
- Phiên bản đã ký bị trigger khóa. Gia hạn là phiên bản mới, tệp bổ sung sau khi ký vào `contract_attachments`.
- `checkout/preview` **không được ghi** gì. `checkout` chạy một transaction: chỉ số cuối, biên bản, hóa đơn cuối, quyết toán, thu hoặc hoàn cọc, kết thúc đợt thuê, chấm dứt hợp đồng.
- Trả phòng làm chung với Người 4: Người 3 viết luồng ở `TenanciesController`, Người 4 cung cấp `InvoiceBuilder` và `DepositService`. Cọc chưa xử lý hết trả `deposit_not_settled`.
- Không còn luồng chuyển phòng: kết thúc hợp đồng cũ, tạo hợp đồng mới, hoàn cọc rồi thu cọc mới.

### Khách: Hợp đồng: `/contract`

Khách xem đợt thuê, hợp đồng, người ở cùng, cọc; gửi đề nghị gia hạn hoặc trả phòng.

- **Giao diện:** `frontend/src/pages/customer/contract.js`
- **Code backend:** `backend/src/SmartRent.Api/Features/Contracts/`
- **Bảng, view:** `v_contract_status`, `v_deposit_balances`, `tenancies`, `tenancy_residents`, `contracts`, `contract_versions`, `contract_files`, `handovers`, `handover_items`, `tenancy_requests`
- **Logic mẫu:** `frontend/src/mocks/handlers/portal.js`, `frontend/src/mocks/handlers/admin.js`

| API | Việc | File trong `Features/` | Quyền | Chống trùng |
|---|---|---|---|---|
| `GET /portal/tenancies/{tenancyId}` | Chi tiết đợt thuê | `Contracts/PortalTenanciesController.cs` | Khách thuê |  |
| `GET /portal/requests` | Đề nghị gia hạn, trả phòng của khách | `Contracts/PortalRequestsController.cs` | Khách thuê |  |
| `POST /portal/requests` | Gửi đề nghị gia hạn hoặc trả phòng | `Contracts/PortalRequestsController.cs` | Khách thuê | Có |
| `POST /portal/requests/{requestId}/cancel` | Hủy đề nghị | `Contracts/PortalRequestsController.cs` | Khách thuê |  |
| `GET /files/{fileId}/download-url` | Lấy đường dẫn tải có thời hạn | `Files/FilesController.cs` (Người 1) | Đã đăng nhập |  |

Cần nhớ:

- Lọc qua `tenants.user_id`, không dùng quyền nhân sự.
- Người ở cùng chỉ xem phòng, thời hạn, điều khoản; không xem giá, công nợ, bản ký; không gửi đề nghị. `rent` trả `null` cho người ở cùng.
- `handovers[].readings` chỉ người đại diện thấy.
- Đề nghị chỉ có hai loại gia hạn và trả phòng. Mỗi loại chỉ có một đề nghị đang chờ trên một đợt thuê.

### Khách: Tài khoản: `/account`

Khách xem hồ sơ, gửi yêu cầu sửa hồ sơ, đổi mật khẩu.

- **Giao diện:** `frontend/src/pages/customer/account.js`
- **Code backend:** `backend/src/SmartRent.Api/Features/Tenants/`
- **Bảng, view:** `tenants`, `tenant_profile_change_requests`, `users`
- **Logic mẫu:** `frontend/src/mocks/handlers/portal.js`, `frontend/src/mocks/handlers/auth.js`

| API | Việc | File trong `Features/` | Quyền | Chống trùng |
|---|---|---|---|---|
| `GET /portal/profile` | Hồ sơ | `Tenants/PortalProfileController.cs` | Khách thuê |  |
| `POST /portal/profile-change-requests` | Tạo đề nghị sửa hồ sơ | `Tenants/PortalProfileController.cs` | Khách thuê |  |
| `POST /portal/profile-change-requests/{requestId}/cancel` | Hủy đề nghị sửa hồ sơ | `Tenants/PortalProfileController.cs` | Khách thuê |  |
| `POST /me/change-password` | Đổi mật khẩu | `Auth/MeController.cs` (Người 1) | Đã đăng nhập |  |

Cần nhớ:

- Khách không tự sửa hồ sơ trực tiếp: tạo yêu cầu để admin duyệt ở `/admin/tenants/:id`.
- Đổi mật khẩu do Người 1 viết ở `MeController`.

## 9. Người 4
<a id="nguoi-4"></a>

Tính tiền phòng, Hóa đơn, thu tiền và sổ cọc. Đây là phần liên quan đến tiền, cần cẩn thận nhất.

### Admin: Tính tiền phòng: `/admin/billing`

Chọn cơ sở và tháng, nhập chỉ số, xem tạm tính, tạo hóa đơn hàng loạt, khóa tháng.

- **Giao diện:** `frontend/src/pages/admin/billing.js`
- **Code backend:** `backend/src/SmartRent.Api/Features/Billing/`, `backend/src/SmartRent.Api/Features/Invoices/`
- **Bảng, view:** `billing_periods`, `billing_period_events`, `meters`, `meter_readings`, `invoices`, `invoice_lines`, `invoice_meter_segments`, `charge_instances`, `invoice_charge_claims`
- **Hàm database:** `effective_rates()`, `next_document_no()`
- **Logic mẫu:** `frontend/src/mocks/handlers/metering.js`, `frontend/src/mocks/handlers/invoices.js`, `frontend/src/mocks/handlers/admin.js`

| API | Việc | File trong `Features/` | Quyền | Chống trùng |
|---|---|---|---|---|
| `GET /billing-periods/{periodId}/worksheet` | Bảng nhập số và tạm tính của tháng | `Billing/BillingPeriodsController.cs` | `billing.read` |  |
| `GET /billing-periods` | Danh sách tháng tính tiền | `Billing/BillingPeriodsController.cs` | `billing.read` |  |
| `POST /billing-periods` | Tạo tháng tính tiền | `Billing/BillingPeriodsController.cs` | `invoices.write` |  |
| `POST /meter-readings/batch` | Ghi chỉ số hàng loạt | `Billing/MeterReadingsController.cs` | `meters.write` | Có |
| `POST /invoice-batches` | Tạo và phát hành hóa đơn hàng loạt | `Invoices/InvoiceBatchesController.cs` | `invoices.write` | Có |
| `POST /meter-readings/{readingId}/correct` | Sửa chỉ số bằng bản ghi sửa | `Billing/MeterReadingsController.cs` | `meters.write` |  |
| `POST /billing-periods/{periodId}/lock` | Khóa tháng | `Billing/BillingPeriodsController.cs` | `billing.lock` |  |
| `POST /billing-periods/{periodId}/unlock` | Mở khóa tháng, cần lý do | `Billing/BillingPeriodsController.cs` | `billing.unlock` |  |
| `GET /settings/billing-schedule` | Lịch nhắc nhập số điện nước và tạo hóa đơn hằng tháng | `Settings/SettingsController.cs` (Người 1) | `billing.read` |  |

Cần nhớ:

- `GET /billing-periods/{id}/worksheet` trả `estimate` cho từng dòng, chỉ là tạm tính.
- Tạo hóa đơn là phát hành luôn: `POST /invoice-batches` với `action: issue`, cần thêm quyền `invoices.issue`. Mỗi đợt thuê xử lý riêng: phòng này lỗi không làm hỏng phòng khác, hóa đơn đã phát hành thì bỏ qua. Trả kết quả từng đợt thuê ngay trong response, không có bảng lô.
- Chỉ số không giảm theo thời gian, số đã lên hóa đơn phát hành thì không sửa được. Sửa là hủy bản cũ có lý do rồi ghi bản mới.
- Khóa tháng chặn ghi chỉ số và hóa đơn. Mở khóa bắt buộc có `smartrent.reason`.
- Lấy giá bằng `effective_rates`, làm tròn từng dòng về đồng, nửa ra xa 0.
- `GET /settings/billing-schedule` do Người 1 viết.

### Admin: Danh sách hóa đơn: `/admin/invoices`

Xem, lọc hóa đơn và tổng tiền, xuất CSV.

- **Giao diện:** `frontend/src/pages/admin/invoices.js`
- **Code backend:** `backend/src/SmartRent.Api/Features/Invoices/`
- **Bảng, view:** `v_invoice_balances`, `invoices`, `tenancies`, `tenants`, `rooms`
- **Logic mẫu:** `frontend/src/mocks/handlers/invoices.js`

| API | Việc | File trong `Features/` | Quyền | Chống trùng |
|---|---|---|---|---|
| `GET /invoices` | Danh sách hóa đơn | `Invoices/InvoicesController.cs` | `invoices.read` |  |

Cần nhớ:

- Đã thu, còn nợ, quá hạn lấy từ `v_invoice_balances`, không tính lại ở API.
- Lọc thêm `hasPending`, `outstanding`. Trả `summary` tính trên toàn bộ tập đã lọc, không chỉ trang đang xem.
- DTO có `pendingPaymentCount`, `pendingPaymentAmount`.

### Admin: Chi tiết hóa đơn: `/admin/invoices/:id`

Xem hóa đơn, tính lại nháp, phát hành, hủy, ghi nhận tiền, duyệt chuyển khoản, hoàn tác.

- **Giao diện:** `frontend/src/pages/admin/invoice-detail.js`
- **Code backend:** `backend/src/SmartRent.Api/Features/Invoices/`, `backend/src/SmartRent.Api/Features/Payments/`
- **Bảng, view:** `v_invoice_balances`, `v_payment_balances`, `invoices`, `invoice_lines`, `invoice_meter_segments`, `payments`, `payment_files`, `payment_intended_invoices`, `payment_allocations`, `payment_reversals`, `bank_accounts`
- **Hàm database:** `next_document_no()`
- **Logic mẫu:** `frontend/src/mocks/handlers/invoices.js`, `frontend/src/mocks/handlers/payments.js`

| API | Việc | File trong `Features/` | Quyền | Chống trùng |
|---|---|---|---|---|
| `GET /invoices/{invoiceId}` | Chi tiết hóa đơn | `Invoices/InvoicesController.cs` | `invoices.read` |  |
| `POST /payments` | Ghi nhận khoản thu | `Payments/PaymentsController.cs` | `payments.report` | Có |
| `POST /payments/{paymentId}/confirm` | Xác nhận khoản thu | `Payments/PaymentsController.cs` | `payments.confirm` | Có |
| `POST /payments/{paymentId}/reject` | Từ chối khoản thu | `Payments/PaymentsController.cs` | `payments.confirm` |  |
| `POST /payment-allocations/{allocationId}/reverse` | Đảo phân bổ thanh toán | `Payments/PaymentAllocationsController.cs` | `payments.allocate` | Có |
| `POST /invoices/{invoiceId}/void` | Hủy hóa đơn, cần lý do | `Invoices/InvoicesController.cs` | `invoices.void` |  |
| `POST /invoices/{invoiceId}/recompute` | Tính lại nháp | `Invoices/InvoicesController.cs` | `invoices.write` |  |
| `POST /invoices/{invoiceId}/issue` | Phát hành hóa đơn | `Invoices/InvoicesController.cs` | `invoices.issue` | Có |
| `DELETE /invoices/{invoiceId}` | Xóa hóa đơn nháp | `Invoices/InvoicesController.cs` | `invoices.write` |  |

Cần nhớ:

- "Chuyển trạng thái" không sửa trường trạng thái: đánh dấu đã thanh toán là tạo khoản thu đã xác nhận rồi phân bổ.
- Hóa đơn đã phát hành không sửa, không xóa. Chỉ hủy có lý do, và phải đảo hết phân bổ trước.
- Chỉ `confirmed` mới phân bổ được. Phân bổ không vượt số còn nợ, không chéo khách (`payer_mismatch`).
- Xác nhận thu không gia hạn hóa đơn. Hóa đơn thu một phần vẫn có thể quá hạn.
- Hoàn tác: `POST /payment-allocations/{id}/reverse` với `reversePayment: true` đảo cả số tiền, cần quyền `payments.reverse`. Sai thì ghi dòng đảo, không sửa dòng cũ.
- Dữ liệu đối chiếu: `HD-BT2609-001` tổng 3.655.000, đã thu 2.000.000, còn 1.655.000.

### Khách: Hóa đơn: `/invoices`

Khách xem tổng nợ và danh sách hóa đơn.

- **Giao diện:** `frontend/src/pages/customer/invoices/list.js`
- **Code backend:** `backend/src/SmartRent.Api/Features/Invoices/`
- **Bảng, view:** `v_invoice_balances`, `invoices`, `payments`, `tickets`, `tenancy_requests`, `notifications`
- **Logic mẫu:** `frontend/src/mocks/handlers/portal.js`

| API | Việc | File trong `Features/` | Quyền | Chống trùng |
|---|---|---|---|---|
| `GET /portal/overview` | Tổng nợ, khoản chờ xác minh, ticket của khách | `Invoices/PortalOverviewController.cs` | Khách thuê |  |
| `GET /portal/invoices` | Danh sách hóa đơn | `Invoices/PortalInvoicesController.cs` | Khách thuê |  |

Cần nhớ:

- Chỉ người đại diện xem được hóa đơn. Người ở cùng không xem công nợ.
- `paymentStatus`, `hasPending` lọc ở máy chủ để phân trang đúng.
- `GET /portal/overview` tổng hợp nhiều nguồn, đọc thẳng từ view và bảng, không gọi service của thư mục khác.

### Khách: Chi tiết hóa đơn: `/invoices/:id`

Khách xem chi tiết và báo đã chuyển khoản.

- **Giao diện:** `frontend/src/pages/customer/invoices/detail.js`
- **Code backend:** `backend/src/SmartRent.Api/Features/Invoices/`, `backend/src/SmartRent.Api/Features/Payments/`
- **Bảng, view:** `v_invoice_balances`, `invoices`, `invoice_lines`, `invoice_meter_segments`, `payments`, `payment_files`, `payment_intended_invoices`, `bank_accounts`
- **Logic mẫu:** `frontend/src/mocks/handlers/portal.js`

| API | Việc | File trong `Features/` | Quyền | Chống trùng |
|---|---|---|---|---|
| `GET /portal/invoices/{invoiceId}` | Chi tiết hóa đơn | `Invoices/PortalInvoicesController.cs` | Khách thuê |  |
| `GET /portal/catalog` | Danh mục cho khách | `Catalog/PortalCatalogController.cs` (Người 2) | Khách thuê |  |
| `POST /portal/payments` | Báo đã chuyển khoản | `Payments/PortalPaymentsController.cs` | Khách thuê | Có |

Cần nhớ:

- Báo chuyển khoản tạo `payments` trạng thái `pending`, **không** tính vào đã thu. Hóa đơn khách chọn ghi vào `payment_intended_invoices` để gợi ý cho quản lý.
- `GET /portal/catalog` do Người 2 viết, trả tài khoản nhận tiền.
- Mã VietQR chưa làm: cần tạo ở máy chủ, không gọi dịch vụ QR ngoài từ trình duyệt.

## 10. Người 5
<a id="nguoi-5"></a>

Ticket, thông báo, gửi email và Tổng quan. Tổng quan chỉ đọc số liệu nên làm sau cùng.

### Admin: Tổng quan: `/admin`

Số liệu phòng, tiền, lịch, ticket, hợp đồng theo tháng. Thanh menu cũng gọi API này để lấy số việc cần làm.

- **Giao diện:** `frontend/src/pages/admin/dashboard.js`
- **Code backend:** `backend/src/SmartRent.Api/Features/Dashboard/`
- **Bảng, view:** `v_room_status`, `v_invoice_balances`, `v_contract_status`, `v_cash_movements`, `rental_inquiries`, `room_viewings`, `tickets`, `billing_periods`, `organization_settings`
- **Logic mẫu:** `frontend/src/mocks/handlers/reports.js`

| API | Việc | File trong `Features/` | Quyền | Chống trùng |
|---|---|---|---|---|
| `GET /dashboard` | Số liệu tổng quan | `Dashboard/DashboardController.cs` | `properties.read` |  |

Cần nhớ:

- Chỉ đọc, không có bảng riêng. Làm sau cùng khi các phần khác đã rõ dữ liệu.
- Lọc theo phạm vi cơ sở được giao, nhận `month`, `propertyId`.
- Response gồm `billing`, `viewings`, `tickets`, `contracts`, `tasks`, `recent.*`, `rooms.strip`.

### Admin: Ticket: `/admin/tickets`, `/admin/tickets/:id`

Danh sách, hội thoại, phân công, chuyển trạng thái.

- **Giao diện:** `frontend/src/pages/admin/tickets.js`
- **Code backend:** `backend/src/SmartRent.Api/Features/Tickets/`
- **Bảng, view:** `tickets`, `ticket_messages`, `ticket_files`, `ticket_events`, `ticket_categories`, `sla_policies`, `stored_files`
- **Logic mẫu:** `frontend/src/mocks/handlers/support.js`, `frontend/src/mocks/handlers/admin.js`

| API | Việc | File trong `Features/` | Quyền | Chống trùng |
|---|---|---|---|---|
| `GET /tickets` | Danh sách ticket | `Tickets/TicketsController.cs` | `tickets.read` |  |
| `POST /tickets/{ticketId}/messages` | Gửi tin nhắn hoặc ghi chú nội bộ | `Tickets/TicketsController.cs` | `tickets.write` |  |
| `GET /tickets/{ticketId}` | Chi tiết ticket | `Tickets/TicketsController.cs` | `tickets.read` |  |
| `POST /tickets/{ticketId}/transitions` | Chuyển trạng thái ticket | `Tickets/TicketsController.cs` | `tickets.write` |  |
| `POST /tickets/{ticketId}/assign` | Phân công | `Tickets/TicketsController.cs` | `tickets.assign` |  |
| `GET /files/{fileId}/download-url` | Lấy đường dẫn tải có thời hạn | `Files/FilesController.cs` (Người 1) | Đã đăng nhập |  |

Cần nhớ:

- Ghi chú nội bộ không được trả cho khách.
- SLA tính liên tục 4, 12, 48, 96 giờ theo ưu tiên. API tính hạn, database không tính.
- Chuyển trạng thái theo bảng cho phép. Mỗi thay đổi ghi `ticket_events` trong cùng transaction.

### Khách: Hỗ trợ: `/tickets`

Danh sách yêu cầu hỗ trợ của khách.

- **Giao diện:** `frontend/src/pages/customer/tickets/list.js`
- **Code backend:** `backend/src/SmartRent.Api/Features/Tickets/`
- **Bảng, view:** `tickets`, `ticket_categories`
- **Logic mẫu:** `frontend/src/mocks/handlers/portal.js`

| API | Việc | File trong `Features/` | Quyền | Chống trùng |
|---|---|---|---|---|
| `GET /portal/tickets` | Danh sách ticket | `Tickets/PortalTicketsController.cs` | Khách thuê |  |

Cần nhớ:

- Khách chưa có phòng được báo cần thuê phòng trước khi gửi yêu cầu.
- Chỉ trả ticket của đợt thuê của khách hoặc do chính khách tạo.

### Khách: Gửi yêu cầu hỗ trợ: `/tickets/new`

Tạo ticket kèm ảnh.

- **Giao diện:** `frontend/src/pages/customer/tickets/new.js`
- **Code backend:** `backend/src/SmartRent.Api/Features/Tickets/`
- **Bảng, view:** `tickets`, `ticket_messages`, `ticket_files`, `ticket_events`, `sla_policies`
- **Logic mẫu:** `frontend/src/mocks/handlers/portal.js`

| API | Việc | File trong `Features/` | Quyền | Chống trùng |
|---|---|---|---|---|
| `GET /portal/catalog` | Danh mục cho khách | `Catalog/PortalCatalogController.cs` (Người 2) | Khách thuê |  |
| `POST /portal/tickets` | Tạo ticket | `Tickets/PortalTicketsController.cs` | Khách thuê | Có |

Cần nhớ:

- `POST /portal/tickets` nhận khóa chống gửi trùng.
- `GET /portal/catalog` do Người 2 viết, trả danh mục ticket.

### Khách: Chi tiết hỗ trợ: `/tickets/:id`

Xem hội thoại, nhắn tin, xác nhận xong hoặc mở lại.

- **Giao diện:** `frontend/src/pages/customer/tickets/detail.js`
- **Code backend:** `backend/src/SmartRent.Api/Features/Tickets/`
- **Bảng, view:** `tickets`, `ticket_messages`, `ticket_files`, `ticket_events`
- **Logic mẫu:** `frontend/src/mocks/handlers/portal.js`, `frontend/src/mocks/handlers/admin.js`

| API | Việc | File trong `Features/` | Quyền | Chống trùng |
|---|---|---|---|---|
| `GET /portal/tickets/{ticketId}` | Chi tiết ticket | `Tickets/PortalTicketsController.cs` | Khách thuê |  |
| `POST /portal/tickets/{ticketId}/messages` | Gửi tin nhắn | `Tickets/PortalTicketsController.cs` | Khách thuê |  |
| `POST /portal/tickets/{ticketId}/confirm` | Xác nhận đã xử lý xong | `Tickets/PortalTicketsController.cs` | Khách thuê |  |
| `POST /portal/tickets/{ticketId}/reopen` | Mở lại ticket, cần lý do | `Tickets/PortalTicketsController.cs` | Khách thuê |  |
| `GET /files/{fileId}/download-url` | Lấy đường dẫn tải có thời hạn | `Files/FilesController.cs` (Người 1) | Đã đăng nhập |  |

Cần nhớ:

- Không trả ghi chú nội bộ, kể cả tệp đi kèm.
- Mở lại cần lý do và hạn mới, ghi `ticket_events`.

### Thông báo: `/notifications`, `/system/notifications`

Danh sách thông báo, đánh dấu đã đọc. Dùng chung cho khách và quản trị.

- **Giao diện:** `frontend/src/pages/shared/notifications.js`
- **Code backend:** `backend/src/SmartRent.Api/Features/Notifications/`
- **Bảng, view:** `notifications`
- **Logic mẫu:** `frontend/src/mocks/handlers/support.js`

| API | Việc | File trong `Features/` | Quyền | Chống trùng |
|---|---|---|---|---|
| `GET /notifications` | Danh sách thông báo | `Notifications/NotificationsController.cs` | Đã đăng nhập |  |
| `POST /notifications/read-all` | Đánh dấu tất cả đã đọc | `Notifications/NotificationsController.cs` | Đã đăng nhập |  |
| `POST /notifications/{notificationId}/read` | Đánh dấu đã đọc | `Notifications/NotificationsController.cs` | Đã đăng nhập |  |

Cần nhớ:

- Chỉ trả thông báo của chính người đăng nhập.
- Các thư mục khác tạo thông báo qua `NotificationSender`, xem mục 4.

## 11. Không làm

Các hàm sau có trong `frontend/src/services/api.js` nhưng chưa màn hình nào gọi. Không viết, trừ khi nhóm thống nhất làm thêm tính năng.

| Nhóm | Hàm chưa dùng |
|---|---|
| `catalogApi` | `update` |
| `propertiesApi` | `changeRate`, `previewRate` |
| `roomsApi` | `addImage`, `addAsset`, `updateAsset`, `changeRate`, `endRate`, `availability` |
| `inquiriesApi` | `create`, `addEvent`, `assign` |
| `reservationsApi` | `list`, `get`, `create`, `extend` |
| `tenantsApi` | `duplicates`, `addIdentityDocument`, `verifyIdentityDocument`, `sendPasswordReset` |
| `profileRequestsApi` | `list` |
| `tenanciesApi` | `list`, `addResident`, `residentLeave`, `resolveGap`, `transfer`, `deposit`, `depositRefund`, `depositOffset`, `depositTransfer` |
| `tenancyRequestsApi` | `list` |
| `contractsApi` | `deleteVersion`, `addVersionFile`, `terminate`, `remove`, `successor` |
| `periodsApi` | `get` |
| `metersApi` | `list`, `readings`, `record`, `replace` |
| `invoicesApi` | `createDraft`, `updateDraft`, `adjust`, `replacement`, `send`, `getBatch`, `retryBatch` |
| `paymentsApi` | `list`, `get`, `allocate`, `reverse` |
| `exportsApi` | `list` |
| `ticketsApi` | `create` |
| `settingsApi` | `organization`, `saveOrganization`, `email`, `saveEmail`, `testEmail`, `templates`, `saveTemplate`, `reminderRules`, `createReminderRule`, `updateReminderRule`, `jobs`, `runJob`, `deliveries`, `retryDelivery`, `integrations`, `saveIntegration`, `testIntegration`, `supportAccess`, `grantSupportAccess`, `revokeSupportAccess` |
| `portalApi` | `payments` |

`docs/api/openapi.yaml` còn có thêm các route cũ khác: báo cáo, sổ cọc, công nợ, nhân sự, nhật ký, AI, chi phí. Một số không còn bảng trong database, danh sách ở `docs/BACKEND_HANDOFF.md` mục 0b. Muốn làm các phần đó phải thêm migration trước.

Giữ chỗ và chuyển phòng cũng không làm: website không tạo được giữ chỗ, không còn luồng chuyển phòng, nên database không có các bảng này.

## 12. Thứ tự làm đề xuất

1. Người 1 xong phần nền, đăng nhập được.
2. Làm API đọc trước: danh sách và chi tiết của mọi trang. Frontend nối được sớm và lộ lỗi dữ liệu sớm.
3. Người 2 làm thêm, sửa cơ sở và phòng. Người 3 làm khách thuê, lịch xem. Người 5 làm ticket, thông báo.
4. Người 3 làm tạo hợp đồng. Người 4 làm tính tiền, hóa đơn, thu tiền.
5. Người 3 và Người 4 cùng làm trả phòng.
6. Người 5 làm Tổng quan. Người 1 làm Quản trị hệ thống.

Dữ liệu mẫu đã có sẵn trong database nên không ai phải chờ người khác làm xong mới thử được.
