-- Hai bảng kỹ thuật cho ApiPay; không thay đổi 13 bảng nghiệp vụ và không xóa dữ liệu.
-- Chạy bằng postgres một lần (có thể chạy lại an toàn).
BEGIN;
SET LOCAL search_path=smartrent,public;
CREATE TABLE IF NOT EXISTS apipay_requests (
  id uuid PRIMARY KEY,
  invoice_id uuid NOT NULL REFERENCES invoices(id),
  user_id uuid NOT NULL REFERENCES users(id),
  bank_public_id text NOT NULL,
  amount numeric(16,0) NOT NULL CHECK(amount BETWEEN 1 AND 300000000),
  content text NOT NULL UNIQUE CHECK(content ~ '^SR[A-F0-9]{32}$'),
  state text NOT NULL CHECK(state IN ('creating','ready','failed','unknown')),
  provider_id text UNIQUE,
  pay_url text,
  qr_url text,
  bank_code text,
  account_number text,
  account_name text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS apipay_requests_invoice_idx ON apipay_requests(invoice_id,created_at DESC);
CREATE TABLE IF NOT EXISTS apipay_events (
  transaction_id text PRIMARY KEY,
  bank_public_id text NOT NULL,
  amount numeric(16,0) NOT NULL CHECK(amount>0),
  content text NOT NULL,
  reference_code text NOT NULL,
  transaction_date timestamptz NOT NULL,
  body_hash text NOT NULL,
  request_id uuid REFERENCES apipay_requests(id),
  payment_id uuid REFERENCES payments(id),
  state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','processed','review','ignored')),
  reason text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS apipay_events_pending_idx ON apipay_events(received_at) WHERE state='pending';
CREATE INDEX IF NOT EXISTS apipay_events_request_idx ON apipay_events(request_id);
CREATE UNIQUE INDEX IF NOT EXISTS apipay_events_payment_unique ON apipay_events(payment_id) WHERE payment_id IS NOT NULL;
COMMENT ON TABLE apipay_requests IS 'Yêu cầu QR ApiPay. Không lưu khóa API/webhook hoặc redirect secret.';
COMMENT ON TABLE apipay_events IS 'Inbox webhook đã xác minh HMAC; transaction_id duy nhất chống thu trùng. Worker ghi sổ payments cùng transaction.';
DO $$ BEGIN
 IF EXISTS(SELECT FROM pg_roles WHERE rolname='smartrent_app') THEN
   GRANT SELECT,INSERT,UPDATE ON apipay_requests,apipay_events TO smartrent_app;
 END IF;
END $$;
COMMIT;
