# Truy cập database

Nguồn chuẩn là [database/README.md](../../../../database/README.md), [từ điển](../../../../database/TU_DIEN_DU_LIEU.md) và [JSONB](../../../../database/JSON_DATA.md).

Map đúng 13 bảng. users chứa tài khoản và hồ sơ khách; contracts chứa đợt thuê/bản ký/gia hạn/người ở cùng; invoices chứa chỉ số/dòng tiền; payments chứa thu/cọc/phân bổ; tickets chứa hội thoại.

Hiện chưa có DbContext nghiệp vụ kết nối SQL. Khi triển khai, map các cột JSONB và generated total_amount theo schema hiện hành. Không dùng EnsureCreated sinh schema khác; không thêm các bảng Identity mặc định. Có thể dùng password hasher cùng store users riêng.

Mọi sửa mảng JSONB cần khóa dòng trong transaction hoặc cập nhật nguyên tử. Kiểm tra cả lỗi Commit của deferred constraints. Xem [bàn giao backend](../../../../docs/BACKEND_HANDOFF.md).
