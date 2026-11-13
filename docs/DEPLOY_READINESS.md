# Rà soát trước deploy — 07/11/2026

## Kết luận

Các luồng chính của những trang hiện tại đã nối PostgreSQL và đã được kiểm tra local.
Chưa nên coi source là bản đã sẵn sàng đưa lên Internet: cấu hình triển khai, bảo vệ
endpoint công khai, lưu trữ bền vững và kiểm tra staging còn phải hoàn thiện.

Rà soát lần này chỉ đọc source/cấu hình, kiểm tra thư viện và publish bản Release.
Không đổi database, mật khẩu hoặc cấu hình local đang dùng; không deploy lên server.

## Phần nghiệp vụ đã có

Trang chủ; tìm/lọc/chi tiết phòng; Liên hệ; khách đặt lịch xem; admin quản lý lịch;
Dashboard; cơ sở/phòng/giá/tin đăng; khách thuê; hợp đồng/nhận phòng/gia hạn/trả phòng;
điện nước/hóa đơn; thu tiền/cọc/hoàn tác; Ticket; thông báo; tài khoản và Cài đặt.

`BACKEND_ROUTE_AUDIT.json` ghi nhận **0 lời gọi service đang được trang sử dụng thiếu
route**. Đây là kiểm tra độ phủ route, không chứng minh mọi tình huống nghiệp vụ hoặc
mọi cấu hình production đều đúng. 19 bài .NET và 198 thao tác HTTP đã đạt ở đợt hoàn
thiện local trước đó; chúng chưa thay thế việc kiểm tra trên server đích.

## Việc cần làm trước khi mở công khai

| Mức | Bằng chứng trong source | Việc cần hoàn thiện |
|---|---|---|
| P0 | `frontend/src/config.js:10`, `frontend/vite.config.js:5`, `frontend/.env.example:7` vẫn mặc định `mock` | Production phải build bằng `VITE_DATA_SOURCE=api`; thêm chốt để build production không âm thầm chọn mock khi thiếu cấu hình. Local hiện đang dùng API qua `.env.local`, file này không được đưa lên Git. |
| P0 | `docker-compose.yml` chỉ có `db`; chưa có cấu hình host frontend/API | Bổ sung một phương án triển khai cụ thể: Dockerfile/Compose production hoặc service của server. Phục vụ `frontend/dist`, proxy `/api` tới API, cấu hình SPA fallback để mở trực tiếp `/admin`, `/rooms/...` không bị 404. Proxy của Vite chỉ có trong dev. |
| P0 | `Program.cs` chưa cấu hình forwarded headers; `AuthController.cs:30,51` dùng `Secure = Request.IsHttps` | Cấu hình domain, HTTPS, proxy tin cậy và chuyển tiếp scheme/IP đúng trước xác thực; bảo đảm cookie đăng nhập có `Secure` khi người dùng truy cập HTTPS. Giới hạn host hợp lệ. Không tin mọi proxy tùy ý. |
| P0 | `LeasingInfrastructure.cs` đọc `ConnectionStrings:SmartRent`; User Secrets đang nằm trên máy phát triển | Cấp connection string và secrets riêng ở server; dùng role `smartrent_app`, không dùng superuser cho API. Đặt môi trường `Production`. Không chép mật khẩu local vào Git hoặc biến `VITE_*`. |
| P0 | `AccountEmail.cs:13` có frontend URL mặc định localhost; Production thiếu SMTP trả 503 | Cấu hình SMTP thật, địa chỉ gửi và `Email__FrontendUrl=https://<domain>`; kiểm tra thư quên mật khẩu/mời khách và đường dẫn trong thư từ bên ngoài server. Code gửi thư đã có, tài khoản nhà cung cấp chưa được cấu hình/xác minh. |
| P0 | `TicketFileStore.cs:15` lưu file theo `ContentRootPath/App_Data/ticket-files`; `Program.cs:36` dùng Data Protection mặc định | Gắn ổ/volume bền vững cho file; cấu hình nơi lưu khóa ký link bền vững và quyền truy cập. Đồng bộ khóa và file nếu chạy nhiều instance. Không để lần thay container/publish làm mất ảnh, hợp đồng hoặc khóa. |
| P1 | Có khóa tài khoản sau 5 lần sai; chưa có rate limiter cho các endpoint công khai trong API | Giới hạn đăng nhập, đăng ký, quên mật khẩu và upload bằng app hoặc proxy; trả 429 phù hợp. Khóa theo tài khoản không thay thế giới hạn theo nguồn gửi. |
| P1 | Docker có healthcheck DB, nhưng chưa có health/readiness production cho API hoặc cấu hình cảnh báo | Bổ sung kiểm tra sống/sẵn sàng, request ID và log vận hành, giới hạn dung lượng/luân chuyển log, theo dõi lỗi và dung lượng lưu trữ. Endpoint `dev/database-check` hiện cố ý chỉ dành cho Development. |
| P1 | SQL baseline và `init.sql` có sẵn, chưa có quy trình cập nhật schema/backup production đi kèm | Viết script cập nhật có phiên bản cho các lần nâng cấp sau, quy trình backup và khôi phục cả SQL lẫn file; thực hiện một lần restore thử. Không chạy lại baseline hoặc xóa volume để nâng cấp dữ liệu đang dùng. |
| P0 | Trợ lý AI (`Features/Chatbot`, 13/11/2026) gọi dịch vụ AI qua `Chatbot:BaseUrl`; máy phát triển đang dùng endpoint `http` với `AllowInsecureHttp=true` | Production dùng endpoint HTTPS và khóa API riêng của server; không bật `AllowInsecureHttp`. Lịch sử hội thoại đang lưu trong bộ nhớ một tiến trình: chạy nhiều instance thì thay `IChatConversationStore`. Xem [CHATBOT_AI.md](CHATBOT_AI.md). |
| P1 | `04_create_admin.sql` yêu cầu hash; lệnh CLI đặt mật khẩu trong `Program.cs` chỉ cho Development | Ghi rõ bước khởi tạo một admin production bằng hash hợp lệ và tài khoản sở hữu DB; không nạp `05_demo.sql` trên server thật. Bảo vệ thao tác bootstrap khỏi truy cập web. |

P0: cần chốt cho môi trường đích trước khi mở website. P1: cần hoàn thiện để vận hành
công khai ổn định và bảo vệ các luồng đã có.

Phương án ít thay đổi code hiện tại là dùng **một domain**: web ở `/`, API ở `/api`.
Backend chưa cấu hình CORS; một số URL ảnh/tệp hiện cũng là đường dẫn cùng origin.
Nếu tách frontend/API sang hai origin, phải bổ sung CORS với credentials, rà cookie
và sửa cách tạo URL asset; chỉ đặt `VITE_API_BASE_URL` chưa xử lý hết các phần này.

Vite hướng dẫn phục vụ bản build và xác định `vite preview` chỉ để xem trước local,
không phải server production. Xem [tài liệu triển khai Vite](https://vite.dev/guide/static-deploy).
Việc xử lý scheme/IP sau reverse proxy theo
[hướng dẫn ASP.NET Core](https://learn.microsoft.com/en-us/aspnet/core/host-and-deploy/proxy-load-balancer?view=aspnetcore-10.0).
Đối với container, xem
[lưu khóa Data Protection bền vững](https://learn.microsoft.com/en-us/aspnet/core/security/data-protection/configuration/overview?view=aspnetcore-10.0).

## Các khả năng chưa có hoặc cần phân biệt

- Hai API cũ `PUT /api/v1/settings/email` và `POST /api/v1/settings/email/test`
  vẫn trả `501`; API templates trả danh sách rỗng. Giao diện Cài đặt hiện tại không
  gọi các route này. SMTP cho quên mật khẩu/mời khách hiện lấy từ cấu hình server.
  Cần loại các API cũ khỏi tài liệu công khai hoặc triển khai nếu muốn quản trị SMTP
  bằng giao diện; không mô tả chúng là chức năng đã hoạt động.
- Thanh toán ApiPay đã có QR, webhook HMAC, inbox bền vững và worker ghi sổ thu
  (13/11/2026). Trước khi nhận tiền thật phải cấu hình khóa server, webhook HTTPS
  trên dashboard và thử delivery thực tế; xem [ApiPay](APIPAY.md).
  Phiếu thu thủ công vẫn dùng cho đối soát ngoại lệ; sandbox/liveTest không thu vào hóa đơn thật.
- Nhắc tính tiền hiện hiển thị trên Tổng quan theo ngày trong Cài đặt. Chưa có
  worker tự gửi email/SMS hoặc tự tạo hóa đơn theo lịch. Giao diện hiện đã ghi rõ
  là nhắc trên Tổng quan.
- Liên hệ hiện cung cấp số điện thoại/email/địa chỉ và liên kết gọi/gửi email.
  Không có form thu lời nhắn riêng; đặt lịch được thực hiện ở chi tiết phòng.
- `docs/api/openapi.yaml` và `check:contract` vẫn mô tả/so sánh bộ API mock cũ.
  Lệnh kiểm tra này đạt không đồng nghĩa 216 API của mock đã được backend triển
  khai. Cần cập nhật tài liệu API theo backend thật để nhóm/backend client khác
  không dùng nhầm các endpoint cũ.

## Kiểm tra trong lần rà soát này

- `dotnet publish ... -c Release --no-restore -p:UseAppHost=false`: thành công,
  output nằm ngoài repo trong thư mục tạm của máy.
- `npm audit` và `npm audit --omit=dev`: 0 lỗ hổng được báo cáo tại thời điểm kiểm tra.
- `dotnet list backend/SmartRent.sln package --vulnerable --include-transitive`:
  không có package bị cảnh báo từ nguồn NuGet đang cấu hình.
- `npm run check:contract`: đạt, nhưng phạm vi là mock/OpenAPI/client như nêu trên.
- Git không theo dõi `.env`, `frontend/.env.local` hoặc thư mục `App_Data`.

Kiểm tra advisory không phải kiểm toán bảo mật đầy đủ. Chưa kiểm tra tải, chưa thử
SMTP ra ngoài và chưa xác minh HTTPS, restart container, backup/restore trên server
đích. Trước deploy cần chạy lại luồng khách đặt lịch → admin nhận phòng → hóa đơn
→ thu tiền → Ticket → trả phòng trên staging, đồng thời kiểm tra hai role, tệp
riêng tư, refresh/logout và link đặt lại mật khẩu qua domain thật.

Các việc nên bổ sung tiếp: CI cho build/test, tắt hoặc giữ riêng source map
production (`sourcemap: true` hiện tại), kiểm tra upload sâu hơn/quét tệp nếu nhận
file từ Internet, dọn upload chưa sử dụng/token hết hạn theo chính sách lưu trữ.
Không cần thêm bảng nghiệp vụ hoặc mở rộng role cho các việc triển khai này.
