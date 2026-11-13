# SmartRent

> Thanh toán tự động ApiPay: [cài đặt server, webhook, QR và đối soát](docs/APIPAY.md). Thêm 2 bảng kỹ thuật qua `database/14_apipay.sql`; cần cấu hình khóa riêng để nhận tiền thật.

Hệ thống quản lý nhà trọ gồm khu admin/chủ trọ và khu khách hàng. Backend ASP.NET
Core dùng PostgreSQL; frontend Vite gọi API thật. Database có 13 bảng nghiệp vụ, 2 bảng ApiPay và hai role
`admin`, `user`, tối đa một admin.

## Cấu hình được chia sẻ

Theo yêu cầu của chủ repo, `.env` và `frontend/.env.local` được đưa vào Git để nhóm
chạy môi trường local giống nhau. **Repo công khai nên các mật khẩu database trong
`.env` cũng công khai. Chỉ dùng chúng cho database local, không dùng lại ở production
hoặc tài khoản/dịch vụ khác.** Mỗi thành viên chạy một database riêng trên máy.

`.env` chỉ cấu hình Docker PostgreSQL; không phải tài khoản đăng nhập website.
User Secrets của .NET, file người dùng tải lên, các bản sao lưu dữ liệu và dữ liệu
Docker volume nằm ngoài source Git. SQL/schema, seed tùy chọn và migration được lưu
đầy đủ trong thư mục `database/`.

## Chạy local trên Windows

Cần Docker Desktop đang chạy, .NET SDK 10 và Node.js từ 22.12 trở lên.

Từ thư mục gốc của repo, chạy PowerShell:

```powershell
docker compose up -d db

$smartRentAppPassword = ((Get-Content .env | Where-Object { $_ -match '^DB_APP_PASSWORD=' }) -split '=', 2)[1].Trim()
dotnet user-secrets set "ConnectionStrings:SmartRent" "Host=127.0.0.1;Port=5433;Database=smartrent;Username=smartrent_app;Password=$smartRentAppPassword" --project backend/src/SmartRent.Api

dotnet run --project backend/src/SmartRent.Api --launch-profile http
```

Ví dụ trên dùng cổng mặc định `5433` trong `.env`. Nếu đã đổi `DB_PORT`, dùng đúng
cổng đó trong connection string. Không thay User Secrets của máy đã kết nối được.

Mở terminal khác từ thư mục gốc:

```powershell
cd frontend
npm ci
npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

- Trang khách: `http://localhost:5174`.
- Trang quản trị: `http://localhost:5174/admin`.
- Kiểm tra kết nối local: `http://localhost:5080/api/v1/dev/database-check`.

Docker tự tạo cấu trúc và cấu hình ban đầu khi volume còn trống. Database đã có dữ
liệu không tự chạy lại script init; không xóa volume để cập nhật source. Không tự
nạp tài khoản hoặc dữ liệu demo lên database mới.

## Admin cho database mới

1. Đăng ký tài khoản riêng của chủ trọ tại `http://localhost:5174/register`.
2. Chuyển tài khoản đó thành admin bằng tài khoản quản trị database:

```powershell
docker compose exec -T db psql -U postgres -d smartrent -v ON_ERROR_STOP=1 -v target_email=email_cua_ban@example.com -f /smartrent-database/tools/transfer_admin.sql
```

3. Đăng nhập lại tại `/admin/login`, dùng mật khẩu vừa đăng ký. Script giữ đúng một
   admin và thu hồi phiên cũ. Tài khoản đích phải chưa gắn với hồ sơ thuê phòng.

Tài khoản website trên máy của thành viên khác không được sao chép qua Git.
Xem thêm [chuyển quyền admin](docs/CHUYEN_QUYEN_ADMIN.md).

## Các chức năng và hướng dẫn

- [Các trang, API và kiểm tra đã hoàn thiện](docs/BACKEND_COMPLETION.md).
- [Cài Docker và database cho backend](docs/CAI_DAT_DOCKER_BACKEND.md).
- [Database, schema và migration](database/README.md).
- [Backend và cách chạy](backend/README.md).
- [Frontend](frontend/README.md).
- [Đăng/ẩn phòng trên trang khách](docs/PHONG_TREN_TRANG_KHACH.md).
- [Cập nhật hợp đồng, địa chỉ, cọc giữ phòng và bộ lọc](docs/CAP_NHAT_PHONG_HOP_DONG_20261113.md).
- [Trợ lý AI cho admin và khách: cấu hình, bảo mật, kiểm thử](docs/CHATBOT_AI.md).
- [Các việc còn cần trước khi deploy production](docs/DEPLOY_READINESS.md).

Email phát triển có thể lưu dưới dạng `.eml` riêng trong `App_Data/mail`; production
cần SMTP và frontend URL thật. Thanh toán hiện là chuyển khoản thủ công, admin đối
chiếu và xác nhận. Không coi việc chạy local/build đạt là đã hoàn tất cấu hình deploy.
