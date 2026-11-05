# SmartRent – Frontend

Giao diện web cho SmartRent: khu khách hàng (thuê phòng, hóa đơn, hỗ trợ, hợp đồng, liên hệ), khu admin dành riêng cho một tài khoản chủ trọ. Chỉ có hai loại tài khoản: `admin` và `user`. Viết bằng HTML/SCSS/JavaScript (ES modules) với Vite và Bootstrap 5, **không** dùng React/Vue/Angular/Tailwind.

Mặc định frontend chạy hoàn toàn bằng **dữ liệu mô phỏng (mock) trong trình duyệt**, không cần backend hay database. Khi backend ASP.NET Core triển khai đúng hợp đồng `../docs/api/openapi.yaml`, đổi một biến môi trường để gọi API thật.

> Đăng nhập và phân quyền trong chế độ mock chỉ để xem trước giao diện. Đây **không** phải cơ chế bảo mật: quyền thật do backend kiểm tra ở mọi API.

## Yêu cầu

- Node.js **22.12 trở lên** (đã kiểm tra với Node 24.19, npm 11.17).
- Package manager: **npm** (lockfile `package-lock.json`). Không trộn yarn/pnpm.

## Cài đặt và chạy

```bash
cd frontend
npm ci              # cài đúng phiên bản trong package-lock.json
npm run dev         # máy chủ phát triển: http://localhost:5174
npm run build       # bản build vào dist/
npm run preview     # chạy thử bản build: http://localhost:4173
```

Kiểm tra không cần trình duyệt:

```bash
npm run test:mock       # chạy kịch bản nghiệp vụ trên mock API (152 kiểm tra) và bảo đảm đủ 216 route mock đều chạy thành công; đồng hồ được dời về ngày tham chiếu của seed nên kết quả không đổi theo ngày chạy
npm run test:access     # kiểm tra đăng nhập riêng, chặn khách truy cập admin và chuyển dữ liệu cũ
npm run check:contract  # đối chiếu route mock ⇄ docs/api/openapi.yaml ⇄ lời gọi trong src/
```

## Cấu hình môi trường

Sao chép `.env.example` thành `.env.local` rồi sửa. Mọi biến `VITE_*` nằm trong bundle trình duyệt, **không** đặt mật khẩu, connection string hay khóa bí mật ở đây.

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `VITE_DATA_SOURCE` | `mock` | `mock`: dữ liệu mô phỏng trong trình duyệt. `api`: gọi backend thật. Ở chế độ `api`, lỗi API được hiển thị, **không** tự chuyển về mock. |
| `VITE_API_BASE_URL` | (trống) | Gốc API, không có `/` ở cuối, ví dụ `https://api.smartrent.example`. Để trống khi frontend và API cùng origin (reverse proxy `/api`). |
| `VITE_API_TIMEOUT_MS` | `15000` | Thời gian chờ mỗi request. |
| `VITE_MOCK_LATENCY` | `150,450` | Độ trễ mô phỏng (ms) để thấy trạng thái đang tải. |
| `VITE_BASE_PATH` | `/` | Khi deploy dưới thư mục con, ví dụ `/smartrent/`. |
| `VITE_DEV_API_PROXY` | (trống) | Chỉ cho `npm run dev`: proxy `/api` tới backend local (ví dụ `http://localhost:5080`) để tránh CORS khi phát triển. |

Chuyển sang API thật: đặt `VITE_DATA_SOURCE=api` và `VITE_API_BASE_URL` (hoặc `VITE_DEV_API_PROXY` khi dev), rồi build lại. Yêu cầu backend đã triển khai; xem `../docs/BACKEND_HANDOFF.md`.

## Tài khoản demo (mock)

Mật khẩu chung: **`demo1234`**.

| Tài khoản | Loại | Đăng nhập |
|---|---|---|
| `ha.chutro@example.com` | Admin / chủ trọ duy nhất, toàn quyền | `/admin` → `/admin/login` |
| `an.khachthue@example.com` | Khách hàng | `/login` |
| `bich.oghep@example.com` | Khách hàng | `/login` |

Khách tự đăng ký ở `/register`; không có đăng ký admin. Xem [mô hình tài khoản](../docs/ACCOUNT_MODEL.md).
Đăng nhập sai khu bị từ chối. Các tài khoản quản lý, nhân viên, kỹ thuật và quản trị hệ thống đã bỏ.

## Dữ liệu mô phỏng

- Dữ liệu mẫu cố định quanh ngày tham chiếu **21/10/2026** (một hệ thống chung: 4 cơ sở, 34 phòng), không dùng thông tin cá nhân hay giấy tờ thật. Mock dùng đồng hồ thật nên số ngày quá hạn tăng theo thời gian. Seed v7/v8 được chuyển sang v9, gộp cơ sở/danh mục và đổi role khách thành user; phiên cũ bị thu hồi.
- Mọi thao tác ghi được lưu ở `localStorage` (khóa `smartrent.mock.db`) và cập nhật các màn hình liên quan.
- **Đặt lại dữ liệu**: chạy `localStorage.removeItem('smartrent.mock.db')` trong Console của trình duyệt rồi tải lại trang.
- Tệp tải lên (FilePond) được “quét an toàn” giả lập và lưu tạm trong trình duyệt. Ảnh được thu nhỏ trước khi lưu để còn sau khi tải lại trang; tệp khác lớn hơn 180 KB chỉ giữ trong phiên. Ảnh giấy tờ/hợp đồng mẫu là ảnh minh họa có ghi “không phải giấy tờ thật”.
- Email lời mời/reset và báo chuyển khoản là **mô phỏng**; chưa kết nối gửi mail hoặc đối soát ngân hàng thật. Một số handler cũ còn trong mock không có trang sử dụng.

Database hiện hành: [13 bảng thu gọn theo các trang đang có](../database/README.md), [đối chiếu từng trang](../database/DOI_CHIEU_TUNG_TRANG.md). Database và mock/localStorage là hai nguồn độc lập; cần triển khai backend trước khi nối chúng. Hồ sơ khách nằm trong users; lịch xem/đề nghị trong bookings; hợp đồng trong contracts; điện nước/dòng tiền trong invoices; cọc/phân bổ trong payments; hội thoại trong tickets. Xem [adapter DTO](../docs/BACKEND_HANDOFF.md) và [JSONB](../database/JSON_DATA.md).

## Luồng làm việc của chủ trọ

1. **Cơ sở**: thêm tên, địa chỉ, giá điện, nước, phí rác, phí dịch vụ.
2. **Phòng**: chọn cơ sở, nhập thông tin và giá, bấm "Kế thừa giá từ cơ sở" rồi sửa nếu phòng có giá riêng, chọn tiện ích, thêm ảnh, đăng tin từ trang chi tiết phòng.
3. **Lịch xem phòng**: yêu cầu khách gửi từ trang tìm phòng hiện ở đây. Xếp lịch, ghi kết quả, bấm "Tạo hợp đồng".
4. **Hợp đồng**: gắn khách với phòng trống, chốt giá, ghi cọc đã thu và số điện nước đầu kỳ, tải bản đã ký. Phòng chuyển sang đã thuê.
5. **Tính tiền phòng**: chọn cơ sở và tháng, xem số tháng trước, nhập số tháng này, bấm tạo hóa đơn. Hóa đơn được phát hành ngay nên có ở trang Hóa đơn và trong tài khoản khách.
6. **Hóa đơn**: ghi nhận thanh toán thủ công hoặc xác nhận khoản khách báo chuyển khoản. Hiện chưa tích hợp đối soát ngân hàng.

Trả phòng và gia hạn nằm ở trang chi tiết hợp đồng. Lịch nhắc ngày nhập số và ngày tạo hóa đơn nằm ở Cài đặt.

## Đường dẫn

Router dùng History API. Máy chủ tĩnh phải trả `index.html` cho mọi đường dẫn không phải tệp (SPA fallback).

| Khu | Đường dẫn chính |
|---|---|
| Khách, ai cũng xem được | `/` (trang ngoài có nền 3D), `/rooms`, `/rooms/:slug`, `/contact` |
| Xác thực | `/login`, `/register`, `/forgot-password`, `/reset-password?token=` |
| Quản trị (`/admin`) | tổng quan; `properties` (thêm, chi tiết, sửa); `rooms` (thêm, chi tiết, sửa); `viewings`; `billing`; `tenants` (chi tiết); `contracts` (tạo, chi tiết); `invoices` (chi tiết); `tickets` (hộp thư hai cột); `settings` |
| Khách, cần đăng nhập | `/invoices`, `/invoices/:id`, `/tickets`, `/tickets/new`, `/tickets/:id`, `/contract`, `/account`, `/notifications`. Chưa có phòng thì các trang này báo cần thuê phòng |

Danh sách đầy đủ ở `src/router/routes.js`; đối chiếu với đặc tả ở `../docs/FRONTEND_COVERAGE.md`.

### Cấu hình máy chủ tĩnh

- `npm run preview` (Vite) đã tự xử lý fallback.
- Nginx: `location / { try_files $uri $uri/ /index.html; }` (đặt `VITE_BASE_PATH` và `location` tương ứng nếu chạy dưới thư mục con).
- IIS: quy tắc URL Rewrite chuyển mọi request không phải tệp/thư mục về `/index.html`.
- Trang khách và admin là **một ứng dụng**, dùng chung router, phiên đăng nhập và dữ liệu mock.
- Luồng khách: tự tạo tài khoản (hồ sơ hiện ở mục Khách thuê của admin), đăng nhập rồi mới đặt được lịch xem phòng. Admin thêm phòng và hợp đồng cho khách, khi đó Hóa đơn, Hỗ trợ, Hợp đồng mới có nội dung.
- Khu khách và trang đăng nhập luôn nền sáng; khu quản trị giữ lựa chọn sáng/tối của người dùng.
- Không đặt giấy tờ, hợp đồng hay chứng từ riêng tư trong `public/`: tệp riêng tư do backend cấp đường dẫn tải có thời hạn sau khi kiểm tra quyền.

## Cấu trúc mã

```text
src/
├── main.js, app.js        # khởi động, chọn khung giao diện theo vai trò, bảo vệ route
├── config.js              # đọc biến VITE_*
├── router/                # router History API + bảng route (tải trang theo nhu cầu)
├── services/              # lớp HTTP tập trung (client.js), api.js theo nghiệp vụ, phiên đăng nhập
├── mocks/                 # "máy chủ" mock: seed, engine nghiệp vụ, handler theo route của openapi.yaml
├── components/            # khung giao diện, form, bảng (DataTables), modal, upload, biểu đồ, hộp thoại; admin-kit.js là mảnh riêng của khu quản trị
├── pages/
│   ├── admin/             # khu quản trị
│   ├── auth/              # đăng nhập, quên và đặt lại mật khẩu
│   ├── customer/          # khu khách hàng, dùng chung dữ liệu với admin
│   │   ├── home/          # trang ngoài: index.js, home.html, home.scss, tour/ (nền 3D tham quan công trình)
│   │   ├── rooms/         # list.js (phòng trống), detail.js (đặt lịch xem)
│   │   ├── invoices/      # list.js, detail.js (biên lai, báo chuyển khoản)
│   │   ├── tickets/       # list.js, new.js, detail.js (trao đổi với quản lý)
│   │   ├── contract.js, contact.js, account.js, not-found.js
│   │   └── common.js      # chặn khi chưa có phòng, thẻ phòng, định dạng giá
│   └── shared/            # thông báo và hội thoại ticket
├── styles/                # SCSS: token màu (CSS variables, sáng/tối), layout, component, vendor, in ấn; _admin.scss chỉ áp dụng trong .sr-admin, _customer.scss cho khu khách (.sr-site, .cu-*). SCSS trang ngoài nằm cạnh trang, bọc dưới body.sr-page-home
└── utils/                 # ngày (Asia/Ho_Chi_Minh), tiền VND, HTML an toàn, CSV
scripts/
├── smoke-mock-api.mjs     # kiểm thử mock API bằng Node
└── check-contract.mjs     # kiểm tra khớp hợp đồng API
public/
├── images/rooms/          # ảnh phòng của dữ liệu mẫu
└── videos/room-tour.mp4   # video tham quan của dữ liệu mẫu
```

Nguyên tắc chính:

- Trang và component chỉ gọi `src/services/api.js`; không hardcode endpoint hay dữ liệu mẫu trong trang. `client.js` gắn `Authorization`, `X-Organization-Id`, `Idempotency-Key`, xử lý timeout/hủy, 401 (làm mới token một lần), 403 và lỗi Problem Details.
- Danh sách lọc/tìm/sắp xếp/phân trang ở máy chủ (mock xử lý trên toàn bộ tập). Bảng DataTables chuyển `start/length/order/search` thành `page/pageSize/sort/q`.
- Ngày nghiệp vụ gửi dạng `YYYY-MM-DD`, thời điểm là ISO 8601 UTC; hiển thị theo `Asia/Ho_Chi_Minh`, tiền VND làm tròn đồng.
- Thao tác tiền/chứng từ dùng khóa chống lặp ổn định khi thử lại; form chặn gửi trùng và cảnh báo dữ liệu chưa lưu.
- Số liệu tính ở trình duyệt (xem trước tiền, quyết toán) chỉ để xem trước; số xác nhận do máy chủ trả về.

## Thư viện

Bootstrap 5.3 + Bootstrap Icons, SweetAlert2, DataTables 3 (không jQuery), Chart.js, Flatpickr (tiếng Việt, dd/mm/yyyy), Tom Select, FilePond, Animate.css, Three.js + postprocessing + n8ao + Lenis (nền 3D và cuộn mượt ở trang chủ, nạp riêng, không có camera bay khi `prefers-reduced-motion`). `drei` chỉ dùng được với React nên không dùng. GSAP vẫn có trong `package.json` theo bộ công nghệ đã chọn nhưng nền 3D mới không cần tới. Alpine.js vẫn có trong `package.json` theo bộ công nghệ đã chọn nhưng hiện không trang nào dùng nên không nạp vào bản build. Phông Be Vietnam Pro và Bricolage Grotesque cài qua `@fontsource`, đóng gói cục bộ: chạy demo không cần CDN. Font Awesome được phép dùng khi Bootstrap Icons thiếu biểu tượng; hiện chưa cần nên không cài. Thư viện được tải theo trang (dynamic import), tôn trọng `prefers-reduced-motion`.

## Nền 3D trang chủ

Mã ở `src/pages/customer/home/tour/`, chỉ trang chủ tải (gói riêng `tour-*.js`). Công trình dựng hoàn toàn bằng code, không tải mô hình hay ảnh ngoài. Chuyến tham quan là công trình minh họa, không phải nhà thật.

| Tệp | Vai trò |
|---|---|
| `plan.js` | Kích thước công trình, hướng nắng, bảng màu |
| `path.js` | Đường camera: danh sách `SHOTS` gắn với 5 section của trang |
| `quality.js` | Chọn mức chất lượng theo thiết bị, tự hạ khi máy không theo kịp |
| `facade.js`, `site.js`, `interior.js`, `roof.js`, `foliage.js` | Mặt tiền, khu đất, nội thất, sân thượng, cây xanh |
| `sky.js`, `materials.js`, `textures.js`, `post.js` | Bầu trời, chất liệu, vân bề mặt vẽ bằng code, hậu kỳ |

Muốn chỉnh một cảnh quay, sửa dòng tương ứng trong `SHOTS`: `section` và `at` là vị trí trên trang, `pos` và `look` là vị trí camera và điểm nhìn, giá trị bỏ trống giữ nguyên như cảnh trước. Vị trí được tính từ bố cục thật nên đổi nội dung trang camera vẫn đúng nhịp.
