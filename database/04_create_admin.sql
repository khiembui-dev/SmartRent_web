-- Chạy một lần bằng tài khoản sở hữu database. Hash do PasswordHasher của backend tạo.
-- psql ... -v admin_email='...' -v admin_name='...' -v admin_hash='...' -f 04_create_admin.sql
\set ON_ERROR_STOP on
BEGIN;
SET search_path = smartrent, public;
INSERT INTO users(role,email,display_name,password_hash,login_enabled)
VALUES ('admin', :'admin_email', :'admin_name', :'admin_hash', true);
COMMIT;
