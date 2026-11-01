-- Chạy khi đang kết nối database postgres; KHÔNG bọc trong transaction.
-- Không tạo tài khoản hay mật khẩu mặc định. Role chạy lệnh sẽ là chủ database.
CREATE DATABASE smartrent
    WITH ENCODING = 'UTF8' TEMPLATE = template0;
ALTER DATABASE smartrent SET timezone TO 'Asia/Ho_Chi_Minh';
-- Sau đó kết nối smartrent và chạy lần lượt 01, 02, 03, 04 (xem README.md).
