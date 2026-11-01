# Prompt giao Claude thiết kế và code frontend SmartRent

Bạn là UI/UX Designer và Frontend Developer. Hãy tự thiết kế và code frontend hoàn chỉnh cho SmartRent — website quản lý và đặt phòng trọ.

Trước khi làm, đọc `CLAUDE.md`, `DAC_TA_LUONG_VA_CHUC_NANG_WEBSITE_PHONG_TRO.md` và tài liệu trong `database/`. Bám sát chức năng, vai trò và quy tắc nghiệp vụ; tự quyết định phong cách, bố cục và cách trình bày giao diện.

**Ngôn ngữ và công nghệ:**

- HTML5, CSS3, SCSS, JavaScript ES6+; Vite để chạy và build.
- Bootstrap 5, Bootstrap Icons; Font Awesome là lựa chọn icon thay thế khi cần.
- Animate.css cho hiệu ứng đơn giản; GSAP cho chuyển động nâng cao khi phù hợp.
- SweetAlert2, DataTables, Chart.js, Flatpickr, Tom Select, FilePond, Alpine.js; CSS Variables/SCSS quản lý theme. Dùng đúng mục đích, tránh tải thư viện không cần trên từng trang.

**Yêu cầu chính:**

1. Hoàn thiện khu tìm/đặt phòng công khai, khu quản trị theo vai trò và cổng khách thuê; bao phủ các phân hệ trong đặc tả. Chức năng tương lai/tùy chọn phải ghi rõ phạm vi mô phỏng.
2. Tách `frontend/` và `backend/` độc lập. Giai đoạn này chỉ code frontend; `backend/` để README bàn giao cho team C#/ASP.NET Core Web API + EF Core + Npgsql/PostgreSQL. Giữ nguyên `database/`.
3. Frontend chạy được khi chưa có backend: mock data nhất quán, thao tác có kết quả, đủ trạng thái tải/rỗng/lỗi/thành công. Tách lớp API/service khỏi giao diện để đổi mock sang API thật bằng cấu hình.
4. Giao diện tiếng Việt, responsive, dễ dùng, hỗ trợ bàn phím, form có validation; ngày và tiền VND thống nhất. Lọc, tìm kiếm, sắp xếp, phân trang và các luồng nghiệp vụ phải hoạt động trong chế độ mock.
5. Giữ đúng nghiệp vụ: giữ chỗ khác đang ở; báo chuyển khoản chưa xác minh chưa tính đã thu; cọc tách tiền thuê; hóa đơn phát hành dùng điều chỉnh; quyền thật do backend kiểm tra.
6. Tạo `docs/api/openapi.yaml` mô tả API đề xuất, DTO, lỗi, phân trang và quyền; tạo tài liệu bàn giao, danh sách trang/chức năng đã làm, `.env.example` và README hướng dẫn chạy/build.

Hãy thực hiện thành project chạy được, kiểm tra build và các luồng chính. Không chỉ trả về kế hoạch hoặc ảnh thiết kế; ghi rõ phần đã kiểm tra và phần còn mô phỏng khi bàn giao.
 