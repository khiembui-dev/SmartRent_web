# Tài khoản của hệ thống hiện tại

| Role | Cửa đăng nhập | Phạm vi |
|---|---|---|
| admin | /admin/login | Chủ trọ duy nhất, quản lý toàn bộ chức năng admin |
| user | /login | Trang khách, lịch xem và dữ liệu thuê của chính mình |

Đăng ký luôn tạo user. Cửa admin từ chối user; cửa khách từ chối admin. Audience customer chỉ là tên khu trong frontend.

Database có 13 bảng. users chứa cả tài khoản và hồ sơ khách thuê: tên, liên hệ, ngày sinh, địa chỉ, liên hệ khẩn cấp, giấy tờ che. Hồ sơ chưa kích hoạt có login_enabled=false và có thể chưa có email/password. Khi kích hoạt, cập nhật chính users.id đó; không tạo thêm hồ sơ khách ở bảng khác.

Unique index giới hạn một admin; trigger khóa role; SQL runtime không ghi role. Owner tạo admin bằng database/04_create_admin.sql với hash hợp lệ.

Khi cần chuyển quyền admin sang tài khoản đã đăng ký, dùng [hướng dẫn chuyển chủ trọ](CHUYEN_QUYEN_ADMIN.md). Script owner giữ đúng một admin, thu hồi phiên cũ và giữ nguyên lịch sử người ký/ghi chú.

contracts.user_id là người đại diện. contracts.occupants lưu người ở cùng, vẫn role user; không cấp quyền tài chính cho người ở cùng. Mỗi endpoint kiểm tra cả role lẫn ownership.

Mock trình duyệt hiện có admin ha.chutro@example.com, user an.khachthue@example.com và bich.oghep@example.com; mật khẩu demo1234. Các tài khoản này không tự đồng bộ sang PostgreSQL. Hash trong SQL demo cố ý chưa dùng đăng nhập.

Xem [database](../database/README.md), [quy tắc truy cập](../database/THIET_KE_DATABASE.md).
