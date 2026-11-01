# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Nhiệm vụ hiện tại: frontend SmartRent

Người dùng giao Claude **tự thiết kế UI/UX và code frontend**, dựa trên đặc tả đã có. Không có bố cục, bảng màu hoặc thiết kế mẫu bắt buộc; tự đưa ra quyết định thiết kế phù hợp sản phẩm. Prompt thực thi ở `PROMPT_CLAUDE_FRONTEND.md`. Hướng dẫn frontend dưới đây bổ sung cho các quy tắc database/backend bên dưới.

### Nguồn yêu cầu và cách làm

- Đọc `DAC_TA_LUONG_VA_CHUC_NANG_WEBSITE_PHONG_TRO.md` trước khi chia trang và viết luồng. Đọc `database/THIET_KE_DATABASE.md`, `database/ERD.md`; tra `database/TU_DIEN_DU_LIEU.md` khi cần tên trường/trạng thái. Database là nguồn mô hình nghiệp vụ, không phải danh sách màn hình phải dựng một bảng một trang.
- Hoàn thiện frontend cho khu công khai tìm/đặt phòng, quản trị chủ trọ/nhân viên và cổng khách thuê. Vai trò quản trị hệ thống, AI và các tích hợp tùy chọn phải được thể hiện đúng mức độ trong đặc tả, có dữ liệu mô phỏng rõ ràng nếu dựng bản xem trước.
- Tự thiết kế rồi triển khai thành code chạy được; không dừng ở lời mô tả, wireframe hoặc ảnh. Có thể triển khai theo từng phân hệ nhưng giữ danh sách tiến độ và tiếp tục hoàn thiện phạm vi được giao.
- Quyết định kỹ thuật/giao diện thông thường tự xử lý. Chính sách kinh doanh chưa chốt ở §10.3 của đặc tả phải ghi thành giả định demo/cấu hình chờ xác nhận trong tài liệu bàn giao; không coi đó là nghiệp vụ sản xuất đã được phê duyệt.
- Viết giao diện, thông báo lỗi và tài liệu bàn giao bằng tiếng Việt có dấu. Tên biến, module và API dùng tiếng Anh nhất quán.

### Ngôn ngữ và bộ công nghệ được chọn

| Thành phần | Công nghệ / cách dùng |
|---|---|
| Nền tảng frontend | HTML5, CSS3, SCSS, JavaScript ES6+ với ES modules |
| Chạy và build | Vite; `frontend/package.json` sở hữu dependency và scripts riêng |
| UI nền tảng | Bootstrap 5 |
| Icon chính | Bootstrap Icons |
| Icon thay thế | Font Awesome khi thiếu biểu tượng phù hợp; tránh trộn bộ icon tùy tiện |
| Hiệu ứng đơn giản | Animate.css |
| Chuyển động nâng cao | GSAP khi có nhu cầu; không ép animation vào mọi thao tác |
| Thông báo / xác nhận | SweetAlert2 |
| Bảng dữ liệu | DataTables |
| Biểu đồ | Chart.js |
| Chọn ngày | Flatpickr, định dạng và ngôn ngữ Việt Nam |
| Select có tìm kiếm | Tom Select |
| Upload / preview | FilePond |
| Tương tác UI nhẹ | Alpine.js |
| Theme | CSS Variables kết hợp SCSS, dùng design tokens nhất quán |

Không tự thay stack đã chọn bằng React, Vue, Angular, Tailwind, Razor hoặc Blazor. Các thư viện được dùng theo chức năng phù hợp; không phải mọi trang đều import toàn bộ. Không để Bootstrap, Alpine và thư viện khác cùng điều khiển một trạng thái gây xung đột. Tôn trọng `prefers-reduced-motion`.

Khi bắt đầu code, kiểm tra tài liệu chính thức và tương thích dependency, chốt phiên bản trong lockfile. Ưu tiên cài qua package manager và bundle cục bộ; tài nguyên chính không phụ thuộc CDN khi chạy demo. Chưa có frontend được cài ở trạng thái ban đầu, không khẳng định dependency/lệnh đã chạy trước khi thực sự chạy.

### Ranh giới thư mục và trách nhiệm

Tạo các thư mục khi triển khai frontend, theo cấu trúc định hướng sau; có thể tổ chức các module con phù hợp với cách định tuyến đã chọn:

```text
/
├── CLAUDE.md
├── PROMPT_CLAUDE_FRONTEND.md
├── DAC_TA_LUONG_VA_CHUC_NANG_WEBSITE_PHONG_TRO.md
├── database/                     # Schema và tài liệu đang có
├── frontend/
│   ├── package.json
│   ├── <lockfile>
│   ├── .env.example
│   ├── README.md
│   ├── public/
│   └── src/
│       ├── assets/
│       ├── styles/
│       ├── components/
│       ├── pages/
│       ├── services/
│       ├── mocks/
│       └── utils/
├── backend/
│   ├── SmartRent.sln
│   ├── HUONG_DAN_THEO_TRANG.md   # Mỗi trang code ở đâu, ai làm, gọi API gì
│   ├── src/SmartRent.Api/        # Common/, Data/, Features/<nhóm trang>/
│   └── tests/SmartRent.Api.Tests/
└── docs/
    ├── api/openapi.yaml          # Hợp đồng API đề xuất cho team backend
    ├── FRONTEND_COVERAGE.md       # Trang/luồng/role/trạng thái hoàn thành
    └── BACKEND_HANDOFF.md         # DTO, tích hợp, giả định và phần còn thiếu
```

- Frontend phải chạy và build độc lập bên trong `frontend/`. Dữ liệu/thư viện/tài nguyên frontend không nằm trong project ASP.NET.
- Backend dùng C#, ASP.NET Core Web API, EF Core, Npgsql và PostgreSQL. `backend/` đã có khung project chia theo trang nhưng chưa có API; không viết API hoặc kết nối database thật nếu chưa được giao.
- Không đưa C#, Razor, truy vấn SQL, connection string hoặc khóa bí mật vào frontend. Các biến có tiền tố `VITE_` là cấu hình công khai, không chứa secret.
- Không chỉnh schema/seed/tài liệu database để thuận tiện cho UI. Đề xuất thay đổi dữ liệu ghi riêng vào tài liệu bàn giao để team backend xem xét.
- Dùng component/module dùng lại cho thành phần chung, form, bảng, upload và trạng thái. Tránh nhân bản HTML/logic nghiệp vụ giữa các trang; chọn cách routing/navigation phù hợp với frontend tách rời và ghi cách cấu hình khi triển khai.

### Các phân hệ cần bao phủ

- Công khai: danh sách/chi tiết phòng, lọc/tìm kiếm, liên hệ, yêu cầu xem/thuê, lịch xem và giữ chỗ theo phạm vi đặc tả; đăng nhập/quên/đặt lại mật khẩu.
- Quản trị: dashboard; cơ sở, phòng, tiện nghi/ảnh/tài sản và giá; yêu cầu/lịch xem/giữ chỗ; hồ sơ khách/người ở cùng; hợp đồng/phiên bản/bàn giao; nhận/gia hạn/chuyển/trả và quyết toán.
- Tài chính: công tơ, chỉ số, thay công tơ, kỳ tính tiền/khóa kỳ; hóa đơn và phát hành hàng loạt; thanh toán/phân bổ/đảo; công nợ và sổ cọc; báo cáo/in/xuất.
- Hỗ trợ và hệ thống: ticket/hội thoại/phân công/SLA; thông báo; nhân sự/vai trò/cơ sở phân công; cấu hình đơn vị/email/lịch nhắc; nhật ký. Mô phỏng chi phí, AI hoặc tích hợp nếu triển khai màn hình tùy chọn; ghi rõ phần chưa kết nối dịch vụ thật.
- Cổng khách: hồ sơ/yêu cầu sửa hồ sơ, đợt thuê/hợp đồng, hóa đơn/thanh toán/chứng từ, ticket/thông báo và đề nghị gia hạn/chuyển/trả.

Với mỗi phân hệ, theo dõi trang danh sách/tạo/sửa/chi tiết và các hành động nghiệp vụ thực sự cần từ đặc tả; không mặc định mọi chứng từ đều được sửa/xóa như CRUD thông thường.

### Mock data, service và hợp đồng API

- Frontend mặc định chạy bằng mock data không cần backend hoặc database. Tách fixtures, mock repository và API adapter ra khỏi page/component; giao diện sử dụng cùng service interface ở cả hai chế độ.
- Cấu hình qua `VITE_DATA_SOURCE=mock|api` và `VITE_API_BASE_URL`; ghi rõ API mode cần backend đã được triển khai. Không tự fallback sang dữ liệu giả khi API thật gặp lỗi.
- Mock phải nhất quán về ID, đơn vị/cơ sở, khách, đợt thuê, hợp đồng, kỳ, hóa đơn, thanh toán và cọc. Thao tác thêm/sửa/đổi trạng thái phải cập nhật các màn hình liên quan; có cách reset dữ liệu demo. Không dùng thông tin cá nhân hoặc giấy tờ thật.
- Mock hỗ trợ loading, rỗng, lỗi, validation, thành công và thao tác bị từ chối. Lọc/tìm/sort/phân trang trên toàn bộ tập mock, không chỉ các dòng đang hiển thị. API adapter phải thống nhất mapping tham số phân trang/lọc/sort, kể cả DataTables.
- `docs/api/openapi.yaml` mô tả **API đề xuất chưa được backend triển khai**, nhóm theo nghiệp vụ, không tạo API tùy tiện tương ứng từng bảng. Nêu request/response DTO, enum/trạng thái, định dạng tiền/ngày/giờ, phân trang, lỗi/validation, auth và quyền/phạm vi; giữ mock response khớp contract.
- Lớp HTTP tập trung xử lý request, lỗi, 401/403, timeout/hủy request và base URL. Không hardcode endpoint hoặc dữ liệu mẫu trong page. Với thao tác tiền/chứng từ, dự kiến idempotency key ổn định cho retry; tránh retry thao tác ghi một cách mù quáng.
- Tính toán phía frontend chỉ dùng preview. Backend là nguồn xác nhận tiền, giá, trạng thái, khả dụng và quyền. Phiên đăng nhập/đổi role demo chỉ phục vụ xem trước, không được mô tả là cơ chế bảo mật thật.
- FilePond có preview, giới hạn file, lỗi và trạng thái upload; mode mock phải thể hiện upload mô phỏng. Giấy tờ/hợp đồng/chứng từ riêng tư không lưu ở `public/`; tài liệu tích hợp phải nêu việc backend kiểm tra quyền và cấp đường dẫn tải phù hợp.

### Quy tắc nghiệp vụ giao diện bắt buộc

- Tin đăng độc lập trạng thái phòng; gửi yêu cầu/giữ chỗ chưa phải nhận phòng. Không đổi nhãn phòng để gỡ khách; dùng nhận/chuyển/trả đúng luồng.
- Một đợt thuê có đại diện và người ở cùng; người ở cùng không tự có nghĩa vụ thanh toán. Giữ lịch sử khi đổi phòng/gia hạn/trả, không ghi đè khách hiện tại.
- Cọc yêu cầu trên hợp đồng khác cọc đã thu. Hiển thị tiền thuê/phải thu, tiền đã nhận, tiền phân bổ, cọc đang giữ và số dư chưa phân bổ đúng nghĩa.
- Báo chuyển khoản là chờ xác minh; không cộng tiền đã thu trước xác nhận. Hóa đơn thu một phần vẫn có thể quá hạn; quá hạn không tự hủy nợ. Không tăng hạn vì bấm xác nhận thu lại.
- Chứng từ phát hành/bản hợp đồng ký không có sửa/xóa âm thầm. Dùng điều chỉnh/thay thế/hủy/chấm dứt có quyền và lý do theo đặc tả.
- Điện nước cần chỉ số đầu/cuối hợp lệ; không mặc định thiếu bằng 0. Giá 0 hợp lệ; phí một lần không lặp; giá mới không đổi hóa đơn lịch sử.
- Khóa kỳ, hoàn cọc, bù trừ, hủy/đảo tiền và đóng đợt còn nợ phải có hành động/xác nhận/lý do phù hợp. Mock không thể hiện rằng trình duyệt tự bảo đảm transaction của backend.
- Chuẩn ngày API: ngày nghiệp vụ `YYYY-MM-DD`, thời điểm ISO 8601 UTC; hiển thị theo `Asia/Ho_Chi_Minh`, tiền VND nhất quán. Tránh làm lệch ngày do tự chuyển timezone với date-only.
- Dùng bộ dữ liệu đối chiếu từ đặc tả: tổng 3.655.000 đồng, thu 2.000.000 còn 1.655.000; tách phí một lần và cọc.

### Chất lượng và bàn giao frontend

- Responsive trên điện thoại, máy tính bảng và desktop; có điều hướng rõ, nội dung tiếng Việt đầy đủ và trạng thái dữ liệu dễ hiểu. Tự quyết định chi tiết thiết kế, không chờ người dùng chỉ định từng thành phần.
- Form có label/validation và lỗi gắn đúng trường; hỗ trợ focus/bàn phím, độ tương phản và accessibility phù hợp. Ngăn submit trùng, cảnh báo dữ liệu chưa lưu khi cần; xác nhận hành động có ảnh hưởng.
- Mọi nút/link trong phạm vi đã nhận phải có hành vi phù hợp. Tác vụ cần dịch vụ thật (email, ngân hàng, ký số, lưu file riêng tư, AI) phải ghi là mô phỏng/chưa tích hợp, không thông báo đã gửi/đã nhận thật.
- `frontend/README.md` ghi yêu cầu Node, cài đặt, lệnh `dev/build/preview`, cấu hình môi trường, route, tài khoản/role demo và reset mock. Chốt một package manager và giữ lockfile tương ứng.
- `docs/FRONTEND_COVERAGE.md` đối chiếu đặc tả với route/phân hệ, vai trò, trạng thái và luồng đã làm/chưa làm. Không dùng chữ “hoàn tất” nếu còn trang rỗng hoặc hành động chưa hoạt động.
- `docs/BACKEND_HANDOFF.md` ghi cách chuyển mock sang API, DTO/endpoint liên quan, auth/CORS, quyền, phân trang, upload, quy tắc máy chủ và các giả định cần chốt. Các đường dẫn/quy ước API mới là đề xuất để team thống nhất, không phải API đã có.
- Sau khi code, chạy build và kiểm tra thực tế các luồng quan trọng: tìm/gửi yêu cầu; tiếp nhận/nhận phòng; ghi chỉ số/phát hành; thu một phần/chờ xác minh; cọc; gia hạn/chuyển/trả; ticket; chuyển vai trò/phạm vi demo. Kiểm tra responsive, console và navigation. Báo đúng những gì thực sự đã chạy; lưu cách kiểm tra lại.
- Nhiệm vụ frontend không cần chạy bộ kiểm thử database hoặc tạo database thật. Các lệnh database bên dưới chỉ dùng khi có công việc liên quan được giao.

## Repository state

SmartRent is a planned website for managing and renting boarding-house rooms (phòng trọ). **At the time these instructions were updated, no application code existed yet**: the repo held the business spec (`DAC_TA_LUONG_VA_CHUC_NANG_WEBSITE_PHONG_TRO.md`) and a finished PostgreSQL 16+ schema under `database/`, designed for a future ASP.NET Core + EF Core + Npgsql backend. Inspect the actual tree before starting or resuming implementation. All docs, SQL comments and test names are in Vietnamese; keep new ones in Vietnamese. The code is on GitHub at https://github.com/khiembui-dev/SmartRent_web (public, default branch `main`).

- The spec is the source of business requirements. Tags: `[Kế thừa]` = carried over from the old desktop admin app, `[Chuẩn hóa]` = corrected/normalized, `[Bổ sung]` = new proposals not yet verified. §10.2 lists the key acceptance criteria and §10.3 lists policy decisions the owner has not made yet. Do not invent answers to those decisions.
- `database/THIET_KE_DATABASE.md` explains every table and design rule. §8 lists which steps each server operation must run in one transaction, and §9 splits what the database enforces from what the API must enforce. Read it before you change the schema or write backend code.

## Commands

psql is not on PATH. It is at `C:\Program Files\PostgreSQL\16\bin\psql.exe`. Connect through `PGHOST`/`PGPORT`/`PGUSER` plus pgpass or `PGPASSWORD`; never put credentials in files.

```powershell
$psql = 'C:\Program Files\PostgreSQL\16\bin\psql.exe'

# Full check: creates smartrent_test_<uuid>, installs 01→04, runs acceptance.sql, the 05 template, 2 two-connection race tests,
# then loads 06 and compares every number with the website engine, then drops the DBs. Needs Node. Role needs CREATEDB. Add --keep to keep the test DB.
python database/tests/run_checks.py --psql $psql

# Acceptance tests only, against an installed DB (all test data is rolled back)
& $psql -X -d smartrent -v ON_ERROR_STOP=1 -f database/tests/acceptance.sql

# Team dev database: each machine runs its own copy (port 5433). Reset with down -v. Needs .env copied from .env.example.
docker compose up -d

# Fresh install on a real server: prompts for the password locally and refuses to touch an existing database
powershell -ExecutionPolicy Bypass -File database/install.ps1              # add -SampleData for the 06 demo data

# Real data: edit database/05_du_lieu_thuc.sql, then run it once. It calls the import_* functions from 04_import_tools.sql.

# Regenerate the demo data from the frontend mock
node database/tools/mock_seed_to_sql.mjs

# Regenerate the data dictionary from the live catalog (e.g. a DB kept with --keep)
python database/tools/export_dictionary.py --psql $psql --database <db>
```

You cannot run a single acceptance check on its own. `acceptance.sql` is one `DO` block that prints how many checks passed, and the first failure aborts it with `FAIL: <name>`. The last recorded run is in `database/tests/latest-run.txt`.

## Schema workflow rules

- `01_schema.sql` (tables, constraints, indexes), `02_rules.sql` (views, functions, triggers), `03_seed.sql` (system catalog plus `initialize_organization()`) and `04_import_tools.sql` (`import_*` functions) are **one-time installers**. Each runs in its own transaction, and none can be run twice on the same database. Once a database exists, every change must be a migration. Once the team starts backend work, add files to `database/migrations/` and a `\\i` line in `database/docker/init.sql` instead of editing 01–04; `run_checks.py` picks migrations up automatically. `05_du_lieu_thuc.sql` is the real-data template and `06_du_lieu_mau.sql` is generated demo data; never run 06 on a database holding real data.
- The scripts must not use psql-only meta-commands such as `\connect`, so that Npgsql or a migration runner can execute them too.
- `TU_DIEN_DU_LIEU.md` is generated, so don't edit it by hand. The generator reads `COMMENT ON TABLE` from the catalog and **fails if a table has no comment**. Add one whenever you add a table.
- Catalog totals (currently 74 tables, 12 views, 168 FKs, 129 CHECKs, 5 EXCLUDEs, 133 triggers; 98 acceptance + 2 concurrency checks) are repeated in `README.md`, `KIEM_THU.md`, `ERD.md` and `latest-run.txt`. Update them when the schema changes.
- The old 103-table design is in `database/archive/v1-103-bang/` for reference only. Scope follows the screens that exist: do not re-add tables for features without a screen unless asked.

## Architecture (database)

Everything lives in schema `smartrent`. The database timezone is `Asia/Ho_Chi_Minh`, and the `btree_gist` extension is required.

**Multi-tenancy through ownership chains, not repeated keys.** Data belongs to an `organizations` row, but child tables reach it through their FK chain (`invoice → tenancy → room → property → organization`, `payment → tenant → organization`) instead of storing `organization_id` again. `02_rules.sql` enforces this with **table-driven trigger registration**: `DO $$ … FOR r IN VALUES (…) LOOP EXECUTE format('CREATE TRIGGER …')` lists. When you add a table or FK, update the relevant lists:
- `guard_same_organization` (`scope_N` triggers): both sides of a cross-link belong to the same org. `organization_of(table, id)` resolves ownership and needs a branch for any new owner table. In PL/pgSQL never combine a `TG_TABLE_NAME` check and a column access in one `IF`; `AND` does not short-circuit.
- `guard_fixed_columns` (`fixed_<col>`): ownership columns that may never change.
- `reject_mutation` (`append_only`): ledger and event tables. Fix mistakes with a linked reversal row, never with UPDATE or DELETE.
- `guard_domain_links`, `financial_lock` / `financial_balanced`, `audit_row`.

**No RLS.** The same-org triggers stop bad links between orgs, but they do not limit reads. The future API must authorize every query: EF query filters through navigation/joins, plus raw SQL, exports and AI paths. Staff permissions are per-organization (`business_roles`, `membership_roles`, `membership_properties` with `property_scope` all/assigned). The global `roles` table is only for SystemAdmin. The tenant portal goes through `tenants.user_id`, never through staff permissions.

**Derived values are views, never stored columns.** Debt, paid amounts, deposit held, unapplied payment and room occupancy come only from `v_invoice_totals`, `v_invoice_balances`, `v_tenant_debts`, `v_deposit_balances`, `v_payment_balances`, `v_room_status`, `v_contract_status`, `v_tenant_status`, `v_public_rooms` and `v_cash_movements`. Don't add `total_debt`, `paid_until` or `current_tenant_id` columns. `rooms.operating_status` (available/maintenance/inactive) is separate from occupancy, which comes from tenancies.

**Room calendar.** `tenancies` is the occupancy calendar. A gist `EXCLUDE` constraint on `room_id` and the generated `stay` range blocks overlapping periods, even across concurrent transactions; ended stays still block so history cannot be overwritten. Ranges are half-open `[move in, move out)`: the move-in day counts, the move-out day does not. Contract `ends_on` is the first day out of force, and the contract shows `ends_on - 1`. There are no reservations.

**Pricing.** `charge_rates` belongs to exactly one scope (property, room or contract version). `effective_rates(tenancy_id, date)` resolves prices in this order: signed contract version → room → property; `room_rates(room_id, date)` covers rooms without a tenancy. A price of 0 is valid and still takes priority. To change a price, close `effective_to` on the old row and insert a new one; never update `unit_price`. Invoice lines snapshot the price, quantity and proration (`proration_numerator/denominator`).

**Documents become immutable.** Signed contract versions (with their parties, files and price plan) and issued invoices are locked by triggers. Later changes take a new contract version, or an adjustment, replacement or void invoice. Invoice `kind` is one of `periodic`, `final`, `one_time`, `replacement`, `debit_adjustment`, `credit_adjustment` or `opening_balance`. Only `periodic` and `replacement` are range-exclusive; a metered-only `final` may overlap an issued month, and a trigger stops rent being billed twice. A locked `billing_periods` row blocks writes to its invoices, and unlocking it requires the `smartrent.reason` setting. A one-time fee is a single `charge_instances` row reused on retry, so it can never be billed twice.

**Money integrity at commit time.** `payments`, `payment_reversals`, `deposit_entries`, `payment_allocations`, `invoices` and `invoice_lines` carry two triggers. A row lock (`financial_lock`) on the tenant serializes concurrent money operations. `DEFERRABLE INITIALLY DEFERRED` constraint triggers (`financial_balanced`) check that every amount balances, so offsetting rows can be written in any order within one transaction and are validated at `COMMIT` or `SET CONSTRAINTS ALL IMMEDIATE`. Rules:
- Only `confirmed` payments can be allocated.
- Each allocation has exactly one funding source: a payment or a deposit offset.
- Deposits are tracked per source payment.
- Money that is "used" never exceeds the confirmed amount minus reversals.

**Session context for audit.** Inside each business transaction, set `smartrent.actor_id`, `smartrent.reason` and `smartrent.correlation_id` with `set_config(name, value, true)`. The `audit_change` trigger copies them into `audit_logs`.

**Types and rounding.** VND amounts are `numeric(18,0)`, unit prices `numeric(18,4)`, meter values `numeric(18,3)` and line quantities `numeric(18,6)`. Each line rounds half away from zero (`decimal.Round(x, 0, MidpointRounding.AwayFromZero)` in .NET). `*_on` columns are dates (`DateOnly`). `*_at` columns are `timestamptz`, which must be written as UTC `DateTime`. Enum-like `varchar` + CHECK columns store string codes. Use `idempotency_key` columns for safe retries, and reuse the same key on retry.

## Backend integration

`backend/` is a buildable net10.0 skeleton: 37 empty controllers in `src/SmartRent.Api/Features/<page group>/`, no endpoints yet. `backend/HUONG_DAN_THEO_TRANG.md` maps every page to its owner, folder, controller, API and tables; screens call 130 of the 205 functions in `frontend/src/services/api.js`, so only those are in scope. `database/EF_CORE_NPGSQL.md` is the integration guide. Key points:
- The SQL scripts own the schema. Scaffold with `dotnet ef dbcontext scaffold 'Name=ConnectionStrings:SmartRent' … --schema smartrent`.
- Never call `EnsureCreated()` or apply a default InitialCreate. Scaffolding loses EXCLUDE constraints, triggers, functions, views and expression indexes.
- Keep EF Core, the Npgsql provider and Identity on the **same major version** (it was verified with net10.0, EF Core 10.0.13 and Npgsql EF 10.0.3).
- Use two contexts on the same database: a scaffolded `SmartRentDbContext` for business data, and an `AuthDbContext : IdentityDbContext<ApplicationUser, IdentityRole<Guid>, Guid>` mapped to the snake_case Identity tables (Identity schema Version1). Account changes go only through `UserManager`.
- Use `xmin` as the concurrency token. Treat views as keyless and read-only.
- Map SQLSTATE codes to API errors: `23505` duplicate/idempotent replay, `23503` reference in use, `23514` business-rule violation, `23P01` overlapping room/price/meter range, `40001`/`40P01` retry the whole transaction.
- For a new organization: create the owner through `UserManager`, insert `organizations`, then call `SELECT smartrent.initialize_organization(@org, @owner)`. This seeds roles, permissions, charge types, ticket categories and SLAs. There are no default accounts or demo data.
