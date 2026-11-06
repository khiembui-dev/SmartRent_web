# Ticket admin và khách: code đã triển khai

Ticket hiện chạy bằng PostgreSQL thật. API, ảnh private, hội thoại, ghi chú nội bộ, phân công admin, trạng thái, lịch sử và thông báo đã nối với frontend. Comment trong từng file giải thích hàm, quyền truy cập và các nhóm SQL chính. Danh sách đầy đủ file: [TICKET_FILES.md](TICKET_FILES.md).

## Chạy local

Từ thư mục gốc, bật Docker Desktop rồi chạy:

```powershell
docker compose up -d db
# Database đã tạo từ bản source cũ: migration không reset volume.
docker compose exec -T db psql -U postgres -d smartrent -v ON_ERROR_STOP=1 -f /smartrent-database/06_ticket_backend.sql
dotnet build backend/SmartRent.sln
dotnet run --no-build --project .\backend\src\SmartRent.Api --launch-profile http
```

Terminal khác chạy `npm run dev` trong `frontend`. `frontend/.env.local` chọn `VITE_DATA_SOURCE=api` và `VITE_DEV_API_PROXY=http://127.0.0.1:5080`.

Admin vào `http://localhost:5174/admin/tickets`. Khách đăng nhập tại `/login` rồi vào `/tickets`. Database demo có email admin `admin@example.test`, khách `user@example.test`. Mật khẩu không nằm trong source; đặt mật khẩu riêng bằng lệnh Development (hỏi trong terminal, chỉ lưu hash Identity):

```powershell
dotnet run --no-build --project .\backend\src\SmartRent.Api --launch-profile http -- --set-admin-password
dotnet run --no-build --project .\backend\src\SmartRent.Api --launch-profile http -- --set-customer-password user@example.test
```

Lệnh khách chỉ cập nhật `role=user` có email đó, không tạo/nâng role. Đổi mật khẩu thu hồi các phiên của tài khoản. Database mới trống vẫn cần tạo admin, khách và hợp đồng trước, không tự nạp demo vào dữ liệu thật.

## Đọc từng file theo luồng request

```text
Trang frontend → services/api.js → Vite proxy → Controller
→ TicketApiController kiểm tra token/role → TicketRepository
→ transaction PostgreSQL + trigger history → JSON DTO → frontend render lại.
```

1. `TicketContracts.cs`: request models, lỗi HTTP và `TicketRules`. `DueAt` tính hạn 120/48/24/4 giờ, `NextStatus` kiểm tra state machine, `Text` trim và giới hạn nội dung.
2. `TicketApiController.cs`: `RunAsync` xác thực token thật, kiểm tra role, trả 401/403 và ánh xạ lỗi nghiệp vụ vào đúng ô form.
3. `TicketsController.cs` / `PortalTicketsController.cs`: khai báo các route admin/khách và gọi repository. Khách không dùng được action quản trị.
4. `TicketSql.cs`: `Visible` là điều kiện ownership dùng chung. `Projection` dựng JSON khớp giao diện và loại tin nội bộ ngay tại SQL khi người gọi là khách.
5. `TicketRepository.cs`: `ListAsync` tìm/lọc/phân trang trên SQL trong cùng snapshot; `GetAsync` trả detail hoặc 404. `TenanciesAsync` và `CatalogAsync` phục vụ form khách và hộp phân công.
6. `TicketRepository.Writes.cs`: `CreateAsync`, `MessageAsync`, `AssignAsync`, `TransitionAsync` đều dùng transaction; `LockAsync` khóa dòng; `ContextAsync` đặt actor/action/reason LOCAL cho trigger; `NotifyAsync` ghi thông báo cùng transaction.

Các file ở `src/SmartRent.Api/Features/Tickets`. `tenancyId` của frontend ánh xạ vào `contracts.id`; `categoryId` nhận code ELECTRICITY/WATER/INTERNET/OTHER và lưu vào `category_code`; `events` dựng từ `tickets.history`. Không tạo thêm bảng tin nhắn/lịch sử/tenancy.

## Các hành động và quyền

Khách mở `/tickets/new`: frontend tải `/portal/tenancies` và `/portal/catalog`. Backend chỉ nhận hợp đồng active mà khách đại diện hoặc đang ở cùng, lấy room từ hợp đồng và lấy reported_by từ token. Không tin các ID nhận diện người báo do trình duyệt gửi.

`CreateAsync` kiểm tra form, ảnh và Idempotency-Key. Cùng người gửi + key + body trả ticket cũ; cùng key với body khác trả 409. Advisory lock bảo đảm hai request gửi đồng thời cũng chỉ tạo một dòng.

| Action admin | Status trước | Status sau |
|---|---|---|
| accept | new | accepted; tự gán admin |
| start | new / accepted | in_progress |
| wait | accepted / in_progress | waiting; bắt buộc reason |
| resume | waiting | in_progress |
| resolve | accepted / in_progress / waiting | resolved; bắt buộc resolutionNotes |
| close | resolved | closed |
| reopen | resolved / closed | accepted; reason và hạn xử lý mới |

Khách chỉ xác nhận `resolved → closed` hoặc mở lại `resolved/closed → accepted`. Sai trạng thái trả 409. Frontend admin gửi expectedStatus; backend chặn thao tác từ tab đã cũ. Vì chỉ có một admin, danh sách phân công chỉ gồm tài khoản admin này.

Tin nhắn nối bằng JSONB append dưới khóa dòng, không ghi đè mảng đọc cũ về C#. Hai người gửi cùng lúc không mất tin. Khách cố gửi isInternal=true bị từ chối 403. Ticket closed không nhận tin cho đến khi mở lại. Tin nội bộ không tạo notification rò preview sang khách.

Khách được xem ticket mình báo, hợp đồng mình đại diện hoặc hợp đồng mình đang ở cùng. Ticket/ảnh ngoài quyền trả 404; UUID không thay thế phân quyền.

## Ảnh và database

`TicketFileStore` kiểm tra chữ ký định dạng JPEG/PNG/WebP, tối đa 10 MB, lưu bytes tại `App_Data/ticket-files` ngoài wwwroot và metadata trong files. Đây là kiểm tra định dạng, không phải tích hợp antivirus. Ticket mới chỉ nhận ảnh private/clean/purpose=ticket do chính người gửi upload.

`FilesController` cấp link bằng DataProtection hạn hai phút, gắn với phiên đăng nhập. Lúc lấy content vẫn kiểm tra phiên và quyền; không lộ đường dẫn ổ đĩa. Cần bảo toàn thư mục ảnh khi triển khai; Git bỏ qua App_Data.

Vẫn 13 bảng. `01_schema.sql` có hai cột tickets.idempotency_key/request_hash và unique index. `02_rules.sql` cập nhật trigger history để giữ actor/action/reason. Database cũ dùng `06_ticket_backend.sql`; database mới có sẵn thay đổi trong baseline. Không chạy lại baseline vào volume đang dùng.

## Kiểm tra

```powershell
dotnet test backend/SmartRent.sln --no-restore
python backend/tests/ticket_flow.py
cd frontend
npm run build
```

`TicketRulesTests.cs` kiểm tra SLA và state machine. `ticket_flow.py` tạo fixture UUID riêng, gọi HTTP với PostgreSQL thật rồi dọn fixture, không reset dữ liệu có sẵn. Bao gồm phân quyền, tạo trùng đồng thời, gửi tin đồng thời, ẩn ghi chú, ảnh private, stale status, xác nhận/mở lại và lịch sử.

Đã kiểm tra giao diện thật: khách tạo kèm ảnh → admin tiếp nhận, trả lời công khai/nội bộ, giải quyết → khách không thấy ghi chú, mở được ảnh và xác nhận đóng. Các API trang khác như thông tin liên hệ public ở footer vẫn nằm ngoài chức năng Ticket.
