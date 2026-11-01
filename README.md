# SmartRent

Website quản lý và cho thuê phòng trọ: trang công khai tìm phòng, khu quản trị cho chủ trọ, khu khách thuê và quản trị hệ thống.

| Thư mục | Nội dung | Trạng thái |
|---|---|---|
| `frontend/` | Giao diện bằng HTML, SCSS, JavaScript, Vite, Bootstrap 5 | Chạy được bằng dữ liệu mô phỏng |
| `database/` | PostgreSQL 16, 74 bảng, 12 view, dữ liệu mẫu | Đã kiểm thử, chạy dev bằng Docker |
| `backend/` | ASP.NET Core 10, EF Core, Npgsql | Khung project chia theo trang, **chưa có API** |
| `docs/` | Hợp đồng API, tài liệu bàn giao | Đường dẫn API là đề xuất |

## Bắt đầu

Cần Git, Docker Desktop, .NET SDK 10 và Node.js 22.12 trở lên.

```powershell
git clone https://github.com/khiembui-dev/SmartRent_web.git
cd SmartRent_web
```

**Team backend**, đọc theo thứ tự:

1. [database/HUONG_DAN_CAI_DAT.md](database/HUONG_DAN_CAI_DAT.md): cài database trên máy bằng Docker.
2. [backend/HUONG_DAN_THEO_TRANG.md](backend/HUONG_DAN_THEO_TRANG.md): phân công, mỗi trang code ở thư mục nào, gọi API gì, dùng bảng nào.

**Chạy frontend:**

```powershell
cd frontend
npm ci
npm run dev      # http://localhost:5173
```

Frontend mặc định chạy bằng dữ liệu mô phỏng, không cần backend. Tài khoản xem thử nằm ở [frontend/README.md](frontend/README.md).

## Tài liệu

| Tài liệu | Nội dung |
|---|---|
| [DAC_TA_LUONG_VA_CHUC_NANG_WEBSITE_PHONG_TRO.md](DAC_TA_LUONG_VA_CHUC_NANG_WEBSITE_PHONG_TRO.md) | Đặc tả nghiệp vụ |
| [database/README.md](database/README.md) | Các file database, nhập dữ liệu thật |
| [database/THIET_KE_DATABASE.md](database/THIET_KE_DATABASE.md) | Thiết kế, giao dịch, phần API phải tự kiểm tra |
| [docs/api/openapi.yaml](docs/api/openapi.yaml) | Hợp đồng API |
| [docs/BACKEND_HANDOFF.md](docs/BACKEND_HANDOFF.md) | Cách nối frontend với API thật |

## Quy tắc chung

- Không đưa mật khẩu, connection string hay file `.env` lên Git. Repo này công khai.
- Không đưa dữ liệu khách thật vào repo. `06_du_lieu_mau.sql` và mock chỉ chứa dữ liệu giả.
- Đổi cấu trúc bảng qua `database/migrations/`, không sửa `01` đến `04`.
- Tạo nhánh riêng cho mỗi việc rồi mở pull request vào `main`.
