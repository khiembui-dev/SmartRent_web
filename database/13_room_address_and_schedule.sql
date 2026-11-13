-- Nâng cấp tại chỗ; không xóa dữ liệu/hợp đồng/ảnh. Chạy được nhiều lần.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL search_path=smartrent,public;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS address_details jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(address_details)='object');
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS address_override jsonb CHECK (address_override IS NULL OR jsonb_typeof(address_override)='object');
ALTER TABLE rooms DROP CONSTRAINT IF EXISTS rooms_operating_status_check;
ALTER TABLE rooms ADD CONSTRAINT rooms_operating_status_check CHECK (operating_status IN ('available','reserved','maintenance','inactive'));
ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_meter_reading_day_check;
ALTER TABLE settings ADD CONSTRAINT settings_meter_reading_day_check CHECK (meter_reading_day BETWEEN 1 AND 31);
ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_invoice_create_day_check;
ALTER TABLE settings ADD CONSTRAINT settings_invoice_create_day_check CHECK (invoice_create_day BETWEEN 1 AND 31);
COMMIT;
