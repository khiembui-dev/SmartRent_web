-- Nội dung chuyển khoản theo mã hóa đơn, ví dụ HD-00000093 -> HD00000093.
-- Giữ nguyên request/QR SR cũ để webhook đến muộn vẫn được đối soát; không sửa dữ liệu thu tiền.
BEGIN;
SET LOCAL search_path=smartrent,public;
SET LOCAL lock_timeout='5s';

-- Nhiều lần tạo lại QR của cùng hóa đơn có cùng nội dung, khác provider_id và hạn QR.
ALTER TABLE apipay_requests DROP CONSTRAINT IF EXISTS apipay_requests_content_key;
ALTER TABLE apipay_requests DROP CONSTRAINT IF EXISTS apipay_requests_content_check;
ALTER TABLE apipay_requests ADD CONSTRAINT apipay_requests_content_check
  CHECK(content ~ '^[A-Z0-9]{1,140}$');
CREATE INDEX IF NOT EXISTS apipay_requests_content_idx ON apipay_requests(bank_public_id,content,created_at DESC);

-- Không cho hai hóa đơn khác nhau tạo cùng nội dung sau khi bỏ dấu gạch và viết hoa.
CREATE UNIQUE INDEX IF NOT EXISTS invoices_transfer_content_unique
  ON invoices(upper(replace(code,'-',''))) WHERE code IS NOT NULL;
COMMENT ON COLUMN apipay_requests.content IS 'Mã hóa đơn viết hoa, bỏ dấu gạch; lặp giữa các lần tạo QR cùng hóa đơn. Giữ mã SR cũ để đối soát lịch sử.';
COMMIT;
