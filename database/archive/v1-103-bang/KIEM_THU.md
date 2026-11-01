# Kết quả kiểm tra database

Ngày kiểm tra: **21/10/2026**. Dùng cụm PostgreSQL tạm riêng trên loopback, không thay đổi database ứng dụng đang có. Kiểm tra này đánh giá schema và các ràng buộc đã viết; chưa phải nghiệm thu toàn bộ website/API.

## Môi trường

| Thành phần | Đã dùng |
|---|---|
| PostgreSQL | 16.13, Windows x64 |
| Extension | btree_gist |
| Python | 3.11, standard library + psql |
| .NET | SDK 10.0.401, target net10.0 |
| EF Core / EF Design / dotnet-ef | 10.0.13 |
| Npgsql / Npgsql EF provider | 10.0.3 |

## Kết quả SQL

- Tạo database và cài DDL/rules/seed từ đầu: **đạt**.
- Catalog: **103 bảng**, **9 view**, **226 FK**, **144 CHECK**, **5 EXCLUDE**.
- **44 kiểm tra nghiệp vụ đạt**, dữ liệu acceptance được rollback.
- **2 kiểm tra hai kết nối đồng thời đạt**: lịch phòng chồng nhau chỉ một bên commit; hai lần dùng cùng receipt để nhận cọc vượt tổng tiền chỉ một bên commit.

Các nhóm đã kiểm tra trực tiếp:

| Nhóm | Kết quả tiêu biểu |
|---|---|
| Mã/phạm vi | Mã phòng trùng bị chặn; room_type khác đơn vị bị chặn; kỳ hóa đơn khác cơ sở bị chặn |
| Nhận/đang ở | Hợp đồng ký + bàn giao + chỉ số; trạng thái phòng suy từ thuê |
| Lịch phòng | Chặn giữ chỗ chồng thuê; giữ lịch sử completed; nhận cùng ngày trả không chồng |
| Chỉ số | Không giảm trong cùng chuỗi; không void chỉ số đã lên hóa đơn; kỳ khóa không cho ghi |
| Hóa đơn | Ví dụ đúng 3.655.000 VND; không trùng đợt/kỳ; không sửa dòng/hạn sau phát hành |
| Giá | Giá riêng bằng 0 vẫn ưu tiên; đổi giá không đổi tiền hóa đơn cũ |
| Thu/nợ | Thu 2.000.000 còn 1.655.000; phần còn lại vẫn quá hạn; tổng nợ khách khớp |
| Chống lặp | Trùng idempotency bị chặn; không phân bổ quá receipt; pending không được phân bổ |
| Điều chỉnh/hủy | Chứng từ giảm 50.000 làm giảm nợ; không hủy hóa đơn còn tiền phân bổ |
| Phí một lần | Một charge occurrence không thể bị lập lại trên hóa đơn khác |
| Cọc | Tách mức yêu cầu/thực thu; nhận/hoàn/bù trừ/đảo cân đối; nguồn tiền không bị dùng hai lần |
| Chuyển/trả | Cọc chuyển có hai vế; thiếu vế bị rollback; khách đã rời vẫn có nợ |
| Giữ chỗ | Worker hết hạn giải phóng đúng reservation và allocation |
| Ngày | Ngày 31 về cuối tháng 2; năm nhuận; cộng tháng cuối tháng |
| Khóa/audit | Mở khóa cần lý do; có audit tự động bảng lõi |

## Kiểm tra EF Core + Npgsql

Đã scaffold toàn schema bằng Npgsql EF provider 10.0.3, biên dịch project thử riêng và khởi tạo model runtime. Build đạt **0 lỗi, 0 cảnh báo biên dịch**. Dữ liệu phòng và thanh toán thử được đọc qua DbContext.

Scaffolder báo sáu expression indexes không được tái tạo bằng Fluent API: index email `lower(email)` và năm index của EXCLUDE dùng range. Đây là giới hạn reverse engineering; các index/ràng buộc vẫn tồn tại và hoạt động trên PostgreSQL. Phải giữ SQL migrations từ `01_schema.sql`/`02_rules.sql`, không dùng riêng model scaffold để dựng lại database.

Project C# thử nằm ngoài workspace và không phải source ứng dụng được bàn giao. Hướng dẫn scaffold/mapping trong [EF_CORE_NPGSQL.md](EF_CORE_NPGSQL.md).

## Giới hạn và cách chạy lại

Chưa có website/API nên chưa kiểm thử authorization HTTP, tenant portal, thực gửi SMTP, quét file, ký điện tử, ngân hàng, worker chạy theo lịch, backup/restore thực tế hoặc hiệu năng với dữ liệu lớn. Các bảng tích hợp là nền tảng lưu dữ liệu; cần triển khai adapter và nghiệm thu riêng. Không suy từ 46 kiểm tra database thành tuyên bố toàn hệ thống đã sẵn sàng vận hành.

Chạy lại theo [README.md](README.md), hoặc dùng `python database/tests/run_checks.py --psql <đường-dẫn-psql>`. Runner luôn tạo database tên ngẫu nhiên riêng và tự xóa khi không có `--keep`.
