# SmartRent backend

ASP.NET Core hiện là khung controller; chưa có API nghiệp vụ hoặc DbContext nối database. Giao diện đang dùng mock.

Database mới có **13 bảng**, chỉ admin/user. Bắt đầu từ [bộ cài](../database/README.md), [bàn giao API](../docs/BACKEND_HANDOFF.md), [JSONB](../database/JSON_DATA.md), [đối chiếu trang](../database/DOI_CHIEU_TUNG_TRANG.md).

Để cài PostgreSQL bằng Docker và chuẩn bị cấu hình kết nối cho backend trên Windows, xem [hướng dẫn từng bước](../docs/CAI_DAT_DOCKER_BACKEND.md). Chuỗi kết nối được lưu bằng .NET user-secrets; backend hiện chưa đọc hoặc kết nối chuỗi này.

Chạy trong thư mục backend: `dotnet build SmartRent.sln`, `dotnet run --project src/SmartRent.Api`.

Map entity theo [từ điển](../database/TU_DIEN_DU_LIEU.md). SQL sở hữu schema. users chứa cả hồ sơ khách và thông tin đăng nhập; không sinh thêm bảng tài khoản/hồ sơ/phân quyền. Các danh sách ảnh/giá/bản ký/dòng tiền/tin nhắn nằm trong JSONB.

[Hướng dẫn theo trang và controller](<HUONG_DAN_CODE _BACKEND_THEO_TRANG.md>) ghi ánh xạ chức năng hiện tại. Tên controller/DTO cũ không phải tên bảng phải tạo.

Đọc [quy tắc transaction](../database/THIET_KE_DATABASE.md), kiểm tra SQL, rồi thêm integration tests API. Chỉ khi API hoàn chỉnh mới đặt VITE_DATA_SOURCE=api và VITE_DEV_API_PROXY=http://localhost:5080 trong frontend local. Không đặt connection string hoặc mật khẩu trong biến VITE.
