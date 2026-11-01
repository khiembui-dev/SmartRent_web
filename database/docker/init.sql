-- Chạy một lần khi container tạo database lần đầu. Chỉ dùng cho môi trường dev bằng Docker.
-- Đổi cấu trúc: thêm dòng migration đúng thứ tự, rồi mỗi người chạy lại: docker compose down -v, docker compose up -d
\encoding UTF8
\set ON_ERROR_STOP on

\i /smartrent-database/01_schema.sql
\i /smartrent-database/02_rules.sql
\i /smartrent-database/03_seed.sql
\i /smartrent-database/04_import_tools.sql

-- Migration thêm ở đây, trước dữ liệu mẫu, mỗi file một dòng:
-- \i /smartrent-database/migrations/0001_ten_thay_doi.sql

\i /smartrent-database/06_du_lieu_mau.sql

-- Tài khoản mẫu đăng nhập được ngay với mật khẩu demo1234 như bản mock.
-- Đây là mã băm tạo bằng PasswordHasher của ASP.NET Identity. Chỉ dành cho dữ liệu giả, không dùng trên server thật.
UPDATE smartrent.users
SET password_hash = 'AQAAAAIAAYagAAAAEDB24EUVmiySbJSd+AOYbEVasNftaW7SF2xY4R37l3/LHp52DuZ8P/eHcVz4Ryw8pw==';

-- Tài khoản backend dùng để kết nối: đọc ghi dữ liệu được, nhưng không tạo, sửa, xóa được bảng.
\getenv app_password SMARTRENT_APP_PASSWORD
CREATE ROLE smartrent_app LOGIN PASSWORD :'app_password';
GRANT CONNECT ON DATABASE smartrent TO smartrent_app;
GRANT USAGE ON SCHEMA smartrent TO smartrent_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA smartrent TO smartrent_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA smartrent TO smartrent_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA smartrent TO smartrent_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA smartrent GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO smartrent_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA smartrent GRANT USAGE, SELECT ON SEQUENCES TO smartrent_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA smartrent GRANT EXECUTE ON FUNCTIONS TO smartrent_app;
ALTER ROLE smartrent_app IN DATABASE smartrent SET search_path = smartrent, public;
