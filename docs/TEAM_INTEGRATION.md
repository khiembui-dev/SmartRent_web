# Ghép code nhóm ngày 06/11/2026

Bản ghép dùng database PostgreSQL 13 bảng hiện tại và hai role `admin`, `user`.
Code local Dashboard, Ticket, Files của Ticket và Thông báo được giữ lại.
Đây là bản tích hợp các phần đã có trên GitHub; những module còn trống hoặc chưa
đủ nghiệp vụ được liệt kê ở cuối, không coi việc build thành công là đã hoàn tất toàn website.

## Nguồn code

| Nhánh | Commit | Cách sử dụng |
|---|---|---|
| Local trước khi ghép | `05c66d5` | Lưu toàn bộ phần Dashboard/Ticket đang làm; nhánh `local/pre-team-20261106` |
| `ThanhHuy` | `1aa56d68` | Auth, Me, Settings, EF Core entities và DbContext theo 13 bảng |
| `main` | `d7e66b74` | Tenants, Viewings, Contracts, Billing, Invoices, Payments và các API portal tương ứng |
| `Trọng-Hiểu` | `d7e66b74` | Cùng commit với main; phần portal đã nằm trong bản được ghép |
| `codex/leasing-13-tables` | `041a067e` | Đã đối chiếu; các file nghiệp vụ thuê phòng tương ứng đã có trong main |
| `feat/billing-invoices` | `cc1dc86e` | Đã đối chiếu; chọn bản Npgsql 13 bảng mới hơn trong main, bỏ bản EF dùng các entity cũ |
| `Đình_Mẫn` | `c4bcbf57` | Đã đối chiếu; không ghi đè controller đang chạy bằng các file rỗng hoặc file build `obj/bin` |

Các snapshot chính xác và báo cáo so sánh từng nhánh được giữ tại thư mục bên cạnh source:
`../SmartRent_team_import_20261106_6ed015/`. Việc ghép thực hiện theo từng module,
không chép nguyên cây source chồng lên cấu hình máy. Git lưu bản ghép trong nhánh
`integration/team-20261106`; lịch sử và bản gốc của các nhánh tải về vẫn ở thư mục import.

## Các chỗ đã điều chỉnh khi tích hợp

- `Program.cs`: đăng ký DbContext, dịch vụ Auth/Settings, Npgsql, middleware xác thực;
  dùng cùng `ConnectionStrings:SmartRent` đang có trong User Secrets.
- `Common/LeasingInfrastructure.cs`: mọi API nghiệp vụ lấy actor từ session thật,
  chặn sai role, đặt context người dùng trong transaction và chuyển thời điểm về UTC.
- `Common/Auth/SessionTokenService.cs`, `Features/Auth/*`: thống nhất opaque session
  lưu SHA-256 trong `auth_tokens`, dùng chung với Dashboard/Ticket; đăng nhập riêng
  cho admin/khách. Không yêu cầu thay mật khẩu DB hoặc thêm JWT secret.
- EF mapping không tự ghi các cột `users.role`, `security_stamp`, `updated_at` vốn do
  database quản lý. Đổi mật khẩu sẽ thu hồi phiên theo trigger hiện có.
- Sửa tên `fullName` trong request Auth cho đúng frontend; đăng ký không chiếm lại
  tài khoản có email đã tồn tại.
- Bỏ cách truy cập hóa đơn bằng tài khoản demo khi request không có token.
  Hóa đơn và báo chuyển khoản chỉ dành cho người đại diện hợp đồng.
- Sửa kiểu tham số nullable của danh sách hợp đồng/lịch xem phòng; bổ sung phân trang
  và projection thông tin khách, hợp đồng, phiên bản, cọc cho các màn hình đang có.
- Sửa cấu trúc lịch hẹn (`inquiry`, `date`) và bảng tính tiền: phòng trống không tạo
  một dòng có `tenancy=null`.
- Catalog vẫn có danh mục Ticket, đồng thời trả danh mục và tài khoản ngân hàng lấy
  từ database. Không tự tạo tài khoản ngân hàng, BIN hay giá tiền minh họa.
- Thu tiền hỗ trợ `methodCode` và `allocations` mà giao diện đang gửi.
- Bộ tính tiền được ghép còn có giới hạn. `BillingPriceResolver` chọn giá có hiệu lực
  từ cơ sở → phòng → hợp đồng đã ký; báo lỗi rõ nếu thiếu đơn giá hoặc gặp khoản phí
  chưa được bộ tính hiện tại hỗ trợ. Không mặc định 3 triệu/4.000/20.000.
- API email chưa có provider trả `501` cho thao tác lưu/gửi thử thay vì báo gửi thành công.

Không thay `.env`, `frontend/.env.local`, Docker Compose, cổng máy local hoặc User Secrets.
Không reset schema, không tạo thêm bảng và không nạp lại dữ liệu demo trong quá trình ghép.
Database vẫn dùng các SQL hiện có, bao gồm `06_ticket_backend.sql` của phần Ticket local.

## Kiểm tra

- `dotnet test backend/SmartRent.sln`: 19 bài kiểm thử đạt.
- `npm run build` trong `frontend`: thành công; Vite có cảnh báo cách chia chunk đã có sẵn.
- `npm run test:access` trong `frontend`: đạt kiểm tra mô hình hai role và router/API mock.
- `backend/tests/ticket_flow.py`: 39 lượt HTTP với PostgreSQL thật, kiểm tra quyền,
  gửi tin đồng thời, idempotency, ảnh riêng tư và lịch sử xử lý Ticket.
- `backend/tests/team_merge_smoke.py`: 59 lượt HTTP với PostgreSQL thật, kiểm tra API
  của các module dùng chung session, role, DTO, lịch hẹn +07:00, worksheet và luồng
  đăng ký/đăng nhập/đổi mật khẩu. Fixture UUID riêng được dọn sau kiểm tra.
- Đã mở giao diện Dashboard, danh sách/chi tiết khách và hợp đồng, lịch xem phòng,
  bảng tính tiền, hóa đơn, Ticket, Cài đặt; phía khách đã mở hỗ trợ, hợp đồng,
  tài khoản, hóa đơn và thông báo. Các kiểm tra này không thay thế kiểm thử đầy đủ mọi thao tác.

Chạy lại kiểm tra tích hợp khi API và Docker đang bật, từ thư mục gốc:

```powershell
python backend/tests/ticket_flow.py --keep
# Lệnh trên in đường dẫn file state tạm; dùng đúng đường dẫn đó cho hai lệnh sau.
python backend/tests/team_merge_smoke.py --state "DUONG_DAN_STATE_VUA_IN"
python backend/tests/ticket_flow.py --cleanup "DUONG_DAN_STATE_VUA_IN"
```

Mặc định API kiểm thử là `http://127.0.0.1:5080/api/v1`. Hai biến môi trường tùy chọn
`SMARTRENT_TEST_API_URL`, `SMARTRENT_COMPOSE_ROOT` cho phép chạy worktree riêng mà
không phải sao chép mật khẩu DB. File state chỉ chứa token fixture tạm, không đưa lên GitHub.

## Phần chưa hoàn tất trong code nhóm đã tải

1. `Features/Properties/PropertiesController.cs`, `Features/Rooms/RoomsController.cs`
   và `Features/PublicSite/PublicController.cs` vẫn là controller trống trong các bản
   được đối chiếu. Các trang tương ứng cần viết API tiếp; hiện có thể nhận `404`.
2. Tải file hiện hoàn chỉnh cho Ticket. File hợp đồng, giấy tờ, ảnh đại diện và ảnh
   phòng cần bổ sung nghiệp vụ lưu/tải và kiểm tra quyền riêng theo từng loại.
3. Email mời tài khoản, quên mật khẩu, gửi thử SMTP và xuất mẫu chưa có tích hợp gửi thật.
4. Luồng ghi nhận chỉ số, phát hành hàng loạt, gia hạn/trả phòng/quyết toán cần kiểm thử
   và hoàn thiện tiếp. Đặc biệt: nối chỉ số đầu/cuối và thời điểm, phí dịch vụ/thu một lần,
   tính theo ngày/người/số lượng, thay đổi giá trong kỳ, metadata tệp và hoàn tác cọc.
   Bộ kiểm tra trên chưa xác nhận các luồng tài chính này chạy đầy đủ từ đầu đến cuối.
5. Một số bộ lọc nâng cao trên frontend chưa được endpoint danh sách của nhánh thuê phòng
   triển khai hết. Cần đối chiếu thêm theo từng màn hình khi phát triển tiếp.

Danh sách file thay đổi và file mới: [TEAM_INTEGRATION_FILES.md](TEAM_INTEGRATION_FILES.md).
