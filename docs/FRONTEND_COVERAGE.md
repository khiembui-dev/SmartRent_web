# Độ phủ frontend SmartRent

Đối chiếu đặc tả `DAC_TA_LUONG_VA_CHUC_NANG_WEBSITE_PHONG_TRO.md` với màn hình, vai trò và trạng thái đã làm. Cập nhật 01/11/2026, sau khi làm lại khu khách và thiết kế lại khu quản trị.

**Tóm tắt trung thực:** khu quản trị được rút còn 10 khu theo yêu cầu của chủ dự án: Tổng quan, Cơ sở, Phòng, Lịch xem phòng, Tính tiền phòng, Khách thuê, Hợp đồng, Hóa đơn, Ticket, Cài đặt. Mọi route trong `frontend/src/router/routes.js` (4 trang công khai, 3 trang xác thực, 21 trang quản trị, 12 trang cổng khách, 5 trang quản trị hệ thống) đều có giao diện và hành động chạy trên dữ liệu mô phỏng. Phần cần dịch vụ thật (email, ngân hàng, ký số, AI, quét mã độc, lưu tệp riêng tư) là **mô phỏng** và được ghi nhãn. Backend chưa có; quyền "thật" hiện chỉ mô phỏng trong mock.

Đặc tả rộng hơn phạm vi hiện tại: các chức năng ở mục 2 phần "Đã gỡ khỏi giao diện quản trị" **không còn màn hình**. Đây là quyết định phạm vi, không phải chưa làm kịp.

Ký hiệu trạng thái: **Đã làm** (giao diện + hành động chạy trên mock), **Một phần** (có, nhưng thiếu một phần đặc tả, ghi rõ), **Mô phỏng** (giao diện có, dịch vụ ngoài chưa tích hợp), **Đã gỡ** (có API mock và hợp đồng, không còn màn hình).

## 1. Cách kiểm tra lại

```bash
cd frontend
npm ci
npm run build           # build production
npm run test:mock       # 158 kiểm tra nghiệp vụ + bảo đảm 240/240 route mock chạy thành công
npm run check:contract  # route mock ⇄ docs/api/openapi.yaml ⇄ lời gọi trong src/
npm run dev             # http://localhost:5173 – mật khẩu demo: demo1234
```

Kiểm tra bằng tay theo luồng của chủ trọ (mỗi bước ghi kết quả mong đợi):

1. **Cơ sở** → Thêm cơ sở, để trống rồi lưu → lỗi gắn từng ô. Nhập tên, địa chỉ, điện 3.900, nước 18.000, rác 25.000, dịch vụ 0 → trang chi tiết hiện đủ bảng giá, giá 0 hợp lệ.
2. **Phòng** → Thêm phòng, chọn cơ sở vừa tạo → bấm "Kế thừa giá từ cơ sở" → sửa giá nước → dòng đó hiện "Giá riêng", các dòng khác hiện "Theo cơ sở". Thêm tiện ích mới, tải ảnh, lưu. Ở trang chi tiết bấm "Đăng lên trang tìm phòng".
3. **Trang khách** → Tạo tài khoản ở `/register`, tài khoản hiện ở **Khách thuê** với trạng thái Chưa thuê. Vào Thuê phòng, đặt lịch xem phòng → **Lịch xem phòng** hiện yêu cầu, số đếm ở thanh bên tăng. Khi chưa có phòng, Hóa đơn, Hỗ trợ, Hợp đồng báo cần thuê phòng. Xếp lịch rồi ghi kết quả ở Lịch xem phòng.
4. **Tạo hợp đồng** → thiếu bản ký thì báo lỗi; đủ thì lưu → phòng chuyển "Đã thuê", cọc yêu cầu và cọc đã thu hiện riêng.
5. **Tính tiền phòng** → chọn tháng → thấy số tháng trước → nhập số nhỏ hơn thì báo "Nhỏ hơn số tháng trước"; nhập đúng thì tạm tính đổi ngay → Tạo hóa đơn → số tạm tính khớp hóa đơn.
6. **Hóa đơn** → Ghi nhận thanh toán một phần → "Thanh toán một phần" → Đánh dấu đã thanh toán → Hoàn tác → quay lại còn nợ, lịch sử vẫn giữ. Hủy khi còn khoản thu bị chặn.
7. **Cổng khách** (`an.khachthue@example.com`) → hóa đơn vừa tạo cho A101 hiện trong tài khoản; trả lời ticket từ quản trị hiện ở đây.
8. **Hợp đồng** → Kết thúc và trả phòng → thiếu số cuối thì chặn → xem quyết toán → còn nợ phải nhập lý do → phòng trở lại "Còn trống".
9. Bộ số đối chiếu: hóa đơn `HD-BT2609-001` tổng 3.655.000 đ, đã thu 2.000.000 đ, còn 1.655.000 đ; xác nhận khoản báo chuyển khoản `PT-2610-9001` thì đã thu đủ, hạn vẫn 05/10/2026.

## 2. Phân hệ, route và vai trò

### Khu khách: thuê phòng, liên hệ, xác thực (§4.2, §5.1)

Làm lại 01/11/2026. Nền 3D trang ngoài được làm mới cùng ngày, mã ở `src/pages/customer/home/tour/`. Khách chưa đăng nhập chỉ thấy menu Thuê phòng và Liên hệ. Nội dung giới thiệu ở trang ngoài là văn bản tĩnh, cần chủ trọ xác nhận.

| Chức năng | Route | Trạng thái | Ghi chú |
|---|---|---|---|
| Trang ngoài | `/` | Đã làm | Nền 3D tham quan một công trình minh họa theo thanh cuộn (toàn cảnh, tiến lại gần, sảnh, hành lang, studio, sân thượng), tìm nhanh chuyển sang trang Thuê phòng, phòng đang trống chạy ngang, bảng giá theo khoảng giá thật. Khi `prefers-reduced-motion` nền đổi cảnh theo vị trí dừng, không có camera bay; không có WebGL vẫn dùng được. |
| Thuê phòng | `/rooms` | Đã làm | Chỉ phòng trống ở admin và chưa bị ẩn tin. Lọc khu vực, giá, loại phòng, sắp xếp, phân trang ở máy chủ, đồng bộ URL. Hiện lịch xem của khách đã đăng nhập. |
| Chi tiết phòng, đặt lịch | `/rooms/:slug` | Đã làm | Ảnh, phóng to, video nếu có, tiện nghi, chi phí, quy định, bản đồ. Chưa đăng nhập chỉ có nút đăng nhập/tạo tài khoản, xong quay lại đúng phòng. Đặt lịch không giữ chỗ, không đổi trạng thái phòng; yêu cầu vào Lịch xem phòng của admin. |
| Liên hệ | `/contact` | Đã làm | Điện thoại và email của tài khoản chủ trọ, sửa ở Cài đặt admin là đổi ngay; kèm địa chỉ các khu nhà. |
| Tạo tài khoản | `/register` | Mô phỏng | Hồ sơ hiện ở mục Khách thuê của admin, trạng thái Chưa thuê. Chưa có xác minh email. |
| Đăng nhập, đăng xuất, hết phiên | `/login` | Đã làm | Dùng chung cho khách và quản lý; quay lại trang đang xem; hết phiên → `/login?expired=1`. |
### Quản trị

| Khu | Route | Trạng thái | Ghi chú |
|---|---|---|---|
| Tổng quan | `/admin` | Đã làm | Lọc theo cơ sở và tháng. Doanh thu tháng (không gồm cọc), hóa đơn chưa thanh toán, ticket chưa xử lý, yêu cầu xem phòng, hợp đồng sắp hết hạn; sơ đồ phòng có cờ chưa nhập số và quá hạn; tiến độ tính tiền tháng; việc cần làm mở đúng danh sách đã lọc; biểu đồ có bảng số liệu. |
| Cơ sở | `/admin/properties`, `/new`, `/:id`, `/:id/edit` | Đã làm | Xem, thêm, sửa, xóa (chặn khi còn phòng), ngừng hoạt động. Thêm gồm tên, địa chỉ, giá điện/kWh, nước/m³, phí rác/tháng, phí dịch vụ. Đổi giá không sửa hóa đơn cũ. |
| Phòng | `/admin/rooms`, `/new`, `/:id`, `/:id/edit` | Đã làm | Tìm, lọc theo cơ sở/trạng thái, xem, thêm, sửa, xóa (phòng có lịch sử gợi ý ngừng khai thác). Form: chọn cơ sở, thông tin, giá và trạng thái, giá điện nước kèm nút kế thừa từ cơ sở, tiện ích (thêm được tiện ích mới), ảnh. Đăng/ẩn tin ở trang chi tiết. |
| Lịch xem phòng | `/admin/viewings` | Đã làm | Yêu cầu từ trang khách, xếp lịch, từ chối có lý do, ghi kết quả, tạo hợp đồng từ lịch hẹn. |
| Tính tiền phòng | `/admin/billing` | Đã làm | Chọn cơ sở và tháng 1–12, xem số tháng trước, nhập số tháng này (Enter qua ô kế tiếp), chặn số nhỏ hơn, cảnh báo bất thường, tạm tính tức thì, xem chi tiết, tạo hóa đơn từng phòng hoặc hàng loạt. Thẻ "Chưa nhập số" báo phòng còn thiếu. Khóa/mở khóa tháng có lý do. Sửa số có lý do, số đã lên hóa đơn thì không sửa được. |
| Khách thuê | `/admin/tenants`, `/:id` | Đã làm | Xem, tìm, lọc tài khoản; sửa thông tin; đổi mật khẩu khách; phòng đang thuê, hợp đồng, hóa đơn, ticket; duyệt đề nghị sửa hồ sơ. "Thêm khách" vẫn giữ vì trang khách chưa có đăng ký tài khoản. |
| Hợp đồng | `/admin/contracts`, `/new`, `/:id` | Đã làm | Tạo hợp đồng là nhận phòng; thông tin khách, phòng, thời hạn, cọc yêu cầu và đang giữ, giá chốt; tệp ảnh/PDF; hóa đơn của hợp đồng; gia hạn (phiên bản mới); thu thêm cọc; kết thúc và trả phòng có quyết toán; duyệt đề nghị của khách. |
| Hóa đơn | `/admin/invoices`, `/:id` | Đã làm | Tìm, lọc theo cơ sở/chu kỳ/trạng thái, dải tổng theo bộ lọc, in, xuất CSV từng hóa đơn và danh sách. Đánh dấu đã thanh toán, thu một phần, xác nhận/từ chối báo chuyển khoản, hoàn tác có lý do, hủy có lý do. Ghi nhãn chưa nối ngân hàng. |
| Ticket | `/admin/tickets`, `/:id` | Đã làm | Hộp thư hai cột, trả lời khách, ghi chú nội bộ, đổi trạng thái, phân công. |
| Cài đặt | `/admin/settings` | Đã làm | Họ tên, email, điện thoại, ảnh đại diện, đổi mật khẩu; lịch nhắc ngày nhập số và ngày tạo hóa đơn. Nhắc hiện trên Tổng quan; gửi email/đẩy là **Mô phỏng**, chưa có. |

### Đã gỡ khỏi giao diện quản trị (31/10/2026)

Theo yêu cầu "chỉ để lại các trang đã nêu". Bản sao mã cũ nằm ở `smartrent-frontend-truoc-redesign-admin-2026-10-31.zip` cạnh thư mục dự án. API mock và `openapi.yaml` của các phần này vẫn giữ.

| Chức năng | Còn lại ở đâu |
|---|---|
| Yêu cầu thuê, giữ chỗ | Yêu cầu chuyển sang Lịch xem phòng. Giữ chỗ không tạo mới được; giữ chỗ có sẵn hủy được ở trang phòng. |
| Đợt thuê, nhận phòng, bàn giao | Gộp vào tạo hợp đồng. Biên bản bàn giao chi tiết và người ở cùng không còn màn hình nhập. |
| Chuyển phòng | **Không còn luồng.** Duyệt đề nghị của khách vẫn được, nhưng thao tác chuyển phải kết thúc hợp đồng cũ rồi tạo hợp đồng mới. |
| Kỳ tính tiền, công tơ | Gộp vào Tính tiền phòng. Thay công tơ không còn màn hình. |
| Lập hóa đơn phát sinh, điều chỉnh tăng/giảm, thay thế | Không còn màn hình. Sai hóa đơn thì hoàn tác khoản thu rồi hủy. |
| Thu tiền, công nợ, sổ cọc | Thu tiền ở chi tiết hóa đơn; công nợ theo khách ở hồ sơ khách; cọc ở chi tiết hợp đồng. |
| Báo cáo, chi phí, xuất dữ liệu | Không còn màn hình; xuất CSV vẫn có ở các danh sách. |
| Nhân sự và vai trò, nhật ký, trợ lý AI, cấu hình email/mẫu/tích hợp | Không còn màn hình. Phân quyền theo vai trò demo vẫn chạy. |
| Trung tâm thông báo, trang tài khoản riêng | Thông báo còn ở chuông trên đầu trang; tài khoản gộp vào Cài đặt. |

### Khu khách: phần cần đăng nhập (§5.12)

Menu Hóa đơn, Hỗ trợ, Hợp đồng chỉ hiện khi đã đăng nhập. Khách chưa có phòng bấm vào sẽ thấy thông báo cần thuê phòng; hệ thống hỏi lại máy chủ mỗi lần mở nên admin vừa thêm phòng là dùng được ngay.

| Chức năng | Route | Trạng thái | Ghi chú |
|---|---|---|---|
| Hóa đơn | `/invoices` | Đã làm | Số cần thanh toán, lọc ở máy chủ, phân trang. Người ở cùng không xem được. |
| Chi tiết, thanh toán | `/invoices/:id` | Đã làm | Tờ biên lai theo dòng hóa đơn thật, in được. Báo chuyển khoản kèm mã giao dịch, ảnh biên lai; tạo khoản chờ xác minh, chưa trừ nợ. Tài khoản ngân hàng minh họa, mã VietQR là ô mô phỏng. |
| Hỗ trợ | `/tickets`, `/tickets/new`, `/tickets/:id` | Đã làm | Gửi kèm ảnh, trao đổi với quản lý (không thấy ghi chú nội bộ), xác nhận đã xong, mở lại có lý do; dùng chung ticket với admin. |
| Hợp đồng | `/contract` | Đã làm | Bản đã ký, biểu phí, cọc, tải tệp hợp đồng, biên bản bàn giao có chỉ số đầu vào, người ở cùng. Đề nghị gia hạn, trả phòng gửi tới admin. Người ở cùng không thấy tiền. |
| Tài khoản, thông báo | `/account`, `/notifications` | Đã làm | Đề nghị sửa liên hệ chờ duyệt, đổi mật khẩu. |

## 3. Luồng nghiệp vụ §4 và cách đã kiểm chứng

| Luồng | Kiểm thử Node (`test:mock`) | Thao tác trên trình duyệt (31/10/2026) |
|---|---|---|
| 4.1 Thiết lập cơ sở/phòng | Bảng giá cơ sở, mã tự sinh, giá 0, phòng kế thừa và giá riêng, công tơ tự tạo, tin đăng, xóa có điều kiện | Tạo cơ sở, tạo phòng kế thừa giá rồi sửa, thêm tiện ích, tải ảnh, đăng tin |
| 4.2 Tìm phòng, đăng ký xem | Danh sách/chi tiết công khai, gửi yêu cầu, chặn thiếu liên hệ | Yêu cầu vào Lịch xem phòng, xếp lịch, ghi kết quả, tạo hợp đồng từ lịch hẹn |
| 4.3 Nhận phòng | Nhận phòng, thiếu chỉ số bị chặn, hai lần nhận cùng phòng chỉ một thành công, tệp bổ sung | Tạo hợp đồng từ yêu cầu; thiếu bản ký bị chặn; phòng chuyển đã thuê |
| 4.4 Điện nước, tạo hóa đơn | Chỉ số giảm bị chặn, ghi hàng loạt, phí một lần không lặp, phát hành lặp bị chặn, tạm tính khớp hóa đơn | Nhập số, số nhỏ hơn bị báo, tạm tính khớp hóa đơn cả tạo một phòng và từ thanh dưới; khóa/mở khóa tháng |
| 4.5 Thu tiền, công nợ | Ví dụ 3.655.000/2.000.000/1.655.000, thu một phần vẫn quá hạn, hoàn tác không để tiền chưa phân bổ, hủy bị chặn khi còn phân bổ | Thu một phần, thu đủ, hoàn tác, hủy bị chặn, xác nhận báo chuyển khoản, phát hành nháp, in, xuất CSV |
| 4.6 Hỗ trợ | Vòng đời ticket, ghi chú nội bộ ẩn với khách | Tiếp nhận, trả lời; đăng nhập khách thấy câu trả lời |
| 4.7 Gia hạn | Phiên bản mới, ký bắt buộc bản ký | Gia hạn từ hợp đồng; thiếu bản ký bị chặn |
| 4.8 Chuyển phòng | Route mock còn chạy | **Không còn giao diện** |
| 4.9 Trả phòng | Xem trước không ghi, bù trừ và hoàn cọc, chặn đóng khi cọc chưa xử lý | Trả B102: còn nợ phải nhập lý do, cọc về 0, hợp đồng chấm dứt, phòng còn trống |

## 4. Tiêu chí nghiệm thu §10.2

| # | Tiêu chí | Frontend/mock thể hiện | Phần backend phải bảo đảm |
|---|---|---|---|
| 1 | Không xem/sửa ngoài quyền kể cả đổi ID | Mock trả 404/403; nhân viên đổi ID sang cơ sở khác bị chặn (kiểm thử) | Kiểm tra mọi API, query filter, export, AI |
| 2 | Tạo phòng không tự phát sinh thuê/thu; mã không trùng | Đã kiểm thử | Unique + transaction |
| 3 | Hai yêu cầu nhận cùng phòng không cùng thành công | Đã kiểm thử | EXCLUDE gist, transaction |
| 4 | Nhận phòng đủ hồ sơ; cọc yêu cầu ≠ thực thu | Đã kiểm thử | Transaction §8 |
| 5 | Phát hành lặp không trùng; chuyển giữa kỳ tính đúng | Đã kiểm thử | Idempotency, `effective_rates` |
| 6 | Ví dụ 3.655.000 / 2.000.000 / 1.655.000; phí một lần không lặp | Đã kiểm thử + hiển thị | Views tiền |
| 7 | Xác nhận lại không thu trùng; thu một phần vẫn quá hạn | Đã kiểm thử + hiển thị | `financial_lock`, idempotency |
| 8 | Đổi giá không sửa hóa đơn cũ; điều chỉnh/hủy giữ dấu vết | Đã kiểm thử | Trigger bất biến |
| 9 | Quá hạn không tự hủy; nợ khớp mọi màn hình | Cùng nguồn số liệu ở mock | Một nguồn view |
| 10 | Gia hạn/chuyển/trả giữ lịch sử; khách rời còn nợ vẫn theo dõi | Đã kiểm thử | Transaction §8 |
| 11 | Cọc đối chiếu từng giao dịch, tách tiền thuê | Chi tiết hợp đồng tách cọc yêu cầu, đã thu, bù trừ, hoàn, đang giữ; không còn màn hình sổ cọc theo phiếu nguồn | `v_deposit_balances` |
| 12 | Ngày cuối tháng/năm nhuận, kỳ/hạn/hết hợp đồng tách riêng | Tiện ích ngày date-only, kẹp ngày cuối tháng | Hàm `invoice_date`, `quick_contract_end_exclusive` |
| 13 | Khách chỉ xem dữ liệu mình; báo chuyển khoản chưa duyệt không thành Đã thu | Đã kiểm thử + hiển thị | Kiểm tra theo `tenants.user_id` |
| 14 | Lọc toàn tập, xuất đúng lọc; theo kỳ và theo ngày thu tách biệt | Mock lọc toàn tập; CSV lấy hết các trang theo lọc | Lọc/phân trang ở máy chủ |
| 15 | Dùng được trên điện thoại; tải/rỗng/lỗi rõ; giữ form khi lỗi; cảnh báo chưa lưu | Kiểm tra 390px; skeleton/rỗng/lỗi + thử lại; lỗi gắn ô, form giữ dữ liệu; cảnh báo rời trang theo giá trị thay đổi | – |
| 16 | Upload kiểm tra tệp/quyền; giấy tờ không lộ link công khai | FilePond giới hạn loại/dung lượng; link tải có hạn theo quyền (mock) | Quét mã độc, kho riêng tư, URL có hạn |
| 17 | Email lỗi không mất hóa đơn; thử lại chống trùng; tác vụ chạy khi đóng trình duyệt | Lịch sử gửi + thử lại; chạy tay có chống trùng (mô phỏng) | Worker máy chủ, outbox |

## 5. Trạng thái giao diện

- **Đang tải:** khung skeleton; khi lọc lại, bảng/biểu đồ giữ khung và mờ đi thay vì nhảy trang.
- **Rỗng:** thông điệp theo ngữ cảnh (không có kết quả theo bộ lọc khác với chưa có dữ liệu), có hành động tiếp theo khi phù hợp.
- **Lỗi:** thông điệp tiếng Việt, gợi ý xử lý, mã tra cứu nếu có, nút Thử lại; lỗi 409/422 hiện ở form hoặc hộp thoại, không mất dữ liệu đã nhập.
- **Không có quyền / không tìm thấy:** trang riêng; menu ẩn mục không có quyền (chỉ để gọn, không phải bảo mật).
- **Thành công:** toast; dữ liệu liên quan (số đếm menu, dashboard, danh sách) cập nhật.
- **Xác nhận:** thao tác ảnh hưởng tiền/chứng từ dùng hộp lý do (khóa/mở kỳ, hủy/điều chỉnh, đảo tiền, hoàn/bù trừ cọc, từ chối…) hoặc hộp xác nhận tóm tắt (trả phòng, chuyển phòng).

## 6. Những gì đã thực sự chạy (31/10/2026)

| Kiểm tra | Kết quả |
|---|---|
| `npm run build` (Vite 8.3.5) | Thành công, không lỗi |
| `npm run test:mock` | Đạt 158 kiểm tra; 240/240 route mock chạy thành công. Đồng hồ dời về ngày tham chiếu của seed; trước đó kịch bản fail từ 31/10/2026 vì phụ thuộc ngày chạy |
| `npm run check:contract` | Khớp: 240 thao tác mock = 240 trong openapi.yaml; mọi lời gọi trong `src/` có trong cả hai |
| `npx @redocly/cli@1.34.5 lint docs/api/openapi.yaml` | Hợp lệ, 1 cảnh báo về trường license |
| Playwright – luồng đầy đủ bằng chủ trọ | Các bước ở mục 1, dữ liệu mới hoàn toàn, Chromium, không lỗi console |
| Playwright – Tổng quan | Lưới 3 cột đo ở 375, 768, 1024, 1200, 1280, 1440, 1920 và 2560 px: đáy các khối trong một hàng bằng nhau, không hàng nào còn ô trống, không tràn ngang, không lỗi console |
| Playwright – mục Đã thuê | Thêm phòng và sửa phòng gán được khách (thêm khách mới ngay trong form, tìm khách có sẵn), báo lỗi đúng ô khi bỏ trống hoặc khách đang thuê nơi khác, khóa trạng thái khi phòng có khách, gỡ khách, Tính tiền chặn và dẫn tới bổ sung hợp đồng, bổ sung hợp đồng kèm bản ký xong thì hết cảnh báo |
| Playwright – mọi route quản trị | 21 route ở 1920, 1440, 768 và 375 px, các trang chính thêm ở 992, 1024, 1199, 1200, 1280 và 2560 px: không lỗi console; không tràn ngang sau khi trang tải xong (đo `scrollWidth` so với `clientWidth`); nội dung chiếm hết phần còn lại sau sidebar. Trang sửa phòng ở 375 px có tràn thoáng qua lúc FilePond khởi tạo |
| Playwright – nhân viên, Kỹ thuật, quản lý | Thanh bên chỉ hiện mục có quyền; trang không đủ quyền hiện thông báo; không lỗi |
| Playwright – khu khách làm lại | 12 trang ở 320, 375, 768, 1024, 1280, 1440 và 1920 px: không tràn ngang, không phần tử bị cắt, không lỗi console. Chạy trọn chuỗi: chưa đăng nhập, tạo tài khoản, đặt lịch, báo chưa có phòng, admin tạo hợp đồng bằng màn hình thật, nhập chỉ số, phát hành hóa đơn, khách báo chuyển khoản, xem hợp đồng, gửi ticket |
| Playwright – liên kết khách và admin | Tài khoản mới hiện ở Khách thuê; lịch xem hiện ở Lịch xem phòng; phòng được gán biến mất khỏi trang Thuê phòng; đổi điện thoại ở Cài đặt hiện ngay ở Liên hệ; người ở cùng không thấy Hóa đơn |
| Playwright – CSS không tràn sang admin | So style nút, panel, huy hiệu, menu ở admin khi mở trực tiếp và sau khi đi qua trang khách trong cùng phiên: không khác biệt |
| Playwright – người ở cùng, quản trị hệ thống | Người ở cùng không thấy tiền, hóa đơn, nút gia hạn; quản trị hệ thống 5 route: không lỗi console |
| In hóa đơn, xuất CSV | Xem bản in bằng chế độ media print; mở tệp CSV xuất ra kiểm tra BOM UTF-8 và cột |
| Chế độ tối | Xem Tổng quan và Tính tiền phòng |

Lỗi phát hiện và đã sửa khi kiểm tra: giá đè nhau ở danh sách cơ sở; số đếm yêu cầu xem phòng lệch giữa thanh bên và trang; chọn cơ sở ở Tính tiền làm dính bộ lọc các danh sách khác; bảng tính tiền tràn ở 768 px; trang sửa phòng và chi tiết hóa đơn tràn ở 375 px; tệp CSV hóa đơn thiếu BOM và trộn dấu phân cách; `/portal/profile` in `[object Object]` ở địa chỉ (lỗi có từ trước).

## 7. Chưa làm và giới hạn đã biết

- Backend và database thật chưa nối; mọi quyền/tính toán ở mock chỉ để xem trước. `VITE_DATA_SOURCE=api` cần backend đúng `openapi.yaml`.
- Tích hợp thật: email/SMTP, ngân hàng/QR/đối soát, cổng thanh toán, ký số, hóa đơn điện tử, AI, quét mã độc, kho tệp riêng tư.
- Đăng ký tài khoản chưa xác minh email; tài khoản tự đăng ký không tự nối vào hồ sơ khách do admin tạo sẵn (xem BACKEND_HANDOFF §9).
- Đổi mật khẩu khách từ quản trị là thao tác mô phỏng; cần ràng buộc bảo mật khi làm thật (xem BACKEND_HANDOFF §0).
- Khách chỉ đề nghị gia hạn và trả phòng; đề nghị chuyển phòng đã bỏ vì khu quản trị không có luồng chuyển phòng.
- Khách chưa tự hủy được lịch xem phòng đã đặt, cần gọi quản lý.
- Lịch nhắc chỉ hiện trên giao diện, chưa có tác vụ nền gửi nhắc.
- Ảnh phòng mẫu có dấu GoPlus của bên khác; cần thay bằng ảnh của chủ trọ trước khi dùng thật.
- Trang quản trị chưa chặn việc vẽ đè khi rời trang lúc đang tải (trang khách đã chặn). Hiếm gặp, sửa ở `app.js` sẽ đụng mọi trang quản trị nên chưa làm.
- Công nợ, báo cáo, nhật ký, phân quyền: không còn màn hình quản trị (mục 2).
- Danh mục địa giới hành chính có phiên bản: chưa dùng (nhập tay). Phí theo số lượng: chưa có ô nhập số lượng.
- SLA tính liên tục 24/7; chưa có lịch giờ làm việc.
- Chưa có kiểm thử giao diện tự động trong CI; các lần Playwright ở trên chạy tay. Chỉ dùng Chromium, chưa thử Safari, Firefox và trình đọc màn hình thật.
