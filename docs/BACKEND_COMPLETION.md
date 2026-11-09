# Backend sau khi hoàn thiện ngày 07/11/2026

Phạm vi là các luồng local đã nối SQL. Các việc còn cần làm trước khi deploy nằm
trong [rà soát production](DEPLOY_READINESS.md).

Các thay đổi được viết trực tiếp tại thư mục source gốc sau khi gộp code nhóm.
Database vẫn có **13 bảng**, role `admin` và `user`; không reset database hoặc thay
`.env`, Docker Compose, User Secrets và cổng làm việc của máy.

## Các trang và luồng đã nối SQL

| Trang | Chức năng |
|---|---|
| Tổng quan admin | Số phòng, tiền thu/công nợ, Ticket, lịch xem, hợp đồng sắp hết hạn; lọc cơ sở/tháng |
| Cơ sở | Danh sách, thêm/sửa, bảng giá có lịch sử, kích hoạt/ngừng, xóa khi chưa có phòng |
| Phòng | Danh sách/lọc, thêm/sửa, giá kế thừa hoặc giá riêng, tiện ích, ảnh/bìa, trạng thái, xóa khi chưa có lịch sử |
| Tin đăng | Đăng/ẩn ngay danh sách hoặc chi tiết phòng; cho phép chưa có ảnh; phòng trống đã đăng mới hiện ở trang khách |
| Lịch xem | Khách đặt theo slug; admin xếp lịch, ghi kết quả, từ chối; hủy giữ chỗ hiện có |
| Khách thuê | Thêm/sửa, tìm/lọc, hồ sơ cả người đại diện/người ở cùng, đặt mật khẩu, mời kích hoạt, duyệt/từ chối đề nghị sửa liên hệ |
| Hợp đồng | Nhận phòng, thu cọc, nhập phòng đã có khách/bổ sung hợp đồng, phiên bản/gia hạn, ký tệp, đính kèm, quyết toán trả phòng, lưu trữ |
| Tính tiền | Mở/khóa/mở khóa kỳ, chỉ số trước lấy từ kỳ đã phát hành hoặc lúc nhận phòng, nhập/sửa riêng điện/nước, dự tính và tạo/phát hành nhiều hóa đơn |
| Hóa đơn và thu tiền | Chi tiết khoản thu/chỉ số; thu tiền, khách báo chuyển khoản/biên lai, admin xác nhận/từ chối, hoàn tác, số dư và lịch sử đảo khớp nhau, CSV theo bộ lọc |
| Ticket | Tạo, ảnh riêng tư, trao đổi/ghi chú nội bộ, phân công/trạng thái, xác nhận/mở lại và thông báo đúng người nhận |
| Cài đặt | Tên/email/điện thoại/ảnh đại diện, mật khẩu, lịch nhắc và tài khoản nhận chuyển khoản |
| Trang khách | Trang chủ, tìm/lọc/xem phòng, liên hệ, đăng ký/đăng nhập, hợp đồng/bàn giao, hóa đơn/thanh toán, Ticket, tài khoản và thông báo |

## Những lỗi đã sửa

- API Cơ sở, Phòng, trang công khai và xác nhận xuất CSV trước đây chưa có route.
- Frontend gửi `chargeTypeId`, chỉ số dạng số, `slug`, `methodCode`, `allocations`,
  `displayName` khác định dạng backend. Các request đã được chuyển sang snapshot JSONB đúng SQL.
- Trang chi tiết hóa đơn thiếu `meterSegments`, số tiền dòng và thông tin hoàn tác;
  trang trả phòng thiếu `meters`. Đã bổ sung projection dùng chung.
- Bổ sung hợp đồng cho phòng nhập cũ trước đây bị điều hướng sai vì `contracts`
  luôn có một dòng dù chưa có bản hợp đồng. Luồng nhập/bổ sung đã được kiểm tra.
- Không còn lấy chỉ số đầu mặc định 0 hoặc dùng giá minh họa. Chỉ số điện/nước
  được ghi cùng thời điểm phù hợp; hóa đơn tháng và quyết toán dùng chung bộ tính.
- Chia tiền cố định theo từng tháng và ngày thực tế; các dòng sử dụng đơn giá nguyên
  VND và tỷ lệ ngày, tổng làm tròn khớp hàm `invoice_total` của PostgreSQL.
- Sửa nước không còn sửa nhầm điện do dùng chung ID hóa đơn.
- Chuyển khoản `+07:00` được đổi về UTC. Xác nhận sử dụng phần phân bổ admin chọn.
- Gửi lại phiếu thu bằng cùng `Idempotency-Key` không tạo thêm dòng, kể cả gửi đồng thời;
  nội dung khác với cùng key trả `409`.
- Hoàn tác phiếu thu ghi đủ phương thức/lý do; lịch sử người thuê trừ các khoản đã đảo.
- Preview trả phòng tính tiền thật. Checkout lấy lại cùng phép tính trong transaction,
  bù cọc/hoàn cọc, ghi số cuối và trả phòng; không thu lại phần thuê đã phát hành.
- Duyệt đề nghị chỉ sửa điện thoại không xóa email. Lọc cơ sở và tình trạng người ở cùng
  hoạt động; email trong Cài đặt admin được lưu.
- EF và các API Npgsql dùng chung `NpgsqlDataSource` và `search_path`, tránh lỗi trigger
  không tìm thấy `auth_tokens` khi đặt/đổi mật khẩu.
- Upload hỗ trợ avatar/ảnh phòng, hợp đồng PDF/ảnh, biên lai và Ticket. Tệp riêng được
  kiểm tra quyền khi cấp link và tải; chỉ ảnh gắn tin đăng/avatar mới có URL công khai.
- Đăng xuất bằng Bearer cũng thu hồi phiên; đổi/đặt mật khẩu thu hồi phiên và giao diện
  đưa người dùng về trang đăng nhập.

## Các file chính

| File/thư mục trong `backend/src/SmartRent.Api` | Trách nhiệm |
|---|---|
| `Common/BusinessData.cs` | Transaction, retry xung đột, JSONB, danh mục mã phí và lịch sử giá |
| `Features/Rooms/HousingData.cs` | Dữ liệu phòng/cơ sở theo cấu trúc frontend |
| `Features/Properties`, `Features/Rooms`, `Features/PublicSite` | Quản lý cơ sở/phòng và tìm phòng công khai |
| `Features/Billing/BillingEngine.cs` | Bộ tính chung từ hợp đồng, giá, chỉ số và thời gian thuê |
| `Features/Billing/*Controller.cs` | Kỳ tính tiền, worksheet, nhập/sửa chỉ số |
| `Features/Invoices/InvoiceData.cs` | Chi tiết hóa đơn, số dư, chỉ số, phiếu thu và dòng đảo |
| `Features/Payments/PaymentLedger.cs` | Ghi sổ thu/cọc/hoàn tác cùng kiểm tra gửi lại |
| `Features/Contracts/CheckoutService.cs` | Xem trước và thực hiện quyết toán, cọc và trả phòng |
| `Features/Contracts/*Controller.cs` | Hợp đồng, gia hạn/ký và quyền xem của khách |
| `Features/Auth/AccountEmail.cs` | Thư đặt mật khẩu/kích hoạt: local `.eml`, production SMTP |
| `Features/Files` | Lưu nội dung ngoài wwwroot, link riêng có hạn và ảnh công khai |
| `Program.cs` | Đăng ký chung connection pool, Auth, EF và dịch vụ |

Các file frontend được chỉnh ở `pages/admin` và `pages/customer` để dùng đúng các
request/response này; không chuyển sang dữ liệu mock.

## Email và phạm vi tích hợp bên ngoài

Trong `Development`, khi chưa cấu hình SMTP, thư thật được tạo dưới dạng `.eml` trong
`backend/src/SmartRent.Api/App_Data/mail`. Mở thư để lấy liên kết đặt mật khẩu local.
Thư và token nằm ngoài Git; không đưa thư này lên GitHub hoặc chia sẻ liên kết.
Khi cần giữ toàn bộ thư trong máy phát triển dù đã có cấu hình SMTP, đặt
`Email__UsePickup=true` trong terminal chạy backend. Khóa này chỉ có hiệu lực ở
`Development`; bộ kiểm tra tự đặt khóa này để không gửi email ra ngoài.

Production cần cấu hình các khóa sau bằng User Secrets hoặc biến môi trường của máy
chạy backend: `Email:Host`, `Email:Port`, `Email:EnableSsl`, `Email:Username`,
`Email:Password`, `Email:From`, `Email:FrontendUrl`. Với biến môi trường dùng dấu `__`
thay `:`, ví dụ `Email__Host`. Khi thiếu SMTP ở Production, API báo lỗi dịch vụ,
không thông báo giả rằng đã gửi thư. Gửi SMTP tới nhà cung cấp bên ngoài chưa được
kiểm tra vì chưa có thông tin tài khoản SMTP trong yêu cầu này.

Thanh toán hiện là chuyển khoản thủ công và admin đối chiếu/xác nhận. Không có tích hợp
ngân hàng tự động hoặc tự suy đoán BIN/VietQR. Tài khoản nhận tiền nhập tại Cài đặt admin.
Nếu giá điện/nước thay đổi giữa một kỳ, hệ thống yêu cầu chốt chỉ số tại ngày đổi giá,
không tự chia lượng tiêu thụ để thu một số tiền suy đoán.

## Kiểm tra

- Build .NET và 19 bài kiểm thử hiện có.
- 62 thao tác HTTP của luồng đầy đủ; 38 thao tác bổ sung cho thư/kích hoạt, nhập phòng,
  nhiều tháng, thu tiền đồng thời, quyền tệp và Cài đặt.
- 39 kiểm tra Ticket và 59 kiểm tra tích hợp các module sau gộp vẫn đạt.
- Đã mở 20 màn hình admin và 14 màn hình khách/xác thực trên source gốc.
- Frontend build và kiểm tra mô hình hai role đạt.
- Bổ sung 25 thao tác HTTP kiểm tra tin phòng chưa có ảnh, đăng/ẩn, phòng bảo trì,
  cơ sở ngừng hoạt động và dữ liệu trả về công khai; 96 kiểm tra SQL và 10 luồng SQL đạt.

Tổng cộng **223 thao tác HTTP** đạt trong đợt kiểm tra cuối sau khi sửa tin phòng.

Các kiểm tra ghi dữ liệu được chạy bằng chính assembly build từ source gốc, với database
tạm có cùng schema để không làm thay đổi dữ liệu đang dùng. Không có bản ứng dụng riêng
dùng thay cho source gốc. Database tạm được dọn sau kiểm tra.

Regression nằm tại `backend/tests/full_backend_flow.py`, `backend/tests/backend_edge_flow.py`
và `backend/tests/public_listing_flow.py`; các script yêu cầu state local và từ chối
API/database làm việc thông thường.
Snapshot route tại [BACKEND_ROUTE_AUDIT.json](BACKEND_ROUTE_AUDIT.json) phân biệt API
đang được trang sử dụng với các service cũ chưa được trang nào gọi; việc tồn tại service
cũ trong `api.js` không có nghĩa là một trang hiện tại còn thiếu.

## Chạy hằng ngày

Từ thư mục gốc, sau khi mở Docker Desktop:

```powershell
docker compose up -d db
dotnet run --project backend/src/SmartRent.Api --launch-profile http
```

Mở terminal khác:

```powershell
cd frontend
npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

Admin: `http://localhost:5174/admin`; khách: `http://localhost:5174`.
Khi build lại backend, dừng tiến trình đang chạy bằng Ctrl+C trước để Windows không khóa DLL.
