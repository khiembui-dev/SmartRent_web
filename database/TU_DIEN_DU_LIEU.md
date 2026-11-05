# Từ điển database hiện tại

Sinh trực tiếp từ PostgreSQL: 13 bảng, 9 view. Đơn vị tiền VND (numeric nguyên), chỉ số điện nước có 3 chữ số thập phân.

## auth_tokens

Phiên đăng nhập, đặt lại mật khẩu và lời mời; chỉ lưu hash token.

| Cột | Kiểu | Null | Mặc định / công thức |
|---|---|---|---|
| `id` | `uuid` | Không | gen_random_uuid() |
| `user_id` | `uuid` | Không | — |
| `kind` | `text` | Không | — |
| `token_hash` | `text` | Không | — |
| `created_at` | `timestamp with time zone` | Không | now() |
| `expires_at` | `timestamp with time zone` | Không | — |
| `consumed_at` | `timestamp with time zone` | Có | — |
| `revoked_at` | `timestamp with time zone` | Có | — |
| `user_agent` | `text` | Có | — |
| `ip_address` | `inet` | Có | — |

Ràng buộc:

- `CHECK ((expires_at > created_at))`
- `CHECK ((kind = ANY (ARRAY['session'::text, 'password_reset'::text, 'invitation'::text])))`
- `PRIMARY KEY (id)`
- `CHECK ((length(token_hash) >= 32))`
- `UNIQUE (token_hash)`
- `FOREIGN KEY (user_id) REFERENCES smartrent.users(id)`

Chỉ mục:

- `CREATE UNIQUE INDEX auth_tokens_pkey ON smartrent.auth_tokens USING btree (id)`
- `CREATE UNIQUE INDEX auth_tokens_token_hash_key ON smartrent.auth_tokens USING btree (token_hash)`
- `CREATE INDEX auth_tokens_user_idx ON smartrent.auth_tokens USING btree (user_id, kind)`

## billing_periods

Kỳ tháng theo cơ sở và trạng thái khóa, kể cả tháng chưa có hóa đơn.

| Cột | Kiểu | Null | Mặc định / công thức |
|---|---|---|---|
| `id` | `uuid` | Không | gen_random_uuid() |
| `property_id` | `uuid` | Không | — |
| `month_start` | `date` | Không | — |
| `status` | `text` | Không | 'open'::text |
| `locked_at` | `timestamp with time zone` | Có | — |
| `locked_by` | `uuid` | Có | — |
| `unlock_reason` | `text` | Có | — |
| `history` | `jsonb` | Không | '[]'::jsonb |
| `created_at` | `timestamp with time zone` | Không | now() |

Ràng buộc:

- `CHECK (((status = 'locked'::text) = ((locked_at IS NOT NULL) AND (locked_by IS NOT NULL))))`
- `CHECK ((jsonb_typeof(history) = 'array'::text))`
- `FOREIGN KEY (locked_by) REFERENCES smartrent.users(id)`
- `CHECK ((EXTRACT(day FROM month_start) = (1)::numeric))`
- `PRIMARY KEY (id)`
- `FOREIGN KEY (property_id) REFERENCES smartrent.properties(id)`
- `UNIQUE (property_id, month_start)`
- `CHECK ((status = ANY (ARRAY['open'::text, 'locked'::text])))`

Chỉ mục:

- `CREATE UNIQUE INDEX billing_periods_pkey ON smartrent.billing_periods USING btree (id)`
- `CREATE UNIQUE INDEX billing_periods_property_id_month_start_key ON smartrent.billing_periods USING btree (property_id, month_start)`

## bookings

Yêu cầu, lịch xem, giữ chỗ và đề nghị của khách, phân biệt bằng kind.

| Cột | Kiểu | Null | Mặc định / công thức |
|---|---|---|---|
| `id` | `uuid` | Không | gen_random_uuid() |
| `code` | `text` | Không | — |
| `user_id` | `uuid` | Không | — |
| `room_id` | `uuid` | Có | — |
| `contract_id` | `uuid` | Có | — |
| `kind` | `text` | Không | 'viewing'::text |
| `status` | `text` | Không | 'new'::text |
| `contact_name` | `text` | Có | — |
| `phone` | `text` | Có | — |
| `email` | `text` | Có | — |
| `occupants` | `smallint` | Có | — |
| `preferred_viewing_at` | `timestamp with time zone` | Có | — |
| `desired_on` | `date` | Có | — |
| `message` | `text` | Có | — |
| `changes` | `jsonb` | Không | '{}'::jsonb |
| `appointments` | `jsonb` | Không | '[]'::jsonb |
| `hold_status` | `text` | Có | — |
| `hold_from` | `date` | Có | — |
| `hold_to` | `date` | Có | — |
| `hold_expires_at` | `timestamp with time zone` | Có | — |
| `hold_reason` | `text` | Có | — |
| `reviewed_by` | `uuid` | Có | — |
| `reviewed_at` | `timestamp with time zone` | Có | — |
| `decision_notes` | `text` | Có | — |
| `history` | `jsonb` | Không | '[]'::jsonb |
| `created_at` | `timestamp with time zone` | Không | now() |
| `updated_at` | `timestamp with time zone` | Không | now() |

Ràng buộc:

- `CHECK ((jsonb_typeof(appointments) = 'array'::text))`
- `CHECK ((jsonb_typeof(changes) = 'object'::text))`
- `CHECK ((((kind = 'viewing'::text) AND (room_id IS NOT NULL) AND (contract_id IS NULL) AND (occupants IS NOT NULL) AND (contact_name IS NOT NULL)) OR ((kind = 'profile_change'::text) AND (contract_id IS NULL) AND (changes <> '{}'::jsonb)) OR ((kind = ANY (ARRAY['renewal'::text, 'checkout'::text, 'transfer'::text])) AND (contract_id IS NOT NULL) AND (desired_on IS NOT NULL))))`
- `CHECK (((hold_status IS NULL) OR ((kind = 'viewing'::text) AND (hold_from IS NOT NULL) AND (hold_expires_at IS NOT NULL))))`
- `CHECK (((hold_to IS NULL) OR (hold_to > hold_from)))`
- `CHECK (((reviewed_at IS NULL) = (reviewed_by IS NULL)))`
- `CHECK (((status <> 'rejected'::text) OR (NULLIF(btrim(decision_notes), ''::text) IS NOT NULL)))`
- `UNIQUE (code)`
- `FOREIGN KEY (contract_id) REFERENCES smartrent.contracts(id)`
- `CHECK ((jsonb_typeof(history) = 'array'::text))`
- `CHECK ((hold_status = ANY (ARRAY['holding'::text, 'converted'::text, 'cancelled'::text, 'expired'::text])))`
- `CHECK ((kind = ANY (ARRAY['viewing'::text, 'profile_change'::text, 'renewal'::text, 'checkout'::text, 'transfer'::text])))`
- `CHECK (((occupants >= 1) AND (occupants <= 20)))`
- `PRIMARY KEY (id)`
- `FOREIGN KEY (reviewed_by) REFERENCES smartrent.users(id)`
- `EXCLUDE USING gist (room_id WITH =, daterange(hold_from, hold_to, '[)'::text) WITH &&) WHERE ((hold_status = 'holding'::text))`
- `FOREIGN KEY (room_id) REFERENCES smartrent.rooms(id)`
- `CHECK ((status = ANY (ARRAY['new'::text, 'accepted'::text, 'consulting'::text, 'scheduled'::text, 'completed'::text, 'no_show'::text, 'pending'::text, 'approved'::text, 'converted'::text, 'rejected'::text, 'cancelled'::text])))`
- `FOREIGN KEY (user_id) REFERENCES smartrent.users(id)`

Chỉ mục:

- `CREATE UNIQUE INDEX bookings_pkey ON smartrent.bookings USING btree (id)`
- `CREATE UNIQUE INDEX bookings_code_key ON smartrent.bookings USING btree (code)`
- `CREATE INDEX bookings_room_id_daterange_excl ON smartrent.bookings USING gist (room_id, daterange(hold_from, hold_to, '[)'::text)) WHERE (hold_status = 'holding'::text)`
- `CREATE UNIQUE INDEX bookings_one_open_viewing ON smartrent.bookings USING btree (user_id, room_id) WHERE ((kind = 'viewing'::text) AND (status <> ALL (ARRAY['converted'::text, 'rejected'::text, 'cancelled'::text])))`
- `CREATE UNIQUE INDEX bookings_one_pending_request ON smartrent.bookings USING btree (user_id, kind, COALESCE(contract_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE ((kind <> 'viewing'::text) AND (status = 'pending'::text))`
- `CREATE INDEX bookings_queue_idx ON smartrent.bookings USING btree (kind, status, preferred_viewing_at)`

## contracts

Một hồ sơ thuê và hợp đồng; chứa gia hạn, bản ký, người ở cùng, bàn giao.

| Cột | Kiểu | Null | Mặc định / công thức |
|---|---|---|---|
| `id` | `uuid` | Không | gen_random_uuid() |
| `code` | `text` | Không | — |
| `room_id` | `uuid` | Không | — |
| `user_id` | `uuid` | Không | — |
| `booking_id` | `uuid` | Có | — |
| `status` | `text` | Không | 'active'::text |
| `onboarding_mode` | `text` | Không | 'new'::text |
| `starts_on` | `date` | Không | — |
| `move_in_on` | `date` | Có | — |
| `move_out_on` | `date` | Có | — |
| `ends_on` | `date` | Có | — |
| `required_deposit` | `numeric(16,0)` | Không | 0 |
| `versions` | `jsonb` | Không | '[]'::jsonb |
| `attachments` | `jsonb` | Không | '[]'::jsonb |
| `occupants` | `jsonb` | Không | '[]'::jsonb |
| `initial_readings` | `jsonb` | Không | '{}'::jsonb |
| `final_readings` | `jsonb` | Không | '{}'::jsonb |
| `checkin_handover` | `jsonb` | Không | '{}'::jsonb |
| `checkout_handover` | `jsonb` | Không | '{}'::jsonb |
| `checkout_summary` | `jsonb` | Không | '{}'::jsonb |
| `onboarding_gaps` | `jsonb` | Không | '[]'::jsonb |
| `ended_reason` | `text` | Có | — |
| `remaining_debt_reason` | `text` | Có | — |
| `archived_at` | `timestamp with time zone` | Có | — |
| `created_at` | `timestamp with time zone` | Không | now() |
| `updated_at` | `timestamp with time zone` | Không | now() |

Ràng buộc:

- `TRIGGER DEFERRABLE INITIALLY DEFERRED`
- `CHECK ((jsonb_typeof(attachments) = 'array'::text))`
- `FOREIGN KEY (booking_id) REFERENCES smartrent.bookings(id)`
- `UNIQUE (booking_id)`
- `CHECK (((ends_on IS NULL) OR (ends_on > starts_on)))`
- `CHECK (((move_in_on IS NULL) OR (move_in_on >= starts_on)))`
- `CHECK (((move_out_on IS NULL) OR (move_out_on > COALESCE(move_in_on, starts_on))))`
- `CHECK (((status <> 'active'::text) OR ((move_in_on IS NOT NULL) AND (move_out_on IS NULL))))`
- `CHECK (((status <> 'ended'::text) OR ((move_out_on IS NOT NULL) AND (NULLIF(btrim(ended_reason), ''::text) IS NOT NULL))))`
- `CHECK ((jsonb_typeof(checkin_handover) = 'object'::text))`
- `CHECK ((jsonb_typeof(checkout_handover) = 'object'::text))`
- `CHECK ((jsonb_typeof(checkout_summary) = 'object'::text))`
- `UNIQUE (code)`
- `CHECK ((jsonb_typeof(final_readings) = 'object'::text))`
- `CHECK ((jsonb_typeof(initial_readings) = 'object'::text))`
- `CHECK ((jsonb_typeof(occupants) = 'array'::text))`
- `CHECK ((jsonb_typeof(onboarding_gaps) = 'array'::text))`
- `CHECK ((onboarding_mode = ANY (ARRAY['new'::text, 'import'::text])))`
- `PRIMARY KEY (id)`
- `CHECK ((required_deposit >= (0)::numeric))`
- `EXCLUDE USING gist (room_id WITH =, daterange(starts_on, move_out_on, '[)'::text) WITH &&) WHERE ((status <> 'cancelled'::text))`
- `FOREIGN KEY (room_id) REFERENCES smartrent.rooms(id)`
- `CHECK ((status = ANY (ARRAY['planned'::text, 'active'::text, 'ended'::text, 'cancelled'::text])))`
- `FOREIGN KEY (user_id) REFERENCES smartrent.users(id)`
- `CHECK ((jsonb_typeof(versions) = 'array'::text))`

Chỉ mục:

- `CREATE UNIQUE INDEX contracts_pkey ON smartrent.contracts USING btree (id)`
- `CREATE UNIQUE INDEX contracts_code_key ON smartrent.contracts USING btree (code)`
- `CREATE UNIQUE INDEX contracts_booking_id_key ON smartrent.contracts USING btree (booking_id)`
- `CREATE INDEX contracts_room_id_daterange_excl ON smartrent.contracts USING gist (room_id, daterange(starts_on, move_out_on, '[)'::text)) WHERE (status <> 'cancelled'::text)`
- `CREATE INDEX contracts_customer_idx ON smartrent.contracts USING btree (user_id, status)`
- `CREATE INDEX contracts_expiry_idx ON smartrent.contracts USING btree (ends_on) WHERE (status = 'active'::text)`

## files

Metadata tệp dùng chung; nội dung nhị phân ở storage.

| Cột | Kiểu | Null | Mặc định / công thức |
|---|---|---|---|
| `id` | `uuid` | Không | gen_random_uuid() |
| `uploaded_by` | `uuid` | Có | — |
| `storage_key` | `text` | Không | — |
| `file_name` | `text` | Không | — |
| `content_type` | `text` | Không | — |
| `byte_size` | `bigint` | Không | — |
| `visibility` | `text` | Không | 'private'::text |
| `purpose` | `text` | Không | — |
| `scan_status` | `text` | Không | 'pending'::text |
| `sha256` | `text` | Có | — |
| `created_at` | `timestamp with time zone` | Không | now() |

Ràng buộc:

- `CHECK ((byte_size >= 0))`
- `PRIMARY KEY (id)`
- `CHECK ((purpose = ANY (ARRAY['avatar'::text, 'room_image'::text, 'contract_signed'::text, 'contract_attachment'::text, 'payment_proof'::text, 'ticket'::text, 'other'::text])))`
- `CHECK ((scan_status = ANY (ARRAY['pending'::text, 'clean'::text, 'rejected'::text, 'missing'::text])))`
- `UNIQUE (storage_key)`
- `FOREIGN KEY (uploaded_by) REFERENCES smartrent.users(id)`
- `CHECK ((visibility = ANY (ARRAY['public'::text, 'private'::text])))`

Chỉ mục:

- `CREATE UNIQUE INDEX files_pkey ON smartrent.files USING btree (id)`
- `CREATE UNIQUE INDEX files_storage_key_key ON smartrent.files USING btree (storage_key)`

## invoices

Hóa đơn cùng chỉ số điện nước, lịch sử sửa số và toàn bộ dòng tính tiền.

| Cột | Kiểu | Null | Mặc định / công thức |
|---|---|---|---|
| `id` | `uuid` | Không | gen_random_uuid() |
| `code` | `text` | Có | — |
| `contract_id` | `uuid` | Không | — |
| `period_id` | `uuid` | Có | — |
| `kind` | `text` | Không | 'periodic'::text |
| `adjusts_invoice_id` | `uuid` | Có | — |
| `metered_only` | `boolean` | Không | false |
| `status` | `text` | Không | 'draft'::text |
| `service_from` | `date` | Không | — |
| `service_to` | `date` | Không | — |
| `electricity_start` | `numeric(16,3)` | Có | — |
| `electricity_end` | `numeric(16,3)` | Có | — |
| `electricity_from_at` | `timestamp with time zone` | Có | — |
| `electricity_to_at` | `timestamp with time zone` | Có | — |
| `water_start` | `numeric(16,3)` | Có | — |
| `water_end` | `numeric(16,3)` | Có | — |
| `water_from_at` | `timestamp with time zone` | Có | — |
| `water_to_at` | `timestamp with time zone` | Có | — |
| `readings_history` | `jsonb` | Không | '[]'::jsonb |
| `correction_reason` | `text` | Có | — |
| `lines` | `jsonb` | Không | '[]'::jsonb |
| `total_amount` | `numeric(16,0)` | Có | smartrent.invoice_total(lines) |
| `customer_snapshot` | `jsonb` | Không | '{}'::jsonb |
| `issued_on` | `date` | Có | — |
| `due_on` | `date` | Có | — |
| `issued_by` | `uuid` | Có | — |
| `issued_at` | `timestamp with time zone` | Có | — |
| `voided_at` | `timestamp with time zone` | Có | — |
| `void_reason` | `text` | Có | — |
| `notes` | `text` | Có | — |
| `idempotency_key` | `text` | Có | — |
| `request_hash` | `text` | Có | — |
| `created_at` | `timestamp with time zone` | Không | now() |

Ràng buộc:

- `TRIGGER DEFERRABLE INITIALLY DEFERRED`
- `FOREIGN KEY (adjusts_invoice_id) REFERENCES smartrent.invoices(id)`
- `CHECK ((service_to > service_from))`
- `CHECK (((kind = ANY (ARRAY['debit_adjustment'::text, 'credit_adjustment'::text])) = (adjusts_invoice_id IS NOT NULL)))`
- `CHECK (((kind <> 'periodic'::text) OR (period_id IS NOT NULL)))`
- `CHECK (((NOT metered_only) OR (kind = 'final'::text)))`
- `CHECK (((electricity_end IS NULL) OR ((electricity_start IS NOT NULL) AND (electricity_end >= electricity_start) AND (electricity_from_at IS NOT NULL) AND (electricity_to_at IS NOT NULL) AND (electricity_to_at > electricity_from_at))))`
- `CHECK (((water_end IS NULL) OR ((water_start IS NOT NULL) AND (water_end >= water_start) AND (water_from_at IS NOT NULL) AND (water_to_at IS NOT NULL) AND (water_to_at > water_from_at))))`
- `CHECK (((status = 'draft'::text) OR ((code IS NOT NULL) AND (issued_on IS NOT NULL) AND (due_on IS NOT NULL) AND (due_on >= issued_on) AND (issued_at IS NOT NULL) AND (issued_by IS NOT NULL))))`
- `CHECK (((status <> 'void'::text) OR ((voided_at IS NOT NULL) AND (NULLIF(btrim(void_reason), ''::text) IS NOT NULL))))`
- `CHECK (((idempotency_key IS NULL) OR (request_hash IS NOT NULL)))`
- `UNIQUE (code)`
- `EXCLUDE USING gist (contract_id WITH =, daterange(service_from, service_to, '[)'::text) WITH &&) WHERE (((status <> 'void'::text) AND (kind = ANY (ARRAY['periodic'::text, 'final'::text])) AND (NOT metered_only)))`
- `FOREIGN KEY (contract_id) REFERENCES smartrent.contracts(id)`
- `CHECK ((jsonb_typeof(customer_snapshot) = 'object'::text))`
- `CHECK (((electricity_start IS NULL) OR (electricity_start >= (0)::numeric)))`
- `UNIQUE (idempotency_key)`
- `FOREIGN KEY (issued_by) REFERENCES smartrent.users(id)`
- `CHECK ((kind = ANY (ARRAY['periodic'::text, 'final'::text, 'opening_balance'::text, 'debit_adjustment'::text, 'credit_adjustment'::text])))`
- `CHECK ((jsonb_typeof(lines) = 'array'::text))`
- `FOREIGN KEY (period_id) REFERENCES smartrent.billing_periods(id)`
- `PRIMARY KEY (id)`
- `CHECK ((jsonb_typeof(readings_history) = 'array'::text))`
- `CHECK ((status = ANY (ARRAY['draft'::text, 'issued'::text, 'void'::text])))`
- `CHECK (((water_start IS NULL) OR (water_start >= (0)::numeric)))`

Chỉ mục:

- `CREATE UNIQUE INDEX invoices_pkey ON smartrent.invoices USING btree (id)`
- `CREATE UNIQUE INDEX invoices_code_key ON smartrent.invoices USING btree (code)`
- `CREATE UNIQUE INDEX invoices_idempotency_key_key ON smartrent.invoices USING btree (idempotency_key)`
- `CREATE INDEX invoices_contract_id_daterange_excl ON smartrent.invoices USING gist (contract_id, daterange(service_from, service_to, '[)'::text)) WHERE ((status <> 'void'::text) AND (kind = ANY (ARRAY['periodic'::text, 'final'::text])) AND (NOT metered_only))`
- `CREATE UNIQUE INDEX invoices_one_final ON smartrent.invoices USING btree (contract_id) WHERE ((kind = 'final'::text) AND (status <> 'void'::text))`
- `CREATE UNIQUE INDEX invoices_one_month ON smartrent.invoices USING btree (contract_id, period_id) WHERE ((kind = 'periodic'::text) AND (status <> 'void'::text))`
- `CREATE INDEX invoices_due_idx ON smartrent.invoices USING btree (status, due_on)`
- `CREATE INDEX invoices_period_idx ON smartrent.invoices USING btree (period_id, status)`

## notifications

Thông báo và trạng thái đọc theo tài khoản.

| Cột | Kiểu | Null | Mặc định / công thức |
|---|---|---|---|
| `id` | `uuid` | Không | gen_random_uuid() |
| `recipient_id` | `uuid` | Không | — |
| `event_key` | `text` | Không | — |
| `title` | `text` | Không | — |
| `body` | `text` | Không | — |
| `url` | `text` | Có | — |
| `created_at` | `timestamp with time zone` | Không | now() |
| `read_at` | `timestamp with time zone` | Có | — |

Ràng buộc:

- `PRIMARY KEY (id)`
- `UNIQUE (recipient_id, event_key)`
- `FOREIGN KEY (recipient_id) REFERENCES smartrent.users(id)`

Chỉ mục:

- `CREATE UNIQUE INDEX notifications_pkey ON smartrent.notifications USING btree (id)`
- `CREATE UNIQUE INDEX notifications_recipient_id_event_key_key ON smartrent.notifications USING btree (recipient_id, event_key)`
- `CREATE INDEX notifications_recipient_idx ON smartrent.notifications USING btree (recipient_id, created_at DESC)`

## payments

Sổ thanh toán và cọc; phân bổ vào hóa đơn nằm trong JSONB.

| Cột | Kiểu | Null | Mặc định / công thức |
|---|---|---|---|
| `id` | `uuid` | Không | gen_random_uuid() |
| `code` | `text` | Không | — |
| `user_id` | `uuid` | Không | — |
| `contract_id` | `uuid` | Có | — |
| `intended_invoice_id` | `uuid` | Có | — |
| `kind` | `text` | Không | 'receipt'::text |
| `reverses_id` | `uuid` | Có | — |
| `status` | `text` | Không | 'pending'::text |
| `amount` | `numeric(16,0)` | Không | — |
| `method` | `text` | Có | — |
| `external_reference` | `text` | Có | — |
| `allocations` | `jsonb` | Không | '[]'::jsonb |
| `proof_file_ids` | `jsonb` | Không | '[]'::jsonb |
| `submitted_by` | `uuid` | Có | — |
| `confirmed_by` | `uuid` | Có | — |
| `confirmed_at` | `timestamp with time zone` | Có | — |
| `reason` | `text` | Có | — |
| `notes` | `text` | Có | — |
| `received_at` | `timestamp with time zone` | Không | now() |
| `idempotency_key` | `text` | Có | — |
| `request_hash` | `text` | Có | — |
| `created_at` | `timestamp with time zone` | Không | now() |

Ràng buộc:

- `TRIGGER DEFERRABLE INITIALLY DEFERRED`
- `CHECK ((jsonb_typeof(allocations) = 'array'::text))`
- `CHECK ((amount > (0)::numeric))`
- `CHECK (((kind !~~ 'deposit_%'::text) OR (contract_id IS NOT NULL)))`
- `CHECK (((kind = ANY (ARRAY['receipt_reversal'::text, 'deposit_offset_reversal'::text])) = (reverses_id IS NOT NULL)))`
- `CHECK (((status = 'confirmed'::text) = ((confirmed_at IS NOT NULL) AND (confirmed_by IS NOT NULL))))`
- `CHECK (((kind <> ALL (ARRAY['receipt_reversal'::text, 'deposit_refund'::text, 'deposit_offset'::text, 'deposit_offset_reversal'::text])) OR (status = 'confirmed'::text)))`
- `CHECK (((kind <> ALL (ARRAY['receipt_reversal'::text, 'deposit_refund'::text, 'deposit_offset_reversal'::text])) OR (NULLIF(btrim(reason), ''::text) IS NOT NULL)))`
- `CHECK (((status <> 'rejected'::text) OR (NULLIF(btrim(reason), ''::text) IS NOT NULL)))`
- `CHECK (((kind = ANY (ARRAY['deposit_offset'::text, 'deposit_offset_reversal'::text])) = (method IS NULL)))`
- `CHECK (((method IS DISTINCT FROM 'bank_transfer'::text) OR (NULLIF(btrim(external_reference), ''::text) IS NOT NULL)))`
- `CHECK (((idempotency_key IS NULL) OR (request_hash IS NOT NULL)))`
- `UNIQUE (code)`
- `FOREIGN KEY (confirmed_by) REFERENCES smartrent.users(id)`
- `FOREIGN KEY (contract_id) REFERENCES smartrent.contracts(id)`
- `FOREIGN KEY (intended_invoice_id) REFERENCES smartrent.invoices(id)`
- `CHECK ((kind = ANY (ARRAY['receipt'::text, 'receipt_reversal'::text, 'deposit_receipt'::text, 'deposit_refund'::text, 'deposit_offset'::text, 'deposit_offset_reversal'::text])))`
- `CHECK ((method = ANY (ARRAY['cash'::text, 'bank_transfer'::text])))`
- `PRIMARY KEY (id)`
- `CHECK ((jsonb_typeof(proof_file_ids) = 'array'::text))`
- `FOREIGN KEY (reverses_id) REFERENCES smartrent.payments(id)`
- `CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'rejected'::text])))`
- `FOREIGN KEY (submitted_by) REFERENCES smartrent.users(id)`
- `FOREIGN KEY (user_id) REFERENCES smartrent.users(id)`
- `UNIQUE (user_id, idempotency_key)`

Chỉ mục:

- `CREATE UNIQUE INDEX payments_pkey ON smartrent.payments USING btree (id)`
- `CREATE UNIQUE INDEX payments_code_key ON smartrent.payments USING btree (code)`
- `CREATE UNIQUE INDEX payments_user_id_idempotency_key_key ON smartrent.payments USING btree (user_id, idempotency_key)`
- `CREATE UNIQUE INDEX payments_bank_reference ON smartrent.payments USING btree (lower(btrim(external_reference))) WHERE ((kind = ANY (ARRAY['receipt'::text, 'deposit_receipt'::text])) AND (method = 'bank_transfer'::text) AND (status <> 'rejected'::text))`
- `CREATE INDEX payments_customer_idx ON smartrent.payments USING btree (user_id, status, received_at)`
- `CREATE INDEX payments_contract_idx ON smartrent.payments USING btree (contract_id, kind)`
- `CREATE INDEX payments_reversal_idx ON smartrent.payments USING btree (reverses_id)`

## properties

Cơ sở, danh mục tiện ích và bảng giá mặc định dạng JSONB.

| Cột | Kiểu | Null | Mặc định / công thức |
|---|---|---|---|
| `id` | `uuid` | Không | gen_random_uuid() |
| `code` | `text` | Không | — |
| `name` | `text` | Không | — |
| `address_line` | `text` | Không | — |
| `locality` | `text` | Có | — |
| `province` | `text` | Không | — |
| `description` | `text` | Có | — |
| `is_active` | `boolean` | Không | true |
| `inactive_reason` | `text` | Có | — |
| `invoice_day` | `smallint` | Không | 1 |
| `due_after_days` | `smallint` | Không | 5 |
| `proration_policy` | `text` | Không | 'actual_days'::text |
| `amenity_options` | `jsonb` | Không | '[]'::jsonb |
| `rates` | `jsonb` | Không | '[]'::jsonb |
| `created_at` | `timestamp with time zone` | Không | now() |
| `updated_at` | `timestamp with time zone` | Không | now() |

Ràng buộc:

- `CHECK ((jsonb_typeof(amenity_options) = 'array'::text))`
- `CHECK ((is_active OR (NULLIF(btrim(inactive_reason), ''::text) IS NOT NULL)))`
- `UNIQUE (code)`
- `CHECK (((due_after_days >= 0) AND (due_after_days <= 365)))`
- `CHECK (((invoice_day >= 1) AND (invoice_day <= 31)))`
- `CHECK ((btrim(name) <> ''::text))`
- `PRIMARY KEY (id)`
- `CHECK ((proration_policy = ANY (ARRAY['actual_days'::text, 'full_month'::text])))`
- `CHECK ((jsonb_typeof(rates) = 'array'::text))`

Chỉ mục:

- `CREATE UNIQUE INDEX properties_pkey ON smartrent.properties USING btree (id)`
- `CREATE UNIQUE INDEX properties_code_key ON smartrent.properties USING btree (code)`

## rooms

Phòng cùng tin đăng, tiện ích, ảnh, giá riêng và lịch sử trạng thái.

| Cột | Kiểu | Null | Mặc định / công thức |
|---|---|---|---|
| `id` | `uuid` | Không | gen_random_uuid() |
| `property_id` | `uuid` | Không | — |
| `code` | `text` | Không | — |
| `name` | `text` | Không | — |
| `floor_label` | `text` | Có | — |
| `area_m2` | `numeric(7,2)` | Không | — |
| `capacity` | `smallint` | Không | — |
| `room_type_code` | `text` | Không | 'STANDARD'::text |
| `room_type_name` | `text` | Không | 'Phòng tiêu chuẩn'::text |
| `description` | `text` | Có | — |
| `rules_text` | `text` | Có | — |
| `required_deposit` | `numeric(16,0)` | Không | 0 |
| `operating_status` | `text` | Không | 'available'::text |
| `status_reason` | `text` | Có | — |
| `listing_slug` | `text` | Có | — |
| `listing_title` | `text` | Có | — |
| `listing_description` | `text` | Có | — |
| `listing_status` | `text` | Không | 'hidden'::text |
| `video_url` | `text` | Có | — |
| `published_at` | `timestamp with time zone` | Có | — |
| `amenities` | `jsonb` | Không | '[]'::jsonb |
| `images` | `jsonb` | Không | '[]'::jsonb |
| `rates` | `jsonb` | Không | '[]'::jsonb |
| `status_history` | `jsonb` | Không | '[]'::jsonb |
| `created_at` | `timestamp with time zone` | Không | now() |
| `updated_at` | `timestamp with time zone` | Không | now() |

Ràng buộc:

- `CHECK ((jsonb_typeof(amenities) = 'array'::text))`
- `CHECK (((area_m2 >= (1)::numeric) AND (area_m2 <= (500)::numeric)))`
- `CHECK (((capacity >= 1) AND (capacity <= 20)))`
- `CHECK (((listing_status <> 'published'::text) OR ((listing_slug IS NOT NULL) AND (listing_title IS NOT NULL) AND (published_at IS NOT NULL))))`
- `CHECK ((code ~ '^[A-Za-z0-9-]{1,20}$'::text))`
- `CHECK ((jsonb_typeof(images) = 'array'::text))`
- `UNIQUE (listing_slug)`
- `CHECK ((listing_status = ANY (ARRAY['hidden'::text, 'draft'::text, 'published'::text])))`
- `CHECK ((operating_status = ANY (ARRAY['available'::text, 'maintenance'::text, 'inactive'::text])))`
- `PRIMARY KEY (id)`
- `FOREIGN KEY (property_id) REFERENCES smartrent.properties(id)`
- `CHECK ((jsonb_typeof(rates) = 'array'::text))`
- `CHECK ((required_deposit >= (0)::numeric))`
- `CHECK ((jsonb_typeof(status_history) = 'array'::text))`

Chỉ mục:

- `CREATE UNIQUE INDEX rooms_pkey ON smartrent.rooms USING btree (id)`
- `CREATE UNIQUE INDEX rooms_listing_slug_key ON smartrent.rooms USING btree (listing_slug)`
- `CREATE UNIQUE INDEX rooms_code_unique ON smartrent.rooms USING btree (property_id, lower(code))`
- `CREATE INDEX rooms_search_idx ON smartrent.rooms USING btree (property_id, operating_status, listing_status)`
- `CREATE INDEX rooms_amenities_idx ON smartrent.rooms USING gin (amenities)`

## settings

Cấu hình thương hiệu, lịch nhắc và ngân hàng mặc định.

| Cột | Kiểu | Null | Mặc định / công thức |
|---|---|---|---|
| `id` | `smallint` | Không | 1 |
| `business_name` | `text` | Không | 'SmartRent'::text |
| `meter_reading_day` | `smallint` | Không | 25 |
| `invoice_create_day` | `smallint` | Không | 28 |
| `reminder_enabled` | `boolean` | Không | true |
| `bank_name` | `text` | Có | — |
| `bank_account_number` | `text` | Có | — |
| `bank_account_name` | `text` | Có | — |
| `updated_at` | `timestamp with time zone` | Không | now() |
| `updated_by` | `uuid` | Có | — |

Ràng buộc:

- `CHECK ((invoice_create_day >= meter_reading_day))`
- `CHECK ((num_nonnulls(bank_name, bank_account_number, bank_account_name) = ANY (ARRAY[0, 3])))`
- `CHECK ((id = 1))`
- `CHECK (((invoice_create_day >= 1) AND (invoice_create_day <= 28)))`
- `CHECK (((meter_reading_day >= 1) AND (meter_reading_day <= 28)))`
- `PRIMARY KEY (id)`
- `FOREIGN KEY (updated_by) REFERENCES smartrent.users(id)`

Chỉ mục:

- `CREATE UNIQUE INDEX settings_pkey ON smartrent.settings USING btree (id)`

## tickets

Sự cố cùng loại, tệp, hội thoại và tiến độ trong một bảng.

| Cột | Kiểu | Null | Mặc định / công thức |
|---|---|---|---|
| `id` | `uuid` | Không | gen_random_uuid() |
| `code` | `text` | Không | — |
| `room_id` | `uuid` | Không | — |
| `contract_id` | `uuid` | Có | — |
| `category_code` | `text` | Không | — |
| `reported_by` | `uuid` | Không | — |
| `assigned_to` | `uuid` | Có | — |
| `title` | `text` | Không | — |
| `description` | `text` | Không | — |
| `priority` | `text` | Không | 'normal'::text |
| `status` | `text` | Không | 'new'::text |
| `due_at` | `timestamp with time zone` | Không | — |
| `waiting_reason` | `text` | Có | — |
| `resolution_notes` | `text` | Có | — |
| `resolved_at` | `timestamp with time zone` | Có | — |
| `closed_at` | `timestamp with time zone` | Có | — |
| `attachment_file_ids` | `jsonb` | Không | '[]'::jsonb |
| `messages` | `jsonb` | Không | '[]'::jsonb |
| `history` | `jsonb` | Không | '[]'::jsonb |
| `created_at` | `timestamp with time zone` | Không | now() |
| `updated_at` | `timestamp with time zone` | Không | now() |

Ràng buộc:

- `FOREIGN KEY (assigned_to) REFERENCES smartrent.users(id)`
- `CHECK ((jsonb_typeof(attachment_file_ids) = 'array'::text))`
- `CHECK ((category_code = ANY (ARRAY['ELECTRICITY'::text, 'WATER'::text, 'INTERNET'::text, 'OTHER'::text])))`
- `CHECK (((status <> 'waiting'::text) OR (NULLIF(btrim(waiting_reason), ''::text) IS NOT NULL)))`
- `CHECK (((status <> ALL (ARRAY['resolved'::text, 'closed'::text])) OR (NULLIF(btrim(resolution_notes), ''::text) IS NOT NULL)))`
- `UNIQUE (code)`
- `FOREIGN KEY (contract_id) REFERENCES smartrent.contracts(id)`
- `CHECK ((jsonb_typeof(history) = 'array'::text))`
- `CHECK ((jsonb_typeof(messages) = 'array'::text))`
- `PRIMARY KEY (id)`
- `CHECK ((priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text])))`
- `FOREIGN KEY (reported_by) REFERENCES smartrent.users(id)`
- `FOREIGN KEY (room_id) REFERENCES smartrent.rooms(id)`
- `CHECK ((status = ANY (ARRAY['new'::text, 'accepted'::text, 'in_progress'::text, 'waiting'::text, 'resolved'::text, 'closed'::text])))`

Chỉ mục:

- `CREATE UNIQUE INDEX tickets_pkey ON smartrent.tickets USING btree (id)`
- `CREATE UNIQUE INDEX tickets_code_key ON smartrent.tickets USING btree (code)`
- `CREATE INDEX tickets_inbox_idx ON smartrent.tickets USING btree (status, due_at)`
- `CREATE INDEX tickets_customer_idx ON smartrent.tickets USING btree (reported_by, contract_id)`

## users

Tài khoản và toàn bộ hồ sơ khách, kể cả khách chưa kích hoạt đăng nhập.

| Cột | Kiểu | Null | Mặc định / công thức |
|---|---|---|---|
| `id` | `uuid` | Không | gen_random_uuid() |
| `role` | `character varying(5)` | Không | 'user'::character varying |
| `email` | `text` | Có | — |
| `password_hash` | `text` | Có | — |
| `display_name` | `text` | Không | — |
| `code` | `text` | Có | — |
| `phone` | `text` | Có | — |
| `login_enabled` | `boolean` | Không | false |
| `date_of_birth` | `date` | Có | — |
| `address_line` | `text` | Có | — |
| `locality` | `text` | Có | — |
| `province` | `text` | Có | — |
| `emergency_contact_name` | `text` | Có | — |
| `emergency_contact_phone` | `text` | Có | — |
| `notes` | `text` | Có | — |
| `identity_documents` | `jsonb` | Không | '[]'::jsonb |
| `avatar_file_id` | `uuid` | Có | — |
| `is_active` | `boolean` | Không | true |
| `email_verified_at` | `timestamp with time zone` | Có | — |
| `accepted_terms_at` | `timestamp with time zone` | Có | — |
| `security_stamp` | `uuid` | Không | gen_random_uuid() |
| `failed_login_count` | `integer` | Không | 0 |
| `locked_until` | `timestamp with time zone` | Có | — |
| `last_login_at` | `timestamp with time zone` | Có | — |
| `created_at` | `timestamp with time zone` | Không | now() |
| `updated_at` | `timestamp with time zone` | Không | now() |

Ràng buộc:

- `FOREIGN KEY (avatar_file_id) REFERENCES smartrent.files(id)`
- `CHECK (((NOT login_enabled) OR ((email IS NOT NULL) AND (password_hash IS NOT NULL))))`
- `CHECK ((((role)::text <> 'admin'::text) OR login_enabled))`
- `UNIQUE (code)`
- `CHECK ((btrim(display_name) <> ''::text))`
- `CHECK (((email IS NULL) OR (btrim(email) <> ''::text)))`
- `CHECK ((failed_login_count >= 0))`
- `CHECK ((jsonb_typeof(identity_documents) = 'array'::text))`
- `CHECK (((password_hash IS NULL) OR (length(password_hash) >= 20)))`
- `PRIMARY KEY (id)`
- `CHECK (((role)::text = ANY ((ARRAY['admin'::character varying, 'user'::character varying])::text[])))`

Chỉ mục:

- `CREATE UNIQUE INDEX users_pkey ON smartrent.users USING btree (id)`
- `CREATE UNIQUE INDEX users_code_key ON smartrent.users USING btree (code)`
- `CREATE UNIQUE INDEX users_email_unique ON smartrent.users USING btree (lower(btrim(email))) WHERE (email IS NOT NULL)`
- `CREATE UNIQUE INDEX users_one_admin ON smartrent.users USING btree (role) WHERE ((role)::text = 'admin'::text)`
- `CREATE INDEX users_profile_idx ON smartrent.users USING btree (role, phone, lower(display_name))`

## Views

- `v_deposit_balances`
- `v_invoice_balances`
- `v_public_rooms`
- `v_room_occupancy`
- `v_user_bookings`
- `v_user_contracts`
- `v_user_invoices`
- `v_user_notifications`
- `v_user_tickets`
