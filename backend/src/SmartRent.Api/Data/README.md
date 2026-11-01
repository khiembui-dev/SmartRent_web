# Truy cập database

Người 1 giữ thư mục này. Các file ở đây sinh từ database, cách chạy nằm ở `backend/HUONG_DAN_THEO_TRANG.md` mục 3.

| File | Chứa |
|---|---|
| `SmartRentDbContext.cs`, `Entities/` | Sinh bằng `dotnet ef dbcontext scaffold`. Không sửa tay, vì scaffold lại sẽ ghi đè |
| `AuthDbContext.cs`, `ApplicationUser.cs` | Viết tay theo `database/EF_CORE_NPGSQL.md` mục 3 |

Phần mở rộng của entity đặt ở partial class, ngoài thư mục `Entities/`.

Cấu trúc bảng do các file SQL trong `database/` quản lý. Không dùng EF Core Migrations.
