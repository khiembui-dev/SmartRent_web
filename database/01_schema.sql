-- SmartRent: baseline 13 bảng thu gọn theo yêu cầu ngày 04/11/2026.
-- Cài vào database trống. Danh sách chi tiết nằm trong JSONB của hồ sơ chính.
BEGIN;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE SCHEMA smartrent;
SET search_path=smartrent,public;
CREATE FUNCTION invoice_total(items jsonb) RETURNS numeric LANGUAGE sql IMMUTABLE STRICT AS $$
 SELECT coalesce(sum(round((x->>'quantity')::numeric*(x->>'unitPrice')::numeric*
 coalesce((x->>'sign')::integer,1)*coalesce((x->>'numerator')::integer,1)/
 coalesce((x->>'denominator')::integer,1))),0) FROM jsonb_array_elements(items) x
$$;
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role varchar(5) NOT NULL DEFAULT 'user' CHECK (role IN ('admin','user')),
  email text CHECK (email IS NULL OR btrim(email) <> ''),
  password_hash text CHECK (password_hash IS NULL OR length(password_hash) >= 20),
  display_name text NOT NULL CHECK (btrim(display_name) <> ''),
  code text UNIQUE,
  phone text,
  login_enabled boolean NOT NULL DEFAULT false,
  date_of_birth date,
  address_line text,
  locality text,
  province text,
  emergency_contact_name text,
  emergency_contact_phone text,
  notes text,
  identity_documents jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(identity_documents)='array'),
  avatar_file_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  email_verified_at timestamptz,
  accepted_terms_at timestamptz,
  security_stamp uuid NOT NULL DEFAULT gen_random_uuid(),
  failed_login_count integer NOT NULL DEFAULT 0 CHECK (failed_login_count >= 0),
  locked_until timestamptz,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT login_enabled OR (email IS NOT NULL AND password_hash IS NOT NULL)),
  CHECK (role<>'admin' OR login_enabled)
);

CREATE TABLE auth_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  kind text NOT NULL CHECK (kind IN ('session','password_reset','invitation')),
  token_hash text NOT NULL UNIQUE CHECK (length(token_hash) >= 32),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  revoked_at timestamptz,
  user_agent text,
  ip_address inet,
  CHECK (expires_at > created_at)
);

CREATE TABLE files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_by uuid REFERENCES users(id),
  storage_key text NOT NULL UNIQUE,
  file_name text NOT NULL,
  content_type text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size >= 0),
  visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('public','private')),
  purpose text NOT NULL CHECK (purpose IN ('avatar','room_image','contract_signed','contract_attachment','payment_proof','ticket','other')),
  scan_status text NOT NULL DEFAULT 'pending' CHECK (scan_status IN ('pending','clean','rejected','missing')),
  sha256 text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  business_name text NOT NULL DEFAULT 'SmartRent',
  meter_reading_day smallint NOT NULL DEFAULT 25 CHECK (meter_reading_day BETWEEN 1 AND 28),
  invoice_create_day smallint NOT NULL DEFAULT 28 CHECK (invoice_create_day BETWEEN 1 AND 28),
  reminder_enabled boolean NOT NULL DEFAULT true,
  -- Trang khách chỉ hiển thị một tài khoản nhận tiền mặc định; chưa có giao diện quản lý ngân hàng.
  bank_name text,
  bank_account_number text,
  bank_account_name text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id),
  CHECK (invoice_create_day >= meter_reading_day),
  CHECK (num_nonnulls(bank_name,bank_account_number,bank_account_name) IN (0,3))
);

CREATE TABLE properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL CHECK (btrim(name) <> ''),
  address_line text NOT NULL,
  locality text,
  province text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  inactive_reason text,
  invoice_day smallint NOT NULL DEFAULT 1 CHECK (invoice_day BETWEEN 1 AND 31),
  due_after_days smallint NOT NULL DEFAULT 5 CHECK (due_after_days BETWEEN 0 AND 365),
  proration_policy text NOT NULL DEFAULT 'actual_days' CHECK (proration_policy IN ('actual_days','full_month')),
  amenity_options jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(amenity_options)='array'),
  rates jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(rates)='array'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (is_active OR nullif(btrim(inactive_reason),'') IS NOT NULL)
);

CREATE TABLE rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id),
  code text NOT NULL,
  name text NOT NULL,
  floor_label text,
  area_m2 numeric(7,2) NOT NULL CHECK (area_m2 BETWEEN 1 AND 500),
  capacity smallint NOT NULL CHECK (capacity BETWEEN 1 AND 20),
  -- Loại phòng chỉ để hiển thị/lọc, không có trang quản lý danh mục loại phòng.
  room_type_code text NOT NULL DEFAULT 'STANDARD',
  room_type_name text NOT NULL DEFAULT 'Phòng tiêu chuẩn',
  description text,
  rules_text text,
  required_deposit numeric(16,0) NOT NULL DEFAULT 0 CHECK (required_deposit >= 0),
  operating_status text NOT NULL DEFAULT 'available' CHECK (operating_status IN ('available','maintenance','inactive')),
  status_reason text,
  -- Tin đăng là quan hệ 1:1 với phòng, lưu ngay trên phòng.
  listing_slug text UNIQUE,
  listing_title text,
  listing_description text,
  listing_status text NOT NULL DEFAULT 'hidden' CHECK (listing_status IN ('hidden','draft','published')),
  video_url text,
  published_at timestamptz,
  amenities jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(amenities)='array'),
  images jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(images)='array'),
  rates jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(rates)='array'),
  status_history jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(status_history)='array'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (code ~ '^[A-Za-z0-9-]{1,20}$'),
  CHECK (listing_status <> 'published' OR (listing_slug IS NOT NULL AND listing_title IS NOT NULL AND published_at IS NOT NULL))
);

CREATE TABLE bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES users(id),
  room_id uuid REFERENCES rooms(id),
  contract_id uuid,
  kind text NOT NULL DEFAULT 'viewing' CHECK(kind IN ('viewing','profile_change','renewal','checkout','transfer')),
  status text NOT NULL DEFAULT 'new' CHECK(status IN ('new','accepted','consulting','scheduled','completed','no_show','pending','approved','converted','rejected','cancelled')),
  contact_name text,
  phone text,
  email text,
  occupants smallint CHECK(occupants BETWEEN 1 AND 20),
  preferred_viewing_at timestamptz,
  desired_on date,
  message text,
  changes jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(changes)='object'),
  appointments jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(appointments)='array'),
  hold_status text CHECK(hold_status IN ('holding','converted','cancelled','expired')),
  hold_from date,
  hold_to date,
  hold_expires_at timestamptz,
  hold_reason text,
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  decision_notes text,
  history jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(history)='array'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK((kind='viewing' AND room_id IS NOT NULL AND contract_id IS NULL AND occupants IS NOT NULL AND contact_name IS NOT NULL) OR
        (kind='profile_change' AND contract_id IS NULL AND changes<>'{}') OR
        (kind IN ('renewal','checkout','transfer') AND contract_id IS NOT NULL AND desired_on IS NOT NULL)),
  CHECK(hold_status IS NULL OR (kind='viewing' AND hold_from IS NOT NULL AND hold_expires_at IS NOT NULL)),
  CHECK(hold_to IS NULL OR hold_to>hold_from),
  CHECK((reviewed_at IS NULL)=(reviewed_by IS NULL)),
  CHECK(status<>'rejected' OR nullif(btrim(decision_notes),'') IS NOT NULL),
  EXCLUDE USING gist(room_id WITH =,daterange(hold_from,hold_to,'[)') WITH &&) WHERE(hold_status='holding')
);

CREATE TABLE contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  room_id uuid NOT NULL REFERENCES rooms(id),
  user_id uuid NOT NULL REFERENCES users(id),
  booking_id uuid UNIQUE REFERENCES bookings(id),
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('planned','active','ended','cancelled')),
  onboarding_mode text NOT NULL DEFAULT 'new' CHECK(onboarding_mode IN ('new','import')),
  starts_on date NOT NULL,
  move_in_on date,
  move_out_on date,
  ends_on date,
  required_deposit numeric(16,0) NOT NULL DEFAULT 0 CHECK(required_deposit>=0),
  versions jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(versions)='array'),
  attachments jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(attachments)='array'),
  occupants jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(occupants)='array'),
  initial_readings jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(initial_readings)='object'),
  final_readings jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(final_readings)='object'),
  checkin_handover jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(checkin_handover)='object'),
  checkout_handover jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(checkout_handover)='object'),
  checkout_summary jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(checkout_summary)='object'),
  onboarding_gaps jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(onboarding_gaps)='array'),
  ended_reason text,
  remaining_debt_reason text,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(ends_on IS NULL OR ends_on>starts_on),
  CHECK(move_in_on IS NULL OR move_in_on>=starts_on),
  CHECK(move_out_on IS NULL OR move_out_on>coalesce(move_in_on,starts_on)),
  CHECK(status<>'active' OR (move_in_on IS NOT NULL AND move_out_on IS NULL)),
  CHECK(status<>'ended' OR (move_out_on IS NOT NULL AND nullif(btrim(ended_reason),'') IS NOT NULL)),
  EXCLUDE USING gist(room_id WITH =,daterange(starts_on,move_out_on,'[)') WITH &&) WHERE(status<>'cancelled')
);

CREATE TABLE billing_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id),
  month_start date NOT NULL CHECK (extract(day FROM month_start) = 1),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','locked')),
  locked_at timestamptz,
  locked_by uuid REFERENCES users(id),
  unlock_reason text,
  history jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(history)='array'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id,month_start),
  CHECK ((status = 'locked') = (locked_at IS NOT NULL AND locked_by IS NOT NULL))
);

CREATE TABLE invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE,
  contract_id uuid NOT NULL REFERENCES contracts(id),
  period_id uuid REFERENCES billing_periods(id),
  kind text NOT NULL DEFAULT 'periodic' CHECK(kind IN ('periodic','final','opening_balance','debit_adjustment','credit_adjustment')),
  adjusts_invoice_id uuid REFERENCES invoices(id),
  metered_only boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','issued','void')),
  service_from date NOT NULL,
  service_to date NOT NULL,
  electricity_start numeric(16,3),
  electricity_end numeric(16,3),
  electricity_from_at timestamptz,
  electricity_to_at timestamptz,
  water_start numeric(16,3),
  water_end numeric(16,3),
  water_from_at timestamptz,
  water_to_at timestamptz,
  readings_history jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(readings_history)='array'),
  correction_reason text,
  lines jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(lines)='array'),
  total_amount numeric(16,0) GENERATED ALWAYS AS(invoice_total(lines)) STORED,
  customer_snapshot jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(customer_snapshot)='object'),
  issued_on date,
  due_on date,
  issued_by uuid REFERENCES users(id),
  issued_at timestamptz,
  voided_at timestamptz,
  void_reason text,
  notes text,
  idempotency_key text UNIQUE,
  request_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(service_to>service_from),
  CHECK((kind IN ('debit_adjustment','credit_adjustment'))=(adjusts_invoice_id IS NOT NULL)),
  CHECK(kind<>'periodic' OR period_id IS NOT NULL),
  CHECK(NOT metered_only OR kind='final'),
  CHECK(electricity_start IS NULL OR electricity_start>=0),
  CHECK(electricity_end IS NULL OR (electricity_start IS NOT NULL AND electricity_end>=electricity_start AND electricity_from_at IS NOT NULL AND electricity_to_at IS NOT NULL AND electricity_to_at>electricity_from_at)),
  CHECK(water_start IS NULL OR water_start>=0),
  CHECK(water_end IS NULL OR (water_start IS NOT NULL AND water_end>=water_start AND water_from_at IS NOT NULL AND water_to_at IS NOT NULL AND water_to_at>water_from_at)),
  CHECK(status='draft' OR (code IS NOT NULL AND issued_on IS NOT NULL AND due_on IS NOT NULL AND due_on>=issued_on AND issued_at IS NOT NULL AND issued_by IS NOT NULL)),
  CHECK(status<>'void' OR (voided_at IS NOT NULL AND nullif(btrim(void_reason),'') IS NOT NULL)),
  CHECK(idempotency_key IS NULL OR request_hash IS NOT NULL),
  EXCLUDE USING gist(contract_id WITH =,daterange(service_from,service_to,'[)') WITH &&) WHERE(status<>'void' AND kind IN ('periodic','final') AND NOT metered_only)
);

CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES users(id),
  contract_id uuid REFERENCES contracts(id),
  intended_invoice_id uuid REFERENCES invoices(id),
  kind text NOT NULL DEFAULT 'receipt' CHECK(kind IN ('receipt','receipt_reversal','deposit_receipt','deposit_refund','deposit_offset','deposit_offset_reversal')),
  reverses_id uuid REFERENCES payments(id),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','rejected')),
  amount numeric(16,0) NOT NULL CHECK(amount>0),
  method text CHECK(method IN ('cash','bank_transfer')),
  external_reference text,
  allocations jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(allocations)='array'),
  proof_file_ids jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(proof_file_ids)='array'),
  submitted_by uuid REFERENCES users(id),
  confirmed_by uuid REFERENCES users(id),
  confirmed_at timestamptz,
  reason text,
  notes text,
  received_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text,
  request_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(kind NOT LIKE 'deposit_%' OR contract_id IS NOT NULL),
  CHECK((kind IN ('receipt_reversal','deposit_offset_reversal'))=(reverses_id IS NOT NULL)),
  CHECK((status='confirmed')=(confirmed_at IS NOT NULL AND confirmed_by IS NOT NULL)),
  CHECK(kind NOT IN ('receipt_reversal','deposit_refund','deposit_offset','deposit_offset_reversal') OR status='confirmed'),
  CHECK(kind NOT IN ('receipt_reversal','deposit_refund','deposit_offset_reversal') OR nullif(btrim(reason),'') IS NOT NULL),
  CHECK(status<>'rejected' OR nullif(btrim(reason),'') IS NOT NULL),
  CHECK((kind IN ('deposit_offset','deposit_offset_reversal'))=(method IS NULL)),
  CHECK(method IS DISTINCT FROM 'bank_transfer' OR nullif(btrim(external_reference),'') IS NOT NULL),
  CHECK(idempotency_key IS NULL OR request_hash IS NOT NULL),
  UNIQUE(user_id,idempotency_key)
);

CREATE TABLE tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  room_id uuid NOT NULL REFERENCES rooms(id),
  contract_id uuid REFERENCES contracts(id),
  category_code text NOT NULL CHECK(category_code IN ('ELECTRICITY','WATER','INTERNET','OTHER')),
  reported_by uuid NOT NULL REFERENCES users(id),
  assigned_to uuid REFERENCES users(id),
  title text NOT NULL,
  description text NOT NULL,
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','accepted','in_progress','waiting','resolved','closed')),
  due_at timestamptz NOT NULL,
  waiting_reason text,
  resolution_notes text,
  resolved_at timestamptz,
  closed_at timestamptz,
  attachment_file_ids jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(attachment_file_ids)='array'),
  messages jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(messages)='array'),
  history jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(history)='array'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status<>'waiting' OR nullif(btrim(waiting_reason),'') IS NOT NULL),
  CHECK (status NOT IN ('resolved','closed') OR nullif(btrim(resolution_notes),'') IS NOT NULL)
);

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES users(id),
  event_key text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  UNIQUE (recipient_id,event_key)
);
ALTER TABLE users ADD FOREIGN KEY(avatar_file_id) REFERENCES files(id);
ALTER TABLE bookings ADD FOREIGN KEY(contract_id) REFERENCES contracts(id);
CREATE UNIQUE INDEX users_email_unique ON users(lower(btrim(email))) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX users_one_admin ON users(role) WHERE role='admin';
CREATE INDEX users_profile_idx ON users(role,phone,lower(display_name));
CREATE INDEX auth_tokens_user_idx ON auth_tokens(user_id,kind);
CREATE UNIQUE INDEX rooms_code_unique ON rooms(property_id,lower(code));
CREATE INDEX rooms_search_idx ON rooms(property_id,operating_status,listing_status);
CREATE INDEX rooms_amenities_idx ON rooms USING gin(amenities);
CREATE UNIQUE INDEX bookings_one_open_viewing ON bookings(user_id,room_id) WHERE(kind='viewing' AND status NOT IN ('converted','rejected','cancelled'));
CREATE UNIQUE INDEX bookings_one_pending_request ON bookings(user_id,kind,coalesce(contract_id,'00000000-0000-0000-0000-000000000000'::uuid)) WHERE(kind<>'viewing' AND status='pending');
CREATE INDEX bookings_queue_idx ON bookings(kind,status,preferred_viewing_at);
CREATE INDEX contracts_customer_idx ON contracts(user_id,status);
CREATE INDEX contracts_expiry_idx ON contracts(ends_on) WHERE status='active';
CREATE UNIQUE INDEX invoices_one_final ON invoices(contract_id) WHERE(kind='final' AND status<>'void');
CREATE UNIQUE INDEX invoices_one_month ON invoices(contract_id,period_id) WHERE(kind='periodic' AND status<>'void');
CREATE INDEX invoices_due_idx ON invoices(status,due_on);
CREATE INDEX invoices_period_idx ON invoices(period_id,status);
CREATE UNIQUE INDEX payments_bank_reference ON payments(lower(btrim(external_reference))) WHERE(kind IN ('receipt','deposit_receipt') AND method='bank_transfer' AND status<>'rejected');
CREATE INDEX payments_customer_idx ON payments(user_id,status,received_at);
CREATE INDEX payments_contract_idx ON payments(contract_id,kind);
CREATE INDEX payments_reversal_idx ON payments(reverses_id);
CREATE INDEX tickets_inbox_idx ON tickets(status,due_at);
CREATE INDEX tickets_customer_idx ON tickets(reported_by,contract_id);
CREATE INDEX notifications_recipient_idx ON notifications(recipient_id,created_at DESC);
COMMENT ON TABLE users IS 'Tài khoản và toàn bộ hồ sơ khách, kể cả khách chưa kích hoạt đăng nhập.';
COMMENT ON TABLE auth_tokens IS 'Phiên đăng nhập, đặt lại mật khẩu và lời mời; chỉ lưu hash token.';
COMMENT ON TABLE files IS 'Metadata tệp dùng chung; nội dung nhị phân ở storage.';
COMMENT ON TABLE settings IS 'Cấu hình thương hiệu, lịch nhắc và ngân hàng mặc định.';
COMMENT ON TABLE properties IS 'Cơ sở, danh mục tiện ích và bảng giá mặc định dạng JSONB.';
COMMENT ON TABLE rooms IS 'Phòng cùng tin đăng, tiện ích, ảnh, giá riêng và lịch sử trạng thái.';
COMMENT ON TABLE bookings IS 'Yêu cầu, lịch xem, giữ chỗ và đề nghị của khách, phân biệt bằng kind.';
COMMENT ON TABLE contracts IS 'Một hồ sơ thuê và hợp đồng; chứa gia hạn, bản ký, người ở cùng, bàn giao.';
COMMENT ON TABLE billing_periods IS 'Kỳ tháng theo cơ sở và trạng thái khóa, kể cả tháng chưa có hóa đơn.';
COMMENT ON TABLE invoices IS 'Hóa đơn cùng chỉ số điện nước, lịch sử sửa số và toàn bộ dòng tính tiền.';
COMMENT ON TABLE payments IS 'Sổ thanh toán và cọc; phân bổ vào hóa đơn nằm trong JSONB.';
COMMENT ON TABLE tickets IS 'Sự cố cùng loại, tệp, hội thoại và tiến độ trong một bảng.';
COMMENT ON TABLE notifications IS 'Thông báo và trạng thái đọc theo tài khoản.';
COMMIT;
