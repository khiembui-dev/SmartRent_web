# Thanh toán hóa đơn tự động qua ApiPay

Tích hợp cho SmartRent: ASP.NET Core 10 + Npgsql/PostgreSQL + frontend Vite. Cập nhật 14/11/2026: `/invoices/:id` hiển thị chi tiết hóa đơn, lịch sử và nút **Thanh toán**; nút mở trang riêng `/invoices/:id/pay` chứa QR và toàn bộ thông tin chuyển khoản. Quản trị `/admin/invoices` có phần **Đối soát ApiPay** khi phát sinh ngoại lệ.

Máy local đã được bật ApiPay ngày 14/11/2026: khóa xác thực được, ngân hàng MB đang ACTIVE, webhook HTTPS đã đăng ký, QR thật đã tạo cho hóa đơn và ảnh QR tải trực tiếp từ ApiPay. Hóa đơn vẫn chưa thanh toán cho đến khi có tiền thật và webhook hợp lệ. Các máy khác cần cấu hình riêng theo hướng dẫn dưới đây.

## Chạy lại trên máy anh

Khóa API và webhook secret đã lưu bằng **DPAPI của Windows** ngoài repository, tại `%LOCALAPPDATA%\SmartRent\payments\apipay.credentials.clixml`. Chỉ tài khoản Windows đã lưu mới giải mã được. Không chép khóa vào `.env`, frontend hay GitHub.

Từ thư mục gốc dự án:

```powershell
# Bật Docker Desktop trước.
docker compose up -d db
.\backend\start-apipay-local.ps1
```

Script tự kiểm tra ngân hàng, build/chạy backend, mở tunnel HTTPS và đăng ký hoặc cập nhật đúng webhook đã tạo cho bản local. Secret chỉ được giải mã vào môi trường tiến trình backend. Frontend hiện có ở `http://localhost:5174`; nếu chưa chạy, dùng terminal khác `cd frontend` rồi `npm run dev -- --port 5174`.

Tunnel trỏ vào cổng riêng **5081**, chỉ nhận `POST /api/v1/apipay/webhook`. Các trang admin, API hóa đơn, health/dev và mọi route khác qua tunnel trả 404. API frontend vẫn dùng cổng **5080** như trước. Không mở cổng PostgreSQL ra Internet.

Cloudflared được tải từ release chính thức `2026.11.0`, kiểm tra SHA-256 trước khi chạy và đặt ngoài repo. Tunnel phát triển có URL `trycloudflare.com`; khi khởi động lại máy URL có thể đổi, script cập nhật webhook bằng API. Giữ **backend, Docker và tunnel đang chạy** khi nhận tiền. Production cần server/HTTPS cố định hoạt động liên tục; Quick Tunnel không bảo đảm uptime. Nếu webhook thất bại khi máy tắt lâu, xem lịch sử gửi ApiPay và gửi lại delivery sau khi bật server.

Trên máy khác hoặc khi đổi khóa, nhập kín trong terminal (không gửi vào chat, không đặt khóa trong command history):

```powershell
.\backend\configure-apipay-local.ps1 -BankPublicId "public-id-ngan-hang-cua-ban"
.\backend\start-apipay-local.ps1
```

`start-apipay.ps1` trước đây vẫn dùng được với HTTPS/proxy do anh tự quản lý; launcher mới bổ sung cấu hình mã hóa và tunnel tự động cho phát triển local.

## 1. Luồng hoạt động

1. Khách đăng nhập, mở hóa đơn của mình, bấm **Thanh toán** để đến `/invoices/:id/pay`. Trang chi tiết không tạo QR hoặc ghi nhận đã trả tiền. Trang thanh toán tự lấy QR còn hiệu lực, hoặc tạo yêu cầu một lần nếu chưa có.
2. Server kiểm tra quyền sở hữu, trạng thái hóa đơn, số dư còn phải thu và các khoản đang chờ xác minh. Số tiền và bank ID được lấy ở server, không nhận từ form khách.
3. Server lấy **mã hóa đơn, bỏ dấu gạch và viết hoa** làm nội dung chuyển khoản: `HD-00000093` → `HD00000093`, sau đó gọi `POST https://app.apipay.vn/v1/client/payment-requests`. Gửi `bankPublicId`, `amount` dạng chuỗi, `content`, `title`, `expiresAt` 30 phút; Authorization là `Bearer Base64(accessKey:secretKey)`. Nội dung cố định theo hóa đơn, kể cả khi tạo lại QR; provider ID vẫn riêng cho từng lần tạo. Chỉ tái sử dụng QR có nội dung đúng định dạng mới.
4. Trang thanh toán hiện `qrUrl`, ngân hàng, chủ tài khoản, số tài khoản, số tiền, nội dung, hạn QR và tóm tắt hóa đơn. Có nút sao chép và link `payUrl` trong tab mới. QR hợp lệ của cùng hóa đơn/số dư được tái sử dụng; tải lại trang không tạo QR lần nữa.
5. ApiPay gửi `transaction.in` tới `POST /api/v1/apipay/webhook`. Server xác minh `ApiPay-Signature` trên đúng byte raw body bằng HMAC-SHA256 và so sánh fixed-time trước khi parse JSON.
6. Server COMMIT giao dịch vào `apipay_events`, khóa duy nhất `transaction_id`, rồi trả 200. Deadline tiếp nhận 7 giây; DB tạm lỗi trả 503 cho ApiPay retry. Không gọi API ngoài trong webhook.
7. `ApiPayWorker` đọc inbox SQL khoảng mỗi 3 giây. Phải khớp bank ID, một hóa đơn, số tiền yêu cầu và số dư hiện tại. Nhiều lượt tạo QR của cùng hóa đơn không bị coi là mơ hồ; worker chọn yêu cầu khớp số tiền và đã được tạo trước thời điểm giao dịch (cho phép lệch giờ 5 phút). Mã `HD000000930` không khớp `HD00000093`; ngân hàng có thể thêm chữ trước/sau mã và đổi hoa/thường. Các mã `SR...` cũ vẫn đối soát được để không bỏ sót chuyển khoản đã thực hiện. Worker ghi phiếu thu confirmed vào bảng `payments`, ghi thông báo và đánh dấu event processed trong **cùng transaction**. Nếu crash/rollback thì worker thử lại. Lỗi từng event có backoff, không chặn các event khác.
8. `v_invoice_balances` tự tính `paid_amount`, `outstanding_amount`, `payment_status`. Hóa đơn vẫn có `status='issued'`; **đã thanh toán** là `paymentStatus='paid'`, không phải giá trị mới của `invoices.status`.
9. Trang thanh toán kiểm tra server mỗi 5 giây khi tab đang hiển thị và hóa đơn còn nợ; tự hiện **Thanh toán thành công**, gỡ QR và có nút **Xem hóa đơn** khi số dư bằng 0. Chi tiết hóa đơn cập nhật **Đã thanh toán đủ**. Poll dừng khi rời trang, ẩn tab hoặc đã thanh toán. Sau lỗi tạo QR không tự gửi lại POST trong các lần poll; chỉ thử lại khi khách chủ động bấm nút.

Không dùng `redirectUrl`; không có redirect secret cần lưu. Nút mở ApiPay dùng tab mới, trang hóa đơn vẫn chờ xác nhận SQL. Mọi query `status=success`, `data`, `signature` trên trình duyệt không có quyền xác nhận thanh toán. Nếu bổ sung redirect trong tương lai phải triển khai lưu secret riêng cho từng request và xác minh chữ ký theo tài liệu ApiPay trước khi hiển thị kết quả redirect.

## 2. Database

13 bảng nghiệp vụ giữ nguyên, thêm **2 bảng kỹ thuật**; tổng 15 bảng khi đã áp dụng `database/14_apipay.sql`:

| Bảng | Chức năng và dữ liệu chính |
|---|---|
| `apipay_requests` | Hóa đơn, khách, bank ID, số tiền, nội dung theo mã hóa đơn (lặp giữa các lượt QR cùng hóa đơn), provider ID duy nhất, URL QR/thanh toán, thông tin tài khoản nhận, hạn QR, trạng thái tạo yêu cầu. Không chứa khóa API hay webhook secret. |
| `apipay_events` | Transaction ID duy nhất, bank ID, số tiền, nội dung, mã ngân hàng, thời điểm, hash body, request/payment được đối soát, trạng thái và lý do. Không lưu raw webhook hoặc chữ ký. |

Database Docker mới được init tự động qua `database/docker/init.sql`. Database đang có dữ liệu cần migration, **không xóa volume hoặc chạy lại `01_schema.sql`**:

```powershell
docker compose up -d db
docker compose exec -T db psql -U postgres -d smartrent -v ON_ERROR_STOP=1 -f /smartrent-database/14_apipay.sql
docker compose exec -T db psql -U postgres -d smartrent -v ON_ERROR_STOP=1 -f /smartrent-database/16_apipay_invoice_content.sql
```

Sao lưu trước khi chạy trên môi trường khác. Máy local hiện tại đã được sao lưu vào thư mục `backend/src/SmartRent.Api/App_Data/maintenance/` và áp dụng migration. Thư mục này bị Git bỏ qua. Migration 16 đổi ràng buộc nội dung và index để tạo lại QR cùng mã hóa đơn; giữ nguyên các yêu cầu `SR...` và dữ liệu thu tiền. Index mã hóa đơn sau chuẩn hóa ngăn hai hóa đơn khác nhau có cùng nội dung. Role `smartrent_app` có quyền đọc/ghi 2 bảng; tài khoản SQL tùy chỉnh cần cấp quyền tương đương.

## 3. Biến môi trường của server

| Biến | Ý nghĩa |
|---|---|
| `APIPAY_ENABLED` | `true` để bật; mặc định tắt. |
| `APIPAY_ACCESS_KEY` | Access key lấy trong tài khoản ApiPay. Chỉ đặt vào môi trường backend. |
| `APIPAY_SECRET_KEY` | Secret key đi kèm access key. |
| `APIPAY_WEBHOOK_SECRET` | Secret riêng do ApiPay tạo khi đăng ký webhook; không dùng secret key API thay thế. |
| `APIPAY_WEBHOOK_URL` | URL HTTPS công khai, đường dẫn `/api/v1/apipay/webhook`. Launcher local tự đăng ký/cập nhật URL bằng API; khi tự vận hành HTTPS có thể đăng ký qua dashboard. |
| `APIPAY_BANK_PUBLIC_ID` | Tài khoản nhận tiền; mặc định ID đã chỉ định của website. Chỉ đọc ở server. |
| `APIPAY_TRUSTED_PROXIES` | IP proxy trực tiếp, phân cách bằng dấu phẩy. Bỏ trống nếu Kestrel tự phục vụ HTTPS. Chỉ proxy trong danh sách mới được đặt `X-Forwarded-Proto`. |
| `APIPAY_WEBHOOK_LISTENER_PORT` | Cổng riêng cho tunnel, launcher local dùng `5081`; cổng này chặn tất cả route trừ POST webhook đúng đường dẫn, không có query. |

Bank ID mặc định theo yêu cầu: **`cmwf0n7b20xp301tjzi8z6dpc`**, có thể cấu hình bằng `APIPAY_BANK_PUBLIC_ID`. Launcher kiểm tra tài khoản đó phải ACTIVE trước khi khởi động.

Mẫu tên biến: [`backend/apipay.env.example`](../backend/apipay.env.example). .NET không tự đọc file mẫu này. Không đặt khóa vào `VITE_*`, frontend, `appsettings` được commit, hoặc `.env` gốc (file `.env` của dự án hiện đang được Git theo dõi). Không gửi khóa vào chat. Production dùng env/secret manager của host, không bật HTTP body/header logging cho ApiPay.

## 4. Cấu hình thủ công với HTTPS/proxy riêng (tùy chọn)

Máy anh đã cấu hình bằng `start-apipay-local.ps1` ở đầu tài liệu nên không cần làm lại mục này. Các bước dưới đây dành cho người tự quản lý domain/proxy và webhook, không dùng launcher tự động.

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
7. Dùng tài khoản khách sở hữu hóa đơn, mở `/invoices/:id`, bấm **Thanh toán**. Trang `/invoices/:id/pay` tự chuẩn bị QR. Kiểm tra ngân hàng, chủ tài khoản, số tiền và nội dung trước khi chuyển. Nếu thiếu cấu hình server, trang vẫn hiện thông tin hóa đơn và thông báo chưa sẵn sàng, không tạo QR giả.
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
| `ApiPaySetup.cs` | Đăng ký HttpClient không log, proxy tin cậy, giới hạn listener webhook và background worker. |
| `backend/tools/ApiPay.Local.psm1` | Lưu/đọc DPAPI ngoài source, gọi API đăng ký webhook và truyền env cho backend. |
| `backend/start-apipay-local.ps1` | Bật local, kiểm tra cloudflared chính thức, đăng ký/cập nhật webhook và khởi động server. |
| `backend/configure-apipay-local.ps1` | Nhập hoặc đổi khóa kín trong terminal và kiểm tra tài khoản ngân hàng. |
| `PortalApiPayController.cs` | GET/POST yêu cầu thanh toán cho khách sở hữu hóa đơn. |
| `AdminApiPayController.cs` | Danh sách ngoại lệ, thử đối soát lại, liên kết phiếu thu đúng giao dịch. |
| `frontend/src/pages/customer/invoices/detail.js` | Trang hóa đơn, lịch sử và nút Thanh toán dẫn tới trang riêng. |
| `frontend/src/pages/customer/invoices/payment.js` | Route thanh toán riêng `/invoices/:id/pay`. |
| `frontend/src/pages/customer/invoices/invoice-page.js` | Giao diện dùng chung, tạo/tái sử dụng QR, thông tin chuyển khoản, copy và polling số dư từ backend. |
| `frontend/src/pages/admin/apipay-review.js` | Khối đối soát trong trang hóa đơn admin. |
| `frontend/src/styles/_payments.scss` | Bố cục desktop/mobile, màu và trạng thái thanh toán. |
| `database/14_apipay.sql` | Hai bảng kỹ thuật và quyền SQL. |
| `database/16_apipay_invoice_content.sql` | Nội dung theo mã hóa đơn, giữ lịch sử QR và ngăn trùng mã giữa các hóa đơn. |

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

- 25 test ApiPay đạt, gồm nội dung `HD00000093`, tạo lại QR cùng nội dung, số dư thay đổi, webhook mã cũ đến muộn và không nhận nhầm mã dài hơn; 21 kiểm tra HTTP thực tế đạt trong `backend/tests/apipay_http.py`, gồm Bearer/role, HTTPS qua proxy được tin cậy, raw HMAC, ACK bền vững, replay, hosted worker và listener chỉ phục vụ webhook. Migration 16 cũng được chạy hai lần trong database tạm để kiểm tra khả năng chạy lại.
- Bộ xUnit chung ở đợt kiểm tra trước: 163 đạt; 17 test cần DB cấu hình riêng được bỏ qua ở lệnh chung. Các test DB ApiPay đã được chạy riêng và đạt bằng runner trên.
- Bộ hồi quy `run_full_backend.py` đạt cho luồng phòng, hợp đồng, tính tiền, thanh toán cũ, Ticket và phân quyền.
- Frontend build, `check:contract` (237 thao tác) và `test:access` đạt. Giao diện được kiểm tra ở desktop 1440px, mobile 390px/320px; 12 kiểm tra gồm tạo QR, poll tự chuyển sang paid, chặn trả thêm khi review, thiếu cấu hình và mất mạng đều đạt. Phần kiểm tra giao diện dùng response thử trong trình duyệt; dữ liệu hoạt động của website vẫn gọi backend/PostgreSQL thật.
- Script khởi động đã kiểm tra với Windows PowerShell. Database local có 15 bảng. Khóa và webhook đã cấu hình mã hóa, webhook đăng ký ACTIVE với đúng một ngân hàng. QR thật đã tạo thành công; thử endpoint HTTPS với chữ ký hợp lệ cho event sandbox trả 200 ignored, route nội bộ qua tunnel trả 404. Chưa thực hiện chuyển tiền ngân hàng thật hoặc tự đánh dấu hóa đơn đã thanh toán.

Luồng hai trang được kiểm tra thêm 18 tình huống trên router thật với response thử trong trình duyệt: nút Thanh toán dẫn đúng trang; chỉ trang thanh toán tạo QR; hiển thị đầy đủ thông tin; reload tái sử dụng QR; desktop/mobile 390px và 320px; query `status=success` không xác nhận hóa đơn; poll cập nhật thành công từ server; mất mạng/thiếu cấu hình/đang đối soát; POST lỗi không tự lặp và nút thử lại chủ động. Trang và nút cũng đã được kiểm tra trên hóa đơn local anh cung cấp, với QR thật lấy từ ApiPay.

Tài liệu đối chiếu: [Payment Requests API](https://docs.apipay.vn/vi/api/payment-requests), [Webhooks](https://docs.apipay.vn/vi/api/webhooks), [ASP.NET Core proxy](https://learn.microsoft.com/aspnet/core/host-and-deploy/proxy-load-balancer). Không dùng API của dịch vụ ApiPay khác quốc gia.
