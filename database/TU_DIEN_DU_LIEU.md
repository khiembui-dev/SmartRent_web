# Từ điển dữ liệu SmartRent

Sinh trực tiếp từ catalog PostgreSQL bằng tools/export_dictionary.py; không sửa tay.

**74 bảng, 12 view.** Mỗi bảng bên dưới ghi đầy đủ cột, khóa và index.

UUID ↔ Guid; numeric ↔ decimal; date ↔ DateOnly; timestamptz ↔ DateTime UTC; bytea ↔ byte[].

`NULL = Có` nghĩa là trường tùy chọn. Thời gian *_on dùng ngày; *_at dùng thời điểm UTC.
`snapshot` là giá trị tại thời điểm ký/phát hành, giữ nguyên khi danh mục thay đổi.
`idempotency_key` là khóa do client/server giữ ổn định khi thử lại cùng yêu cầu.
Các FK mặc định NO ACTION; chỉ các quan hệ có ON DELETE CASCADE ghi rõ mới được xóa dây chuyền.

## Mục lục

- [amenities](#amenities)
- [api_idempotency_keys](#api_idempotency_keys)
- [audit_logs](#audit_logs)
- [backup_runs](#backup_runs)
- [bank_accounts](#bank_accounts)
- [billing_period_events](#billing_period_events)
- [billing_periods](#billing_periods)
- [business_role_permissions](#business_role_permissions)
- [business_roles](#business_roles)
- [charge_instances](#charge_instances)
- [charge_rates](#charge_rates)
- [charge_types](#charge_types)
- [checkout_settlements](#checkout_settlements)
- [contract_attachments](#contract_attachments)
- [contract_files](#contract_files)
- [contract_parties](#contract_parties)
- [contract_versions](#contract_versions)
- [contracts](#contracts)
- [deposit_entries](#deposit_entries)
- [document_counters](#document_counters)
- [email_outbox](#email_outbox)
- [handover_files](#handover_files)
- [handover_items](#handover_items)
- [handovers](#handovers)
- [invoice_charge_claims](#invoice_charge_claims)
- [invoice_lines](#invoice_lines)
- [invoice_meter_segments](#invoice_meter_segments)
- [invoices](#invoices)
- [membership_properties](#membership_properties)
- [membership_roles](#membership_roles)
- [meter_readings](#meter_readings)
- [meters](#meters)
- [notifications](#notifications)
- [organization_memberships](#organization_memberships)
- [organization_settings](#organization_settings)
- [organizations](#organizations)
- [payment_allocations](#payment_allocations)
- [payment_files](#payment_files)
- [payment_intended_invoices](#payment_intended_invoices)
- [payment_methods](#payment_methods)
- [payment_reversals](#payment_reversals)
- [payments](#payments)
- [permissions](#permissions)
- [properties](#properties)
- [rental_inquiries](#rental_inquiries)
- [role_claims](#role_claims)
- [roles](#roles)
- [room_amenities](#room_amenities)
- [room_images](#room_images)
- [room_listings](#room_listings)
- [room_status_events](#room_status_events)
- [room_types](#room_types)
- [room_viewings](#room_viewings)
- [rooms](#rooms)
- [sla_policies](#sla_policies)
- [stored_files](#stored_files)
- [support_access_grants](#support_access_grants)
- [tenancies](#tenancies)
- [tenancy_requests](#tenancy_requests)
- [tenancy_residents](#tenancy_residents)
- [tenant_identity_documents](#tenant_identity_documents)
- [tenant_profile_change_requests](#tenant_profile_change_requests)
- [tenants](#tenants)
- [ticket_categories](#ticket_categories)
- [ticket_events](#ticket_events)
- [ticket_files](#ticket_files)
- [ticket_messages](#ticket_messages)
- [tickets](#tickets)
- [user_claims](#user_claims)
- [user_logins](#user_logins)
- [user_roles](#user_roles)
- [user_sessions](#user_sessions)
- [user_tokens](#user_tokens)
- [users](#users)

## amenities

Tiện ích của đơn vị. Form phòng thêm được tiện ích mới ngay khi nhập.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `organization_id` | `uuid` | Không | `—` |
| `code` | `character varying(50)` | Không | `—` |
| `name` | `character varying(150)` | Không | `—` |
| `icon` | `character varying(50)` | Có | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `amenities_organization_id_fkey`: `FOREIGN KEY (organization_id) REFERENCES smartrent.organizations(id)`
- `amenities_pkey`: `PRIMARY KEY (id)`
- `amenities_organization_id_code_key`: `UNIQUE (organization_id, code)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX amenities_organization_id_code_key ON smartrent.amenities USING btree (organization_id, code);
CREATE UNIQUE INDEX amenities_pkey ON smartrent.amenities USING btree (id);
```

</details>

## api_idempotency_keys

Chống gửi trùng ở tầng API cho thao tác không có cột idempotency_key riêng: đặt lịch, tạo hợp đồng, trả phòng, gửi ticket. Xóa khi quá expires_at.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `user_id` | `uuid` | Không | `—` |
| `route` | `character varying(200)` | Không | `—` |
| `idempotency_key` | `uuid` | Không | `—` |
| `request_hash` | `character(64)` | Không | `—` |
| `response_status` | `smallint` | Có | `—` |
| `response_body` | `jsonb` | Có | `—` |
| `created_at` | `timestamp with time zone` | Không | `now()` |
| `expires_at` | `timestamp with time zone` | Không | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `api_idempotency_keys_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES smartrent.users(id) ON DELETE CASCADE`
- `api_idempotency_keys_pkey`: `PRIMARY KEY (user_id, route, idempotency_key)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX api_idempotency_keys_pkey ON smartrent.api_idempotency_keys USING btree (user_id, route, idempotency_key);
CREATE INDEX ix_idempotency_expiry ON smartrent.api_idempotency_keys USING btree (expires_at);
```

</details>

## audit_logs

Nhật ký tự động: ai, lúc nào, sửa gì, trước sau ra sao, lý do. Cũng ghi các lần xuất CSV. Chứa liên hệ khách nên phải bảo vệ như dữ liệu riêng tư.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `bigint` | Không | `GENERATED ALWAYS AS IDENTITY` |
| `organization_id` | `uuid` | Có | `—` |
| `actor_id` | `uuid` | Có | `—` |
| `action` | `character varying(40)` | Không | `—` |
| `table_name` | `character varying(100)` | Không | `—` |
| `record_key` | `jsonb` | Không | `—` |
| `old_data` | `jsonb` | Có | `—` |
| `new_data` | `jsonb` | Có | `—` |
| `reason` | `text` | Có | `—` |
| `correlation_id` | `uuid` | Có | `—` |
| `occurred_at` | `timestamp with time zone` | Không | `now()` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `audit_logs_actor_id_fkey`: `FOREIGN KEY (actor_id) REFERENCES smartrent.users(id)`
- `audit_logs_organization_id_fkey`: `FOREIGN KEY (organization_id) REFERENCES smartrent.organizations(id)`
- `audit_logs_pkey`: `PRIMARY KEY (id)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX audit_logs_pkey ON smartrent.audit_logs USING btree (id);
CREATE INDEX ix_audit_logs_actor_id ON smartrent.audit_logs USING btree (actor_id);
CREATE INDEX ix_audit_logs_organization_id ON smartrent.audit_logs USING btree (organization_id);
CREATE INDEX ix_audit_scope_time ON smartrent.audit_logs USING btree (organization_id, occurred_at DESC);
```

</details>

## backup_runs

Nhật ký sao lưu và thử khôi phục ở trang Hỗ trợ và vận hành. Ghi dòng ở đây không tự tạo bản sao lưu.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `kind` | `character varying(15)` | Không | `—` |
| `status` | `character varying(10)` | Không | `—` |
| `reference` | `text` | Không | `—` |
| `requested_by` | `uuid` | Có | `—` |
| `started_at` | `timestamp with time zone` | Không | `now()` |
| `finished_at` | `timestamp with time zone` | Có | `—` |
| `error_message` | `text` | Có | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `backup_runs_kind_check`: `CHECK (((kind)::text = ANY ((ARRAY['backup'::character varying, 'restore_test'::character varying])::text[])))`
- `backup_runs_status_check`: `CHECK (((status)::text = ANY ((ARRAY['running'::character varying, 'succeeded'::character varying, 'failed'::character varying])::text[])))`
- `backup_runs_requested_by_fkey`: `FOREIGN KEY (requested_by) REFERENCES smartrent.users(id)`
- `backup_runs_pkey`: `PRIMARY KEY (id)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX backup_runs_pkey ON smartrent.backup_runs USING btree (id);
CREATE INDEX ix_backup_runs_requested_by ON smartrent.backup_runs USING btree (requested_by);
```

</details>

## bank_accounts

Tài khoản nhận tiền của đơn vị, hiện ở trang thanh toán hóa đơn của khách.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `organization_id` | `uuid` | Không | `—` |
| `bank_name` | `character varying(100)` | Không | `—` |
| `account_number` | `character varying(100)` | Không | `—` |
| `account_holder` | `character varying(200)` | Không | `—` |
| `is_default` | `boolean` | Không | `false` |
| `is_active` | `boolean` | Không | `true` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `bank_accounts_organization_id_fkey`: `FOREIGN KEY (organization_id) REFERENCES smartrent.organizations(id)`
- `bank_accounts_pkey`: `PRIMARY KEY (id)`
- `bank_accounts_organization_id_bank_name_account_number_key`: `UNIQUE (organization_id, bank_name, account_number)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX bank_accounts_organization_id_bank_name_account_number_key ON smartrent.bank_accounts USING btree (organization_id, bank_name, account_number);
CREATE UNIQUE INDEX bank_accounts_pkey ON smartrent.bank_accounts USING btree (id);
CREATE UNIQUE INDEX ux_bank_default ON smartrent.bank_accounts USING btree (organization_id) WHERE is_default;
```

</details>

## billing_period_events

Lịch sử khóa và mở khóa tháng, bắt buộc có lý do.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `billing_period_id` | `uuid` | Không | `—` |
| `action` | `character varying(8)` | Không | `—` |
| `reason` | `text` | Không | `—` |
| `actor_id` | `uuid` | Không | `—` |
| `created_at` | `timestamp with time zone` | Không | `now()` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `billing_period_events_action_check`: `CHECK (((action)::text = ANY ((ARRAY['lock'::character varying, 'unlock'::character varying])::text[])))`
- `billing_period_events_reason_check`: `CHECK ((btrim(reason) <> ''::text))`
- `billing_period_events_actor_id_fkey`: `FOREIGN KEY (actor_id) REFERENCES smartrent.users(id)`
- `billing_period_events_billing_period_id_fkey`: `FOREIGN KEY (billing_period_id) REFERENCES smartrent.billing_periods(id)`
- `billing_period_events_pkey`: `PRIMARY KEY (id)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX billing_period_events_pkey ON smartrent.billing_period_events USING btree (id);
CREATE INDEX ix_billing_period_events_actor_id ON smartrent.billing_period_events USING btree (actor_id);
CREATE INDEX ix_billing_period_events_billing_period_id ON smartrent.billing_period_events USING btree (billing_period_id);
```

</details>

## billing_periods

Tháng tính tiền của một cơ sở ở trang Tính tiền phòng. Khóa tháng chặn sửa chỉ số và hóa đơn của tháng đó.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `property_id` | `uuid` | Không | `—` |
| `month_start` | `date` | Không | `—` |
| `status` | `character varying(8)` | Không | `'open'::character varying` |
| `locked_at` | `timestamp with time zone` | Có | `—` |
| `locked_by` | `uuid` | Có | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `billing_periods_check`: `CHECK (((((status)::text = 'locked'::text) AND (locked_at IS NOT NULL) AND (locked_by IS NOT NULL)) OR (((status)::text = 'open'::text) AND (locked_at IS NULL) AND (locked_by IS NULL))))`
- `billing_periods_month_start_check`: `CHECK ((EXTRACT(day FROM month_start) = (1)::numeric))`
- `billing_periods_status_check`: `CHECK (((status)::text = ANY ((ARRAY['open'::character varying, 'locked'::character varying])::text[])))`
- `billing_periods_locked_by_fkey`: `FOREIGN KEY (locked_by) REFERENCES smartrent.users(id)`
- `billing_periods_property_id_fkey`: `FOREIGN KEY (property_id) REFERENCES smartrent.properties(id)`
- `billing_periods_pkey`: `PRIMARY KEY (id)`
- `billing_periods_property_id_month_start_key`: `UNIQUE (property_id, month_start)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX billing_periods_pkey ON smartrent.billing_periods USING btree (id);
CREATE UNIQUE INDEX billing_periods_property_id_month_start_key ON smartrent.billing_periods USING btree (property_id, month_start);
CREATE INDEX ix_billing_periods_locked_by ON smartrent.billing_periods USING btree (locked_by);
```

</details>

## business_role_permissions

Quyền của từng vai trò (N-N).

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `role_id` | `uuid` | Không | `—` |
| `permission_code` | `character varying(100)` | Không | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `business_role_permissions_permission_code_fkey`: `FOREIGN KEY (permission_code) REFERENCES smartrent.permissions(code)`
- `business_role_permissions_role_id_fkey`: `FOREIGN KEY (role_id) REFERENCES smartrent.business_roles(id) ON DELETE CASCADE`
- `business_role_permissions_pkey`: `PRIMARY KEY (role_id, permission_code)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX business_role_permissions_pkey ON smartrent.business_role_permissions USING btree (role_id, permission_code);
CREATE INDEX ix_business_role_permissions_permission_code ON smartrent.business_role_permissions USING btree (permission_code);
```

</details>

## business_roles

Vai trò trong một đơn vị. Mặc định có Chủ trọ, Quản lý, Nhân viên; đơn vị có thể tự tạo thêm.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `organization_id` | `uuid` | Không | `—` |
| `code` | `character varying(50)` | Không | `—` |
| `name` | `character varying(150)` | Không | `—` |
| `is_system` | `boolean` | Không | `false` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `business_roles_organization_id_fkey`: `FOREIGN KEY (organization_id) REFERENCES smartrent.organizations(id)`
- `business_roles_pkey`: `PRIMARY KEY (id)`
- `business_roles_organization_id_code_key`: `UNIQUE (organization_id, code)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX business_roles_organization_id_code_key ON smartrent.business_roles USING btree (organization_id, code);
CREATE UNIQUE INDEX business_roles_pkey ON smartrent.business_roles USING btree (id);
```

</details>

## charge_instances

Một lần phát sinh của khoản thu trong đợt thuê. Dùng lại đúng dòng này khi lập lại nên phí một lần không thể thu hai lần.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `tenancy_id` | `uuid` | Không | `—` |
| `charge_type_id` | `uuid` | Không | `—` |
| `billing_period_id` | `uuid` | Có | `—` |
| `occurrence_key` | `character varying(100)` | Không | `'default'::character varying` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `charge_instances_billing_period_id_fkey`: `FOREIGN KEY (billing_period_id) REFERENCES smartrent.billing_periods(id)`
- `charge_instances_charge_type_id_fkey`: `FOREIGN KEY (charge_type_id) REFERENCES smartrent.charge_types(id)`
- `charge_instances_tenancy_id_fkey`: `FOREIGN KEY (tenancy_id) REFERENCES smartrent.tenancies(id)`
- `charge_instances_pkey`: `PRIMARY KEY (id)`
- `charge_instances_tenancy_id_charge_type_id_billing_period_i_key`: `UNIQUE NULLS NOT DISTINCT (tenancy_id, charge_type_id, billing_period_id, occurrence_key)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX charge_instances_pkey ON smartrent.charge_instances USING btree (id);
CREATE UNIQUE INDEX charge_instances_tenancy_id_charge_type_id_billing_period_i_key ON smartrent.charge_instances USING btree (tenancy_id, charge_type_id, billing_period_id, occurrence_key) NULLS NOT DISTINCT;
CREATE INDEX ix_charge_instances_billing_period_id ON smartrent.charge_instances USING btree (billing_period_id);
CREATE INDEX ix_charge_instances_charge_type_id ON smartrent.charge_instances USING btree (charge_type_id);
```

</details>

## charge_rates

Bảng giá có hiệu lực theo ngày, thuộc đúng một phạm vi: cơ sở, phòng, hoặc phiên bản hợp đồng. Giá 0 là giá hợp lệ. Đổi giá: đóng effective_to rồi thêm dòng mới, không sửa unit_price.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `property_id` | `uuid` | Có | `—` |
| `room_id` | `uuid` | Có | `—` |
| `contract_version_id` | `uuid` | Có | `—` |
| `scope_id` | `uuid` | Có | `COALESCE(contract_version_id, room_id, property_id)` |
| `charge_type_id` | `uuid` | Không | `—` |
| `effective_from` | `date` | Không | `—` |
| `effective_to` | `date` | Có | `—` |
| `unit_price` | `numeric(18,4)` | Không | `—` |
| `calculation_method` | `character varying(15)` | Không | `—` |
| `billing_cycle` | `character varying(10)` | Không | `'monthly'::character varying` |
| `proration_mode` | `character varying(12)` | Không | `'full_period'::character varying` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `charge_rates_billing_cycle_check`: `CHECK (((billing_cycle)::text = ANY ((ARRAY['monthly'::character varying, 'once'::character varying])::text[])))`
- `charge_rates_calculation_method_check`: `CHECK (((calculation_method)::text = ANY ((ARRAY['fixed'::character varying, 'metered'::character varying, 'per_person'::character varying, 'per_quantity'::character varying])::text[])))`
- `charge_rates_check`: `CHECK ((num_nonnulls(property_id, room_id, contract_version_id) = 1))`
- `charge_rates_check1`: `CHECK (((effective_to IS NULL) OR (effective_to > effective_from)))`
- `charge_rates_proration_mode_check`: `CHECK (((proration_mode)::text = ANY ((ARRAY['full_period'::character varying, 'actual_days'::character varying])::text[])))`
- `charge_rates_unit_price_check`: `CHECK ((unit_price >= (0)::numeric))`
- `charge_rates_charge_type_id_fkey`: `FOREIGN KEY (charge_type_id) REFERENCES smartrent.charge_types(id)`
- `charge_rates_contract_version_id_fkey`: `FOREIGN KEY (contract_version_id) REFERENCES smartrent.contract_versions(id) ON DELETE CASCADE`
- `charge_rates_property_id_fkey`: `FOREIGN KEY (property_id) REFERENCES smartrent.properties(id) ON DELETE CASCADE`
- `charge_rates_room_id_fkey`: `FOREIGN KEY (room_id) REFERENCES smartrent.rooms(id) ON DELETE CASCADE`
- `charge_rates_pkey`: `PRIMARY KEY (id)`
- `charge_rates_scope_id_charge_type_id_daterange_excl`: `EXCLUDE USING gist (scope_id WITH =, charge_type_id WITH =, daterange(effective_from, effective_to, '[)'::text) WITH &&)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX charge_rates_pkey ON smartrent.charge_rates USING btree (id);
CREATE INDEX charge_rates_scope_id_charge_type_id_daterange_excl ON smartrent.charge_rates USING gist (scope_id, charge_type_id, daterange(effective_from, effective_to, '[)'::text));
CREATE INDEX ix_charge_rates_charge_type_id ON smartrent.charge_rates USING btree (charge_type_id);
CREATE INDEX ix_charge_rates_contract_version_id ON smartrent.charge_rates USING btree (contract_version_id);
CREATE INDEX ix_charge_rates_property_id ON smartrent.charge_rates USING btree (property_id);
CREATE INDEX ix_charge_rates_room_id ON smartrent.charge_rates USING btree (room_id);
```

</details>

## charge_types

Danh mục khoản thu: tiền thuê, điện, nước, dịch vụ, rác, internet, phí khác, bồi thường, số dư đầu kỳ.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `organization_id` | `uuid` | Không | `—` |
| `code` | `character varying(50)` | Không | `—` |
| `name` | `character varying(200)` | Không | `—` |
| `category` | `character varying(20)` | Không | `—` |
| `unit_label` | `character varying(30)` | Không | `—` |
| `is_active` | `boolean` | Không | `true` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `charge_types_category_check`: `CHECK (((category)::text = ANY ((ARRAY['rent'::character varying, 'electricity'::character varying, 'water'::character varying, 'service'::character varying, 'other'::character varying, 'compensation'::character varying])::text[])))`
- `charge_types_organization_id_fkey`: `FOREIGN KEY (organization_id) REFERENCES smartrent.organizations(id)`
- `charge_types_pkey`: `PRIMARY KEY (id)`
- `charge_types_organization_id_code_key`: `UNIQUE (organization_id, code)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX charge_types_organization_id_code_key ON smartrent.charge_types USING btree (organization_id, code);
CREATE UNIQUE INDEX charge_types_pkey ON smartrent.charge_types USING btree (id);
```

</details>

## checkout_settlements

Quyết toán khi trả phòng. Khách còn nợ phải có lý do; nợ vẫn được giữ sau khi đóng đợt thuê.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `tenancy_id` | `uuid` | Không | `—` |
| `checkout_handover_id` | `uuid` | Có | `—` |
| `status` | `character varying(10)` | Không | `'draft'::character varying` |
| `allow_remaining_debt` | `boolean` | Không | `false` |
| `remaining_debt_reason` | `text` | Có | `—` |
| `confirmed_by` | `uuid` | Có | `—` |
| `confirmed_at` | `timestamp with time zone` | Có | `—` |
| `notes` | `text` | Có | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `checkout_settlements_check`: `CHECK (((NOT allow_remaining_debt) OR (NULLIF(btrim(remaining_debt_reason), ''::text) IS NOT NULL)))`
- `checkout_settlements_check1`: `CHECK (((((status)::text = 'confirmed'::text) AND (confirmed_by IS NOT NULL) AND (confirmed_at IS NOT NULL)) OR (((status)::text = 'draft'::text) AND (confirmed_by IS NULL) AND (confirmed_at IS NULL))))`
- `checkout_settlements_status_check`: `CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'confirmed'::character varying])::text[])))`
- `checkout_settlements_checkout_handover_id_fkey`: `FOREIGN KEY (checkout_handover_id) REFERENCES smartrent.handovers(id)`
- `checkout_settlements_confirmed_by_fkey`: `FOREIGN KEY (confirmed_by) REFERENCES smartrent.users(id)`
- `checkout_settlements_tenancy_id_fkey`: `FOREIGN KEY (tenancy_id) REFERENCES smartrent.tenancies(id)`
- `checkout_settlements_pkey`: `PRIMARY KEY (id)`
- `checkout_settlements_tenancy_id_key`: `UNIQUE (tenancy_id)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX checkout_settlements_pkey ON smartrent.checkout_settlements USING btree (id);
CREATE UNIQUE INDEX checkout_settlements_tenancy_id_key ON smartrent.checkout_settlements USING btree (tenancy_id);
CREATE INDEX ix_checkout_settlements_checkout_handover_id ON smartrent.checkout_settlements USING btree (checkout_handover_id);
CREATE INDEX ix_checkout_settlements_confirmed_by ON smartrent.checkout_settlements USING btree (confirmed_by);
```

</details>

## contract_attachments

Tệp bổ sung vào hồ sơ hợp đồng sau khi ký, tách khỏi tệp của phiên bản đã khóa.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `contract_id` | `uuid` | Không | `—` |
| `file_id` | `uuid` | Không | `—` |
| `note` | `text` | Có | `—` |
| `added_by` | `uuid` | Không | `—` |
| `added_at` | `timestamp with time zone` | Không | `now()` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `contract_attachments_added_by_fkey`: `FOREIGN KEY (added_by) REFERENCES smartrent.users(id)`
- `contract_attachments_contract_id_fkey`: `FOREIGN KEY (contract_id) REFERENCES smartrent.contracts(id) ON DELETE CASCADE`
- `contract_attachments_file_id_fkey`: `FOREIGN KEY (file_id) REFERENCES smartrent.stored_files(id)`
- `contract_attachments_pkey`: `PRIMARY KEY (id)`
- `contract_attachments_contract_id_file_id_key`: `UNIQUE (contract_id, file_id)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX contract_attachments_contract_id_file_id_key ON smartrent.contract_attachments USING btree (contract_id, file_id);
CREATE UNIQUE INDEX contract_attachments_pkey ON smartrent.contract_attachments USING btree (id);
CREATE INDEX ix_contract_attachments_added_by ON smartrent.contract_attachments USING btree (added_by);
CREATE INDEX ix_contract_attachments_file_id ON smartrent.contract_attachments USING btree (file_id);
```

</details>

## contract_files

Tệp thuộc một phiên bản hợp đồng; bản ký là bắt buộc trước khi xác nhận ký và bị khóa sau đó.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `contract_version_id` | `uuid` | Không | `—` |
| `file_id` | `uuid` | Không | `—` |
| `file_kind` | `character varying(20)` | Không | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `contract_files_file_kind_check`: `CHECK (((file_kind)::text = ANY ((ARRAY['draft'::character varying, 'signed'::character varying, 'appendix'::character varying, 'signature_proof'::character varying])::text[])))`
- `contract_files_contract_version_id_fkey`: `FOREIGN KEY (contract_version_id) REFERENCES smartrent.contract_versions(id) ON DELETE CASCADE`
- `contract_files_file_id_fkey`: `FOREIGN KEY (file_id) REFERENCES smartrent.stored_files(id)`
- `contract_files_pkey`: `PRIMARY KEY (contract_version_id, file_id)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX contract_files_pkey ON smartrent.contract_files USING btree (contract_version_id, file_id);
CREATE INDEX ix_contract_files_file_id ON smartrent.contract_files USING btree (file_id);
```

</details>

## contract_parties

Các bên tại thời điểm ký. Là ảnh chụp lịch sử của chứng từ nên không đổi theo hồ sơ khách.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `contract_version_id` | `uuid` | Không | `—` |
| `party_role` | `character varying(20)` | Không | `—` |
| `full_name_snapshot` | `character varying(250)` | Không | `—` |
| `address_snapshot` | `text` | Không | `—` |
| `identity_masked` | `character varying(40)` | Có | `—` |
| `contact_snapshot` | `text` | Có | `—` |
| `tenant_id` | `uuid` | Có | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `contract_parties_party_role_check`: `CHECK (((party_role)::text = ANY ((ARRAY['landlord'::character varying, 'representative'::character varying, 'co_signer'::character varying])::text[])))`
- `contract_parties_contract_version_id_fkey`: `FOREIGN KEY (contract_version_id) REFERENCES smartrent.contract_versions(id) ON DELETE CASCADE`
- `contract_parties_tenant_id_fkey`: `FOREIGN KEY (tenant_id) REFERENCES smartrent.tenants(id)`
- `contract_parties_pkey`: `PRIMARY KEY (id)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX contract_parties_pkey ON smartrent.contract_parties USING btree (id);
CREATE INDEX ix_contract_parties_contract_version_id ON smartrent.contract_parties USING btree (contract_version_id);
CREATE INDEX ix_contract_parties_tenant_id ON smartrent.contract_parties USING btree (tenant_id);
```

</details>

## contract_versions

Phiên bản hợp đồng. Gia hạn tạo phiên bản mới; bản đã ký bị khóa. ends_on là ngày đầu tiên hết hiệu lực, ngày ghi trên hợp đồng là ends_on - 1.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `contract_id` | `uuid` | Không | `—` |
| `version_no` | `integer` | Không | `—` |
| `effective_from` | `date` | Không | `—` |
| `ends_on` | `date` | Không | `—` |
| `required_deposit` | `numeric(18,0)` | Không | `—` |
| `invoice_day` | `smallint` | Không | `—` |
| `due_after_days` | `smallint` | Không | `—` |
| `proration_policy` | `character varying(20)` | Không | `—` |
| `terms_text` | `text` | Không | `—` |
| `change_reason` | `text` | Có | `—` |
| `signed_at` | `timestamp with time zone` | Có | `—` |
| `confirmed_by` | `uuid` | Có | `—` |
| `signature_method` | `character varying(15)` | Có | `—` |
| `external_signature_reference` | `text` | Có | `—` |
| `created_at` | `timestamp with time zone` | Không | `now()` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `contract_versions_check`: `CHECK ((ends_on > effective_from))`
- `contract_versions_check1`: `CHECK ((((signed_at IS NULL) AND (confirmed_by IS NULL) AND (signature_method IS NULL)) OR ((signed_at IS NOT NULL) AND (confirmed_by IS NOT NULL) AND (signature_method IS NOT NULL))))`
- `contract_versions_due_after_days_check`: `CHECK (((due_after_days >= 0) AND (due_after_days <= 365)))`
- `contract_versions_invoice_day_check`: `CHECK (((invoice_day >= 1) AND (invoice_day <= 31)))`
- `contract_versions_proration_policy_check`: `CHECK (((proration_policy)::text = ANY ((ARRAY['actual_days'::character varying, 'full_month'::character varying])::text[])))`
- `contract_versions_required_deposit_check`: `CHECK ((required_deposit >= (0)::numeric))`
- `contract_versions_signature_method_check`: `CHECK (((signature_method)::text = ANY ((ARRAY['paper'::character varying, 'external_esign'::character varying])::text[])))`
- `contract_versions_version_no_check`: `CHECK ((version_no > 0))`
- `contract_versions_confirmed_by_fkey`: `FOREIGN KEY (confirmed_by) REFERENCES smartrent.users(id)`
- `contract_versions_contract_id_fkey`: `FOREIGN KEY (contract_id) REFERENCES smartrent.contracts(id)`
- `contract_versions_pkey`: `PRIMARY KEY (id)`
- `contract_versions_contract_id_effective_from_key`: `UNIQUE (contract_id, effective_from)`
- `contract_versions_contract_id_version_no_key`: `UNIQUE (contract_id, version_no)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX contract_versions_contract_id_effective_from_key ON smartrent.contract_versions USING btree (contract_id, effective_from);
CREATE UNIQUE INDEX contract_versions_contract_id_version_no_key ON smartrent.contract_versions USING btree (contract_id, version_no);
CREATE UNIQUE INDEX contract_versions_pkey ON smartrent.contract_versions USING btree (id);
CREATE INDEX ix_contract_versions_confirmed_by ON smartrent.contract_versions USING btree (confirmed_by);
```

</details>

## contracts

Hợp đồng có mã riêng, gắn với đợt thuê. Trạng thái hiển thị suy từ v_contract_status, không lưu.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `tenancy_id` | `uuid` | Không | `—` |
| `code` | `character varying(80)` | Không | `—` |
| `predecessor_contract_id` | `uuid` | Có | `—` |
| `terminated_on` | `date` | Có | `—` |
| `termination_reason` | `text` | Có | `—` |
| `terminated_by` | `uuid` | Có | `—` |
| `terminated_at` | `timestamp with time zone` | Có | `—` |
| `archived_at` | `timestamp with time zone` | Có | `—` |
| `created_by` | `uuid` | Không | `—` |
| `created_at` | `timestamp with time zone` | Không | `now()` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `contracts_check`: `CHECK ((id IS DISTINCT FROM predecessor_contract_id))`
- `contracts_check1`: `CHECK (((terminated_on IS NULL) = (terminated_by IS NULL)))`
- `contracts_check2`: `CHECK (((terminated_on IS NULL) = (terminated_at IS NULL)))`
- `contracts_check3`: `CHECK (((terminated_on IS NULL) OR (NULLIF(btrim(termination_reason), ''::text) IS NOT NULL)))`
- `contracts_created_by_fkey`: `FOREIGN KEY (created_by) REFERENCES smartrent.users(id)`
- `contracts_predecessor_contract_id_fkey`: `FOREIGN KEY (predecessor_contract_id) REFERENCES smartrent.contracts(id)`
- `contracts_tenancy_id_fkey`: `FOREIGN KEY (tenancy_id) REFERENCES smartrent.tenancies(id)`
- `contracts_terminated_by_fkey`: `FOREIGN KEY (terminated_by) REFERENCES smartrent.users(id)`
- `contracts_pkey`: `PRIMARY KEY (id)`
- `contracts_code_key`: `UNIQUE (code)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX contracts_code_key ON smartrent.contracts USING btree (code);
CREATE UNIQUE INDEX contracts_pkey ON smartrent.contracts USING btree (id);
CREATE INDEX ix_contracts_created_by ON smartrent.contracts USING btree (created_by);
CREATE INDEX ix_contracts_predecessor_contract_id ON smartrent.contracts USING btree (predecessor_contract_id);
CREATE INDEX ix_contracts_tenancy_id ON smartrent.contracts USING btree (tenancy_id);
CREATE INDEX ix_contracts_terminated_by ON smartrent.contracts USING btree (terminated_by);
```

</details>

## deposit_entries

Sổ cọc chỉ ghi thêm: nhận, hoàn, bù trừ vào hóa đơn, đảo. Mỗi dòng giữ khoản thu gốc nên đối chiếu được từng đồng.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `tenancy_id` | `uuid` | Không | `—` |
| `payment_id` | `uuid` | Không | `—` |
| `kind` | `character varying(15)` | Không | `—` |
| `amount` | `numeric(18,0)` | Không | `—` |
| `related_entry_id` | `uuid` | Có | `—` |
| `payment_reversal_id` | `uuid` | Có | `—` |
| `settlement_id` | `uuid` | Có | `—` |
| `occurred_at` | `timestamp with time zone` | Không | `—` |
| `reason` | `text` | Không | `—` |
| `confirmed_by` | `uuid` | Không | `—` |
| `idempotency_key` | `uuid` | Không | `—` |
| `created_at` | `timestamp with time zone` | Không | `now()` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `deposit_entries_amount_check`: `CHECK ((amount > (0)::numeric))`
- `deposit_entries_check`: `CHECK ((id IS DISTINCT FROM related_entry_id))`
- `deposit_entries_check1`: `CHECK ((((kind)::text = 'reversal'::text) = (related_entry_id IS NOT NULL)))`
- `deposit_entries_check2`: `CHECK ((((kind)::text = 'refund'::text) = (payment_reversal_id IS NOT NULL)))`
- `deposit_entries_kind_check`: `CHECK (((kind)::text = ANY ((ARRAY['receipt'::character varying, 'refund'::character varying, 'offset'::character varying, 'reversal'::character varying])::text[])))`
- `deposit_entries_confirmed_by_fkey`: `FOREIGN KEY (confirmed_by) REFERENCES smartrent.users(id)`
- `deposit_entries_payment_id_fkey`: `FOREIGN KEY (payment_id) REFERENCES smartrent.payments(id)`
- `deposit_entries_payment_reversal_id_fkey`: `FOREIGN KEY (payment_reversal_id) REFERENCES smartrent.payment_reversals(id)`
- `deposit_entries_related_entry_id_fkey`: `FOREIGN KEY (related_entry_id) REFERENCES smartrent.deposit_entries(id)`
- `deposit_entries_settlement_id_fkey`: `FOREIGN KEY (settlement_id) REFERENCES smartrent.checkout_settlements(id)`
- `deposit_entries_tenancy_id_fkey`: `FOREIGN KEY (tenancy_id) REFERENCES smartrent.tenancies(id)`
- `deposit_entries_pkey`: `PRIMARY KEY (id)`
- `financial_balanced`: `TRIGGER DEFERRABLE INITIALLY DEFERRED`
- `deposit_entries_idempotency_key_key`: `UNIQUE (idempotency_key)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX deposit_entries_idempotency_key_key ON smartrent.deposit_entries USING btree (idempotency_key);
CREATE UNIQUE INDEX deposit_entries_pkey ON smartrent.deposit_entries USING btree (id);
CREATE INDEX ix_deposit_entries_confirmed_by ON smartrent.deposit_entries USING btree (confirmed_by);
CREATE INDEX ix_deposit_entries_payment_id ON smartrent.deposit_entries USING btree (payment_id);
CREATE INDEX ix_deposit_entries_payment_reversal_id ON smartrent.deposit_entries USING btree (payment_reversal_id);
CREATE INDEX ix_deposit_entries_related_entry_id ON smartrent.deposit_entries USING btree (related_entry_id);
CREATE INDEX ix_deposit_entries_settlement_id ON smartrent.deposit_entries USING btree (settlement_id);
CREATE INDEX ix_deposit_entries_tenancy_id ON smartrent.deposit_entries USING btree (tenancy_id);
```

</details>

## document_counters

Bộ đếm cấp mã hóa đơn, hợp đồng, phiếu thu, ticket, yêu cầu xem phòng; an toàn khi nhiều người cùng thao tác.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `organization_id` | `uuid` | Không | `—` |
| `series` | `character varying(40)` | Không | `—` |
| `last_value` | `bigint` | Không | `0` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `document_counters_last_value_check`: `CHECK ((last_value >= 0))`
- `document_counters_organization_id_fkey`: `FOREIGN KEY (organization_id) REFERENCES smartrent.organizations(id)`
- `document_counters_pkey`: `PRIMARY KEY (organization_id, series)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX document_counters_pkey ON smartrent.document_counters USING btree (organization_id, series);
```

</details>

## email_outbox

Hàng đợi email ghi cùng transaction nghiệp vụ, tiến trình nền gửi và thử lại: đặt lại mật khẩu, hóa đơn, nhắc nợ. Lỗi email không làm mất hóa đơn.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `organization_id` | `uuid` | Có | `—` |
| `recipient_user_id` | `uuid` | Có | `—` |
| `to_email` | `character varying(256)` | Không | `—` |
| `template_code` | `character varying(60)` | Không | `—` |
| `subject` | `text` | Không | `—` |
| `body` | `text` | Không | `—` |
| `dedupe_key` | `character varying(300)` | Không | `—` |
| `status` | `character varying(10)` | Không | `'pending'::character varying` |
| `attempts` | `integer` | Không | `0` |
| `available_at` | `timestamp with time zone` | Không | `now()` |
| `locked_until` | `timestamp with time zone` | Có | `—` |
| `sent_at` | `timestamp with time zone` | Có | `—` |
| `last_error` | `text` | Có | `—` |
| `created_at` | `timestamp with time zone` | Không | `now()` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `email_outbox_attempts_check`: `CHECK ((attempts >= 0))`
- `email_outbox_status_check`: `CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'sending'::character varying, 'sent'::character varying, 'failed'::character varying])::text[])))`
- `email_outbox_organization_id_fkey`: `FOREIGN KEY (organization_id) REFERENCES smartrent.organizations(id)`
- `email_outbox_recipient_user_id_fkey`: `FOREIGN KEY (recipient_user_id) REFERENCES smartrent.users(id)`
- `email_outbox_pkey`: `PRIMARY KEY (id)`
- `email_outbox_dedupe_key_key`: `UNIQUE (dedupe_key)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX email_outbox_dedupe_key_key ON smartrent.email_outbox USING btree (dedupe_key);
CREATE UNIQUE INDEX email_outbox_pkey ON smartrent.email_outbox USING btree (id);
CREATE INDEX ix_email_outbox_organization_id ON smartrent.email_outbox USING btree (organization_id);
CREATE INDEX ix_email_outbox_recipient_user_id ON smartrent.email_outbox USING btree (recipient_user_id);
CREATE INDEX ix_outbox_pending ON smartrent.email_outbox USING btree (available_at) WHERE ((status)::text = ANY ((ARRAY['pending'::character varying, 'failed'::character varying])::text[]));
```

</details>

## handover_files

Ảnh hiện trạng kèm biên bản bàn giao.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `handover_id` | `uuid` | Không | `—` |
| `file_id` | `uuid` | Không | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `handover_files_file_id_fkey`: `FOREIGN KEY (file_id) REFERENCES smartrent.stored_files(id)`
- `handover_files_handover_id_fkey`: `FOREIGN KEY (handover_id) REFERENCES smartrent.handovers(id) ON DELETE CASCADE`
- `handover_files_pkey`: `PRIMARY KEY (handover_id, file_id)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX handover_files_pkey ON smartrent.handover_files USING btree (handover_id, file_id);
CREATE INDEX ix_handover_files_file_id ON smartrent.handover_files USING btree (file_id);
```

</details>

## handover_items

Tài sản ghi trong biên bản bàn giao, là nội dung của biên bản nên không phụ thuộc danh mục nào.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `handover_id` | `uuid` | Không | `—` |
| `name` | `character varying(200)` | Không | `—` |
| `quantity` | `numeric(12,3)` | Không | `1` |
| `condition_notes` | `text` | Có | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `handover_items_quantity_check`: `CHECK ((quantity >= (0)::numeric))`
- `handover_items_handover_id_fkey`: `FOREIGN KEY (handover_id) REFERENCES smartrent.handovers(id) ON DELETE CASCADE`
- `handover_items_pkey`: `PRIMARY KEY (id)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX handover_items_pkey ON smartrent.handover_items USING btree (id);
CREATE INDEX ix_handover_items_handover_id ON smartrent.handover_items USING btree (handover_id);
```

</details>

## handovers

Biên bản bàn giao lúc nhận và trả phòng. Khách xem lại ở trang Hợp đồng, kèm chỉ số điện nước.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `tenancy_id` | `uuid` | Không | `—` |
| `kind` | `character varying(10)` | Không | `—` |
| `occurred_at` | `timestamp with time zone` | Không | `—` |
| `notes` | `text` | Có | `—` |
| `landlord_confirmed_by` | `uuid` | Có | `—` |
| `tenant_confirmed_by` | `uuid` | Có | `—` |
| `confirmed_at` | `timestamp with time zone` | Có | `—` |
| `representative_confirmation_text` | `text` | Có | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `handovers_kind_check`: `CHECK (((kind)::text = ANY ((ARRAY['checkin'::character varying, 'checkout'::character varying])::text[])))`
- `handovers_landlord_confirmed_by_fkey`: `FOREIGN KEY (landlord_confirmed_by) REFERENCES smartrent.users(id)`
- `handovers_tenancy_id_fkey`: `FOREIGN KEY (tenancy_id) REFERENCES smartrent.tenancies(id)`
- `handovers_tenant_confirmed_by_fkey`: `FOREIGN KEY (tenant_confirmed_by) REFERENCES smartrent.users(id)`
- `handovers_pkey`: `PRIMARY KEY (id)`
- `handovers_tenancy_id_kind_key`: `UNIQUE (tenancy_id, kind)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX handovers_pkey ON smartrent.handovers USING btree (id);
CREATE UNIQUE INDEX handovers_tenancy_id_kind_key ON smartrent.handovers USING btree (tenancy_id, kind);
CREATE INDEX ix_handovers_landlord_confirmed_by ON smartrent.handovers USING btree (landlord_confirmed_by);
CREATE INDEX ix_handovers_tenant_confirmed_by ON smartrent.handovers USING btree (tenant_confirmed_by);
```

</details>

## invoice_charge_claims

Phát sinh đang được dòng hóa đơn nào sử dụng. Hóa đơn hủy thì nhả ra, khóa chính chặn thu trùng.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `charge_instance_id` | `uuid` | Không | `—` |
| `invoice_line_id` | `uuid` | Không | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `invoice_charge_claims_charge_instance_id_fkey`: `FOREIGN KEY (charge_instance_id) REFERENCES smartrent.charge_instances(id)`
- `invoice_charge_claims_invoice_line_id_fkey`: `FOREIGN KEY (invoice_line_id) REFERENCES smartrent.invoice_lines(id) ON DELETE CASCADE`
- `invoice_charge_claims_pkey`: `PRIMARY KEY (charge_instance_id)`
- `invoice_charge_claims_invoice_line_id_key`: `UNIQUE (invoice_line_id)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX invoice_charge_claims_invoice_line_id_key ON smartrent.invoice_charge_claims USING btree (invoice_line_id);
CREATE UNIQUE INDEX invoice_charge_claims_pkey ON smartrent.invoice_charge_claims USING btree (charge_instance_id);
```

</details>

## invoice_lines

Từng khoản trên hóa đơn, chụp giá và số lượng tại lúc lập. Đổi bảng giá không làm đổi hóa đơn cũ.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `invoice_id` | `uuid` | Không | `—` |
| `line_no` | `integer` | Không | `—` |
| `charge_type_id` | `uuid` | Không | `—` |
| `charge_instance_id` | `uuid` | Có | `—` |
| `source_rate_id` | `uuid` | Có | `—` |
| `source_scope` | `character varying(10)` | Có | `—` |
| `description_snapshot` | `text` | Không | `—` |
| `unit_snapshot` | `character varying(30)` | Không | `—` |
| `quantity` | `numeric(18,6)` | Không | `—` |
| `unit_price` | `numeric(18,4)` | Không | `—` |
| `sign` | `smallint` | Không | `1` |
| `proration_numerator` | `integer` | Không | `1` |
| `proration_denominator` | `integer` | Không | `1` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `invoice_lines_line_no_check`: `CHECK ((line_no > 0))`
- `invoice_lines_proration_denominator_check`: `CHECK ((proration_denominator > 0))`
- `invoice_lines_proration_numerator_check`: `CHECK ((proration_numerator >= 0))`
- `invoice_lines_quantity_check`: `CHECK ((quantity >= (0)::numeric))`
- `invoice_lines_sign_check`: `CHECK ((sign = ANY (ARRAY['-1'::integer, 1])))`
- `invoice_lines_source_scope_check`: `CHECK (((source_scope)::text = ANY ((ARRAY['contract'::character varying, 'room'::character varying, 'property'::character varying, 'manual'::character varying])::text[])))`
- `invoice_lines_unit_price_check`: `CHECK ((unit_price >= (0)::numeric))`
- `invoice_lines_charge_instance_id_fkey`: `FOREIGN KEY (charge_instance_id) REFERENCES smartrent.charge_instances(id)`
- `invoice_lines_charge_type_id_fkey`: `FOREIGN KEY (charge_type_id) REFERENCES smartrent.charge_types(id)`
- `invoice_lines_invoice_id_fkey`: `FOREIGN KEY (invoice_id) REFERENCES smartrent.invoices(id)`
- `invoice_lines_source_rate_id_fkey`: `FOREIGN KEY (source_rate_id) REFERENCES smartrent.charge_rates(id)`
- `invoice_lines_pkey`: `PRIMARY KEY (id)`
- `financial_balanced`: `TRIGGER DEFERRABLE INITIALLY DEFERRED`
- `invoice_lines_invoice_id_line_no_key`: `UNIQUE (invoice_id, line_no)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX invoice_lines_invoice_id_line_no_key ON smartrent.invoice_lines USING btree (invoice_id, line_no);
CREATE UNIQUE INDEX invoice_lines_pkey ON smartrent.invoice_lines USING btree (id);
CREATE INDEX ix_invoice_lines_charge_instance_id ON smartrent.invoice_lines USING btree (charge_instance_id);
CREATE INDEX ix_invoice_lines_charge_type_id ON smartrent.invoice_lines USING btree (charge_type_id);
CREATE INDEX ix_invoice_lines_source_rate_id ON smartrent.invoice_lines USING btree (source_rate_id);
```

</details>

## invoice_meter_segments

Chỉ số đầu và cuối làm căn cứ cho dòng điện, nước; có nhiều đoạn khi thay công tơ giữa tháng.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `invoice_line_id` | `uuid` | Không | `—` |
| `from_reading_id` | `uuid` | Không | `—` |
| `to_reading_id` | `uuid` | Không | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `invoice_meter_segments_check`: `CHECK ((from_reading_id <> to_reading_id))`
- `invoice_meter_segments_from_reading_id_fkey`: `FOREIGN KEY (from_reading_id) REFERENCES smartrent.meter_readings(id)`
- `invoice_meter_segments_invoice_line_id_fkey`: `FOREIGN KEY (invoice_line_id) REFERENCES smartrent.invoice_lines(id) ON DELETE CASCADE`
- `invoice_meter_segments_to_reading_id_fkey`: `FOREIGN KEY (to_reading_id) REFERENCES smartrent.meter_readings(id)`
- `invoice_meter_segments_pkey`: `PRIMARY KEY (id)`
- `invoice_meter_segments_invoice_line_id_from_reading_id_to_r_key`: `UNIQUE (invoice_line_id, from_reading_id, to_reading_id)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX invoice_meter_segments_invoice_line_id_from_reading_id_to_r_key ON smartrent.invoice_meter_segments USING btree (invoice_line_id, from_reading_id, to_reading_id);
CREATE UNIQUE INDEX invoice_meter_segments_pkey ON smartrent.invoice_meter_segments USING btree (id);
CREATE INDEX ix_invoice_meter_segments_from_reading_id ON smartrent.invoice_meter_segments USING btree (from_reading_id);
CREATE INDEX ix_invoice_meter_segments_to_reading_id ON smartrent.invoice_meter_segments USING btree (to_reading_id);
```

</details>

## invoices

Hóa đơn nội bộ: tháng, cuối đợt thuê, phát sinh, thay thế, điều chỉnh tăng giảm, số dư đầu kỳ. Phát hành rồi không sửa, chỉ điều chỉnh hoặc hủy có lý do.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `tenancy_id` | `uuid` | Không | `—` |
| `billing_period_id` | `uuid` | Có | `—` |
| `kind` | `character varying(20)` | Không | `—` |
| `original_invoice_id` | `uuid` | Có | `—` |
| `code` | `character varying(80)` | Có | `—` |
| `status` | `character varying(8)` | Không | `'draft'::character varying` |
| `service_from` | `date` | Không | `—` |
| `service_to` | `date` | Không | `—` |
| `issued_on` | `date` | Có | `—` |
| `due_on` | `date` | Có | `—` |
| `issued_at` | `timestamp with time zone` | Có | `—` |
| `issued_by` | `uuid` | Có | `—` |
| `voided_at` | `timestamp with time zone` | Có | `—` |
| `voided_by` | `uuid` | Có | `—` |
| `void_reason` | `text` | Có | `—` |
| `notes` | `text` | Có | `—` |
| `needs_recompute` | `boolean` | Không | `false` Hóa đơn nháp cần tính lại vì chỉ số hoặc giá vừa đổi. |
| `idempotency_key` | `uuid` | Không | `—` |
| `created_by` | `uuid` | Không | `—` |
| `created_at` | `timestamp with time zone` | Không | `now()` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `invoices_check`: `CHECK ((service_to > service_from))`
- `invoices_check1`: `CHECK (((due_on IS NULL) OR (due_on >= issued_on)))`
- `invoices_check2`: `CHECK ((id IS DISTINCT FROM original_invoice_id))`
- `invoices_check3`: `CHECK ((((kind)::text = ANY ((ARRAY['replacement'::character varying, 'debit_adjustment'::character varying, 'credit_adjustment'::character varying])::text[])) = (original_invoice_id IS NOT NULL)))`
- `invoices_check4`: `CHECK ((((kind)::text <> 'periodic'::text) OR (billing_period_id IS NOT NULL)))`
- `invoices_check5`: `CHECK ((((status)::text <> 'issued'::text) OR ((code IS NOT NULL) AND (issued_on IS NOT NULL) AND (due_on IS NOT NULL) AND (issued_at IS NOT NULL) AND (issued_by IS NOT NULL))))`
- `invoices_check6`: `CHECK ((((status)::text <> 'void'::text) OR ((voided_at IS NOT NULL) AND (voided_by IS NOT NULL) AND (NULLIF(btrim(void_reason), ''::text) IS NOT NULL))))`
- `invoices_kind_check`: `CHECK (((kind)::text = ANY ((ARRAY['periodic'::character varying, 'final'::character varying, 'one_time'::character varying, 'replacement'::character varying, 'debit_adjustment'::character varying, 'credit_adjustment'::character varying, 'opening_balance'::character varying])::text[])))`
- `invoices_status_check`: `CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'issued'::character varying, 'void'::character varying])::text[])))`
- `invoices_billing_period_id_fkey`: `FOREIGN KEY (billing_period_id) REFERENCES smartrent.billing_periods(id)`
- `invoices_created_by_fkey`: `FOREIGN KEY (created_by) REFERENCES smartrent.users(id)`
- `invoices_issued_by_fkey`: `FOREIGN KEY (issued_by) REFERENCES smartrent.users(id)`
- `invoices_original_invoice_id_fkey`: `FOREIGN KEY (original_invoice_id) REFERENCES smartrent.invoices(id)`
- `invoices_tenancy_id_fkey`: `FOREIGN KEY (tenancy_id) REFERENCES smartrent.tenancies(id)`
- `invoices_voided_by_fkey`: `FOREIGN KEY (voided_by) REFERENCES smartrent.users(id)`
- `invoices_pkey`: `PRIMARY KEY (id)`
- `financial_balanced`: `TRIGGER DEFERRABLE INITIALLY DEFERRED`
- `invoices_code_key`: `UNIQUE (code)`
- `invoices_idempotency_key_key`: `UNIQUE (idempotency_key)`
- `invoices_tenancy_id_daterange_excl`: `EXCLUDE USING gist (tenancy_id WITH =, daterange(service_from, service_to, '[)'::text) WITH &&) WHERE ((((status)::text = 'issued'::text) AND ((kind)::text = ANY ((ARRAY['periodic'::character varying, 'replacement'::character varying])::text[]))))`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX invoices_code_key ON smartrent.invoices USING btree (code);
CREATE UNIQUE INDEX invoices_idempotency_key_key ON smartrent.invoices USING btree (idempotency_key);
CREATE UNIQUE INDEX invoices_pkey ON smartrent.invoices USING btree (id);
CREATE INDEX invoices_tenancy_id_daterange_excl ON smartrent.invoices USING gist (tenancy_id, daterange(service_from, service_to, '[)'::text)) WHERE (((status)::text = 'issued'::text) AND ((kind)::text = ANY ((ARRAY['periodic'::character varying, 'replacement'::character varying])::text[])));
CREATE INDEX ix_invoice_due ON smartrent.invoices USING btree (due_on) WHERE ((status)::text = 'issued'::text);
CREATE INDEX ix_invoice_period_status ON smartrent.invoices USING btree (billing_period_id, status);
CREATE INDEX ix_invoices_billing_period_id ON smartrent.invoices USING btree (billing_period_id);
CREATE INDEX ix_invoices_created_by ON smartrent.invoices USING btree (created_by);
CREATE INDEX ix_invoices_issued_by ON smartrent.invoices USING btree (issued_by);
CREATE INDEX ix_invoices_original_invoice_id ON smartrent.invoices USING btree (original_invoice_id);
CREATE INDEX ix_invoices_tenancy_id ON smartrent.invoices USING btree (tenancy_id);
CREATE INDEX ix_invoices_voided_by ON smartrent.invoices USING btree (voided_by);
CREATE UNIQUE INDEX ux_invoice_periodic ON smartrent.invoices USING btree (tenancy_id, billing_period_id) WHERE (((kind)::text = 'periodic'::text) AND ((status)::text <> 'void'::text));
CREATE UNIQUE INDEX ux_invoice_replacement ON smartrent.invoices USING btree (original_invoice_id) WHERE (((kind)::text = 'replacement'::text) AND ((status)::text <> 'void'::text));
```

</details>

## membership_properties

Cơ sở được giao cho nhân sự có property_scope = assigned (N-N).

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `membership_id` | `uuid` | Không | `—` |
| `property_id` | `uuid` | Không | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `membership_properties_membership_id_fkey`: `FOREIGN KEY (membership_id) REFERENCES smartrent.organization_memberships(id) ON DELETE CASCADE`
- `membership_properties_property_id_fkey`: `FOREIGN KEY (property_id) REFERENCES smartrent.properties(id)`
- `membership_properties_pkey`: `PRIMARY KEY (membership_id, property_id)`

<details><summary>Indexes</summary>

```sql
CREATE INDEX ix_membership_properties_property_id ON smartrent.membership_properties USING btree (property_id);
CREATE UNIQUE INDEX membership_properties_pkey ON smartrent.membership_properties USING btree (membership_id, property_id);
```

</details>

## membership_roles

Vai trò của từng nhân sự (N-N).

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `membership_id` | `uuid` | Không | `—` |
| `role_id` | `uuid` | Không | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `membership_roles_membership_id_fkey`: `FOREIGN KEY (membership_id) REFERENCES smartrent.organization_memberships(id) ON DELETE CASCADE`
- `membership_roles_role_id_fkey`: `FOREIGN KEY (role_id) REFERENCES smartrent.business_roles(id)`
- `membership_roles_pkey`: `PRIMARY KEY (membership_id, role_id)`

<details><summary>Indexes</summary>

```sql
CREATE INDEX ix_membership_roles_role_id ON smartrent.membership_roles USING btree (role_id);
CREATE UNIQUE INDEX membership_roles_pkey ON smartrent.membership_roles USING btree (membership_id, role_id);
```

</details>

## meter_readings

Chỉ số công tơ, không được giảm theo thời gian. Sửa số: hủy bản cũ có lý do rồi ghi bản mới; số đã lên hóa đơn phát hành thì không sửa được.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `meter_id` | `uuid` | Không | `—` |
| `observed_at` | `timestamp with time zone` | Không | `—` |
| `reading_value` | `numeric(18,3)` | Không | `—` |
| `billing_period_id` | `uuid` | Có | `—` |
| `tenancy_id` | `uuid` | Có | `—` |
| `handover_id` | `uuid` | Có | `—` |
| `reading_kind` | `character varying(12)` | Không | `—` |
| `status` | `character varying(8)` | Không | `'valid'::character varying` |
| `supersedes_id` | `uuid` | Có | `—` |
| `void_reason` | `text` | Có | `—` |
| `notes` | `text` | Có | `—` |
| `recorded_by` | `uuid` | Không | `—` |
| `recorded_at` | `timestamp with time zone` | Không | `now()` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `meter_readings_check`: `CHECK ((id IS DISTINCT FROM supersedes_id))`
- `meter_readings_check1`: `CHECK ((((status)::text <> 'void'::text) OR (NULLIF(btrim(void_reason), ''::text) IS NOT NULL)))`
- `meter_readings_reading_kind_check`: `CHECK (((reading_kind)::text = ANY ((ARRAY['baseline'::character varying, 'periodic'::character varying, 'checkin'::character varying, 'checkout'::character varying, 'replacement'::character varying])::text[])))`
- `meter_readings_reading_value_check`: `CHECK ((reading_value >= (0)::numeric))`
- `meter_readings_status_check`: `CHECK (((status)::text = ANY ((ARRAY['valid'::character varying, 'void'::character varying])::text[])))`
- `meter_readings_billing_period_id_fkey`: `FOREIGN KEY (billing_period_id) REFERENCES smartrent.billing_periods(id)`
- `meter_readings_handover_id_fkey`: `FOREIGN KEY (handover_id) REFERENCES smartrent.handovers(id)`
- `meter_readings_meter_id_fkey`: `FOREIGN KEY (meter_id) REFERENCES smartrent.meters(id)`
- `meter_readings_recorded_by_fkey`: `FOREIGN KEY (recorded_by) REFERENCES smartrent.users(id)`
- `meter_readings_supersedes_id_fkey`: `FOREIGN KEY (supersedes_id) REFERENCES smartrent.meter_readings(id)`
- `meter_readings_tenancy_id_fkey`: `FOREIGN KEY (tenancy_id) REFERENCES smartrent.tenancies(id)`
- `meter_readings_pkey`: `PRIMARY KEY (id)`
- `meter_readings_supersedes_id_key`: `UNIQUE (supersedes_id)`

<details><summary>Indexes</summary>

```sql
CREATE INDEX ix_meter_history ON smartrent.meter_readings USING btree (meter_id, observed_at DESC) WHERE ((status)::text = 'valid'::text);
CREATE INDEX ix_meter_readings_billing_period_id ON smartrent.meter_readings USING btree (billing_period_id);
CREATE INDEX ix_meter_readings_handover_id ON smartrent.meter_readings USING btree (handover_id);
CREATE INDEX ix_meter_readings_meter_id ON smartrent.meter_readings USING btree (meter_id);
CREATE INDEX ix_meter_readings_recorded_by ON smartrent.meter_readings USING btree (recorded_by);
CREATE INDEX ix_meter_readings_tenancy_id ON smartrent.meter_readings USING btree (tenancy_id);
CREATE UNIQUE INDEX meter_readings_pkey ON smartrent.meter_readings USING btree (id);
CREATE UNIQUE INDEX meter_readings_supersedes_id_key ON smartrent.meter_readings USING btree (supersedes_id);
CREATE UNIQUE INDEX ux_meter_observed ON smartrent.meter_readings USING btree (meter_id, observed_at) WHERE ((status)::text = 'valid'::text);
CREATE UNIQUE INDEX ux_reading_periodic ON smartrent.meter_readings USING btree (meter_id, billing_period_id) WHERE (((status)::text = 'valid'::text) AND ((reading_kind)::text = 'periodic'::text) AND (billing_period_id IS NOT NULL));
```

</details>

## meters

Công tơ điện, nước của phòng; mỗi phòng một công tơ đang dùng cho mỗi loại. Thay công tơ: chốt removed_at rồi thêm công tơ mới.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `room_id` | `uuid` | Không | `—` |
| `meter_kind` | `character varying(12)` | Không | `—` |
| `serial_number` | `character varying(100)` | Không | `—` |
| `installed_at` | `timestamp with time zone` | Không | `—` |
| `removed_at` | `timestamp with time zone` | Có | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `meters_check`: `CHECK (((removed_at IS NULL) OR (removed_at > installed_at)))`
- `meters_meter_kind_check`: `CHECK (((meter_kind)::text = ANY ((ARRAY['electricity'::character varying, 'water'::character varying])::text[])))`
- `meters_room_id_fkey`: `FOREIGN KEY (room_id) REFERENCES smartrent.rooms(id) ON DELETE CASCADE`
- `meters_pkey`: `PRIMARY KEY (id)`
- `meters_room_id_meter_kind_tstzrange_excl`: `EXCLUDE USING gist (room_id WITH =, meter_kind WITH =, tstzrange(installed_at, removed_at, '[)'::text) WITH &&)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX meters_pkey ON smartrent.meters USING btree (id);
CREATE INDEX meters_room_id_meter_kind_tstzrange_excl ON smartrent.meters USING gist (room_id, meter_kind, tstzrange(installed_at, removed_at, '[)'::text));
```

</details>

## notifications

Thông báo ở chuông trên đầu trang. event_key chống gửi trùng cùng một sự kiện.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `organization_id` | `uuid` | Có | `—` |
| `recipient_id` | `uuid` | Không | `—` |
| `event_key` | `character varying(250)` | Không | `—` |
| `title` | `text` | Không | `—` |
| `body` | `text` | Không | `—` |
| `relative_url` | `text` | Có | `—` |
| `read_at` | `timestamp with time zone` | Có | `—` |
| `created_at` | `timestamp with time zone` | Không | `now()` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `notifications_organization_id_fkey`: `FOREIGN KEY (organization_id) REFERENCES smartrent.organizations(id)`
- `notifications_recipient_id_fkey`: `FOREIGN KEY (recipient_id) REFERENCES smartrent.users(id)`
- `notifications_pkey`: `PRIMARY KEY (id)`
- `notifications_recipient_id_event_key_key`: `UNIQUE (recipient_id, event_key)`

<details><summary>Indexes</summary>

```sql
CREATE INDEX ix_notifications_organization_id ON smartrent.notifications USING btree (organization_id);
CREATE INDEX ix_notifications_unread ON smartrent.notifications USING btree (recipient_id, created_at DESC) WHERE (read_at IS NULL);
CREATE UNIQUE INDEX notifications_pkey ON smartrent.notifications USING btree (id);
CREATE UNIQUE INDEX notifications_recipient_id_event_key_key ON smartrent.notifications USING btree (recipient_id, event_key);
```

</details>

## organization_memberships

Nhân sự của đơn vị: chủ trọ, quản lý, nhân viên; property_scope quyết định xem mọi cơ sở hay chỉ cơ sở được giao.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `organization_id` | `uuid` | Không | `—` |
| `user_id` | `uuid` | Không | `—` |
| `status` | `character varying(20)` | Không | `'active'::character varying` |
| `property_scope` | `character varying(10)` | Không | `'assigned'::character varying` |
| `joined_at` | `timestamp with time zone` | Không | `now()` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `organization_memberships_property_scope_check`: `CHECK (((property_scope)::text = ANY ((ARRAY['all'::character varying, 'assigned'::character varying])::text[])))`
- `organization_memberships_status_check`: `CHECK (((status)::text = ANY ((ARRAY['invited'::character varying, 'active'::character varying, 'suspended'::character varying, 'left'::character varying])::text[])))`
- `organization_memberships_organization_id_fkey`: `FOREIGN KEY (organization_id) REFERENCES smartrent.organizations(id)`
- `organization_memberships_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES smartrent.users(id)`
- `organization_memberships_pkey`: `PRIMARY KEY (id)`
- `organization_memberships_organization_id_user_id_key`: `UNIQUE (organization_id, user_id)`

<details><summary>Indexes</summary>

```sql
CREATE INDEX ix_organization_memberships_user_id ON smartrent.organization_memberships USING btree (user_id);
CREATE UNIQUE INDEX organization_memberships_organization_id_user_id_key ON smartrent.organization_memberships USING btree (organization_id, user_id);
CREATE UNIQUE INDEX organization_memberships_pkey ON smartrent.organization_memberships USING btree (id);
```

</details>

## organization_settings

Lịch nhắc ở Cài đặt: ngày nhập số điện nước và ngày tạo hóa đơn hằng tháng.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `organization_id` | `uuid` | Không | `—` |
| `timezone` | `character varying(60)` | Không | `'Asia/Ho_Chi_Minh'::character varying` |
| `meter_reading_day` | `smallint` | Không | `25` |
| `invoice_create_day` | `smallint` | Không | `28` |
| `billing_reminder_enabled` | `boolean` | Không | `true` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `organization_settings_check`: `CHECK ((invoice_create_day >= meter_reading_day))`
- `organization_settings_invoice_create_day_check`: `CHECK (((invoice_create_day >= 1) AND (invoice_create_day <= 28)))`
- `organization_settings_meter_reading_day_check`: `CHECK (((meter_reading_day >= 1) AND (meter_reading_day <= 28)))`
- `organization_settings_organization_id_fkey`: `FOREIGN KEY (organization_id) REFERENCES smartrent.organizations(id) ON DELETE CASCADE`
- `organization_settings_pkey`: `PRIMARY KEY (organization_id)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX organization_settings_pkey ON smartrent.organization_settings USING btree (organization_id);
```

</details>

## organizations

Đơn vị chủ trọ. Quản trị hệ thống tạo, tạm ngưng hoặc mở lại đơn vị.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `code` | `character varying(40)` | Không | `—` |
| `name` | `character varying(250)` | Không | `—` |
| `legal_name` | `character varying(250)` | Có | `—` |
| `tax_code` | `character varying(30)` | Có | `—` |
| `phone` | `character varying(30)` | Có | `—` |
| `email` | `character varying(256)` | Có | `—` |
| `is_active` | `boolean` | Không | `true` |
| `suspended_reason` | `text` | Có | `—` |
| `created_at` | `timestamp with time zone` | Không | `now()` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `organizations_pkey`: `PRIMARY KEY (id)`
- `organizations_code_key`: `UNIQUE (code)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX organizations_code_key ON smartrent.organizations USING btree (code);
CREATE UNIQUE INDEX organizations_pkey ON smartrent.organizations USING btree (id);
```

</details>

## payment_allocations

Phân bổ tiền vào hóa đơn, từ một khoản thu hoặc từ bù trừ cọc. Hoàn tác bằng dòng đảo liên kết, không sửa dòng cũ.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `invoice_id` | `uuid` | Không | `—` |
| `payment_id` | `uuid` | Có | `—` |
| `deposit_entry_id` | `uuid` | Có | `—` |
| `kind` | `character varying(10)` | Không | `—` |
| `amount` | `numeric(18,0)` | Không | `—` |
| `reverses_id` | `uuid` | Có | `—` |
| `allocated_by` | `uuid` | Không | `—` |
| `allocated_at` | `timestamp with time zone` | Không | `now()` |
| `reason` | `text` | Có | `—` |
| `idempotency_key` | `uuid` | Không | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `payment_allocations_amount_check`: `CHECK ((amount > (0)::numeric))`
- `payment_allocations_check`: `CHECK ((num_nonnulls(payment_id, deposit_entry_id) = 1))`
- `payment_allocations_check1`: `CHECK ((((kind)::text = 'reversal'::text) = (reverses_id IS NOT NULL)))`
- `payment_allocations_check2`: `CHECK ((id IS DISTINCT FROM reverses_id))`
- `payment_allocations_check3`: `CHECK ((((kind)::text <> 'reversal'::text) OR (NULLIF(btrim(reason), ''::text) IS NOT NULL)))`
- `payment_allocations_kind_check`: `CHECK (((kind)::text = ANY ((ARRAY['apply'::character varying, 'reversal'::character varying])::text[])))`
- `payment_allocations_allocated_by_fkey`: `FOREIGN KEY (allocated_by) REFERENCES smartrent.users(id)`
- `payment_allocations_deposit_entry_id_fkey`: `FOREIGN KEY (deposit_entry_id) REFERENCES smartrent.deposit_entries(id)`
- `payment_allocations_invoice_id_fkey`: `FOREIGN KEY (invoice_id) REFERENCES smartrent.invoices(id)`
- `payment_allocations_payment_id_fkey`: `FOREIGN KEY (payment_id) REFERENCES smartrent.payments(id)`
- `payment_allocations_reverses_id_fkey`: `FOREIGN KEY (reverses_id) REFERENCES smartrent.payment_allocations(id)`
- `payment_allocations_pkey`: `PRIMARY KEY (id)`
- `financial_balanced`: `TRIGGER DEFERRABLE INITIALLY DEFERRED`
- `payment_allocations_idempotency_key_key`: `UNIQUE (idempotency_key)`

<details><summary>Indexes</summary>

```sql
CREATE INDEX ix_payment_allocations_allocated_by ON smartrent.payment_allocations USING btree (allocated_by);
CREATE INDEX ix_payment_allocations_deposit_entry_id ON smartrent.payment_allocations USING btree (deposit_entry_id);
CREATE INDEX ix_payment_allocations_invoice_id ON smartrent.payment_allocations USING btree (invoice_id);
CREATE INDEX ix_payment_allocations_payment_id ON smartrent.payment_allocations USING btree (payment_id);
CREATE INDEX ix_payment_allocations_reverses_id ON smartrent.payment_allocations USING btree (reverses_id);
CREATE UNIQUE INDEX payment_allocations_idempotency_key_key ON smartrent.payment_allocations USING btree (idempotency_key);
CREATE UNIQUE INDEX payment_allocations_pkey ON smartrent.payment_allocations USING btree (id);
```

</details>

## payment_files

Ảnh biên lai khách gửi kèm khi báo chuyển khoản.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `payment_id` | `uuid` | Không | `—` |
| `file_id` | `uuid` | Không | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `payment_files_file_id_fkey`: `FOREIGN KEY (file_id) REFERENCES smartrent.stored_files(id)`
- `payment_files_payment_id_fkey`: `FOREIGN KEY (payment_id) REFERENCES smartrent.payments(id)`
- `payment_files_pkey`: `PRIMARY KEY (payment_id, file_id)`

<details><summary>Indexes</summary>

```sql
CREATE INDEX ix_payment_files_file_id ON smartrent.payment_files USING btree (file_id);
CREATE UNIQUE INDEX payment_files_pkey ON smartrent.payment_files USING btree (payment_id, file_id);
```

</details>

## payment_intended_invoices

Hóa đơn khách chọn khi báo chuyển khoản. Chỉ là gợi ý cho quản lý, chưa phải phân bổ tiền.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `payment_id` | `uuid` | Không | `—` |
| `invoice_id` | `uuid` | Không | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `payment_intended_invoices_invoice_id_fkey`: `FOREIGN KEY (invoice_id) REFERENCES smartrent.invoices(id)`
- `payment_intended_invoices_payment_id_fkey`: `FOREIGN KEY (payment_id) REFERENCES smartrent.payments(id)`
- `payment_intended_invoices_pkey`: `PRIMARY KEY (payment_id, invoice_id)`

<details><summary>Indexes</summary>

```sql
CREATE INDEX ix_payment_intended_invoices_invoice_id ON smartrent.payment_intended_invoices USING btree (invoice_id);
CREATE UNIQUE INDEX payment_intended_invoices_pkey ON smartrent.payment_intended_invoices USING btree (payment_id, invoice_id);
```

</details>

## payment_methods

Cách thanh toán: tiền mặt, chuyển khoản, khác.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `code` | `character varying(30)` | Không | `—` |
| `name` | `character varying(100)` | Không | `—` |
| `is_active` | `boolean` | Không | `true` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `payment_methods_pkey`: `PRIMARY KEY (code)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX payment_methods_pkey ON smartrent.payment_methods USING btree (code);
```

</details>

## payment_reversals

Đảo khoản thu nhập sai hoặc hoàn tiền; giữ nguyên khoản thu gốc, không xóa dấu vết.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `payment_id` | `uuid` | Không | `—` |
| `amount` | `numeric(18,0)` | Không | `—` |
| `kind` | `character varying(10)` | Không | `—` |
| `occurred_at` | `timestamp with time zone` | Không | `—` |
| `method_code` | `character varying(30)` | Không | `—` |
| `evidence_file_id` | `uuid` | Có | `—` |
| `external_reference` | `character varying(200)` | Có | `—` |
| `reason` | `text` | Không | `—` |
| `confirmed_by` | `uuid` | Không | `—` |
| `idempotency_key` | `uuid` | Không | `—` |
| `created_at` | `timestamp with time zone` | Không | `now()` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `payment_reversals_amount_check`: `CHECK ((amount > (0)::numeric))`
- `payment_reversals_kind_check`: `CHECK (((kind)::text = ANY ((ARRAY['correction'::character varying, 'refund'::character varying])::text[])))`
- `payment_reversals_reason_check`: `CHECK ((btrim(reason) <> ''::text))`
- `payment_reversals_confirmed_by_fkey`: `FOREIGN KEY (confirmed_by) REFERENCES smartrent.users(id)`
- `payment_reversals_evidence_file_id_fkey`: `FOREIGN KEY (evidence_file_id) REFERENCES smartrent.stored_files(id)`
- `payment_reversals_method_code_fkey`: `FOREIGN KEY (method_code) REFERENCES smartrent.payment_methods(code)`
- `payment_reversals_payment_id_fkey`: `FOREIGN KEY (payment_id) REFERENCES smartrent.payments(id)`
- `payment_reversals_pkey`: `PRIMARY KEY (id)`
- `financial_balanced`: `TRIGGER DEFERRABLE INITIALLY DEFERRED`
- `payment_reversals_idempotency_key_key`: `UNIQUE (idempotency_key)`

<details><summary>Indexes</summary>

```sql
CREATE INDEX ix_payment_reversals_confirmed_by ON smartrent.payment_reversals USING btree (confirmed_by);
CREATE INDEX ix_payment_reversals_evidence_file_id ON smartrent.payment_reversals USING btree (evidence_file_id);
CREATE INDEX ix_payment_reversals_method_code ON smartrent.payment_reversals USING btree (method_code);
CREATE INDEX ix_payment_reversals_payment_id ON smartrent.payment_reversals USING btree (payment_id);
CREATE UNIQUE INDEX payment_reversals_idempotency_key_key ON smartrent.payment_reversals USING btree (idempotency_key);
CREATE UNIQUE INDEX payment_reversals_pkey ON smartrent.payment_reversals USING btree (id);
```

</details>

## payments

Tiền thực nhận hoặc khách báo đã chuyển. Báo chuyển khoản là pending, chưa tính đã thu; chỉ confirmed mới phân bổ được.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `code` | `character varying(80)` | Không | `—` |
| `tenant_id` | `uuid` | Không | `—` |
| `property_id` | `uuid` | Có | `—` |
| `amount` | `numeric(18,0)` | Không | `—` |
| `received_at` | `timestamp with time zone` | Không | `—` |
| `method_code` | `character varying(30)` | Không | `—` |
| `bank_account_id` | `uuid` | Có | `—` |
| `external_reference` | `character varying(200)` | Có | `—` |
| `status` | `character varying(10)` | Không | `'pending'::character varying` |
| `confirmed_by` | `uuid` | Có | `—` |
| `confirmed_at` | `timestamp with time zone` | Có | `—` |
| `rejection_reason` | `text` | Có | `—` |
| `reported_by` | `uuid` | Có | `—` |
| `notes` | `text` | Có | `—` |
| `idempotency_key` | `uuid` | Không | `—` |
| `created_at` | `timestamp with time zone` | Không | `now()` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `payments_amount_check`: `CHECK ((amount > (0)::numeric))`
- `payments_check`: `CHECK (((((status)::text = 'confirmed'::text) AND (confirmed_by IS NOT NULL) AND (confirmed_at IS NOT NULL)) OR (((status)::text <> 'confirmed'::text) AND (confirmed_by IS NULL) AND (confirmed_at IS NULL))))`
- `payments_check1`: `CHECK ((((status)::text <> 'rejected'::text) OR (NULLIF(btrim(rejection_reason), ''::text) IS NOT NULL)))`
- `payments_status_check`: `CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'confirmed'::character varying, 'rejected'::character varying])::text[])))`
- `payments_bank_account_id_fkey`: `FOREIGN KEY (bank_account_id) REFERENCES smartrent.bank_accounts(id)`
- `payments_confirmed_by_fkey`: `FOREIGN KEY (confirmed_by) REFERENCES smartrent.users(id)`
- `payments_method_code_fkey`: `FOREIGN KEY (method_code) REFERENCES smartrent.payment_methods(code)`
- `payments_property_id_fkey`: `FOREIGN KEY (property_id) REFERENCES smartrent.properties(id)`
- `payments_reported_by_fkey`: `FOREIGN KEY (reported_by) REFERENCES smartrent.users(id)`
- `payments_tenant_id_fkey`: `FOREIGN KEY (tenant_id) REFERENCES smartrent.tenants(id)`
- `payments_pkey`: `PRIMARY KEY (id)`
- `financial_balanced`: `TRIGGER DEFERRABLE INITIALLY DEFERRED`
- `payments_code_key`: `UNIQUE (code)`
- `payments_idempotency_key_key`: `UNIQUE (idempotency_key)`

<details><summary>Indexes</summary>

```sql
CREATE INDEX ix_payments_bank_account_id ON smartrent.payments USING btree (bank_account_id);
CREATE INDEX ix_payments_confirmed_by ON smartrent.payments USING btree (confirmed_by);
CREATE INDEX ix_payments_method_code ON smartrent.payments USING btree (method_code);
CREATE INDEX ix_payments_pending ON smartrent.payments USING btree (created_at DESC) WHERE ((status)::text = 'pending'::text);
CREATE INDEX ix_payments_property_id ON smartrent.payments USING btree (property_id);
CREATE INDEX ix_payments_reported_by ON smartrent.payments USING btree (reported_by);
CREATE INDEX ix_payments_tenant_id ON smartrent.payments USING btree (tenant_id);
CREATE UNIQUE INDEX payments_code_key ON smartrent.payments USING btree (code);
CREATE UNIQUE INDEX payments_idempotency_key_key ON smartrent.payments USING btree (idempotency_key);
CREATE UNIQUE INDEX payments_pkey ON smartrent.payments USING btree (id);
CREATE UNIQUE INDEX ux_bank_reference ON smartrent.payments USING btree (bank_account_id, external_reference) WHERE ((bank_account_id IS NOT NULL) AND (external_reference IS NOT NULL) AND ((status)::text <> 'rejected'::text));
```

</details>

## permissions

Danh mục quyền nhỏ mà router và API đang kiểm tra, ví dụ invoices.issue, payments.confirm.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `code` | `character varying(100)` | Không | `—` |
| `description` | `text` | Không | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `permissions_pkey`: `PRIMARY KEY (code)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX permissions_pkey ON smartrent.permissions USING btree (code);
```

</details>

## properties

Cơ sở (nhà trọ). Địa chỉ nhập tay; invoice_day và due_after_days là mặc định khi lập hóa đơn. Giá điện nước, phí nằm ở charge_rates.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `organization_id` | `uuid` | Không | `—` |
| `code` | `character varying(40)` | Không | `—` |
| `name` | `character varying(200)` | Không | `—` |
| `address_line` | `text` | Không | `—` |
| `locality` | `character varying(150)` | Không | `—` |
| `province` | `character varying(100)` | Không | `—` |
| `latitude` | `numeric(10,7)` | Có | `—` |
| `longitude` | `numeric(10,7)` | Có | `—` |
| `description` | `text` | Có | `—` |
| `contact_name` | `character varying(200)` | Có | `—` |
| `phone` | `character varying(30)` | Có | `—` |
| `email` | `character varying(256)` | Có | `—` |
| `invoice_day` | `smallint` | Không | `28` |
| `due_after_days` | `smallint` | Không | `7` |
| `contract_warning_days` | `smallint` | Không | `30` |
| `proration_policy` | `character varying(20)` | Không | `'actual_days'::character varying` |
| `is_active` | `boolean` | Không | `true` |
| `created_at` | `timestamp with time zone` | Không | `now()` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `properties_contract_warning_days_check`: `CHECK ((contract_warning_days >= 0))`
- `properties_due_after_days_check`: `CHECK (((due_after_days >= 0) AND (due_after_days <= 365)))`
- `properties_invoice_day_check`: `CHECK (((invoice_day >= 1) AND (invoice_day <= 31)))`
- `properties_latitude_check`: `CHECK (((latitude >= ('-90'::integer)::numeric) AND (latitude <= (90)::numeric)))`
- `properties_longitude_check`: `CHECK (((longitude >= ('-180'::integer)::numeric) AND (longitude <= (180)::numeric)))`
- `properties_proration_policy_check`: `CHECK (((proration_policy)::text = ANY ((ARRAY['actual_days'::character varying, 'full_month'::character varying])::text[])))`
- `properties_organization_id_fkey`: `FOREIGN KEY (organization_id) REFERENCES smartrent.organizations(id)`
- `properties_pkey`: `PRIMARY KEY (id)`
- `properties_organization_id_code_key`: `UNIQUE (organization_id, code)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX properties_organization_id_code_key ON smartrent.properties USING btree (organization_id, code);
CREATE UNIQUE INDEX properties_pkey ON smartrent.properties USING btree (id);
```

</details>

## rental_inquiries

Yêu cầu xem phòng khách đặt ở trang phòng, xử lý ở Lịch xem phòng của admin. Không giữ chỗ, không đổi trạng thái phòng.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `code` | `character varying(80)` | Không | `—` |
| `room_id` | `uuid` | Không | `—` |
| `tenant_id` | `uuid` | Có | `—` |
| `source` | `character varying(10)` | Không | `'public'::character varying` |
| `contact_name` | `character varying(200)` | Không | `—` |
| `phone` | `character varying(30)` | Có | `—` |
| `email` | `character varying(256)` | Có | `—` |
| `desired_move_in` | `date` | Có | `—` |
| `preferred_viewing_at` | `timestamp with time zone` | Có | `—` |
| `occupants` | `smallint` | Không | `1` |
| `message` | `text` | Có | `—` |
| `status` | `character varying(15)` | Không | `'new'::character varying` |
| `assigned_to` | `uuid` | Có | `—` |
| `closed_reason` | `text` | Có | `—` |
| `created_at` | `timestamp with time zone` | Không | `now()` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `rental_inquiries_check`: `CHECK (((NULLIF(btrim((phone)::text), ''::text) IS NOT NULL) OR (NULLIF(btrim((email)::text), ''::text) IS NOT NULL)))`
- `rental_inquiries_check1`: `CHECK ((((status)::text <> ALL ((ARRAY['rejected'::character varying, 'cancelled'::character varying])::text[])) OR (NULLIF(btrim(closed_reason), ''::text) IS NOT NULL)))`
- `rental_inquiries_occupants_check`: `CHECK ((occupants > 0))`
- `rental_inquiries_source_check`: `CHECK (((source)::text = ANY ((ARRAY['public'::character varying, 'staff'::character varying])::text[])))`
- `rental_inquiries_status_check`: `CHECK (((status)::text = ANY ((ARRAY['new'::character varying, 'accepted'::character varying, 'consulting'::character varying, 'viewing'::character varying, 'approved'::character varying, 'rejected'::character varying, 'cancelled'::character varying, 'converted'::character varying])::text[])))`
- `rental_inquiries_assigned_to_fkey`: `FOREIGN KEY (assigned_to) REFERENCES smartrent.users(id)`
- `rental_inquiries_room_id_fkey`: `FOREIGN KEY (room_id) REFERENCES smartrent.rooms(id)`
- `rental_inquiries_tenant_id_fkey`: `FOREIGN KEY (tenant_id) REFERENCES smartrent.tenants(id)`
- `rental_inquiries_pkey`: `PRIMARY KEY (id)`
- `rental_inquiries_code_key`: `UNIQUE (code)`

<details><summary>Indexes</summary>

```sql
CREATE INDEX ix_inquiries_queue ON smartrent.rental_inquiries USING btree (status, created_at DESC);
CREATE INDEX ix_rental_inquiries_assigned_to ON smartrent.rental_inquiries USING btree (assigned_to);
CREATE INDEX ix_rental_inquiries_room_id ON smartrent.rental_inquiries USING btree (room_id);
CREATE INDEX ix_rental_inquiries_tenant_id ON smartrent.rental_inquiries USING btree (tenant_id);
CREATE UNIQUE INDEX rental_inquiries_code_key ON smartrent.rental_inquiries USING btree (code);
CREATE UNIQUE INDEX rental_inquiries_pkey ON smartrent.rental_inquiries USING btree (id);
CREATE UNIQUE INDEX ux_inquiry_open ON smartrent.rental_inquiries USING btree (tenant_id, room_id) WHERE ((tenant_id IS NOT NULL) AND ((status)::text = ANY ((ARRAY['new'::character varying, 'accepted'::character varying, 'consulting'::character varying, 'viewing'::character varying, 'approved'::character varying])::text[])));
```

</details>

## role_claims

Claim của vai trò toàn hệ thống, bảng chuẩn của Identity.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `integer` | Không | `GENERATED BY DEFAULT AS IDENTITY` |
| `role_id` | `uuid` | Không | `—` |
| `claim_type` | `text` | Có | `—` |
| `claim_value` | `text` | Có | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `role_claims_role_id_fkey`: `FOREIGN KEY (role_id) REFERENCES smartrent.roles(id) ON DELETE CASCADE`
- `role_claims_pkey`: `PRIMARY KEY (id)`

<details><summary>Indexes</summary>

```sql
CREATE INDEX ix_role_claims_role_id ON smartrent.role_claims USING btree (role_id);
CREATE UNIQUE INDEX role_claims_pkey ON smartrent.role_claims USING btree (id);
```

</details>

## roles

Vai trò toàn hệ thống của Identity, hiện chỉ có SystemAdmin. Không dùng để cấp quyền trong đơn vị.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `name` | `character varying(256)` | Có | `—` |
| `normalized_name` | `character varying(256)` | Có | `—` |
| `concurrency_stamp` | `text` | Có | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `roles_pkey`: `PRIMARY KEY (id)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX roles_pkey ON smartrent.roles USING btree (id);
CREATE UNIQUE INDEX ux_roles_name ON smartrent.roles USING btree (normalized_name) WHERE (normalized_name IS NOT NULL);
```

</details>

## room_amenities

Tiện ích của từng phòng (N-N).

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `room_id` | `uuid` | Không | `—` |
| `amenity_id` | `uuid` | Không | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `room_amenities_amenity_id_fkey`: `FOREIGN KEY (amenity_id) REFERENCES smartrent.amenities(id)`
- `room_amenities_room_id_fkey`: `FOREIGN KEY (room_id) REFERENCES smartrent.rooms(id) ON DELETE CASCADE`
- `room_amenities_pkey`: `PRIMARY KEY (room_id, amenity_id)`

<details><summary>Indexes</summary>

```sql
CREATE INDEX ix_room_amenities_amenity_id ON smartrent.room_amenities USING btree (amenity_id);
CREATE UNIQUE INDEX room_amenities_pkey ON smartrent.room_amenities USING btree (room_id, amenity_id);
```

</details>

## room_images

Ảnh phòng, thứ tự và ảnh bìa; mỗi phòng tối đa một ảnh bìa.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `room_id` | `uuid` | Không | `—` |
| `file_id` | `uuid` | Không | `—` |
| `sort_order` | `integer` | Không | `0` |
| `is_cover` | `boolean` | Không | `false` |
| `caption` | `text` | Có | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `room_images_sort_order_check`: `CHECK ((sort_order >= 0))`
- `room_images_file_id_fkey`: `FOREIGN KEY (file_id) REFERENCES smartrent.stored_files(id)`
- `room_images_room_id_fkey`: `FOREIGN KEY (room_id) REFERENCES smartrent.rooms(id) ON DELETE CASCADE`
- `room_images_pkey`: `PRIMARY KEY (id)`
- `room_images_room_id_file_id_key`: `UNIQUE (room_id, file_id)`

<details><summary>Indexes</summary>

```sql
CREATE INDEX ix_room_images_file_id ON smartrent.room_images USING btree (file_id);
CREATE UNIQUE INDEX room_images_pkey ON smartrent.room_images USING btree (id);
CREATE UNIQUE INDEX room_images_room_id_file_id_key ON smartrent.room_images USING btree (room_id, file_id);
CREATE UNIQUE INDEX ux_room_cover ON smartrent.room_images USING btree (room_id) WHERE is_cover;
```

</details>

## room_listings

Tin đăng ở trang Thuê phòng, độc lập với việc có người ở; slug là đường dẫn /rooms/:slug.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `room_id` | `uuid` | Không | `—` |
| `slug` | `character varying(250)` | Không | `—` |
| `title` | `character varying(250)` | Không | `—` |
| `description` | `text` | Có | `—` |
| `video_url` | `text` | Có | `—` |
| `status` | `character varying(10)` | Không | `'draft'::character varying` |
| `published_at` | `timestamp with time zone` | Có | `—` |
| `updated_at` | `timestamp with time zone` | Không | `now()` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `room_listings_status_check`: `CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'published'::character varying, 'hidden'::character varying])::text[])))`
- `room_listings_room_id_fkey`: `FOREIGN KEY (room_id) REFERENCES smartrent.rooms(id) ON DELETE CASCADE`
- `room_listings_pkey`: `PRIMARY KEY (id)`
- `room_listings_room_id_key`: `UNIQUE (room_id)`
- `room_listings_slug_key`: `UNIQUE (slug)`

<details><summary>Indexes</summary>

```sql
CREATE INDEX ix_listing_published ON smartrent.room_listings USING btree (status, published_at DESC);
CREATE UNIQUE INDEX room_listings_pkey ON smartrent.room_listings USING btree (id);
CREATE UNIQUE INDEX room_listings_room_id_key ON smartrent.room_listings USING btree (room_id);
CREATE UNIQUE INDEX room_listings_slug_key ON smartrent.room_listings USING btree (slug);
```

</details>

## room_status_events

Lịch sử đưa phòng vào bảo trì, ngừng khai thác hoặc khai thác lại, có lý do.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `room_id` | `uuid` | Không | `—` |
| `old_status` | `character varying(15)` | Có | `—` |
| `new_status` | `character varying(15)` | Không | `—` |
| `reason` | `text` | Không | `—` |
| `changed_by` | `uuid` | Có | `—` |
| `changed_at` | `timestamp with time zone` | Không | `now()` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `room_status_events_reason_check`: `CHECK ((btrim(reason) <> ''::text))`
- `room_status_events_changed_by_fkey`: `FOREIGN KEY (changed_by) REFERENCES smartrent.users(id)`
- `room_status_events_room_id_fkey`: `FOREIGN KEY (room_id) REFERENCES smartrent.rooms(id) ON DELETE CASCADE`
- `room_status_events_pkey`: `PRIMARY KEY (id)`

<details><summary>Indexes</summary>

```sql
CREATE INDEX ix_room_status_events_changed_by ON smartrent.room_status_events USING btree (changed_by);
CREATE INDEX ix_room_status_events_room_id ON smartrent.room_status_events USING btree (room_id);
CREATE UNIQUE INDEX room_status_events_pkey ON smartrent.room_status_events USING btree (id);
```

</details>

## room_types

Loại phòng, dùng để lọc ở trang Thuê phòng. Form admin không hỏi loại nên phòng mới nhận loại STANDARD của đơn vị.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `organization_id` | `uuid` | Không | `—` |
| `code` | `character varying(40)` | Không | `—` |
| `name` | `character varying(100)` | Không | `—` |
| `description` | `text` | Có | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `room_types_organization_id_fkey`: `FOREIGN KEY (organization_id) REFERENCES smartrent.organizations(id)`
- `room_types_pkey`: `PRIMARY KEY (id)`
- `room_types_organization_id_code_key`: `UNIQUE (organization_id, code)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX room_types_organization_id_code_key ON smartrent.room_types USING btree (organization_id, code);
CREATE UNIQUE INDEX room_types_pkey ON smartrent.room_types USING btree (id);
```

</details>

## room_viewings

Lịch hẹn xem phòng admin xếp và kết quả sau khi xem.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `inquiry_id` | `uuid` | Không | `—` |
| `starts_at` | `timestamp with time zone` | Không | `—` |
| `ends_at` | `timestamp with time zone` | Không | `—` |
| `host_user_id` | `uuid` | Có | `—` |
| `status` | `character varying(12)` | Không | `'scheduled'::character varying` |
| `result_notes` | `text` | Có | `—` |
| `created_at` | `timestamp with time zone` | Không | `now()` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `room_viewings_check`: `CHECK ((ends_at > starts_at))`
- `room_viewings_status_check`: `CHECK (((status)::text = ANY ((ARRAY['scheduled'::character varying, 'completed'::character varying, 'cancelled'::character varying, 'no_show'::character varying])::text[])))`
- `room_viewings_host_user_id_fkey`: `FOREIGN KEY (host_user_id) REFERENCES smartrent.users(id)`
- `room_viewings_inquiry_id_fkey`: `FOREIGN KEY (inquiry_id) REFERENCES smartrent.rental_inquiries(id)`
- `room_viewings_pkey`: `PRIMARY KEY (id)`

<details><summary>Indexes</summary>

```sql
CREATE INDEX ix_room_viewings_host_user_id ON smartrent.room_viewings USING btree (host_user_id);
CREATE INDEX ix_room_viewings_inquiry_id ON smartrent.room_viewings USING btree (inquiry_id);
CREATE UNIQUE INDEX room_viewings_pkey ON smartrent.room_viewings USING btree (id);
```

</details>

## rooms

Phòng. operating_status chỉ nói phòng được khai thác hay không; Đã thuê suy từ tenancies qua v_room_status, không lưu ở đây.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `property_id` | `uuid` | Không | `—` |
| `room_type_id` | `uuid` | Không | `—` |
| `code` | `character varying(40)` | Không | `—` |
| `name` | `character varying(150)` | Không | `—` |
| `floor_label` | `character varying(30)` | Có | `—` |
| `area_m2` | `numeric(8,2)` | Không | `—` |
| `capacity` | `smallint` | Không | `—` |
| `description` | `text` | Có | `—` |
| `rules_text` | `text` | Có | `—` |
| `required_deposit` | `numeric(18,0)` | Không | `0` Tiền cọc đề xuất khi chào thuê. Cọc đã thỏa thuận ở contract_versions, cọc thực thu ở deposit_entries. |
| `operating_status` | `character varying(15)` | Không | `'available'::character varying` |
| `created_at` | `timestamp with time zone` | Không | `now()` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `rooms_area_m2_check`: `CHECK ((area_m2 > (0)::numeric))`
- `rooms_capacity_check`: `CHECK ((capacity > 0))`
- `rooms_operating_status_check`: `CHECK (((operating_status)::text = ANY ((ARRAY['available'::character varying, 'maintenance'::character varying, 'inactive'::character varying])::text[])))`
- `rooms_required_deposit_check`: `CHECK ((required_deposit >= (0)::numeric))`
- `rooms_property_id_fkey`: `FOREIGN KEY (property_id) REFERENCES smartrent.properties(id)`
- `rooms_room_type_id_fkey`: `FOREIGN KEY (room_type_id) REFERENCES smartrent.room_types(id)`
- `rooms_pkey`: `PRIMARY KEY (id)`
- `rooms_property_id_code_key`: `UNIQUE (property_id, code)`

<details><summary>Indexes</summary>

```sql
CREATE INDEX ix_rooms_room_type_id ON smartrent.rooms USING btree (room_type_id);
CREATE UNIQUE INDEX rooms_pkey ON smartrent.rooms USING btree (id);
CREATE UNIQUE INDEX rooms_property_id_code_key ON smartrent.rooms USING btree (property_id, code);
```

</details>

## sla_policies

Số giờ xử lý theo mức ưu tiên, tính liên tục 24/7: 4, 12, 48, 96 giờ.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `organization_id` | `uuid` | Không | `—` |
| `priority` | `character varying(10)` | Không | `—` |
| `target_hours` | `integer` | Không | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `sla_policies_priority_check`: `CHECK (((priority)::text = ANY ((ARRAY['urgent'::character varying, 'high'::character varying, 'normal'::character varying, 'low'::character varying])::text[])))`
- `sla_policies_target_hours_check`: `CHECK ((target_hours > 0))`
- `sla_policies_organization_id_fkey`: `FOREIGN KEY (organization_id) REFERENCES smartrent.organizations(id)`
- `sla_policies_pkey`: `PRIMARY KEY (id)`
- `sla_policies_organization_id_priority_key`: `UNIQUE (organization_id, priority)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX sla_policies_organization_id_priority_key ON smartrent.sla_policies USING btree (organization_id, priority);
CREATE UNIQUE INDEX sla_policies_pkey ON smartrent.sla_policies USING btree (id);
```

</details>

## stored_files

Thông tin tệp; nội dung tệp nằm ở kho lưu trữ. Tệp private chỉ tải qua đường dẫn có hạn sau khi kiểm tra quyền.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `organization_id` | `uuid` | Có | `—` |
| `storage_key` | `text` | Không | `—` |
| `original_name` | `text` | Không | `—` |
| `content_type` | `character varying(150)` | Không | `—` |
| `byte_size` | `bigint` | Không | `0` |
| `sha256` | `character(64)` | Có | `—` |
| `purpose` | `character varying(30)` | Không | `'other'::character varying` |
| `visibility` | `character varying(10)` | Không | `'private'::character varying` |
| `scan_status` | `character varying(15)` | Không | `'pending'::character varying` |
| `uploaded_by` | `uuid` | Có | `—` |
| `created_at` | `timestamp with time zone` | Không | `now()` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `stored_files_byte_size_check`: `CHECK ((byte_size >= 0))`
- `stored_files_purpose_check`: `CHECK (((purpose)::text = ANY ((ARRAY['identity_front'::character varying, 'identity_back'::character varying, 'contract_signed'::character varying, 'contract_attachment'::character varying, 'payment_proof'::character varying, 'handover'::character varying, 'ticket'::character varying, 'room_image'::character varying, 'room_video'::character varying, 'avatar'::character varying, 'other'::character varying])::text[])))`
- `stored_files_scan_status_check`: `CHECK (((scan_status)::text = ANY ((ARRAY['pending'::character varying, 'clean'::character varying, 'rejected'::character varying, 'missing'::character varying])::text[])))`
- `stored_files_visibility_check`: `CHECK (((visibility)::text = ANY ((ARRAY['private'::character varying, 'public'::character varying])::text[])))`
- `stored_files_organization_id_fkey`: `FOREIGN KEY (organization_id) REFERENCES smartrent.organizations(id)`
- `stored_files_uploaded_by_fkey`: `FOREIGN KEY (uploaded_by) REFERENCES smartrent.users(id)`
- `stored_files_pkey`: `PRIMARY KEY (id)`
- `stored_files_storage_key_key`: `UNIQUE (storage_key)`

<details><summary>Indexes</summary>

```sql
CREATE INDEX ix_stored_files_organization_id ON smartrent.stored_files USING btree (organization_id);
CREATE INDEX ix_stored_files_uploaded_by ON smartrent.stored_files USING btree (uploaded_by);
CREATE UNIQUE INDEX stored_files_pkey ON smartrent.stored_files USING btree (id);
CREATE UNIQUE INDEX stored_files_storage_key_key ON smartrent.stored_files USING btree (storage_key);
```

</details>

## support_access_grants

Quyền hỗ trợ có lý do, có hạn do chủ trọ cấp cho quản trị hệ thống. Hiện ở trang Hỗ trợ và vận hành.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `organization_id` | `uuid` | Không | `—` |
| `user_id` | `uuid` | Không | `—` |
| `granted_by` | `uuid` | Không | `—` |
| `reason` | `text` | Không | `—` |
| `starts_at` | `timestamp with time zone` | Không | `—` |
| `expires_at` | `timestamp with time zone` | Không | `—` |
| `revoked_at` | `timestamp with time zone` | Có | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `support_access_grants_check`: `CHECK ((expires_at > starts_at))`
- `support_access_grants_reason_check`: `CHECK ((btrim(reason) <> ''::text))`
- `support_access_grants_granted_by_fkey`: `FOREIGN KEY (granted_by) REFERENCES smartrent.users(id)`
- `support_access_grants_organization_id_fkey`: `FOREIGN KEY (organization_id) REFERENCES smartrent.organizations(id)`
- `support_access_grants_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES smartrent.users(id)`
- `support_access_grants_pkey`: `PRIMARY KEY (id)`

<details><summary>Indexes</summary>

```sql
CREATE INDEX ix_support_access_grants_granted_by ON smartrent.support_access_grants USING btree (granted_by);
CREATE INDEX ix_support_access_grants_organization_id ON smartrent.support_access_grants USING btree (organization_id);
CREATE INDEX ix_support_access_grants_user_id ON smartrent.support_access_grants USING btree (user_id);
CREATE UNIQUE INDEX support_access_grants_pkey ON smartrent.support_access_grants USING btree (id);
```

</details>

## tenancies

Một đợt ở của khách đại diện trong một phòng, là lịch sử thuê của phòng. onboarding_mode = import là khách đang ở được nhập từ form phòng hoặc từ dữ liệu cũ, chưa có hợp đồng.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `room_id` | `uuid` | Không | `—` |
| `representative_tenant_id` | `uuid` | Không | `—` |
| `inquiry_id` | `uuid` | Có | `—` |
| `status` | `character varying(12)` | Không | `'planned'::character varying` |
| `planned_move_in` | `date` | Không | `—` |
| `actual_move_in` | `date` | Có | `—` |
| `actual_move_out` | `date` | Có | `—` |
| `stay` | `daterange` | Có | `daterange(COALESCE(actual_move_in, planned_move_in), actual_move_out, '[)'::text)` Khoảng ở [ngày vào, ngày trả), tính tự động. Đang ở thì chưa có cận trên. |
| `onboarding_mode` | `character varying(10)` | Không | `'normal'::character varying` |
| `end_reason` | `text` | Có | `—` |
| `ended_by` | `uuid` | Có | `—` |
| `created_by` | `uuid` | Có | `—` |
| `created_at` | `timestamp with time zone` | Không | `now()` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `tenancies_check`: `CHECK (((actual_move_out IS NULL) OR ((actual_move_in IS NOT NULL) AND (actual_move_out > actual_move_in))))`
- `tenancies_check1`: `CHECK ((((status)::text <> ALL ((ARRAY['active'::character varying, 'ended'::character varying])::text[])) OR (actual_move_in IS NOT NULL)))`
- `tenancies_check2`: `CHECK ((((status)::text <> 'ended'::text) OR ((actual_move_out IS NOT NULL) AND (ended_by IS NOT NULL) AND (NULLIF(btrim(end_reason), ''::text) IS NOT NULL))))`
- `tenancies_check3`: `CHECK ((((status)::text <> 'active'::text) OR (actual_move_out IS NULL)))`
- `tenancies_check4`: `CHECK ((((status)::text <> 'planned'::text) OR ((actual_move_in IS NULL) AND (actual_move_out IS NULL))))`
- `tenancies_onboarding_mode_check`: `CHECK (((onboarding_mode)::text = ANY ((ARRAY['normal'::character varying, 'import'::character varying])::text[])))`
- `tenancies_status_check`: `CHECK (((status)::text = ANY ((ARRAY['planned'::character varying, 'active'::character varying, 'ended'::character varying, 'cancelled'::character varying])::text[])))`
- `tenancies_created_by_fkey`: `FOREIGN KEY (created_by) REFERENCES smartrent.users(id)`
- `tenancies_ended_by_fkey`: `FOREIGN KEY (ended_by) REFERENCES smartrent.users(id)`
- `tenancies_inquiry_id_fkey`: `FOREIGN KEY (inquiry_id) REFERENCES smartrent.rental_inquiries(id)`
- `tenancies_representative_tenant_id_fkey`: `FOREIGN KEY (representative_tenant_id) REFERENCES smartrent.tenants(id)`
- `tenancies_room_id_fkey`: `FOREIGN KEY (room_id) REFERENCES smartrent.rooms(id)`
- `tenancies_pkey`: `PRIMARY KEY (id)`
- `tenancy_consistent`: `TRIGGER DEFERRABLE INITIALLY DEFERRED`
- `tenancies_room_id_stay_excl`: `EXCLUDE USING gist (room_id WITH =, stay WITH &&) WHERE (((status)::text <> 'cancelled'::text))`

<details><summary>Indexes</summary>

```sql
CREATE INDEX ix_tenancies_created_by ON smartrent.tenancies USING btree (created_by);
CREATE INDEX ix_tenancies_ended_by ON smartrent.tenancies USING btree (ended_by);
CREATE INDEX ix_tenancies_inquiry_id ON smartrent.tenancies USING btree (inquiry_id);
CREATE INDEX ix_tenancies_representative_tenant_id ON smartrent.tenancies USING btree (representative_tenant_id);
CREATE INDEX ix_tenancies_room_id ON smartrent.tenancies USING btree (room_id);
CREATE UNIQUE INDEX tenancies_pkey ON smartrent.tenancies USING btree (id);
CREATE INDEX tenancies_room_id_stay_excl ON smartrent.tenancies USING gist (room_id, stay) WHERE ((status)::text <> 'cancelled'::text);
CREATE UNIQUE INDEX ux_representative_active ON smartrent.tenancies USING btree (representative_tenant_id) WHERE ((status)::text = ANY ((ARRAY['planned'::character varying, 'active'::character varying])::text[]));
```

</details>

## tenancy_requests

Đề nghị gia hạn hoặc trả phòng khách gửi từ trang Hợp đồng; gửi chưa làm thay đổi hợp đồng.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `tenancy_id` | `uuid` | Không | `—` |
| `request_type` | `character varying(12)` | Không | `—` |
| `desired_on` | `date` | Không | `—` |
| `message` | `text` | Có | `—` |
| `status` | `character varying(12)` | Không | `'pending'::character varying` |
| `requested_by` | `uuid` | Không | `—` |
| `reviewed_by` | `uuid` | Có | `—` |
| `decision_notes` | `text` | Có | `—` |
| `created_at` | `timestamp with time zone` | Không | `now()` |
| `reviewed_at` | `timestamp with time zone` | Có | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `tenancy_requests_request_type_check`: `CHECK (((request_type)::text = ANY ((ARRAY['renewal'::character varying, 'checkout'::character varying])::text[])))`
- `tenancy_requests_status_check`: `CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying, 'cancelled'::character varying, 'completed'::character varying])::text[])))`
- `tenancy_requests_requested_by_fkey`: `FOREIGN KEY (requested_by) REFERENCES smartrent.users(id)`
- `tenancy_requests_reviewed_by_fkey`: `FOREIGN KEY (reviewed_by) REFERENCES smartrent.users(id)`
- `tenancy_requests_tenancy_id_fkey`: `FOREIGN KEY (tenancy_id) REFERENCES smartrent.tenancies(id)`
- `tenancy_requests_pkey`: `PRIMARY KEY (id)`

<details><summary>Indexes</summary>

```sql
CREATE INDEX ix_tenancy_requests_requested_by ON smartrent.tenancy_requests USING btree (requested_by);
CREATE INDEX ix_tenancy_requests_reviewed_by ON smartrent.tenancy_requests USING btree (reviewed_by);
CREATE INDEX ix_tenancy_requests_tenancy_id ON smartrent.tenancy_requests USING btree (tenancy_id);
CREATE UNIQUE INDEX tenancy_requests_pkey ON smartrent.tenancy_requests USING btree (id);
CREATE UNIQUE INDEX ux_tenancy_request_pending ON smartrent.tenancy_requests USING btree (tenancy_id, request_type) WHERE ((status)::text = 'pending'::text);
```

</details>

## tenancy_residents

Người ở cùng. Họ xem được phòng và điều khoản, không có nghĩa vụ thanh toán và không xem công nợ của người đại diện.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `tenancy_id` | `uuid` | Không | `—` |
| `tenant_id` | `uuid` | Không | `—` |
| `joined_on` | `date` | Không | `—` |
| `left_on` | `date` | Có | `—` |
| `relationship` | `character varying(100)` | Có | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `tenancy_residents_check`: `CHECK (((left_on IS NULL) OR (left_on > joined_on)))`
- `tenancy_residents_tenancy_id_fkey`: `FOREIGN KEY (tenancy_id) REFERENCES smartrent.tenancies(id)`
- `tenancy_residents_tenant_id_fkey`: `FOREIGN KEY (tenant_id) REFERENCES smartrent.tenants(id)`
- `tenancy_residents_pkey`: `PRIMARY KEY (id)`
- `tenancy_residents_tenancy_id_tenant_id_daterange_excl`: `EXCLUDE USING gist (tenancy_id WITH =, tenant_id WITH =, daterange(joined_on, left_on, '[)'::text) WITH &&)`

<details><summary>Indexes</summary>

```sql
CREATE INDEX ix_tenancy_residents_tenant_id ON smartrent.tenancy_residents USING btree (tenant_id);
CREATE UNIQUE INDEX tenancy_residents_pkey ON smartrent.tenancy_residents USING btree (id);
CREATE INDEX tenancy_residents_tenancy_id_tenant_id_daterange_excl ON smartrent.tenancy_residents USING gist (tenancy_id, tenant_id, daterange(joined_on, left_on, '[)'::text));
```

</details>

## tenant_identity_documents

Giấy tờ tùy thân. Số giấy tờ chỉ lưu dạng mã hóa, fingerprint để tra trùng, number_last4 để hiển thị che số. Ảnh giấy tờ bắt buộc là tệp private.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `tenant_id` | `uuid` | Không | `—` |
| `document_type` | `character varying(30)` | Không | `—` |
| `number_ciphertext` | `bytea` | Không | `—` |
| `number_fingerprint` | `character varying(128)` | Không | `—` |
| `number_last4` | `character varying(4)` | Không | `—` |
| `issued_on` | `date` | Có | `—` |
| `issuing_authority` | `text` | Có | `—` |
| `expires_on` | `date` | Có | `—` |
| `front_file_id` | `uuid` | Có | `—` |
| `back_file_id` | `uuid` | Có | `—` |
| `verified_by` | `uuid` | Có | `—` |
| `verified_at` | `timestamp with time zone` | Có | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `tenant_identity_documents_check`: `CHECK (((verified_by IS NULL) = (verified_at IS NULL)))`
- `tenant_identity_documents_document_type_check`: `CHECK (((document_type)::text = ANY ((ARRAY['cccd'::character varying, 'cmnd'::character varying, 'passport'::character varying, 'other'::character varying])::text[])))`
- `tenant_identity_documents_back_file_id_fkey`: `FOREIGN KEY (back_file_id) REFERENCES smartrent.stored_files(id)`
- `tenant_identity_documents_front_file_id_fkey`: `FOREIGN KEY (front_file_id) REFERENCES smartrent.stored_files(id)`
- `tenant_identity_documents_tenant_id_fkey`: `FOREIGN KEY (tenant_id) REFERENCES smartrent.tenants(id)`
- `tenant_identity_documents_verified_by_fkey`: `FOREIGN KEY (verified_by) REFERENCES smartrent.users(id)`
- `tenant_identity_documents_pkey`: `PRIMARY KEY (id)`
- `tenant_identity_documents_tenant_id_document_type_number_fi_key`: `UNIQUE (tenant_id, document_type, number_fingerprint)`

<details><summary>Indexes</summary>

```sql
CREATE INDEX ix_tenant_identity_documents_back_file_id ON smartrent.tenant_identity_documents USING btree (back_file_id);
CREATE INDEX ix_tenant_identity_documents_front_file_id ON smartrent.tenant_identity_documents USING btree (front_file_id);
CREATE INDEX ix_tenant_identity_documents_verified_by ON smartrent.tenant_identity_documents USING btree (verified_by);
CREATE UNIQUE INDEX tenant_identity_documents_pkey ON smartrent.tenant_identity_documents USING btree (id);
CREATE UNIQUE INDEX tenant_identity_documents_tenant_id_document_type_number_fi_key ON smartrent.tenant_identity_documents USING btree (tenant_id, document_type, number_fingerprint);
```

</details>

## tenant_profile_change_requests

Khách đề nghị đổi liên hệ ở trang Tài khoản, admin duyệt ở hồ sơ khách. Họ tên và giấy tờ phải đối chiếu trực tiếp nên không có ở đây.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `tenant_id` | `uuid` | Không | `—` |
| `requested_by` | `uuid` | Không | `—` |
| `requested_at` | `timestamp with time zone` | Không | `now()` |
| `status` | `character varying(12)` | Không | `'pending'::character varying` |
| `proposed_phone` | `character varying(30)` | Có | `—` |
| `proposed_email` | `character varying(256)` | Có | `—` |
| `proposed_emergency_contact_name` | `character varying(200)` | Có | `—` |
| `proposed_emergency_contact_phone` | `character varying(30)` | Có | `—` |
| `reason` | `text` | Có | `—` |
| `review_notes` | `text` | Có | `—` |
| `reviewed_by` | `uuid` | Có | `—` |
| `reviewed_at` | `timestamp with time zone` | Có | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `tenant_profile_change_requests_check`: `CHECK ((num_nonnulls(proposed_phone, proposed_email, proposed_emergency_contact_name, proposed_emergency_contact_phone) > 0))`
- `tenant_profile_change_requests_status_check`: `CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying, 'cancelled'::character varying])::text[])))`
- `tenant_profile_change_requests_requested_by_fkey`: `FOREIGN KEY (requested_by) REFERENCES smartrent.users(id)`
- `tenant_profile_change_requests_reviewed_by_fkey`: `FOREIGN KEY (reviewed_by) REFERENCES smartrent.users(id)`
- `tenant_profile_change_requests_tenant_id_fkey`: `FOREIGN KEY (tenant_id) REFERENCES smartrent.tenants(id)`
- `tenant_profile_change_requests_pkey`: `PRIMARY KEY (id)`

<details><summary>Indexes</summary>

```sql
CREATE INDEX ix_tenant_profile_change_requests_requested_by ON smartrent.tenant_profile_change_requests USING btree (requested_by);
CREATE INDEX ix_tenant_profile_change_requests_reviewed_by ON smartrent.tenant_profile_change_requests USING btree (reviewed_by);
CREATE INDEX ix_tenant_profile_change_requests_tenant_id ON smartrent.tenant_profile_change_requests USING btree (tenant_id);
CREATE UNIQUE INDEX tenant_profile_change_requests_pkey ON smartrent.tenant_profile_change_requests USING btree (id);
CREATE UNIQUE INDEX ux_profile_request_pending ON smartrent.tenant_profile_change_requests USING btree (tenant_id) WHERE ((status)::text = 'pending'::text);
```

</details>

## tenants

Hồ sơ khách theo từng đơn vị, hiện ở mục Khách thuê của admin. Khách tự đăng ký có user_id; khách nhập tay có thể chưa có tài khoản. Điện thoại không bắt buộc duy nhất vì người thân có thể dùng chung số.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `organization_id` | `uuid` | Không | `—` |
| `user_id` | `uuid` | Có | `—` |
| `code` | `character varying(40)` | Không | `—` |
| `full_name` | `character varying(200)` | Không | `—` |
| `email` | `character varying(256)` | Có | `—` |
| `phone` | `character varying(30)` | Có | `—` |
| `date_of_birth` | `date` | Có | `—` |
| `address_line` | `text` | Có | `—` |
| `emergency_contact_name` | `character varying(200)` | Có | `—` |
| `emergency_contact_phone` | `character varying(30)` | Có | `—` |
| `notes` | `text` | Có | `—` |
| `created_at` | `timestamp with time zone` | Không | `now()` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `tenants_organization_id_fkey`: `FOREIGN KEY (organization_id) REFERENCES smartrent.organizations(id)`
- `tenants_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES smartrent.users(id)`
- `tenants_pkey`: `PRIMARY KEY (id)`
- `tenants_organization_id_code_key`: `UNIQUE (organization_id, code)`

<details><summary>Indexes</summary>

```sql
CREATE INDEX ix_tenant_email ON smartrent.tenants USING btree (organization_id, lower((email)::text));
CREATE INDEX ix_tenant_phone ON smartrent.tenants USING btree (organization_id, phone);
CREATE INDEX ix_tenant_search ON smartrent.tenants USING gin (smartrent.normalize_text((((((((full_name)::text || ' '::text) || (code)::text) || ' '::text) || COALESCE((phone)::text, ''::text)) || ' '::text) || COALESCE((email)::text, ''::text))) gin_trgm_ops);
CREATE INDEX ix_tenants_user_id ON smartrent.tenants USING btree (user_id);
CREATE UNIQUE INDEX tenants_organization_id_code_key ON smartrent.tenants USING btree (organization_id, code);
CREATE UNIQUE INDEX tenants_pkey ON smartrent.tenants USING btree (id);
CREATE UNIQUE INDEX ux_tenant_account ON smartrent.tenants USING btree (organization_id, user_id) WHERE (user_id IS NOT NULL);
```

</details>

## ticket_categories

Loại sự cố khách chọn khi gửi yêu cầu hỗ trợ.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `organization_id` | `uuid` | Không | `—` |
| `code` | `character varying(40)` | Không | `—` |
| `name` | `character varying(100)` | Không | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `ticket_categories_organization_id_fkey`: `FOREIGN KEY (organization_id) REFERENCES smartrent.organizations(id)`
- `ticket_categories_pkey`: `PRIMARY KEY (id)`
- `ticket_categories_organization_id_code_key`: `UNIQUE (organization_id, code)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX ticket_categories_organization_id_code_key ON smartrent.ticket_categories USING btree (organization_id, code);
CREATE UNIQUE INDEX ticket_categories_pkey ON smartrent.ticket_categories USING btree (id);
```

</details>

## ticket_events

Lịch sử đổi trạng thái, phân công, mở lại của ticket; chỉ ghi thêm.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `ticket_id` | `uuid` | Không | `—` |
| `event_type` | `character varying(30)` | Không | `—` |
| `old_status` | `character varying(15)` | Có | `—` |
| `new_status` | `character varying(15)` | Có | `—` |
| `old_assignee_id` | `uuid` | Có | `—` |
| `new_assignee_id` | `uuid` | Có | `—` |
| `reason` | `text` | Có | `—` |
| `actor_id` | `uuid` | Không | `—` |
| `created_at` | `timestamp with time zone` | Không | `now()` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `ticket_events_actor_id_fkey`: `FOREIGN KEY (actor_id) REFERENCES smartrent.users(id)`
- `ticket_events_new_assignee_id_fkey`: `FOREIGN KEY (new_assignee_id) REFERENCES smartrent.users(id)`
- `ticket_events_old_assignee_id_fkey`: `FOREIGN KEY (old_assignee_id) REFERENCES smartrent.users(id)`
- `ticket_events_ticket_id_fkey`: `FOREIGN KEY (ticket_id) REFERENCES smartrent.tickets(id)`
- `ticket_events_pkey`: `PRIMARY KEY (id)`

<details><summary>Indexes</summary>

```sql
CREATE INDEX ix_ticket_events_actor_id ON smartrent.ticket_events USING btree (actor_id);
CREATE INDEX ix_ticket_events_new_assignee_id ON smartrent.ticket_events USING btree (new_assignee_id);
CREATE INDEX ix_ticket_events_old_assignee_id ON smartrent.ticket_events USING btree (old_assignee_id);
CREATE INDEX ix_ticket_events_ticket_id ON smartrent.ticket_events USING btree (ticket_id);
CREATE UNIQUE INDEX ticket_events_pkey ON smartrent.ticket_events USING btree (id);
```

</details>

## ticket_files

Ảnh đính kèm ticket hoặc một tin nhắn trong ticket.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `ticket_id` | `uuid` | Không | `—` |
| `message_id` | `uuid` | Có | `—` |
| `file_id` | `uuid` | Không | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `ticket_files_file_id_fkey`: `FOREIGN KEY (file_id) REFERENCES smartrent.stored_files(id)`
- `ticket_files_message_id_fkey`: `FOREIGN KEY (message_id) REFERENCES smartrent.ticket_messages(id)`
- `ticket_files_ticket_id_fkey`: `FOREIGN KEY (ticket_id) REFERENCES smartrent.tickets(id)`
- `ticket_files_pkey`: `PRIMARY KEY (id)`
- `ticket_files_ticket_id_file_id_key`: `UNIQUE (ticket_id, file_id)`

<details><summary>Indexes</summary>

```sql
CREATE INDEX ix_ticket_files_file_id ON smartrent.ticket_files USING btree (file_id);
CREATE INDEX ix_ticket_files_message_id ON smartrent.ticket_files USING btree (message_id);
CREATE UNIQUE INDEX ticket_files_pkey ON smartrent.ticket_files USING btree (id);
CREATE UNIQUE INDEX ticket_files_ticket_id_file_id_key ON smartrent.ticket_files USING btree (ticket_id, file_id);
```

</details>

## ticket_messages

Hội thoại của ticket. Ghi chú nội bộ (is_internal) không bao giờ trả cho khách.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `ticket_id` | `uuid` | Không | `—` |
| `author_id` | `uuid` | Không | `—` |
| `body` | `text` | Không | `—` |
| `is_internal` | `boolean` | Không | `false` |
| `created_at` | `timestamp with time zone` | Không | `now()` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `ticket_messages_author_id_fkey`: `FOREIGN KEY (author_id) REFERENCES smartrent.users(id)`
- `ticket_messages_ticket_id_fkey`: `FOREIGN KEY (ticket_id) REFERENCES smartrent.tickets(id)`
- `ticket_messages_pkey`: `PRIMARY KEY (id)`

<details><summary>Indexes</summary>

```sql
CREATE INDEX ix_ticket_messages_author_id ON smartrent.ticket_messages USING btree (author_id);
CREATE INDEX ix_ticket_messages_ticket_id ON smartrent.ticket_messages USING btree (ticket_id);
CREATE UNIQUE INDEX ticket_messages_pkey ON smartrent.ticket_messages USING btree (id);
```

</details>

## tickets

Yêu cầu hỗ trợ theo phòng, dùng chung giữa trang Hỗ trợ của khách và Ticket của admin.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `code` | `character varying(80)` | Không | `—` |
| `room_id` | `uuid` | Không | `—` |
| `tenancy_id` | `uuid` | Có | `—` |
| `category_id` | `uuid` | Không | `—` |
| `title` | `character varying(250)` | Không | `—` |
| `description` | `text` | Không | `—` |
| `priority` | `character varying(10)` | Không | `'normal'::character varying` |
| `status` | `character varying(15)` | Không | `'new'::character varying` |
| `reported_by` | `uuid` | Không | `—` |
| `assigned_to` | `uuid` | Có | `—` |
| `sla_policy_id` | `uuid` | Có | `—` |
| `due_at` | `timestamp with time zone` | Có | `—` |
| `resolved_at` | `timestamp with time zone` | Có | `—` |
| `closed_at` | `timestamp with time zone` | Có | `—` |
| `resolution_notes` | `text` | Có | `—` |
| `created_at` | `timestamp with time zone` | Không | `now()` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `tickets_priority_check`: `CHECK (((priority)::text = ANY ((ARRAY['urgent'::character varying, 'high'::character varying, 'normal'::character varying, 'low'::character varying])::text[])))`
- `tickets_status_check`: `CHECK (((status)::text = ANY ((ARRAY['new'::character varying, 'accepted'::character varying, 'in_progress'::character varying, 'waiting'::character varying, 'resolved'::character varying, 'closed'::character varying])::text[])))`
- `tickets_assigned_to_fkey`: `FOREIGN KEY (assigned_to) REFERENCES smartrent.users(id)`
- `tickets_category_id_fkey`: `FOREIGN KEY (category_id) REFERENCES smartrent.ticket_categories(id)`
- `tickets_reported_by_fkey`: `FOREIGN KEY (reported_by) REFERENCES smartrent.users(id)`
- `tickets_room_id_fkey`: `FOREIGN KEY (room_id) REFERENCES smartrent.rooms(id)`
- `tickets_sla_policy_id_fkey`: `FOREIGN KEY (sla_policy_id) REFERENCES smartrent.sla_policies(id)`
- `tickets_tenancy_id_fkey`: `FOREIGN KEY (tenancy_id) REFERENCES smartrent.tenancies(id)`
- `tickets_pkey`: `PRIMARY KEY (id)`
- `tickets_code_key`: `UNIQUE (code)`

<details><summary>Indexes</summary>

```sql
CREATE INDEX ix_tickets_assigned_to ON smartrent.tickets USING btree (assigned_to);
CREATE INDEX ix_tickets_category_id ON smartrent.tickets USING btree (category_id);
CREATE INDEX ix_tickets_queue ON smartrent.tickets USING btree (status, priority, due_at);
CREATE INDEX ix_tickets_reported_by ON smartrent.tickets USING btree (reported_by);
CREATE INDEX ix_tickets_room_id ON smartrent.tickets USING btree (room_id);
CREATE INDEX ix_tickets_sla_policy_id ON smartrent.tickets USING btree (sla_policy_id);
CREATE INDEX ix_tickets_tenancy_id ON smartrent.tickets USING btree (tenancy_id);
CREATE UNIQUE INDEX tickets_code_key ON smartrent.tickets USING btree (code);
CREATE UNIQUE INDEX tickets_pkey ON smartrent.tickets USING btree (id);
```

</details>

## user_claims

Claim của tài khoản, bảng chuẩn của Identity.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `integer` | Không | `GENERATED BY DEFAULT AS IDENTITY` |
| `user_id` | `uuid` | Không | `—` |
| `claim_type` | `text` | Có | `—` |
| `claim_value` | `text` | Có | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `user_claims_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES smartrent.users(id) ON DELETE CASCADE`
- `user_claims_pkey`: `PRIMARY KEY (id)`

<details><summary>Indexes</summary>

```sql
CREATE INDEX ix_user_claims_user_id ON smartrent.user_claims USING btree (user_id);
CREATE UNIQUE INDEX user_claims_pkey ON smartrent.user_claims USING btree (id);
```

</details>

## user_logins

Đăng nhập qua nhà cung cấp ngoài, bảng chuẩn của Identity.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `login_provider` | `character varying(128)` | Không | `—` |
| `provider_key` | `character varying(128)` | Không | `—` |
| `provider_display_name` | `text` | Có | `—` |
| `user_id` | `uuid` | Không | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `user_logins_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES smartrent.users(id) ON DELETE CASCADE`
- `user_logins_pkey`: `PRIMARY KEY (login_provider, provider_key)`

<details><summary>Indexes</summary>

```sql
CREATE INDEX ix_user_logins_user_id ON smartrent.user_logins USING btree (user_id);
CREATE UNIQUE INDEX user_logins_pkey ON smartrent.user_logins USING btree (login_provider, provider_key);
```

</details>

## user_roles

Gán vai trò toàn hệ thống cho tài khoản (N-N users, roles).

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `user_id` | `uuid` | Không | `—` |
| `role_id` | `uuid` | Không | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `user_roles_role_id_fkey`: `FOREIGN KEY (role_id) REFERENCES smartrent.roles(id) ON DELETE CASCADE`
- `user_roles_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES smartrent.users(id) ON DELETE CASCADE`
- `user_roles_pkey`: `PRIMARY KEY (user_id, role_id)`

<details><summary>Indexes</summary>

```sql
CREATE INDEX ix_user_roles_role_id ON smartrent.user_roles USING btree (role_id);
CREATE UNIQUE INDEX user_roles_pkey ON smartrent.user_roles USING btree (user_id, role_id);
```

</details>

## user_sessions

Phiên đăng nhập, refresh token chỉ lưu băm. Trang tài khoản liệt kê và thu hồi phiên từ bảng này.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `user_id` | `uuid` | Không | `—` |
| `refresh_token_hash` | `character varying(128)` | Không | `—` |
| `created_at` | `timestamp with time zone` | Không | `now()` |
| `last_seen_at` | `timestamp with time zone` | Có | `—` |
| `expires_at` | `timestamp with time zone` | Không | `—` |
| `revoked_at` | `timestamp with time zone` | Có | `—` |
| `replaced_by_id` | `uuid` | Có | `—` |
| `ip_address` | `inet` | Có | `—` |
| `user_agent` | `text` | Có | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `user_sessions_check`: `CHECK ((expires_at > created_at))`
- `user_sessions_replaced_by_id_fkey`: `FOREIGN KEY (replaced_by_id) REFERENCES smartrent.user_sessions(id)`
- `user_sessions_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES smartrent.users(id) ON DELETE CASCADE`
- `user_sessions_pkey`: `PRIMARY KEY (id)`
- `user_sessions_refresh_token_hash_key`: `UNIQUE (refresh_token_hash)`

<details><summary>Indexes</summary>

```sql
CREATE INDEX ix_user_sessions_replaced_by_id ON smartrent.user_sessions USING btree (replaced_by_id);
CREATE INDEX ix_user_sessions_user_id ON smartrent.user_sessions USING btree (user_id);
CREATE UNIQUE INDEX user_sessions_pkey ON smartrent.user_sessions USING btree (id);
CREATE UNIQUE INDEX user_sessions_refresh_token_hash_key ON smartrent.user_sessions USING btree (refresh_token_hash);
```

</details>

## user_tokens

Token của Identity, gồm token đặt lại mật khẩu.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `user_id` | `uuid` | Không | `—` |
| `login_provider` | `character varying(128)` | Không | `—` |
| `name` | `character varying(128)` | Không | `—` |
| `value` | `text` | Có | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `user_tokens_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES smartrent.users(id) ON DELETE CASCADE`
- `user_tokens_pkey`: `PRIMARY KEY (user_id, login_provider, name)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX user_tokens_pkey ON smartrent.user_tokens USING btree (user_id, login_provider, name);
```

</details>

## users

Tài khoản đăng nhập của cả nhân sự và khách. Mật khẩu chỉ lưu dạng băm. Chủ trọ sửa email, điện thoại ở Cài đặt và các số này hiện ở trang Liên hệ.

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `user_name` | `character varying(256)` | Có | `—` |
| `normalized_user_name` | `character varying(256)` | Có | `—` |
| `email` | `character varying(256)` | Có | `—` |
| `normalized_email` | `character varying(256)` | Có | `—` |
| `email_confirmed` | `boolean` | Không | `false` |
| `password_hash` | `text` | Có | `—` |
| `security_stamp` | `text` | Có | `—` |
| `concurrency_stamp` | `text` | Có | `—` |
| `phone_number` | `text` | Có | `—` |
| `phone_number_confirmed` | `boolean` | Không | `false` |
| `two_factor_enabled` | `boolean` | Không | `false` |
| `lockout_end` | `timestamp with time zone` | Có | `—` |
| `lockout_enabled` | `boolean` | Không | `true` |
| `access_failed_count` | `integer` | Không | `0` |
| `display_name` | `character varying(200)` | Không | `—` |
| `avatar_file_id` | `uuid` | Có | `—` |
| `is_active` | `boolean` | Không | `true` |
| `last_login_at` | `timestamp with time zone` | Có | `—` |
| `created_at` | `timestamp with time zone` | Không | `now()` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `users_access_failed_count_check`: `CHECK ((access_failed_count >= 0))`
- `users_avatar_file_fk`: `FOREIGN KEY (avatar_file_id) REFERENCES smartrent.stored_files(id)`
- `users_pkey`: `PRIMARY KEY (id)`

<details><summary>Indexes</summary>

```sql
CREATE INDEX ix_users_avatar_file_id ON smartrent.users USING btree (avatar_file_id);
CREATE UNIQUE INDEX users_pkey ON smartrent.users USING btree (id);
CREATE UNIQUE INDEX ux_users_email ON smartrent.users USING btree (normalized_email) WHERE (normalized_email IS NOT NULL);
CREATE UNIQUE INDEX ux_users_name ON smartrent.users USING btree (normalized_user_name) WHERE (normalized_user_name IS NOT NULL);
```

</details>

## Views

- `v_allocation_movements`
- `v_cash_movements`
- `v_contract_status`
- `v_deposit_balances`
- `v_deposit_movements`
- `v_invoice_balances`
- `v_invoice_totals`
- `v_payment_balances`
- `v_public_rooms`
- `v_room_status`
- `v_tenant_debts`
- `v_tenant_status`

## Hàm

- `effective_rates`
- `financial_tenant`
- `import_active_tenancy`
- `import_actor`
- `import_bank_account`
- `import_charge_type`
- `import_contract`
- `import_identity_document`
- `import_opening_balance`
- `import_organization`
- `import_organization_id`
- `import_property`
- `import_property_rate`
- `import_resident`
- `import_room`
- `import_room_id`
- `import_room_image`
- `import_slug`
- `import_tenancy`
- `import_tenant`
- `import_tenant_id`
- `initialize_organization`
- `invoice_date`
- `next_document_no`
- `normalize_text`
- `organization_of`
- `quick_contract_end_exclusive`
- `room_rates`
- `validate_financial_tenant`
- `vn_today`
