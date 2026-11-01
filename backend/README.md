# SmartRent: Backend

Khung project ASP.NET Core đã chia sẵn theo trang và build được, **chưa có API nào**. Mỗi controller là file rỗng, đúng tên và đúng đường dẫn gốc.

**Mỗi trang code ở đâu, ai làm, gọi API gì: xem [HUONG_DAN_THEO_TRANG.md](HUONG_DAN_THEO_TRANG.md).**

```powershell
dotnet build SmartRent.sln
dotnet test SmartRent.sln
dotnet run --project src/SmartRent.Api    # http://localhost:5080
```

## Công nghệ đã chọn

| Thành phần | Lựa chọn |
|---|---|
| Nền tảng | C#, ASP.NET Core Web API (net10.0) |
| Truy cập dữ liệu | EF Core 10 + Npgsql (đã kiểm tra với EF Core 10.0.13, Npgsql EF 10.0.3; giữ cùng major version với Identity) |
| Cơ sở dữ liệu | PostgreSQL 16+, schema `smartrent`, cần extension `btree_gist`, `pg_trgm`, `unaccent`, `pgcrypto`, múi giờ `Asia/Ho_Chi_Minh` |
| Xác thực | ASP.NET Core Identity (bảng Identity snake_case trong schema), access token ngắn hạn + refresh token cookie HttpOnly |

## Đọc theo thứ tự

1. `HUONG_DAN_THEO_TRANG.md` – phân công, thư mục và API của từng trang.
2. `../database/HUONG_DAN_CAI_DAT.md` – cài database trên máy.
3. `../CLAUDE.md` – quy tắc chung của repo, kiến trúc database, lệnh kiểm thử database.
4. `../DAC_TA_LUONG_VA_CHUC_NANG_WEBSITE_PHONG_TRO.md` – nghiệp vụ; §10.2 tiêu chí nghiệm thu, §10.3 chính sách chưa chốt.
5. `../database/THIET_KE_DATABASE.md` (đặc biệt §8 giao dịch, §9 phần API phải làm), `../database/EF_CORE_NPGSQL.md`, `../database/TU_DIEN_DU_LIEU.md`.
6. `../docs/api/openapi.yaml` – **hợp đồng API đề xuất** mà frontend đang gọi (240 thao tác, nhóm theo nghiệp vụ, kèm quyền `x-permission`, phạm vi, mã lỗi, khóa chống lặp).
7. `../docs/BACKEND_HANDOFF.md` – cách nối frontend với API thật, quy tắc máy chủ, đề xuất thay đổi dữ liệu và giả định cần chốt.
8. `../docs/FRONTEND_COVERAGE.md` – màn hình/luồng frontend đã làm.

## Bắt đầu

Làm theo thứ tự ở `HUONG_DAN_THEO_TRANG.md`, mục 3 và mục 12. Script SQL là nguồn sở hữu schema: **không** dùng `EnsureCreated()` hay EF Core Migrations.

Kiểm tra với frontend thật: trong `../frontend/.env.local` đặt `VITE_DATA_SOURCE=api` và `VITE_DEV_API_PROXY=http://localhost:5080`, rồi `npm run dev`.

## Tiêu chí nhận bàn giao một nhóm API

- Đúng đường dẫn, phương thức, DTO (camelCase), mã lỗi trong `openapi.yaml`; thay đổi hợp đồng phải cập nhật YAML, `frontend/src/services/api.js` và mock, rồi chạy `npm run check:contract` trong `frontend/`.
- Kịch bản trong `frontend/scripts/smoke-mock-api.mjs` (158 kiểm tra nghiệp vụ, ví dụ hóa đơn 3.655.000 / thu 2.000.000 / còn 1.655.000, phí một lần không lặp, khoản chờ xác minh không tính đã thu) nên được chuyển thành integration test chạy trên API thật.
- Bộ kiểm thử database (`python database/tests/run_checks.py`) vẫn đạt.

## Không được đưa vào repo

Connection string, mật khẩu SMTP, khóa API nhà cung cấp, khóa ký token. Dùng user-secrets/biến môi trường/kho bí mật. Tệp riêng tư (giấy tờ, hợp đồng ký, chứng từ) lưu ở kho riêng, chỉ cấp đường dẫn tải có thời hạn sau khi kiểm tra quyền.
