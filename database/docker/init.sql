\set ON_ERROR_STOP on
\ir /smartrent-database/01_schema.sql
\ir /smartrent-database/02_rules.sql
\ir /smartrent-database/03_seed.sql
\ir /smartrent-database/14_apipay.sql
-- Không tự nạp tài khoản/dữ liệu demo.
\getenv app_password SMARTRENT_APP_PASSWORD
BEGIN;
CREATE ROLE smartrent_app LOGIN PASSWORD :'app_password';
SELECT smartrent.configure_runtime('smartrent_app');
ALTER ROLE smartrent_app IN DATABASE smartrent SET search_path=smartrent,public;
COMMIT;
\unset app_password
