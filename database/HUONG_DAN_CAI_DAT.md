# Cài database SmartRent trên máy của bạn

Dành cho thành viên team backend. Làm xong, máy bạn có PostgreSQL 16 chạy trong Docker với đủ 74 bảng và dữ liệu mẫu để code ngay. Không cần cài PostgreSQL.

**Mỗi người có một bản riêng.** Cấu trúc bảng và dữ liệu ban đầu giống nhau, nhưng dữ liệu bạn thêm hoặc xóa chỉ nằm trên máy bạn. Vì vậy cứ thử thoải mái: hỏng thì tạo lại trong vài phút, không ảnh hưởng ai.

## 1. Cài Docker Desktop

**Windows** cần Windows 10 bản 22H2 hoặc Windows 11 bản 23H2 trở lên, RAM 8 GB và đã bật ảo hóa trong BIOS/UEFI. Windows Home vẫn dùng được vì dự án chạy Linux container.

1. Mở PowerShell bằng **Run as administrator** rồi chạy:
   ```powershell
   wsl --install
   wsl --update
   ```
   Khởi động lại máy nếu được yêu cầu.
2. Tải và cài [Docker Desktop](https://www.docker.com/products/docker-desktop/), chọn dùng WSL 2 nếu trình cài hỏi.
3. Mở Docker Desktop và chờ đến khi Docker báo đang chạy.

**macOS** cần một trong ba phiên bản macOS mới nhất và RAM từ 4 GB. Cài Docker Desktop đúng bản cho chip của máy. Các lệnh bên dưới dùng như nhau, trừ lệnh sao chép file ở bước 3.

Mở terminal mới và kiểm tra:

```powershell
docker --version
docker compose version
```

## 2. Lấy mã nguồn

```powershell
git clone https://github.com/khiembui-dev/SmartRent_web.git
cd SmartRent_web
```

Thư mục dự án phải có `docker-compose.yml`, `.env.example` và `database/`. Mọi lệnh từ đây trở đi đều chạy tại thư mục này.

## 3. Tạo file `.env`

```powershell
copy .env.example .env      # Windows
cp .env.example .env        # macOS, Linux
```

Mở `.env` và đổi hai mật khẩu. Chỉ dùng chữ và số, không dùng khoảng trắng, dấu nháy, `$` hoặc `;`.

| Biến | Ý nghĩa |
|---|---|
| `DB_PORT` | Cổng trên máy bạn, mặc định `5433`. Để `5433` thì không đụng PostgreSQL đã cài sẵn ở `5432` |
| `DB_PASSWORD` | Mật khẩu tài khoản quản trị `postgres` |
| `DB_APP_PASSWORD` | Mật khẩu tài khoản `smartrent_app` mà backend dùng để kết nối |

Hai mật khẩu chỉ có tác dụng **lúc tạo database lần đầu**, nên hãy đổi trước khi sang bước 4. File `.env` chỉ nằm trên máy bạn, không đưa lên Git.

## 4. Tạo database

```powershell
docker compose up -d
docker compose ps
```

Lần đầu Docker tải image khoảng vài trăm MB rồi tự nạp toàn bộ cấu trúc và dữ liệu mẫu. Chạy lại `docker compose ps` đến khi cột STATUS hiện `healthy`.

| STATUS | Ý nghĩa |
|---|---|
| `health: starting` | Đang nạp, có thể mất vài phút, cứ chờ |
| `healthy` | Xong, sang bước 5 |
| `unhealthy` | Nạp lỗi, xem [mục 11](#11-lỗi-thường-gặp) |

## 5. Kiểm tra

```powershell
docker compose exec db psql -U postgres -d smartrent -c "SELECT (SELECT count(*) FROM information_schema.tables WHERE table_schema='smartrent' AND table_type='BASE TABLE') AS so_bang, (SELECT count(*) FROM smartrent.rooms) AS so_phong, (SELECT count(*) FROM smartrent.invoices) AS so_hoa_don;"
```

Kết quả đúng:

```text
 so_bang | so_phong | so_hoa_don
---------+----------+------------
      74 |       34 |         38
```

## 6. Thông tin kết nối

| Mục | Backend | pgAdmin, DBeaver |
|---|---|---|
| Host | `localhost` | `localhost` |
| Cổng | `5433` | `5433` |
| Database | `smartrent` | `smartrent` |
| Tài khoản | `smartrent_app` | `postgres` |
| Mật khẩu | `DB_APP_PASSWORD` | `DB_PASSWORD` |

Bảng nằm trong schema `smartrent`, không phải `public`. Trong pgAdmin, mở `Databases`, `smartrent`, `Schemas`, `smartrent`, `Tables`. Khi viết SQL bằng tài khoản `postgres` thì ghi `smartrent.rooms`. Tài khoản `smartrent_app` đã được cấu hình sẵn nên chỉ cần ghi `rooms`.

Không có pgAdmin thì mở SQL ngay trong container:

```powershell
docker compose exec db psql -U postgres -d smartrent
```

## 7. Nối project backend

Project ASP.NET Core nằm ở `backend/`. Cần .NET SDK 10. Mở `backend/SmartRent.sln` bằng Visual Studio hoặc Rider.

Lưu connection string bằng user-secrets. Thay `<DB_APP_PASSWORD>` bằng mật khẩu trong `.env` của bạn:

```powershell
cd backend/src/SmartRent.Api
dotnet user-secrets set "ConnectionStrings:SmartRent" "Host=localhost;Port=5433;Database=smartrent;Username=smartrent_app;Password=<DB_APP_PASSWORD>"
```

Không ghi connection string vào `appsettings.json` hay mã nguồn. Chạy API bằng `dotnet run`, địa chỉ là `http://localhost:5080`.

Không tự tạo project hay scaffold riêng. Chỉ người giữ database chạy scaffold, để cả nhóm dùng chung một bộ entity.

Trước khi code, đọc:

| Tài liệu | Để biết |
|---|---|
| [../backend/HUONG_DAN_THEO_TRANG.md](../backend/HUONG_DAN_THEO_TRANG.md) | **Đọc đầu tiên.** Mỗi trang code ở thư mục nào, file nào, ai làm |
| [THIET_KE_DATABASE.md](THIET_KE_DATABASE.md) | Màn hình nào dùng bảng nào, bước nào phải nằm trong cùng transaction, API phải tự kiểm tra gì |
| [EF_CORE_NPGSQL.md](EF_CORE_NPGSQL.md) | Cách map kiểu dữ liệu, view, trigger và xử lý lỗi với EF Core |
| [TU_DIEN_DU_LIEU.md](TU_DIEN_DU_LIEU.md) | Mọi cột, kiểu và khóa |
| [../docs/BACKEND_HANDOFF.md](../docs/BACKEND_HANDOFF.md) | Cách nối với frontend. Mục 0b liệt kê các route không còn bảng tương ứng |

Không gọi `EnsureCreated()` và không dùng EF Core Migrations: cấu trúc do các file SQL quản lý, EF không giữ được trigger, view và ràng buộc `EXCLUDE`.

## 8. Tài khoản đăng nhập mẫu

Mật khẩu chung là `demo1234`, dùng được khi backend đã có chức năng đăng nhập. Đây là dữ liệu giả, giống bản mock của frontend.

| Email | Vai trò |
|---|---|
| `ha.chutro@example.com` | Chủ trọ, toàn quyền, 3 cơ sở |
| `quan.quanly@example.com` | Quản lý, 2 cơ sở |
| `lan.nhanvien@example.com` | Nhân viên, 1 cơ sở |
| `minh.kythuat@example.com` | Kỹ thuật, ticket và công tơ |
| `an.khachthue@example.com` | Khách thuê đại diện, phòng A101 |
| `bich.oghep@example.com` | Người ở cùng |
| `admin@smartrent.example.com` | Quản trị hệ thống |

Số để đối chiếu: hóa đơn `HD-BT2609-001` của khách `an.khachthue` có tổng 3.655.000 đồng, đã thu 2.000.000, còn 1.655.000.

## 9. Lệnh hằng ngày

Mở Docker Desktop trước khi chạy các lệnh này.

| Việc | Lệnh |
|---|---|
| Bật database | `docker compose up -d` |
| Tắt, giữ nguyên dữ liệu | `docker compose stop` |
| Xem trạng thái | `docker compose ps` |
| Xem log | `docker compose logs db` |
| Tạo lại từ đầu | `docker compose down -v` rồi `docker compose up -d` |

`down -v` xóa toàn bộ dữ liệu trong bản Docker trên máy bạn và nạp lại dữ liệu mẫu. Máy khác không bị ảnh hưởng.

## 10. Khi cấu trúc bảng thay đổi

Cấu trúc bảng do một người giữ. Cần thêm hoặc đổi bảng, cột thì báo người đó, không tự sửa `01_schema.sql` đến `04_import_tools.sql`. Quy trình nằm ở [migrations/README.md](migrations/README.md).

Khi có thay đổi, cả nhóm chạy:

```powershell
git pull
docker compose down -v
docker compose up -d
```

Chỉ `git pull` thì database chưa đổi, vì Docker chỉ nạp script khi database còn trống. Dữ liệu bạn tự thêm sẽ mất, nên đừng dựa vào dữ liệu thử để code.

Ngoài ra, không đưa dữ liệu thật hay giấy tờ thật vào bản Docker, và không chạy `docker/init.sql` hay `06_du_lieu_mau.sql` trên server thật.

## 11. Lỗi thường gặp

| Hiện tượng | Nguyên nhân | Cách xử lý |
|---|---|---|
| `docker` is not recognized, command not found | Chưa cài Docker hoặc terminal mở từ trước khi cài | Cài Docker Desktop, mở terminal mới |
| `Cannot connect to the Docker daemon`, `dockerDesktopLinuxEngine` | Docker Desktop chưa bật | Mở Docker Desktop, chờ chạy xong rồi thử lại |
| Docker báo lỗi WSL hoặc virtualization | WSL cũ hoặc chưa bật ảo hóa | Chạy `wsl --update`, bật ảo hóa trong BIOS/UEFI |
| `Chưa có file .env, hãy sao chép từ .env.example` | Thiếu `.env`, hoặc file bị lưu thành `.env.txt` | Làm lại bước 3 |
| `port is already allocated`, `address already in use` | Cổng 5433 đang bận | Đổi `DB_PORT` trong `.env`, ví dụ `5434`, chạy lại `docker compose up -d`, sửa cổng trong connection string |
| STATUS là `unhealthy` | Nạp database lỗi giữa chừng | Xem `docker compose logs db`. Nếu do lỗi môi trường thì chạy `docker compose down -v` rồi `docker compose up -d`. Vẫn lỗi thì gửi log cho người giữ database |
| `password authentication failed` | Sai mật khẩu, đổi `.env` sau khi đã tạo database, hoặc đang nối nhầm cổng 5432 | Kiểm tra cổng và mật khẩu. Nếu đã đổi `.env` thì chạy `docker compose down -v` rồi `docker compose up -d` |
| `permission denied for schema smartrent` khi tạo, sửa, xóa bảng | `smartrent_app` không được đổi cấu trúc | Đây là chủ ý, xem mục 10 |
| `relation "rooms" does not exist` khi dùng tài khoản `postgres` | Thiếu tên schema | Ghi `smartrent.rooms` |
| Lỗi nghiệp vụ khi thêm, sửa dữ liệu | Trigger hoặc ràng buộc chặn dữ liệu sai | Đọc nội dung lỗi: đó thường là quy tắc nghiệp vụ, không phải lỗi database. Xem `THIET_KE_DATABASE.md` mục 9 |
