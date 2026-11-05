# Kiểm thử baseline 13 bảng

Đã nạp mới 01_schema.sql, 02_rules.sql, 03_seed.sql và 05_demo.sql trên PostgreSQL 16.13; không tắt trigger khi nạp demo.

- 13 bảng, 9 view; các bảng đã yêu cầu bỏ/gộp không còn trong schema mới.
- 40 route và 63 mục chức năng có nơi lưu dữ liệu trong checklist.
- 96 kiểm tra SQL: xem tên từng ca trong [latest-run.json](tests/latest-run.json).
- 10 luồng nghiệp vụ: xác nhận thu, hoàn tác thu, bù cọc, đảo bù cọc, gia hạn, sửa số điện nước, trả phòng sau hóa đơn tháng, trả phòng không phát sinh điện nước, lịch xem/giữ chỗ thành hợp đồng, duyệt sửa liên hệ.
- 3 thử nghiệm với hai kết nối thật: nhận cùng phòng, thu vượt một hóa đơn, giữ chỗ đồng thời nhận phòng. Chỉ một giao dịch xung đột được ghi.
- 4 kiểm tra quyền SQL runtime: mặc định user, không insert role, không đổi role, không tự cấp quyền.
- Bộ cài PowerShell đã tạo database trống đúng 13 bảng; seed không có tài khoản. Script 04 tạo được admin đầu tiên, chặn admin thứ hai. Installer từ chối database có sẵn và giữ nguyên dữ liệu.

Các kiểm tra bao gồm tham chiếu bên trong JSONB, bản ký bất biến, phân bổ thanh toán đúng khách, cọc không âm và view khách lọc tin nhắn nội bộ. Các test rollback; runner xóa database ngẫu nhiên do chính nó tạo nếu không dùng --keep.

```powershell
python database/tools/audit_source.py
python database/tests/run_checks.py --host 127.0.0.1 --port 55440 --user postgres
```

Đổi port theo PostgreSQL kiểm thử đang chạy. Runner cần quyền tạo database và role tạm. [Kết quả ngắn](tests/latest-run.txt), [đối chiếu trang](DOI_CHIEU_TUNG_TRANG.md).

Website vẫn dùng mock/localStorage. Chưa kiểm thử API ASP.NET thật, email, lưu file nhị phân hoặc Docker. Checklist xác nhận phạm vi lưu trữ, không chứng minh dịch vụ backend đã được triển khai.
