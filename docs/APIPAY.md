# Thanh toán hóa đơn tự động qua ApiPay

Tích hợp ngày 13/11/2026 cho SmartRent: ASP.NET Core 10 + Npgsql/PostgreSQL + frontend Vite. Customer `/invoices/:id` hiển thị số dư, chi tiết khoản thu, QR, thông tin ngân hàng và lịch sử thanh toán. Quản trị `/admin/invoices` có phần **Đối soát ApiPay** khi phát sinh ngoại lệ.

Code đã có; muốn nhận tiền thật cần khóa ApiPay hợp lệ, tài khoản ngân hàng đã kết nối, webhook HTTPS công khai và backend đang chạy. Nếu thiếu cấu hình, trang khách hiển thị chưa sẵn sàng; không tạo QR giả hoặc giả lập đã trả tiền.

## 1. Luồng hoạt động

1. Khách đăng nhập, mở hóa đơn của mình, bấm **Tạo mã QR thanh toán**.
2. Server kiểm tra quyền sở hữu, trạng thái hóa đơn, số dư còn phải thu và các khoản đang chờ xác minh. Số tiền và bank ID được lấy ở server, không nhận từ form khách.
3. Server lưu mã ASCII duy nhất `SR` + UUID không dấu gạch, sau đó gọi `POST https://app.apipay.vn/v1/client/payment-requests`. Gửi `bankPublicId`, `amount` dạng chuỗi, `content`, `title`, `expiresAt` 30 phút; Authorization là `Bearer Base64(accessKey:secretKey)`.
4. Trang khách hiện `qrUrl` và nút mở `payUrl` trong tab mới. QR hợp lệ của cùng hóa đơn/số dư được tái sử dụng để tránh tạo liên tục.
5. ApiPay gửi `transaction.in` tới `POST /api/v1/apipay/webhook`. Server xác minh `ApiPay-Signature` trên đúng byte raw body bằng HMAC-SHA256 và so sánh fixed-time trước khi parse JSON.
6. Server COMMIT giao dịch vào `apipay_events`, khóa duy nhất `transaction_id`, rồi trả 200. Deadline tiếp nhận 7 giây; DB tạm lỗi trả 503 cho ApiPay retry. Không gọi API ngoài trong webhook.
7. `ApiPayWorker` đọc inbox SQL khoảng mỗi 3 giây. Phải khớp bank ID, một mã chuyển khoản, số tiền yêu cầu và số dư hiện tại. Worker ghi phiếu thu confirmed vào bảng `payments`, ghi thông báo và đánh dấu event processed trong **cùng transaction**. Nếu crash/rollback thì worker thử lại. Lỗi từng event có backoff, không chặn các event khác.
8. `v_invoice_balances` tự tính `paid_amount`, `outstanding_amount`, `payment_status`. Hóa đơn vẫn có `status='issued'`; **đã thanh toán** là `paymentStatus='paid'`, không phải giá trị mới của `invoices.status`.
9. Trang khách kiểm tra server mỗi 5 giây khi tab đang hiển thị và hóa đơn còn nợ; tự chuyển sang **Đã thanh toán** khi số dư bằng 0. Poll dừng khi rời trang, ẩn tab hoặc đã thanh toán.

Không dùng `redirectUrl`; không có redirect secret cần lưu. Nút mở ApiPay dùng tab mới, trang hóa đơn vẫn chờ xác nhận SQL. Mọi query `status=success`, `data`, `signature` trên trình duyệt không có quyền xác nhận thanh toán. Nếu bổ sung redirect trong tương lai phải triển khai lưu secret riêng cho từng request và xác minh chữ ký theo tài liệu ApiPay trước khi hiển thị kết quả redirect.

## 2. Database

13 bảng nghiệp vụ giữ nguyên, thêm **2 bảng kỹ thuật**; tổng 15 bảng khi đã áp dụng `database/14_apipay.sql`:

| Bảng | Chức năng và dữ liệu chính |
|---|---|
| `apipay_requests` | Hóa đơn, khách, bank ID, số tiền, mã nội dung duy nhất, provider ID, URL QR/thanh toán, thông tin tài khoản nhận, hạn QR, trạng thái tạo yêu cầu. Không chứa khóa API hay webhook secret. |
| `apipay_events` | Transaction ID duy nhất, bank ID, số tiền, nội dung, mã ngân hàng, thời điểm, hash body, request/payment được đối soát, trạng thái và lý do. Không lưu raw webhook hoặc chữ ký. |

Database Docker mới được init tự động qua `database/docker/init.sql`. Database đang có dữ liệu cần migration, **không xóa volume hoặc chạy lại `01_schema.sql`**:

```powershell
docker compose up -d db
docker compose exec -T db psql -U postgres -d smartrent -v ON_ERROR_STOP=1 -f /smartrent-database/14_apipay.sql
```

Sao lưu trước khi chạy trên môi trường khác. Máy local hiện tại đã được sao lưu vào thư mục `backend/src/SmartRent.Api/App_Data/maintenance/` và áp dụng migration. Thư mục này bị Git bỏ qua. Migration chỉ tạo bảng/index/grant mới, không xóa hoặc nạp lại dữ liệu nghiệp vụ. Role `smartrent_app` có quyền đọc/ghi 2 bảng; tài khoản SQL tùy chỉnh cần cấp quyền tương đương.

## 3. Biến môi trường của server

| Biến | Ý nghĩa |
|---|---|
| `APIPAY_ENABLED` | `true` để bật; mặc định tắt. |
| `APIPAY_ACCESS_KEY` | Access key lấy trong tài khoản ApiPay. Chỉ đặt vào môi trường backend. |
| `APIPAY_SECRET_KEY` | Secret key đi kèm access key. |
| `APIPAY_WEBHOOK_SECRET` | Secret riêng do ApiPay tạo khi đăng ký webhook; không dùng secret key API thay thế. |
| `APIPAY_WEBHOOK_URL` | URL HTTPS công khai, đường dẫn `/api/v1/apipay/webhook`. Đây là cấu hình để đối chiếu và đăng ký dashboard, code không tự tạo webhook. |
| `APIPAY_TRUSTED_PROXIES` | IP proxy trực tiếp, phân cách bằng dấu phẩy. Bỏ trống nếu Kestrel tự phục vụ HTTPS. Chỉ proxy trong danh sách mới được đặt `X-Forwarded-Proto`. |

Bank ID cố định theo yêu cầu: **`cmwf0n7b20xp301tjzi8z6dpc`**, khai báo trong `ApiPayOptions`. Kiểm tra tài khoản đó đúng ngân hàng nhận tiền của anh trên dashboard ApiPay trước khi bật.

Mẫu tên biến: [`backend/apipay.env.example`](../backend/apipay.env.example). .NET không tự đọc file mẫu này. Không đặt khóa vào `VITE_*`, frontend, `appsettings` được commit, hoặc `.env` gốc (file `.env` của dự án hiện đang được Git theo dõi). Không gửi khóa vào chat. Production dùng env/secret manager của host, không bật HTTP body/header logging cho ApiPay.

## 4. Bật trên máy local để phát triển

1. Bật Docker Desktop; ở thư mục gốc chạy `docker compose up -d db`. Áp dụng migration ở mục 2 nếu chưa có.
2. Cần URL HTTPS có thể truy cập từ Internet cho **backend cổng 5080**. Localhost 5174 là frontend, ApiPay không thể gọi localhost của máy anh. Dùng reverse proxy/tunnel HTTPS mà anh quản lý; proxy chuyển nguyên body và header `ApiPay-Signature` tới backend. Không công khai PostgreSQL/cổng 5433.
3. Trên dashboard ApiPay, vào phần webhook, tạo webhook với URL đầy đủ ở `APIPAY_WEBHOOK_URL`, chọn tài khoản ngân hàng ID `cmwf0n7b20xp301tjzi8z6dpc`, bật hoạt động và timeout 10 giây nếu giao diện có trường này.
4. Sao chép secret webhook được tạo và lấy access/secret key API. Giữ riêng trên máy, không đưa vào source.
5. Dừng tiến trình backend cũ đang chiếm cổng 5080. Chạy launcher bên dưới trong PowerShell ở thư mục gốc. Thay `api-domain-cua-anh` bằng tên miền HTTPS/tunnel thực tế. Nếu proxy/tunnel chạy trực tiếp trên máy anh và nối Kestrel qua loopback, dùng IP như ví dụ; nếu proxy ở host khác, nhập đúng IP của proxy đó.

```powershell
.\backend\start-apipay.ps1 `
  -WebhookUrl "https://api-domain-cua-anh/api/v1/apipay/webhook" `
  -TrustedProxies "127.0.0.1,::1"
```

Launcher hỏi 3 secret kín bằng SecureString, truyền qua env cho backend, không ghi file và không in giá trị. Dùng chuỗi kết nối SQL hiện có trong .NET User Secrets. Khi dừng, launcher khôi phục env của PowerShell. Lần sau nhập lại hoặc cấu hình env bằng secret manager. Nếu dùng HTTPS trực tiếp trên Kestrel có thể bỏ `-TrustedProxies` và chỉ định `-Urls` phù hợp với chứng chỉ đã cài.

6. Mở terminal khác cho frontend:

```powershell
cd frontend
npm run dev -- --port 5174
```

Frontend dùng `VITE_DATA_SOURCE=api` và proxy hiện có tới `http://127.0.0.1:5080`. Không thêm secret ApiPay vào môi trường frontend.
7. Dùng tài khoản khách sở hữu hóa đơn, mở `/invoices/:id`, tạo QR. Kiểm tra ngân hàng, chủ tài khoản, số tiền và nội dung trước khi chuyển.
8. Theo dõi delivery trên ApiPay dashboard. Khi nhận webhook tiền thật hợp lệ, hóa đơn tự cập nhật. Chỉ thử chuyển tiền thực khi anh chủ động thực hiện; code/test trong repo không tự chuyển tiền.

## 5. Ngoại lệ và đối soát

- Chữ ký thiếu/sai: 401; event chưa được lưu hoặc xử lý. HTTP không có TLS/proxy hợp lệ: 400. Body lớn hơn 64 KiB: 413.
- `sandbox:true` hoặc `liveTest:true`: sau xác minh chữ ký trả 200 ignored, **không thu vào hóa đơn thật**. Vì vậy nút test trên dashboard không làm hóa đơn thật thành paid.
- Transaction ID gửi lặp, cùng dữ liệu: 200, một inbox row, tối đa một lần ghi thu. Cùng ID nhưng dữ liệu khác: 409.
- Ngân hàng khác ID được chọn: lưu event ignored, không thu.
- Thiếu/thừa tiền, mã không khớp/nhiều mã, hóa đơn đã hủy hoặc số dư thay đổi: review, chưa ghi nhận tự động. Admin nhận thông báo và thấy mục Đối soát ApiPay ở trang Hóa đơn.
- Mã chuyển đúng nhưng QR đã hết hạn: worker vẫn đối chiếu tiền thật với mã đã lưu và số dư hiện tại. Không bỏ mất tiền chỉ vì webhook đến muộn.
- Phiếu thu ngân hàng trùng `referenceCode`: nếu đã xác nhận đúng khách/hóa đơn/số tiền, liên kết phiếu cũ; trường hợp khác đưa về review. Tiền hoàn/đảo vẫn dùng chức năng sổ thu hiện có.
- Admin đối chiếu sao kê, thu thủ công bằng mã giao dịch ngân hàng thật, rồi chọn **Kiểm tra lại**. Nếu mã nội dung không khớp, nhập UUID của phiếu thu đã xác nhận vào **Liên kết**. Backend kiểm tra số tiền và mã ngân hàng; thao tác liên kết không tạo phiếu thu mới hoặc ép số dư về 0. Không tạo khoản thu thứ hai cho một giao dịch đã có trong sổ.
- Mỗi phiếu thu chỉ liên kết một event. Nếu khoản chuyển không thuộc hóa đơn website, admin mở **Khoản không thuộc hóa đơn**, nhập lý do rồi bỏ qua sau đối chiếu; hệ thống lưu người xử lý và lý do, không ghi thêm khoản thu.
- Timeout khi tạo QR có thể xảy ra sau khi ApiPay đã tạo link. Không retry POST ngầm. Mã đã được lưu trước HTTP, webhook đến vẫn có thể đối soát; khách đợi ít nhất một phút trước khi yêu cầu mới. Nếu đã chuyển tiền, không chuyển lại.
- DB/job lỗi tạm thời: event còn pending; worker backoff 5–300 giây và thử lại khi API hoạt động. Trang admin hiển thị số lần thử. Cần giám sát pending lâu, review và log cố định `ApiPay inbox processing deferred`; không bật log request thô để chẩn đoán.

## 6. Các file chính

| File | Trách nhiệm |
|---|---|
| `Features/ApiPay/ApiPayOptions.cs` | Đọc env server, kiểm tra cấu hình và bank ID. |
| `ApiPayClient.cs` | HTTP tạo QR, header xác thực, kiểm tra response và lỗi an toàn; không retry POST tự động. |
| `ApiPayWebhook.cs` | HMAC raw body, lọc test/event, endpoint HTTPS và ACK sau lưu SQL. |
| `ApiPayStore.cs` | Quyền sở hữu, khóa chống tạo trùng, inbox, đối chiếu và ghi `PaymentLedger` cùng transaction. |
| `ApiPaySetup.cs` | Đăng ký HttpClient không log, proxy tin cậy và background worker. |
| `PortalApiPayController.cs` | GET/POST yêu cầu thanh toán cho khách sở hữu hóa đơn. |
| `AdminApiPayController.cs` | Danh sách ngoại lệ, thử đối soát lại, liên kết phiếu thu đúng giao dịch. |
| `frontend/src/pages/customer/invoices/detail.js` | Biên lai, QR, copy thông tin, mở ApiPay và polling số dư. |
| `frontend/src/pages/admin/apipay-review.js` | Khối đối soát trong trang hóa đơn admin. |
| `frontend/src/styles/_payments.scss` | Bố cục desktop/mobile, màu và trạng thái thanh toán. |
| `database/14_apipay.sql` | Hai bảng kỹ thuật và quyền SQL. |

Các API, DTO và mã lỗi nằm trong [`api/openapi.yaml`](api/openapi.yaml). Các handler mock tương ứng chỉ báo không sẵn sàng, không mô phỏng thu tiền thành công.

## 7. Kiểm tra

```powershell
# API thường phải dừng trước build trên Windows vì DLL đang chạy bị khóa.
python backend/tests/run_apipay.py
dotnet test backend/tests/SmartRent.Api.Tests --no-build
cd frontend
npm run build
npm run check:contract
npm run test:access
```

`run_apipay.py` dùng đúng source hiện tại, bản sao schema trong DB tạm `smartrent_audit_*`, dữ liệu thử và HTTP client giả trong test; không gọi ngân hàng thật, không sửa số dư database local. Bộ kiểm tra tập trung gồm tạo request/header, lỗi HTTP/JSON/timeout, số tiền sai, chữ ký raw body sai, sandbox/liveTest, quyền sở hữu, QR trùng, transaction trùng, hai worker đồng thời, restart sau ACK, cập nhật paid thành công và không thu vượt khi số dư thay đổi.

Kết quả kiểm tra lần hoàn thiện này:

- 21 test ApiPay đạt, gồm xử lý timeout và đối soát admin; 16 kiểm tra HTTP thực tế đạt trong `backend/tests/apipay_http.py`, gồm Bearer/role, HTTPS qua proxy được tin cậy, raw HMAC, ACK bền vững, replay và hosted worker.
- Bộ xUnit chung: 163 đạt; 17 test cần DB cấu hình riêng được bỏ qua ở lệnh chung. Năm test DB ApiPay trong số đó đã chạy riêng và đạt bằng runner trên.
- Bộ hồi quy `run_full_backend.py` đạt cho luồng phòng, hợp đồng, tính tiền, thanh toán cũ, Ticket và phân quyền.
- Frontend build, `check:contract` (237 thao tác) và `test:access` đạt. Giao diện được kiểm tra ở desktop 1440px, mobile 390px/320px; 12 kiểm tra gồm tạo QR, poll tự chuyển sang paid, chặn trả thêm khi review, thiếu cấu hình và mất mạng đều đạt. Phần kiểm tra giao diện dùng response thử trong trình duyệt; dữ liệu hoạt động của website vẫn gọi backend/PostgreSQL thật.
- Script khởi động đã kiểm tra cú pháp với Windows PowerShell. Database local đã có 15 bảng; chưa đặt khóa ApiPay hoặc đăng ký webhook trên tài khoản của anh, chưa thực hiện chuyển tiền ngân hàng thật.

Tài liệu đối chiếu: [Payment Requests API](https://docs.apipay.vn/vi/api/payment-requests), [Webhooks](https://docs.apipay.vn/vi/api/webhooks), [ASP.NET Core proxy](https://learn.microsoft.com/aspnet/core/host-and-deploy/proxy-load-balancer). Không dùng API của dịch vụ ApiPay khác quốc gia.
