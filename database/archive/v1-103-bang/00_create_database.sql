-- Chạy khi đang kết nối database postgres; KHÔNG bọc trong transaction.
-- Không tạo tài khoản/mật khẩu mặc định. Role chạy lệnh sẽ là database owner.
CREATE DATABASE smartrent
    WITH ENCODING = 'UTF8' TEMPLATE = template0;
ALTER DATABASE smartrent SET timezone TO 'Asia/Ho_Chi_Minh';
-- Sau đó kết nối smartrent và chạy 01 -> 04 theo README.md.
