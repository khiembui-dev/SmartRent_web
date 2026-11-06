# Cài database Docker để lập trình backend trên Windows

Mỗi thành viên chạy PostgreSQL riêng trên Docker Desktop; không cần cài PostgreSQL trực tiếp trên Windows. Dự án dùng image `postgres:16.13`, cổng máy `127.0.0.1:5433` và Docker volume để lưu dữ liệu. Mỗi người có dữ liệu riêng, không tự đồng bộ với người khác.

## 1. Chuẩn bị

1. Cài Docker Desktop cho Windows từ <https://www.docker.com/products/docker-desktop/> nếu máy chưa có. Làm theo trình cài đặt, hoàn tất yêu cầu WSL 2 nếu Docker yêu cầu, rồi mở Docker Desktop và chờ **Engine running**. Máy trong lần hướng dẫn này đã có Docker Desktop.
2. Cài .NET SDK 10 để chạy backend; kiểm tra bằng `dotnet --list-sdks`. Để chạy frontend cần Node.js từ 22.12.0 trở lên; kiểm tra bằng `node --version`.
3. Mở thư mục gốc source trong VS Code. Đường dẫn trên máy hiện tại là `D:\Downloads\smartrent web - ban dau\smartrent web`. Mỗi thành viên có thể đặt source ở vị trí khác.

## 2. Tạo cấu hình riêng cho máy

Mở **Terminal → New Terminal** trong VS Code. Các lệnh sau chạy bằng PowerShell tại thư mục gốc source:

```powershell
cd "D:\Downloads\smartrent web - ban dau\smartrent web"
```

Với máy khác, thay đường dẫn bằng thư mục source của máy đó. Tạo `.env` nếu file này chưa tồn tại:

```powershell
Copy-Item .env.example .env
notepad .env
```

Nếu `.env` đã tồn tại, chỉ mở file để kiểm tra; không ghi đè. Đặt hai mật khẩu riêng, ví dụ cấu trúc:

```dotenv
DB_PORT=5433
DB_PASSWORD=thay_bang_mat_khau_quan_tri_rieng
DB_APP_PASSWORD=thay_bang_mat_khau_ung_dung_rieng
```

Lưu file. Không commit `.env`, mật khẩu hoặc dữ liệu database lên GitHub. Dùng mật khẩu mới, không dùng mật khẩu đã chia sẻ trong ảnh hoặc cuộc hội thoại.

## 3. Khởi tạo và kiểm tra

```powershell
docker compose up -d db
docker compose ps
```

Lần đầu Docker tải image rồi chạy `01_schema.sql`, `02_rules.sql`, `03_seed.sql` và cấu hình tài khoản ứng dụng. Chờ trạng thái `healthy`, sau đó kiểm tra 13 bảng:

```powershell
docker compose exec db psql -U postgres -d smartrent -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'smartrent' AND table_type = 'BASE TABLE';"
```

Để xem log hoặc mở SQL tương tác:

```powershell
docker compose logs db
docker compose exec db psql -U postgres -d smartrent
```

Trong `psql`, dùng `\dt smartrent.*` để xem bảng, `\q` để thoát. Trong Docker Desktop, vào **Containers → smartrent → smartrent-db** để xem Logs và Start/Stop.

Khởi tạo chỉ tự chạy trên volume mới, trống. Nếu container báo lỗi, hãy xem log trước; không xóa volume hoặc thư mục dữ liệu cũ khi chưa kiểm tra. Nếu trùng tên container `smartrent-db` hoặc cổng 5433, kiểm tra container/dịch vụ đang dùng trước; có thể đổi `DB_PORT` trong `.env` sang cổng trống rồi chạy lại Compose. Thay đổi mật khẩu trong `.env` sau khi volume đã khởi tạo không tự đổi mật khẩu PostgreSQL; cần thực hiện đổi mật khẩu trong PostgreSQL và cập nhật cấu hình kết nối tương ứng.

## 4. Cấu hình chuỗi kết nối backend

Backend chạy trực tiếp trên Windows kết nối tới:

```text
Host=127.0.0.1;Port=5433;Database=smartrent;Username=smartrent_app;Password=<DB_APP_PASSWORD>
```

Thay cổng nếu đã đổi `DB_PORT`. Lưu chuỗi kết nối riêng trên máy bằng .NET user-secrets (thay `<DB_APP_PASSWORD>` bằng mật khẩu thực, không giữ dấu `<>`):

```powershell
dotnet user-secrets set "ConnectionStrings:SmartRent" "Host=127.0.0.1;Port=5433;Database=smartrent;Username=smartrent_app;Password=<DB_APP_PASSWORD>" --project .\backend\src\SmartRent.Api
```

Không đưa lệnh chứa mật khẩu thật vào source hoặc ảnh chia sẻ. Backend hiện là khung: **chưa có DbContext, chưa đọc connection string hoặc kết nối database**. Người lập trình cần triển khai kết nối, xác thực và API; xem [backend README](../backend/README.md) và [bàn giao API](BACKEND_HANDOFF.md). Nếu sau này backend chạy trong cùng mạng Compose, host sẽ là `db` và cổng `5432`; cấu hình hiện tại chỉ chạy database trong Docker.

## 5. Chạy các phần hiện có

Mở một terminal tại thư mục gốc cho backend:

```powershell
dotnet run --project .\backend\src\SmartRent.Api --launch-profile http
```

Backend khung dùng `http://localhost:5080`. Mở terminal thứ hai cho frontend:

```powershell
cd frontend
npm install
npm run dev -- --port 5174
```

Mở địa chỉ Vite hiển thị trong terminal, thường là `http://localhost:5174`. Frontend hiện dùng mock/localStorage, chưa dùng database hoặc API backend thật. Script Docker chỉ tạo cấu hình mặc định, không tạo admin website hay dữ liệu demo; tạo admin khi backend có cơ chế băm mật khẩu phù hợp theo [hướng dẫn database](../database/README.md).

## 6. Dừng và chạy lại

Chạy tại thư mục gốc:

```powershell
docker compose stop db
docker compose start db
```

`docker compose down` xóa container và mạng Compose nhưng giữ volume. Không thêm `-v` nếu cần giữ dữ liệu.
