> Bản hoàn thiện 07/11/2026: xem [các trang, file, kiểm tra và email local](../docs/BACKEND_COMPLETION.md).
> Trước khi deploy: xem [các việc production còn thiếu](../docs/DEPLOY_READINESS.md). Hoàn thiện luồng local chưa đồng nghĩa đã sẵn sàng mở công khai.

# SmartRent backend

ASP.NET Core kết nối PostgreSQL qua Npgsql. Đăng nhập, `/api/v1/me`, Dashboard và Ticket admin/khách đã gọi SQL thật. Ticket gồm ảnh private, trao đổi, ghi chú nội bộ, xử lý, xác nhận/mở lại và thông báo. Các trang Cơ sở, Phòng, tin đăng/tìm phòng, lịch xem, khách thuê, hợp đồng, tính tiền, hóa đơn, thanh toán và Cài đặt đã nối SQL. Frontend local chọn `mock` hoặc `api` qua `VITE_DATA_SOURCE`.

Database mới có **13 bảng**, chỉ admin/user. Bắt đầu từ [bộ cài](../database/README.md), [bàn giao API](../docs/BACKEND_HANDOFF.md), [JSONB](../database/JSON_DATA.md), [đối chiếu trang](../database/DOI_CHIEU_TUNG_TRANG.md).

Để cài PostgreSQL bằng Docker và cấu hình kết nối cho backend trên Windows, xem [hướng dẫn từng bước](../docs/CAI_DAT_DOCKER_BACKEND.md). Chuỗi kết nối đọc từ .NET user-secrets hoặc biến môi trường. Khi chạy backend với profile `http` trong Development, mở `http://localhost:5080/api/v1/dev/database-check` trên máy local để thử kết nối; endpoint này không có trong môi trường khác.

Chạy trong thư mục backend: `dotnet build SmartRent.sln`, `dotnet run --project src/SmartRent.Api`.

### Xem Dashboard bằng PostgreSQL local

1. Bật database: `docker compose up -d db` từ thư mục gốc.
2. Build backend bằng `dotnet build .\backend\src\SmartRent.Api`. Nếu admin trong database demo chưa có mật khẩu, đặt mật khẩu riêng từ thư mục gốc: `dotnet run --no-build --project .\backend\src\SmartRent.Api --launch-profile http -- --set-admin-password`. Lệnh hỏi mật khẩu trong terminal và chỉ lưu hash vào `users`. Muốn đổi mật khẩu, chạy lại lệnh này; các phiên cũ bị thu hồi.
3. Chạy backend: `dotnet run --project .\backend\src\SmartRent.Api --launch-profile http`.
4. Đặt `VITE_DATA_SOURCE=api` và `VITE_DEV_API_PROXY=http://127.0.0.1:5080` trong `frontend/.env.local`, rồi chạy `npm run dev` trong `frontend`.
5. Vào `http://localhost:5174/admin`, đăng nhập bằng email admin trong bảng `users` và mật khẩu vừa đặt. Trang gọi `GET /api/v1/dashboard?month=YYYY-MM&propertyId=UUID` với token admin. API từ chối khách và người chưa đăng nhập.

`room-stats-dev` và `dev/database-check` chỉ dùng để kiểm tra local. Ticket và chuông thông báo đã có API; các trang quản trị còn lại đã có API tương ứng. Xem [bản đồ file Ticket](TICKET_FILES.md) và [cách chạy/đọc code](HUONG_DAN_TICKET_ADMIN_KHACH.md).

Map entity theo [từ điển](../database/TU_DIEN_DU_LIEU.md). SQL sở hữu schema. users chứa cả hồ sơ khách và thông tin đăng nhập; không sinh thêm bảng tài khoản/hồ sơ/phân quyền. Các danh sách ảnh/giá/bản ký/dòng tiền/tin nhắn nằm trong JSONB.

[Hướng dẫn theo trang và controller](<HUONG_DAN_CODE _BACKEND_THEO_TRANG.md>) ghi ánh xạ chức năng hiện tại. Tên controller/DTO cũ không phải tên bảng phải tạo.

[Hướng dẫn code Ticket admin và khách](HUONG_DAN_TICKET_ADMIN_KHACH.md) đi theo từng API, DTO, truy vấn PostgreSQL, quyền truy cập và bước kiểm tra.

Đọc [quy tắc transaction](../database/THIET_KE_DATABASE.md), kiểm tra SQL, rồi thêm integration tests API. Khi dùng backend SQL, đặt VITE_DATA_SOURCE=api và VITE_DEV_API_PROXY=http://localhost:5080 trong frontend local. Không đặt connection string hoặc mật khẩu trong biến VITE.
