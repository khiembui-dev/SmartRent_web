# Từ điển dữ liệu SmartRent

Sinh trực tiếp từ catalog PostgreSQL sau khi cài 01–03; đối chiếu cùng DDL khi thay đổi schema.

**103 bảng, 9 view.** Mỗi bảng bên dưới ghi đầy đủ cột, khóa và index.

UUID ↔ Guid; numeric ↔ decimal; date ↔ DateOnly; timestamptz ↔ DateTime UTC; bytea ↔ byte[].

`NULL = Có` nghĩa là trường tùy chọn. Thời gian *_on dùng ngày; *_at dùng thời điểm UTC.
`snapshot` là giá trị tại thời điểm ký/phát hành, giữ nguyên khi danh mục thay đổi.
`idempotency_key` là khóa do client/server giữ ổn định khi thử lại cùng yêu cầu.
Các FK mặc định NO ACTION; chỉ các quan hệ có ON DELETE CASCADE ghi rõ mới được xóa dây chuyền.

## Mục lục

- [address_datasets](#address_datasets)
- [addresses](#addresses)
- [administrative_units](#administrative_units)
- [ai_conversations](#ai_conversations)
- [ai_messages](#ai_messages)
- [amenities](#amenities)
- [audit_logs](#audit_logs)
- [background_job_runs](#background_job_runs)
- [backup_runs](#backup_runs)
- [bank_accounts](#bank_accounts)
- [billing_period_events](#billing_period_events)
- [billing_periods](#billing_periods)
- [business_holidays](#business_holidays)
- [business_hours](#business_hours)
- [business_role_permissions](#business_role_permissions)
- [business_roles](#business_roles)
- [charge_instances](#charge_instances)
- [charge_rates](#charge_rates)
- [charge_types](#charge_types)
- [checkout_settlements](#checkout_settlements)
- [contract_files](#contract_files)
- [contract_parties](#contract_parties)
- [contract_terminations](#contract_terminations)
- [contract_versions](#contract_versions)
- [contracts](#contracts)
- [delivery_attempts](#delivery_attempts)
- [deposit_entries](#deposit_entries)
- [email_configurations](#email_configurations)
- [expense_categories](#expense_categories)
- [expenses](#expenses)
- [export_jobs](#export_jobs)
- [handover_assets](#handover_assets)
- [handover_files](#handover_files)
- [handovers](#handovers)
- [inquiry_events](#inquiry_events)
- [integration_connections](#integration_connections)
- [integration_events](#integration_events)
- [invoice_charge_claims](#invoice_charge_claims)
- [invoice_files](#invoice_files)
- [invoice_issue_batch_items](#invoice_issue_batch_items)
- [invoice_issue_batches](#invoice_issue_batches)
- [invoice_lines](#invoice_lines)
- [invoice_meter_segments](#invoice_meter_segments)
- [invoices](#invoices)
- [membership_properties](#membership_properties)
- [membership_roles](#membership_roles)
- [message_templates](#message_templates)
- [meter_reading_files](#meter_reading_files)
- [meter_readings](#meter_readings)
- [meter_replacements](#meter_replacements)
- [meters](#meters)
- [notification_deliveries](#notification_deliveries)
- [notifications](#notifications)
- [onboarding_gaps](#onboarding_gaps)
- [organization_memberships](#organization_memberships)
- [organization_settings](#organization_settings)
- [organizations](#organizations)
- [outbox_messages](#outbox_messages)
- [payment_allocations](#payment_allocations)
- [payment_files](#payment_files)
- [payment_methods](#payment_methods)
- [payment_reversals](#payment_reversals)
- [payments](#payments)
- [permissions](#permissions)
- [properties](#properties)
- [property_billing_settings](#property_billing_settings)
- [rate_plans](#rate_plans)
- [reminder_rules](#reminder_rules)
- [rental_inquiries](#rental_inquiries)
- [reservations](#reservations)
- [role_claims](#role_claims)
- [roles](#roles)
- [room_allocations](#room_allocations)
- [room_amenities](#room_amenities)
- [room_assets](#room_assets)
- [room_images](#room_images)
- [room_listings](#room_listings)
- [room_status_events](#room_status_events)
- [room_transfers](#room_transfers)
- [room_types](#room_types)
- [room_viewings](#room_viewings)
- [rooms](#rooms)
- [settlement_invoices](#settlement_invoices)
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

## address_datasets

Bộ địa giới theo nguồn và khoảng hiệu lực; không cố định mô hình ba cấp

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `code` | `character varying(60)` | Không | `—` |
| `name` | `text` | Không | `—` |
| `valid_from` | `date` | Không | `—` |
| `valid_to` | `date` | Có | `—` |
| `source_url` | `text` | Có | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `address_datasets_check`: `CHECK (((valid_to IS NULL) OR (valid_to > valid_from)))`
- `address_datasets_pkey`: `PRIMARY KEY (id)`
- `address_datasets_code_key`: `UNIQUE (code)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX address_datasets_code_key ON smartrent.address_datasets USING btree (code);
CREATE UNIQUE INDEX address_datasets_pkey ON smartrent.address_datasets USING btree (id);
```

</details>

## addresses

Địa chỉ đường/số nhà, đơn vị hành chính tùy chọn, địa phương nhập tay, tọa độ

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `administrative_unit_id` | `uuid` | Có | `—` |
| `address_line` | `text` | Không | `—` |
| `manual_locality` | `text` | Có | `—` |
| `latitude` | `numeric(10,7)` | Có | `—` |
| `longitude` | `numeric(10,7)` | Có | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `addresses_latitude_check`: `CHECK (((latitude >= ('-90'::integer)::numeric) AND (latitude <= (90)::numeric)))`
- `addresses_longitude_check`: `CHECK (((longitude >= ('-180'::integer)::numeric) AND (longitude <= (180)::numeric)))`
- `addresses_administrative_unit_id_fkey`: `FOREIGN KEY (administrative_unit_id) REFERENCES smartrent.administrative_units(id)`
- `addresses_pkey`: `PRIMARY KEY (id)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX addresses_pkey ON smartrent.addresses USING btree (id);
CREATE INDEX ix_addresses_administrative_unit_id ON smartrent.addresses USING btree (administrative_unit_id);
```

</details>

## administrative_units

Cây đơn vị hành chính trong một phiên bản; FK parent cùng dataset

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `dataset_id` | `uuid` | Không | `—` |
| `parent_id` | `uuid` | Có | `—` |
| `code` | `character varying(30)` | Không | `—` |
| `name` | `character varying(200)` | Không | `—` |
| `unit_level` | `character varying(30)` | Không | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `administrative_units_check`: `CHECK ((id IS DISTINCT FROM parent_id))`
- `administrative_units_dataset_id_fkey`: `FOREIGN KEY (dataset_id) REFERENCES smartrent.address_datasets(id)`
- `administrative_units_parent_id_fkey`: `FOREIGN KEY (parent_id) REFERENCES smartrent.administrative_units(id)`
- `administrative_units_pkey`: `PRIMARY KEY (id)`
- `administrative_units_dataset_id_code_key`: `UNIQUE (dataset_id, code)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX administrative_units_dataset_id_code_key ON smartrent.administrative_units USING btree (dataset_id, code);
CREATE UNIQUE INDEX administrative_units_pkey ON smartrent.administrative_units USING btree (id);
CREATE INDEX ix_administrative_units_parent_id ON smartrent.administrative_units USING btree (parent_id);
```

</details>

## ai_conversations

Một kho hội thoại; phạm vi dữ liệu, nguồn trả lời, model

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `organization_id` | `uuid` | Không | `—` |
| `user_id` | `uuid` | Không | `—` |
| `title` | `character varying(250)` | Có | `—` |
| `created_at` | `timestamp with time zone` | Không | `now()` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `ai_conversations_organization_id_fkey`: `FOREIGN KEY (organization_id) REFERENCES smartrent.organizations(id)`
- `ai_conversations_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES smartrent.users(id)`
- `ai_conversations_pkey`: `PRIMARY KEY (id)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX ai_conversations_pkey ON smartrent.ai_conversations USING btree (id);
CREATE INDEX ix_ai_conversations_organization_id ON smartrent.ai_conversations USING btree (organization_id);
CREATE INDEX ix_ai_conversations_user_id ON smartrent.ai_conversations USING btree (user_id);
```

</details>

## ai_messages

Một kho hội thoại; phạm vi dữ liệu, nguồn trả lời, model

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `conversation_id` | `uuid` | Không | `—` |
| `role` | `character varying(10)` | Không | `—` |
| `content` | `text` | Không | `—` |
| `data_scope` | `jsonb` | Có | `—` |
| `source_references` | `jsonb` | Có | `—` |
| `model_name` | `character varying(100)` | Có | `—` |
| `created_at` | `timestamp with time zone` | Không | `now()` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `ai_messages_role_check`: `CHECK (((role)::text = ANY ((ARRAY['user'::character varying, 'assistant'::character varying, 'tool'::character varying])::text[])))`
- `ai_messages_conversation_id_fkey`: `FOREIGN KEY (conversation_id) REFERENCES smartrent.ai_conversations(id)`
- `ai_messages_pkey`: `PRIMARY KEY (id)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX ai_messages_pkey ON smartrent.ai_messages USING btree (id);
CREATE INDEX ix_ai_messages_conversation_id ON smartrent.ai_messages USING btree (conversation_id);
```

</details>

## amenities

Danh mục tiện nghi riêng theo đơn vị

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `organization_id` | `uuid` | Không | `—` |
| `code` | `character varying(50)` | Không | `—` |
| `name` | `character varying(150)` | Không | `—` |

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

## audit_logs

Ai/lúc nào/bản ghi nào/trước sau/lý do/correlation

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `bigint` | Không | `GENERATED ALWAYS AS IDENTITY` |
| `organization_id` | `uuid` | Có | `—` |
| `actor_id` | `uuid` | Có | `—` |
| `action` | `character varying(20)` | Không | `—` |
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

## background_job_runs

Tác vụ nền, khóa chống lặp, trạng thái/lỗi

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `organization_id` | `uuid` | Có | `—` |
| `job_name` | `character varying(100)` | Không | `—` |
| `deduplication_key` | `character varying(250)` | Không | `—` |
| `status` | `character varying(10)` | Không | `—` |
| `started_at` | `timestamp with time zone` | Không | `now()` |
| `finished_at` | `timestamp with time zone` | Có | `—` |
| `error_message` | `text` | Có | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `background_job_runs_status_check`: `CHECK (((status)::text = ANY ((ARRAY['running'::character varying, 'succeeded'::character varying, 'failed'::character varying])::text[])))`
- `background_job_runs_organization_id_fkey`: `FOREIGN KEY (organization_id) REFERENCES smartrent.organizations(id)`
- `background_job_runs_pkey`: `PRIMARY KEY (id)`
- `background_job_runs_deduplication_key_key`: `UNIQUE (deduplication_key)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX background_job_runs_deduplication_key_key ON smartrent.background_job_runs USING btree (deduplication_key);
CREATE UNIQUE INDEX background_job_runs_pkey ON smartrent.background_job_runs USING btree (id);
CREATE INDEX ix_background_job_runs_organization_id ON smartrent.background_job_runs USING btree (organization_id);
```

</details>

## backup_runs

Tham chiếu bản backup và lần thử khôi phục; không tự tạo backup chỉ bằng INSERT

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `job_run_id` | `uuid` | Không | `—` |
| `backup_reference` | `text` | Không | `—` |
| `completed_at` | `timestamp with time zone` | Có | `—` |
| `restore_tested_at` | `timestamp with time zone` | Có | `—` |
| `restore_test_succeeded` | `boolean` | Có | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `backup_runs_job_run_id_fkey`: `FOREIGN KEY (job_run_id) REFERENCES smartrent.background_job_runs(id)`
- `backup_runs_pkey`: `PRIMARY KEY (id)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX backup_runs_pkey ON smartrent.backup_runs USING btree (id);
CREATE INDEX ix_backup_runs_job_run_id ON smartrent.backup_runs USING btree (job_run_id);
```

</details>

## bank_accounts

Tài khoản nhận theo đơn vị

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `organization_id` | `uuid` | Không | `—` |
| `bank_code` | `character varying(30)` | Không | `—` |
| `account_number` | `character varying(100)` | Không | `—` |
| `account_holder` | `character varying(200)` | Không | `—` |
| `is_active` | `boolean` | Không | `true` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `bank_accounts_organization_id_fkey`: `FOREIGN KEY (organization_id) REFERENCES smartrent.organizations(id)`
- `bank_accounts_pkey`: `PRIMARY KEY (id)`
- `bank_accounts_organization_id_bank_code_account_number_key`: `UNIQUE (organization_id, bank_code, account_number)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX bank_accounts_organization_id_bank_code_account_number_key ON smartrent.bank_accounts USING btree (organization_id, bank_code, account_number);
CREATE UNIQUE INDEX bank_accounts_pkey ON smartrent.bank_accounts USING btree (id);
```

</details>

## billing_period_events

Khóa/mở có lý do/người/thời điểm

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

Kỳ tháng của cơ sở, ngày đầu tháng, khóa/mở

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

## business_holidays

Lịch làm việc/ngày nghỉ để máy chủ tính SLA

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `organization_id` | `uuid` | Không | `—` |
| `holiday_on` | `date` | Không | `—` |
| `name` | `text` | Không | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `business_holidays_organization_id_fkey`: `FOREIGN KEY (organization_id) REFERENCES smartrent.organizations(id)`
- `business_holidays_pkey`: `PRIMARY KEY (organization_id, holiday_on)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX business_holidays_pkey ON smartrent.business_holidays USING btree (organization_id, holiday_on);
```

</details>

## business_hours

Lịch làm việc/ngày nghỉ để máy chủ tính SLA

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `organization_id` | `uuid` | Không | `—` |
| `iso_weekday` | `smallint` | Không | `—` |
| `opens_at` | `time without time zone` | Không | `—` |
| `closes_at` | `time without time zone` | Không | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `business_hours_check`: `CHECK ((closes_at > opens_at))`
- `business_hours_iso_weekday_check`: `CHECK (((iso_weekday >= 1) AND (iso_weekday <= 7)))`
- `business_hours_organization_id_fkey`: `FOREIGN KEY (organization_id) REFERENCES smartrent.organizations(id)`
- `business_hours_pkey`: `PRIMARY KEY (id)`
- `business_hours_organization_id_iso_weekday_opens_at_key`: `UNIQUE (organization_id, iso_weekday, opens_at)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX business_hours_organization_id_iso_weekday_opens_at_key ON smartrent.business_hours USING btree (organization_id, iso_weekday, opens_at);
CREATE UNIQUE INDEX business_hours_pkey ON smartrent.business_hours USING btree (id);
```

</details>

## business_role_permissions

N–N vai trò nghiệp vụ–quyền

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `role_id` | `uuid` | Không | `—` |
| `permission_code` | `character varying(100)` | Không | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `business_role_permissions_permission_code_fkey`: `FOREIGN KEY (permission_code) REFERENCES smartrent.permissions(code)`
- `business_role_permissions_role_id_fkey`: `FOREIGN KEY (role_id) REFERENCES smartrent.business_roles(id)`
- `business_role_permissions_pkey`: `PRIMARY KEY (role_id, permission_code)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX business_role_permissions_pkey ON smartrent.business_role_permissions USING btree (role_id, permission_code);
CREATE INDEX ix_business_role_permissions_permission_code ON smartrent.business_role_permissions USING btree (permission_code);
```

</details>

## business_roles

Vai trò trong một đơn vị, mã duy nhất theo đơn vị

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `organization_id` | `uuid` | Không | `—` |
| `code` | `character varying(50)` | Không | `—` |
| `name` | `character varying(150)` | Không | `—` |

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

Một lần phát sinh phí của đợt thuê; phí một lần không có kỳ

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

Giá theo khoản thu/khoảng ngày; cách tính, chu kỳ, cờ chia ngày; không chồng khoảng trong cùng plan/khoản

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `rate_plan_id` | `uuid` | Không | `—` |
| `charge_type_id` | `uuid` | Không | `—` |
| `effective_from` | `date` | Không | `—` |
| `effective_to` | `date` | Có | `—` |
| `unit_price` | `numeric(18,4)` | Không | `—` |
| `calculation_method` | `character varying(15)` | Không | `—` |
| `billing_cycle` | `character varying(10)` | Không | `—` |
| `proration_mode` | `character varying(12)` | Không | `'full_period'::character varying` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `charge_rates_billing_cycle_check`: `CHECK (((billing_cycle)::text = ANY ((ARRAY['monthly'::character varying, 'once'::character varying])::text[])))`
- `charge_rates_calculation_method_check`: `CHECK (((calculation_method)::text = ANY ((ARRAY['fixed'::character varying, 'metered'::character varying, 'per_person'::character varying, 'per_quantity'::character varying])::text[])))`
- `charge_rates_check`: `CHECK (((effective_to IS NULL) OR (effective_to > effective_from)))`
- `charge_rates_proration_mode_check`: `CHECK (((proration_mode)::text = ANY ((ARRAY['full_period'::character varying, 'actual_days'::character varying])::text[])))`
- `charge_rates_unit_price_check`: `CHECK ((unit_price >= (0)::numeric))`
- `charge_rates_charge_type_id_fkey`: `FOREIGN KEY (charge_type_id) REFERENCES smartrent.charge_types(id)`
- `charge_rates_rate_plan_id_fkey`: `FOREIGN KEY (rate_plan_id) REFERENCES smartrent.rate_plans(id)`
- `charge_rates_pkey`: `PRIMARY KEY (id)`
- `charge_rates_rate_plan_id_charge_type_id_daterange_excl`: `EXCLUDE USING gist (rate_plan_id WITH =, charge_type_id WITH =, daterange(effective_from, effective_to, '[)'::text) WITH &&)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX charge_rates_pkey ON smartrent.charge_rates USING btree (id);
CREATE INDEX charge_rates_rate_plan_id_charge_type_id_daterange_excl ON smartrent.charge_rates USING gist (rate_plan_id, charge_type_id, daterange(effective_from, effective_to, '[)'::text));
CREATE INDEX ix_charge_rates_charge_type_id ON smartrent.charge_rates USING btree (charge_type_id);
```

</details>

## charge_types

Danh mục tiền thuê, điện, nước, dịch vụ, phí tự đặt, bồi thường

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

Bảng quyết toán, biên bản trả, duyệt giữ nợ và lý do

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

## contract_files

Bản nháp/ký/phụ lục/chứng cứ chữ ký, FK file thật

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `contract_version_id` | `uuid` | Không | `—` |
| `file_id` | `uuid` | Không | `—` |
| `file_kind` | `character varying(20)` | Không | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `contract_files_file_kind_check`: `CHECK (((file_kind)::text = ANY ((ARRAY['draft'::character varying, 'signed'::character varying, 'appendix'::character varying, 'signature_proof'::character varying])::text[])))`
- `contract_files_contract_version_id_fkey`: `FOREIGN KEY (contract_version_id) REFERENCES smartrent.contract_versions(id)`
- `contract_files_file_id_fkey`: `FOREIGN KEY (file_id) REFERENCES smartrent.stored_files(id)`
- `contract_files_pkey`: `PRIMARY KEY (contract_version_id, file_id)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX contract_files_pkey ON smartrent.contract_files USING btree (contract_version_id, file_id);
CREATE INDEX ix_contract_files_file_id ON smartrent.contract_files USING btree (file_id);
```

</details>

## contract_parties

Các bên ở thời điểm ký, lưu snapshot tên/địa chỉ/giấy tờ

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `contract_version_id` | `uuid` | Không | `—` |
| `party_role` | `character varying(20)` | Không | `—` |
| `full_name_snapshot` | `character varying(250)` | Không | `—` |
| `address_snapshot` | `text` | Không | `—` |
| `identity_ciphertext` | `bytea` | Có | `—` |
| `contact_snapshot` | `text` | Có | `—` |
| `tenant_id` | `uuid` | Có | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `contract_parties_party_role_check`: `CHECK (((party_role)::text = ANY ((ARRAY['landlord'::character varying, 'representative'::character varying, 'co_signer'::character varying])::text[])))`
- `contract_parties_contract_version_id_fkey`: `FOREIGN KEY (contract_version_id) REFERENCES smartrent.contract_versions(id)`
- `contract_parties_tenant_id_fkey`: `FOREIGN KEY (tenant_id) REFERENCES smartrent.tenants(id)`
- `contract_parties_pkey`: `PRIMARY KEY (id)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX contract_parties_pkey ON smartrent.contract_parties USING btree (id);
CREATE INDEX ix_contract_parties_contract_version_id ON smartrent.contract_parties USING btree (contract_version_id);
CREATE INDEX ix_contract_parties_tenant_id ON smartrent.contract_parties USING btree (tenant_id);
```

</details>

## contract_terminations

Chấm dứt có ngày, lý do, người xác nhận; giữ nguyên bản ký

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `contract_id` | `uuid` | Không | `—` |
| `ends_on` | `date` | Không | `—` |
| `reason` | `text` | Không | `—` |
| `confirmed_by` | `uuid` | Không | `—` |
| `confirmed_at` | `timestamp with time zone` | Không | `now()` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `contract_terminations_confirmed_by_fkey`: `FOREIGN KEY (confirmed_by) REFERENCES smartrent.users(id)`
- `contract_terminations_contract_id_fkey`: `FOREIGN KEY (contract_id) REFERENCES smartrent.contracts(id)`
- `contract_terminations_pkey`: `PRIMARY KEY (contract_id)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX contract_terminations_pkey ON smartrent.contract_terminations USING btree (contract_id);
CREATE INDEX ix_contract_terminations_confirmed_by ON smartrent.contract_terminations USING btree (confirmed_by);
```

</details>

## contract_versions

Phiên bản/phụ lục: ngày hiệu lực/kết thúc, cọc, lịch thu, điều khoản và xác nhận ký

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

Chứng từ hợp đồng có mã riêng; liên kết đợt thuê và hợp đồng tiền nhiệm

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `tenancy_id` | `uuid` | Không | `—` |
| `code` | `character varying(80)` | Không | `—` |
| `predecessor_contract_id` | `uuid` | Có | `—` |
| `archived_at` | `timestamp with time zone` | Có | `—` |
| `created_by` | `uuid` | Không | `—` |
| `created_at` | `timestamp with time zone` | Không | `now()` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `contracts_check`: `CHECK ((id IS DISTINCT FROM predecessor_contract_id))`
- `contracts_created_by_fkey`: `FOREIGN KEY (created_by) REFERENCES smartrent.users(id)`
- `contracts_predecessor_contract_id_fkey`: `FOREIGN KEY (predecessor_contract_id) REFERENCES smartrent.contracts(id)`
- `contracts_tenancy_id_fkey`: `FOREIGN KEY (tenancy_id) REFERENCES smartrent.tenancies(id)`
- `contracts_pkey`: `PRIMARY KEY (id)`
- `contracts_code_key`: `UNIQUE (code)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX contracts_code_key ON smartrent.contracts USING btree (code);
CREATE UNIQUE INDEX contracts_pkey ON smartrent.contracts USING btree (id);
CREATE INDEX ix_contracts_created_by ON smartrent.contracts USING btree (created_by);
CREATE INDEX ix_contracts_predecessor_contract_id ON smartrent.contracts USING btree (predecessor_contract_id);
CREATE INDEX ix_contracts_tenancy_id ON smartrent.contracts USING btree (tenancy_id);
```

</details>

## delivery_attempts

Từng lần thử, kết quả/lỗi/thời gian

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `delivery_id` | `uuid` | Không | `—` |
| `attempt_no` | `integer` | Không | `—` |
| `started_at` | `timestamp with time zone` | Không | `now()` |
| `finished_at` | `timestamp with time zone` | Có | `—` |
| `succeeded` | `boolean` | Có | `—` |
| `error_code` | `text` | Có | `—` |
| `error_message` | `text` | Có | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `delivery_attempts_attempt_no_check`: `CHECK ((attempt_no > 0))`
- `delivery_attempts_delivery_id_fkey`: `FOREIGN KEY (delivery_id) REFERENCES smartrent.notification_deliveries(id)`
- `delivery_attempts_pkey`: `PRIMARY KEY (id)`
- `delivery_attempts_delivery_id_attempt_no_key`: `UNIQUE (delivery_id, attempt_no)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX delivery_attempts_delivery_id_attempt_no_key ON smartrent.delivery_attempts USING btree (delivery_id, attempt_no);
CREATE UNIQUE INDEX delivery_attempts_pkey ON smartrent.delivery_attempts USING btree (id);
```

</details>

## deposit_entries

Sổ cọc bất biến: nhận/hoàn/bù trừ/chuyển/đảo; giữ nguồn payment gốc

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
- `deposit_entries_check1`: `CHECK ((((kind)::text = ANY ((ARRAY['reversal'::character varying, 'transfer_in'::character varying])::text[])) = (related_entry_id IS NOT NULL)))`
- `deposit_entries_check2`: `CHECK ((((kind)::text = 'refund'::text) = (payment_reversal_id IS NOT NULL)))`
- `deposit_entries_kind_check`: `CHECK (((kind)::text = ANY ((ARRAY['receipt'::character varying, 'refund'::character varying, 'offset'::character varying, 'transfer_in'::character varying, 'transfer_out'::character varying, 'reversal'::character varying])::text[])))`
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
CREATE UNIQUE INDEX ux_deposit_transfer_pair ON smartrent.deposit_entries USING btree (related_entry_id) WHERE ((kind)::text = 'transfer_in'::text);
```

</details>

## email_configurations

SMTP, kiểu bảo mật, tham chiếu secret; không lưu mật khẩu rõ

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `organization_id` | `uuid` | Không | `—` |
| `smtp_host` | `character varying(250)` | Không | `—` |
| `smtp_port` | `integer` | Không | `—` |
| `security_mode` | `character varying(10)` | Không | `—` |
| `username` | `text` | Có | `—` |
| `secret_reference` | `text` | Có | `—` |
| `from_email` | `character varying(256)` | Không | `—` |
| `from_name` | `character varying(200)` | Có | `—` |
| `is_enabled` | `boolean` | Không | `false` |
| `last_tested_at` | `timestamp with time zone` | Có | `—` |
| `last_test_succeeded` | `boolean` | Có | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `email_configurations_security_mode_check`: `CHECK (((security_mode)::text = ANY ((ARRAY['starttls'::character varying, 'tls'::character varying, 'none'::character varying])::text[])))`
- `email_configurations_smtp_port_check`: `CHECK (((smtp_port >= 1) AND (smtp_port <= 65535)))`
- `email_configurations_organization_id_fkey`: `FOREIGN KEY (organization_id) REFERENCES smartrent.organizations(id)`
- `email_configurations_pkey`: `PRIMARY KEY (organization_id)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX email_configurations_pkey ON smartrent.email_configurations USING btree (organization_id);
```

</details>

## expense_categories

Phân loại chi phí đầu vào

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `organization_id` | `uuid` | Không | `—` |
| `code` | `character varying(40)` | Không | `—` |
| `name` | `character varying(150)` | Không | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `expense_categories_organization_id_fkey`: `FOREIGN KEY (organization_id) REFERENCES smartrent.organizations(id)`
- `expense_categories_pkey`: `PRIMARY KEY (id)`
- `expense_categories_organization_id_code_key`: `UNIQUE (organization_id, code)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX expense_categories_organization_id_code_key ON smartrent.expense_categories USING btree (organization_id, code);
CREATE UNIQUE INDEX expense_categories_pkey ON smartrent.expense_categories USING btree (id);
```

</details>

## expenses

Chi phí phát sinh/thực trả, chứng cứ, liên kết ticket; sai thì ghi đảo bằng reversal_of_id

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `property_id` | `uuid` | Không | `—` |
| `room_id` | `uuid` | Có | `—` |
| `ticket_id` | `uuid` | Có | `—` |
| `category_id` | `uuid` | Không | `—` |
| `amount` | `numeric(18,0)` | Không | `—` |
| `incurred_on` | `date` | Không | `—` |
| `paid_at` | `timestamp with time zone` | Có | `—` |
| `description` | `text` | Không | `—` |
| `evidence_file_id` | `uuid` | Có | `—` |
| `recorded_by` | `uuid` | Không | `—` |
| `reversal_of_id` | `uuid` | Có | `—` |
| `reason` | `text` | Có | `—` |
| `created_at` | `timestamp with time zone` | Không | `now()` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `expenses_amount_check`: `CHECK ((amount > (0)::numeric))`
- `expenses_check`: `CHECK ((id IS DISTINCT FROM reversal_of_id))`
- `expenses_category_id_fkey`: `FOREIGN KEY (category_id) REFERENCES smartrent.expense_categories(id)`
- `expenses_evidence_file_id_fkey`: `FOREIGN KEY (evidence_file_id) REFERENCES smartrent.stored_files(id)`
- `expenses_property_id_fkey`: `FOREIGN KEY (property_id) REFERENCES smartrent.properties(id)`
- `expenses_recorded_by_fkey`: `FOREIGN KEY (recorded_by) REFERENCES smartrent.users(id)`
- `expenses_reversal_of_id_fkey`: `FOREIGN KEY (reversal_of_id) REFERENCES smartrent.expenses(id)`
- `expenses_room_id_fkey`: `FOREIGN KEY (room_id) REFERENCES smartrent.rooms(id)`
- `expenses_ticket_id_fkey`: `FOREIGN KEY (ticket_id) REFERENCES smartrent.tickets(id)`
- `expenses_pkey`: `PRIMARY KEY (id)`
- `expenses_reversal_of_id_key`: `UNIQUE (reversal_of_id)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX expenses_pkey ON smartrent.expenses USING btree (id);
CREATE UNIQUE INDEX expenses_reversal_of_id_key ON smartrent.expenses USING btree (reversal_of_id);
CREATE INDEX ix_expenses_category_id ON smartrent.expenses USING btree (category_id);
CREATE INDEX ix_expenses_evidence_file_id ON smartrent.expenses USING btree (evidence_file_id);
CREATE INDEX ix_expenses_property_id ON smartrent.expenses USING btree (property_id);
CREATE INDEX ix_expenses_recorded_by ON smartrent.expenses USING btree (recorded_by);
CREATE INDEX ix_expenses_room_id ON smartrent.expenses USING btree (room_id);
CREATE INDEX ix_expenses_ticket_id ON smartrent.expenses USING btree (ticket_id);
```

</details>

## export_jobs

Xuất CSV/XLSX/PDF với bộ lọc và file kết quả riêng tư

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `organization_id` | `uuid` | Không | `—` |
| `requested_by` | `uuid` | Không | `—` |
| `report_type` | `character varying(60)` | Không | `—` |
| `filters` | `jsonb` | Không | `—` |
| `format` | `character varying(8)` | Không | `—` |
| `status` | `character varying(10)` | Không | `'pending'::character varying` |
| `result_file_id` | `uuid` | Có | `—` |
| `error_message` | `text` | Có | `—` |
| `created_at` | `timestamp with time zone` | Không | `now()` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `export_jobs_format_check`: `CHECK (((format)::text = ANY ((ARRAY['csv'::character varying, 'xlsx'::character varying, 'pdf'::character varying])::text[])))`
- `export_jobs_status_check`: `CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'running'::character varying, 'succeeded'::character varying, 'failed'::character varying])::text[])))`
- `export_jobs_organization_id_fkey`: `FOREIGN KEY (organization_id) REFERENCES smartrent.organizations(id)`
- `export_jobs_requested_by_fkey`: `FOREIGN KEY (requested_by) REFERENCES smartrent.users(id)`
- `export_jobs_result_file_id_fkey`: `FOREIGN KEY (result_file_id) REFERENCES smartrent.stored_files(id)`
- `export_jobs_pkey`: `PRIMARY KEY (id)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX export_jobs_pkey ON smartrent.export_jobs USING btree (id);
CREATE INDEX ix_export_jobs_organization_id ON smartrent.export_jobs USING btree (organization_id);
CREATE INDEX ix_export_jobs_requested_by ON smartrent.export_jobs USING btree (requested_by);
CREATE INDEX ix_export_jobs_result_file_id ON smartrent.export_jobs USING btree (result_file_id);
```

</details>

## handover_assets

Tài sản, số lượng/tên/tình trạng lúc bàn giao

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `handover_id` | `uuid` | Không | `—` |
| `room_asset_id` | `uuid` | Không | `—` |
| `name_snapshot` | `text` | Không | `—` |
| `quantity` | `numeric(12,3)` | Không | `—` |
| `condition_notes` | `text` | Không | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `handover_assets_quantity_check`: `CHECK ((quantity >= (0)::numeric))`
- `handover_assets_handover_id_fkey`: `FOREIGN KEY (handover_id) REFERENCES smartrent.handovers(id)`
- `handover_assets_room_asset_id_fkey`: `FOREIGN KEY (room_asset_id) REFERENCES smartrent.room_assets(id)`
- `handover_assets_pkey`: `PRIMARY KEY (id)`
- `handover_assets_handover_id_room_asset_id_key`: `UNIQUE (handover_id, room_asset_id)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX handover_assets_handover_id_room_asset_id_key ON smartrent.handover_assets USING btree (handover_id, room_asset_id);
CREATE UNIQUE INDEX handover_assets_pkey ON smartrent.handover_assets USING btree (id);
CREATE INDEX ix_handover_assets_room_asset_id ON smartrent.handover_assets USING btree (room_asset_id);
```

</details>

## handover_files

Ảnh/tệp biên bản bàn giao

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `handover_id` | `uuid` | Không | `—` |
| `file_id` | `uuid` | Không | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `handover_files_file_id_fkey`: `FOREIGN KEY (file_id) REFERENCES smartrent.stored_files(id)`
- `handover_files_handover_id_fkey`: `FOREIGN KEY (handover_id) REFERENCES smartrent.handovers(id)`
- `handover_files_pkey`: `PRIMARY KEY (handover_id, file_id)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX handover_files_pkey ON smartrent.handover_files USING btree (handover_id, file_id);
CREATE INDEX ix_handover_files_file_id ON smartrent.handover_files USING btree (file_id);
```

</details>

## handovers

Bàn giao nhận/trả/chuyển, thời điểm, xác nhận, hiện trạng

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `tenancy_id` | `uuid` | Không | `—` |
| `kind` | `character varying(15)` | Không | `—` |
| `occurred_at` | `timestamp with time zone` | Không | `—` |
| `notes` | `text` | Có | `—` |
| `landlord_confirmed_by` | `uuid` | Có | `—` |
| `tenant_confirmed_by` | `uuid` | Có | `—` |
| `confirmed_at` | `timestamp with time zone` | Có | `—` |
| `representative_confirmation_text` | `text` | Có | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `handovers_kind_check`: `CHECK (((kind)::text = ANY ((ARRAY['checkin'::character varying, 'checkout'::character varying, 'transfer_in'::character varying, 'transfer_out'::character varying])::text[])))`
- `handovers_landlord_confirmed_by_fkey`: `FOREIGN KEY (landlord_confirmed_by) REFERENCES smartrent.users(id)`
- `handovers_tenancy_id_fkey`: `FOREIGN KEY (tenancy_id) REFERENCES smartrent.tenancies(id)`
- `handovers_tenant_confirmed_by_fkey`: `FOREIGN KEY (tenant_confirmed_by) REFERENCES smartrent.users(id)`
- `handovers_pkey`: `PRIMARY KEY (id)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX handovers_pkey ON smartrent.handovers USING btree (id);
CREATE INDEX ix_handovers_landlord_confirmed_by ON smartrent.handovers USING btree (landlord_confirmed_by);
CREATE INDEX ix_handovers_tenancy_id ON smartrent.handovers USING btree (tenancy_id);
CREATE INDEX ix_handovers_tenant_confirmed_by ON smartrent.handovers USING btree (tenant_confirmed_by);
```

</details>

## inquiry_events

Nhật ký liên hệ/xử lý yêu cầu

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `inquiry_id` | `uuid` | Không | `—` |
| `event_type` | `character varying(40)` | Không | `—` |
| `notes` | `text` | Không | `—` |
| `actor_id` | `uuid` | Có | `—` |
| `created_at` | `timestamp with time zone` | Không | `now()` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `inquiry_events_actor_id_fkey`: `FOREIGN KEY (actor_id) REFERENCES smartrent.users(id)`
- `inquiry_events_inquiry_id_fkey`: `FOREIGN KEY (inquiry_id) REFERENCES smartrent.rental_inquiries(id)`
- `inquiry_events_pkey`: `PRIMARY KEY (id)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX inquiry_events_pkey ON smartrent.inquiry_events USING btree (id);
CREATE INDEX ix_inquiry_events_actor_id ON smartrent.inquiry_events USING btree (actor_id);
CREATE INDEX ix_inquiry_events_inquiry_id ON smartrent.inquiry_events USING btree (inquiry_id);
```

</details>

## integration_connections

Nhà cung cấp ngân hàng/thanh toán/ký số/hóa đơn thuế, secret reference

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `organization_id` | `uuid` | Không | `—` |
| `kind` | `character varying(20)` | Không | `—` |
| `provider_code` | `character varying(60)` | Không | `—` |
| `secret_reference` | `text` | Không | `—` |
| `is_enabled` | `boolean` | Không | `false` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `integration_connections_kind_check`: `CHECK (((kind)::text = ANY ((ARRAY['bank'::character varying, 'payment_gateway'::character varying, 'esign'::character varying, 'tax_invoice'::character varying])::text[])))`
- `integration_connections_organization_id_fkey`: `FOREIGN KEY (organization_id) REFERENCES smartrent.organizations(id)`
- `integration_connections_pkey`: `PRIMARY KEY (id)`
- `integration_connections_organization_id_kind_provider_code_key`: `UNIQUE (organization_id, kind, provider_code)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX integration_connections_organization_id_kind_provider_code_key ON smartrent.integration_connections USING btree (organization_id, kind, provider_code);
CREATE UNIQUE INDEX integration_connections_pkey ON smartrent.integration_connections USING btree (id);
```

</details>

## integration_events

Webhook được chống lặp theo connection/provider_event_id, kết quả xử lý

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `connection_id` | `uuid` | Không | `—` |
| `provider_event_id` | `character varying(250)` | Không | `—` |
| `payload` | `jsonb` | Không | `—` |
| `received_at` | `timestamp with time zone` | Không | `now()` |
| `processed_at` | `timestamp with time zone` | Có | `—` |
| `error_message` | `text` | Có | `—` |
| `payment_id` | `uuid` | Có | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `integration_events_connection_id_fkey`: `FOREIGN KEY (connection_id) REFERENCES smartrent.integration_connections(id)`
- `integration_events_payment_id_fkey`: `FOREIGN KEY (payment_id) REFERENCES smartrent.payments(id)`
- `integration_events_pkey`: `PRIMARY KEY (id)`
- `integration_events_connection_id_provider_event_id_key`: `UNIQUE (connection_id, provider_event_id)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX integration_events_connection_id_provider_event_id_key ON smartrent.integration_events USING btree (connection_id, provider_event_id);
CREATE UNIQUE INDEX integration_events_pkey ON smartrent.integration_events USING btree (id);
CREATE INDEX ix_integration_events_payment_id ON smartrent.integration_events USING btree (payment_id);
```

</details>

## invoice_charge_claims

Claim đang sử dụng phát sinh phí; một phát sinh chỉ xuất hiện trên một dòng có hiệu lực

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

## invoice_files

Bản in PDF và chứng cứ

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `invoice_id` | `uuid` | Không | `—` |
| `file_id` | `uuid` | Không | `—` |
| `file_kind` | `character varying(20)` | Không | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `invoice_files_file_kind_check`: `CHECK (((file_kind)::text = ANY ((ARRAY['print_pdf'::character varying, 'evidence'::character varying])::text[])))`
- `invoice_files_file_id_fkey`: `FOREIGN KEY (file_id) REFERENCES smartrent.stored_files(id)`
- `invoice_files_invoice_id_fkey`: `FOREIGN KEY (invoice_id) REFERENCES smartrent.invoices(id)`
- `invoice_files_pkey`: `PRIMARY KEY (invoice_id, file_id)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX invoice_files_pkey ON smartrent.invoice_files USING btree (invoice_id, file_id);
CREATE INDEX ix_invoice_files_file_id ON smartrent.invoice_files USING btree (file_id);
```

</details>

## invoice_issue_batch_items

Kết quả thành công/lỗi/thử lại cho từng đợt thuê

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `batch_id` | `uuid` | Không | `—` |
| `tenancy_id` | `uuid` | Không | `—` |
| `invoice_id` | `uuid` | Có | `—` |
| `status` | `character varying(10)` | Không | `—` |
| `error_code` | `character varying(80)` | Có | `—` |
| `error_message` | `text` | Có | `—` |
| `attempts` | `integer` | Không | `0` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `invoice_issue_batch_items_attempts_check`: `CHECK ((attempts >= 0))`
- `invoice_issue_batch_items_status_check`: `CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'succeeded'::character varying, 'failed'::character varying])::text[])))`
- `invoice_issue_batch_items_batch_id_fkey`: `FOREIGN KEY (batch_id) REFERENCES smartrent.invoice_issue_batches(id)`
- `invoice_issue_batch_items_invoice_id_fkey`: `FOREIGN KEY (invoice_id) REFERENCES smartrent.invoices(id)`
- `invoice_issue_batch_items_tenancy_id_fkey`: `FOREIGN KEY (tenancy_id) REFERENCES smartrent.tenancies(id)`
- `invoice_issue_batch_items_pkey`: `PRIMARY KEY (batch_id, tenancy_id)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX invoice_issue_batch_items_pkey ON smartrent.invoice_issue_batch_items USING btree (batch_id, tenancy_id);
CREATE INDEX ix_invoice_issue_batch_items_invoice_id ON smartrent.invoice_issue_batch_items USING btree (invoice_id);
CREATE INDEX ix_invoice_issue_batch_items_tenancy_id ON smartrent.invoice_issue_batch_items USING btree (tenancy_id);
```

</details>

## invoice_issue_batches

Một yêu cầu phát hành hàng loạt, có khóa chống lặp

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `billing_period_id` | `uuid` | Không | `—` |
| `idempotency_key` | `uuid` | Không | `—` |
| `requested_by` | `uuid` | Không | `—` |
| `created_at` | `timestamp with time zone` | Không | `now()` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `invoice_issue_batches_billing_period_id_fkey`: `FOREIGN KEY (billing_period_id) REFERENCES smartrent.billing_periods(id)`
- `invoice_issue_batches_requested_by_fkey`: `FOREIGN KEY (requested_by) REFERENCES smartrent.users(id)`
- `invoice_issue_batches_pkey`: `PRIMARY KEY (id)`
- `invoice_issue_batches_idempotency_key_key`: `UNIQUE (idempotency_key)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX invoice_issue_batches_idempotency_key_key ON smartrent.invoice_issue_batches USING btree (idempotency_key);
CREATE UNIQUE INDEX invoice_issue_batches_pkey ON smartrent.invoice_issue_batches USING btree (id);
CREATE INDEX ix_invoice_issue_batches_billing_period_id ON smartrent.invoice_issue_batches USING btree (billing_period_id);
CREATE INDEX ix_invoice_issue_batches_requested_by ON smartrent.invoice_issue_batches USING btree (requested_by);
```

</details>

## invoice_lines

Từng khoản thu/giảm, lượng, giá snapshot, nguồn giá, tỷ lệ chia ngày

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `invoice_id` | `uuid` | Không | `—` |
| `line_no` | `integer` | Không | `—` |
| `charge_type_id` | `uuid` | Không | `—` |
| `charge_instance_id` | `uuid` | Có | `—` |
| `source_rate_id` | `uuid` | Có | `—` |
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

Các đoạn chỉ số đầu/cuối của dòng điện/nước, kể cả thay công tơ

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `invoice_line_id` | `uuid` | Không | `—` |
| `from_reading_id` | `uuid` | Không | `—` |
| `to_reading_id` | `uuid` | Không | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `invoice_meter_segments_check`: `CHECK ((from_reading_id <> to_reading_id))`
- `invoice_meter_segments_from_reading_id_fkey`: `FOREIGN KEY (from_reading_id) REFERENCES smartrent.meter_readings(id)`
- `invoice_meter_segments_invoice_line_id_fkey`: `FOREIGN KEY (invoice_line_id) REFERENCES smartrent.invoice_lines(id)`
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

Header chứng từ nháp/phát hành/hủy, kỳ, ngày tính, hạn, chứng từ gốc, idempotency

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
- `invoices_kind_check`: `CHECK (((kind)::text = ANY ((ARRAY['periodic'::character varying, 'final'::character varying, 'one_time'::character varying, 'replacement'::character varying, 'debit_adjustment'::character varying, 'credit_adjustment'::character varying])::text[])))`
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
- `invoices_tenancy_id_daterange_excl`: `EXCLUDE USING gist (tenancy_id WITH =, daterange(service_from, service_to, '[)'::text) WITH &&) WHERE ((((status)::text = 'issued'::text) AND ((kind)::text = ANY ((ARRAY['periodic'::character varying, 'final'::character varying, 'replacement'::character varying])::text[]))))`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX invoices_code_key ON smartrent.invoices USING btree (code);
CREATE UNIQUE INDEX invoices_idempotency_key_key ON smartrent.invoices USING btree (idempotency_key);
CREATE UNIQUE INDEX invoices_pkey ON smartrent.invoices USING btree (id);
CREATE INDEX invoices_tenancy_id_daterange_excl ON smartrent.invoices USING gist (tenancy_id, daterange(service_from, service_to, '[)'::text)) WHERE (((status)::text = 'issued'::text) AND ((kind)::text = ANY ((ARRAY['periodic'::character varying, 'final'::character varying, 'replacement'::character varying])::text[])));
CREATE INDEX ix_invoice_due ON smartrent.invoices USING btree (due_on) WHERE ((status)::text = 'issued'::text);
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

N–N nhân sự–cơ sở được phân công

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `membership_id` | `uuid` | Không | `—` |
| `property_id` | `uuid` | Không | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `membership_properties_membership_id_fkey`: `FOREIGN KEY (membership_id) REFERENCES smartrent.organization_memberships(id)`
- `membership_properties_property_id_fkey`: `FOREIGN KEY (property_id) REFERENCES smartrent.properties(id)`
- `membership_properties_pkey`: `PRIMARY KEY (membership_id, property_id)`

<details><summary>Indexes</summary>

```sql
CREATE INDEX ix_membership_properties_property_id ON smartrent.membership_properties USING btree (property_id);
CREATE UNIQUE INDEX membership_properties_pkey ON smartrent.membership_properties USING btree (membership_id, property_id);
```

</details>

## membership_roles

N–N nhân sự–vai trò cùng đơn vị

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `membership_id` | `uuid` | Không | `—` |
| `role_id` | `uuid` | Không | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `membership_roles_membership_id_fkey`: `FOREIGN KEY (membership_id) REFERENCES smartrent.organization_memberships(id)`
- `membership_roles_role_id_fkey`: `FOREIGN KEY (role_id) REFERENCES smartrent.business_roles(id)`
- `membership_roles_pkey`: `PRIMARY KEY (membership_id, role_id)`

<details><summary>Indexes</summary>

```sql
CREATE INDEX ix_membership_roles_role_id ON smartrent.membership_roles USING btree (role_id);
CREATE UNIQUE INDEX membership_roles_pkey ON smartrent.membership_roles USING btree (membership_id, role_id);
```

</details>

## message_templates

Nội dung theo phiên bản và kênh

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `organization_id` | `uuid` | Không | `—` |
| `code` | `character varying(60)` | Không | `—` |
| `version_no` | `integer` | Không | `—` |
| `channel` | `character varying(10)` | Không | `—` |
| `subject_template` | `text` | Có | `—` |
| `body_template` | `text` | Không | `—` |
| `is_active` | `boolean` | Không | `true` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `message_templates_channel_check`: `CHECK (((channel)::text = ANY ((ARRAY['email'::character varying, 'in_app'::character varying])::text[])))`
- `message_templates_version_no_check`: `CHECK ((version_no > 0))`
- `message_templates_organization_id_fkey`: `FOREIGN KEY (organization_id) REFERENCES smartrent.organizations(id)`
- `message_templates_pkey`: `PRIMARY KEY (id)`
- `message_templates_organization_id_code_version_no_channel_key`: `UNIQUE (organization_id, code, version_no, channel)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX message_templates_organization_id_code_version_no_channel_key ON smartrent.message_templates USING btree (organization_id, code, version_no, channel);
CREATE UNIQUE INDEX message_templates_pkey ON smartrent.message_templates USING btree (id);
```

</details>

## meter_reading_files

Ảnh/chứng cứ chỉ số

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `reading_id` | `uuid` | Không | `—` |
| `file_id` | `uuid` | Không | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `meter_reading_files_file_id_fkey`: `FOREIGN KEY (file_id) REFERENCES smartrent.stored_files(id)`
- `meter_reading_files_reading_id_fkey`: `FOREIGN KEY (reading_id) REFERENCES smartrent.meter_readings(id)`
- `meter_reading_files_pkey`: `PRIMARY KEY (reading_id, file_id)`

<details><summary>Indexes</summary>

```sql
CREATE INDEX ix_meter_reading_files_file_id ON smartrent.meter_reading_files USING btree (file_id);
CREATE UNIQUE INDEX meter_reading_files_pkey ON smartrent.meter_reading_files USING btree (reading_id, file_id);
```

</details>

## meter_readings

Chỉ số không âm theo thời điểm, đợt thuê, kỳ, bàn giao; sửa bằng void + bản ghi kế tiếp

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
```

</details>

## meter_replacements

Công tơ cũ/mới, chỉ số chốt/mở và thời điểm thay

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `old_meter_id` | `uuid` | Không | `—` |
| `new_meter_id` | `uuid` | Không | `—` |
| `final_reading_id` | `uuid` | Không | `—` |
| `initial_reading_id` | `uuid` | Không | `—` |
| `replaced_at` | `timestamp with time zone` | Không | `—` |
| `reason` | `text` | Không | `—` |
| `performed_by` | `uuid` | Không | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `meter_replacements_check`: `CHECK ((old_meter_id <> new_meter_id))`
- `meter_replacements_final_reading_id_fkey`: `FOREIGN KEY (final_reading_id) REFERENCES smartrent.meter_readings(id)`
- `meter_replacements_initial_reading_id_fkey`: `FOREIGN KEY (initial_reading_id) REFERENCES smartrent.meter_readings(id)`
- `meter_replacements_new_meter_id_fkey`: `FOREIGN KEY (new_meter_id) REFERENCES smartrent.meters(id)`
- `meter_replacements_old_meter_id_fkey`: `FOREIGN KEY (old_meter_id) REFERENCES smartrent.meters(id)`
- `meter_replacements_performed_by_fkey`: `FOREIGN KEY (performed_by) REFERENCES smartrent.users(id)`
- `meter_replacements_pkey`: `PRIMARY KEY (id)`
- `meter_replacements_new_meter_id_key`: `UNIQUE (new_meter_id)`
- `meter_replacements_old_meter_id_key`: `UNIQUE (old_meter_id)`

<details><summary>Indexes</summary>

```sql
CREATE INDEX ix_meter_replacements_final_reading_id ON smartrent.meter_replacements USING btree (final_reading_id);
CREATE INDEX ix_meter_replacements_initial_reading_id ON smartrent.meter_replacements USING btree (initial_reading_id);
CREATE INDEX ix_meter_replacements_performed_by ON smartrent.meter_replacements USING btree (performed_by);
CREATE UNIQUE INDEX meter_replacements_new_meter_id_key ON smartrent.meter_replacements USING btree (new_meter_id);
CREATE UNIQUE INDEX meter_replacements_old_meter_id_key ON smartrent.meter_replacements USING btree (old_meter_id);
CREATE UNIQUE INDEX meter_replacements_pkey ON smartrent.meter_replacements USING btree (id);
```

</details>

## meters

Công tơ điện/nước, serial, khoảng lắp/tháo; không chồng công tơ cùng loại trong phòng

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
- `meters_room_id_fkey`: `FOREIGN KEY (room_id) REFERENCES smartrent.rooms(id)`
- `meters_pkey`: `PRIMARY KEY (id)`
- `meters_room_id_meter_kind_tstzrange_excl`: `EXCLUDE USING gist (room_id WITH =, meter_kind WITH =, tstzrange(installed_at, removed_at, '[)'::text) WITH &&)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX meters_pkey ON smartrent.meters USING btree (id);
CREATE INDEX meters_room_id_meter_kind_tstzrange_excl ON smartrent.meters USING gist (room_id, meter_kind, tstzrange(installed_at, removed_at, '[)'::text));
```

</details>

## notification_deliveries

Lần gửi logic theo người/kênh/mẫu, khóa chống lặp

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `outbox_message_id` | `uuid` | Không | `—` |
| `recipient_address` | `text` | Không | `—` |
| `channel` | `character varying(10)` | Không | `—` |
| `template_id` | `uuid` | Có | `—` |
| `deduplication_key` | `character varying(300)` | Không | `—` |
| `status` | `character varying(10)` | Không | `'pending'::character varying` |
| `rendered_subject` | `text` | Có | `—` |
| `rendered_body` | `text` | Có | `—` |
| `sent_at` | `timestamp with time zone` | Có | `—` |
| `provider_message_id` | `text` | Có | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `notification_deliveries_channel_check`: `CHECK (((channel)::text = ANY ((ARRAY['email'::character varying, 'in_app'::character varying])::text[])))`
- `notification_deliveries_status_check`: `CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'sending'::character varying, 'sent'::character varying, 'failed'::character varying])::text[])))`
- `notification_deliveries_outbox_message_id_fkey`: `FOREIGN KEY (outbox_message_id) REFERENCES smartrent.outbox_messages(id)`
- `notification_deliveries_template_id_fkey`: `FOREIGN KEY (template_id) REFERENCES smartrent.message_templates(id)`
- `notification_deliveries_pkey`: `PRIMARY KEY (id)`
- `notification_deliveries_deduplication_key_key`: `UNIQUE (deduplication_key)`

<details><summary>Indexes</summary>

```sql
CREATE INDEX ix_notification_deliveries_outbox_message_id ON smartrent.notification_deliveries USING btree (outbox_message_id);
CREATE INDEX ix_notification_deliveries_template_id ON smartrent.notification_deliveries USING btree (template_id);
CREATE UNIQUE INDEX notification_deliveries_deduplication_key_key ON smartrent.notification_deliveries USING btree (deduplication_key);
CREATE UNIQUE INDEX notification_deliveries_pkey ON smartrent.notification_deliveries USING btree (id);
```

</details>

## notifications

Chuông thông báo theo người, đọc/chưa đọc, liên kết nội bộ

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `organization_id` | `uuid` | Không | `—` |
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

## onboarding_gaps

Hồ sơ còn thiếu khi nhập khách cũ và lịch hoàn thiện

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `tenancy_id` | `uuid` | Không | `—` |
| `missing_item` | `character varying(100)` | Không | `—` |
| `source_reference` | `text` | Có | `—` |
| `notes` | `text` | Có | `—` |
| `resolved_at` | `timestamp with time zone` | Có | `—` |
| `resolved_by` | `uuid` | Có | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `onboarding_gaps_resolved_by_fkey`: `FOREIGN KEY (resolved_by) REFERENCES smartrent.users(id)`
- `onboarding_gaps_tenancy_id_fkey`: `FOREIGN KEY (tenancy_id) REFERENCES smartrent.tenancies(id)`
- `onboarding_gaps_pkey`: `PRIMARY KEY (id)`
- `onboarding_gaps_tenancy_id_missing_item_key`: `UNIQUE (tenancy_id, missing_item)`

<details><summary>Indexes</summary>

```sql
CREATE INDEX ix_onboarding_gaps_resolved_by ON smartrent.onboarding_gaps USING btree (resolved_by);
CREATE UNIQUE INDEX onboarding_gaps_pkey ON smartrent.onboarding_gaps USING btree (id);
CREATE UNIQUE INDEX onboarding_gaps_tenancy_id_missing_item_key ON smartrent.onboarding_gaps USING btree (tenancy_id, missing_item);
```

</details>

## organization_memberships

N–N users–organizations; trạng thái nhân sự; phạm vi all/assigned

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

Múi giờ, lịch worker, lưu trữ

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `organization_id` | `uuid` | Không | `—` |
| `timezone` | `character varying(60)` | Không | `'Asia/Ho_Chi_Minh'::character varying` |
| `daily_job_time` | `time without time zone` | Không | `'08:00:00'::time without time zone` |
| `retention_days` | `integer` | Không | `365` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `organization_settings_retention_days_check`: `CHECK ((retention_days > 0))`
- `organization_settings_organization_id_fkey`: `FOREIGN KEY (organization_id) REFERENCES smartrent.organizations(id)`
- `organization_settings_pkey`: `PRIMARY KEY (organization_id)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX organization_settings_pkey ON smartrent.organization_settings USING btree (organization_id);
```

</details>

## organizations

Đơn vị kinh doanh/chủ trọ

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

## outbox_messages

Sự kiện gửi được ghi cùng transaction nghiệp vụ

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `organization_id` | `uuid` | Không | `—` |
| `event_key` | `character varying(250)` | Không | `—` |
| `event_type` | `character varying(80)` | Không | `—` |
| `payload` | `jsonb` | Không | `—` |
| `available_at` | `timestamp with time zone` | Không | `now()` |
| `attempts` | `integer` | Không | `0` |
| `locked_until` | `timestamp with time zone` | Có | `—` |
| `processed_at` | `timestamp with time zone` | Có | `—` |
| `last_error` | `text` | Có | `—` |
| `created_at` | `timestamp with time zone` | Không | `now()` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `outbox_messages_attempts_check`: `CHECK ((attempts >= 0))`
- `outbox_messages_organization_id_fkey`: `FOREIGN KEY (organization_id) REFERENCES smartrent.organizations(id)`
- `outbox_messages_pkey`: `PRIMARY KEY (id)`
- `outbox_messages_organization_id_event_key_key`: `UNIQUE (organization_id, event_key)`

<details><summary>Indexes</summary>

```sql
CREATE INDEX ix_outbox_pending ON smartrent.outbox_messages USING btree (available_at) WHERE (processed_at IS NULL);
CREATE UNIQUE INDEX outbox_messages_organization_id_event_key_key ON smartrent.outbox_messages USING btree (organization_id, event_key);
CREATE UNIQUE INDEX outbox_messages_pkey ON smartrent.outbox_messages USING btree (id);
```

</details>

## payment_allocations

Phân bổ tiền trực tiếp hoặc bù trừ cọc vào hóa đơn; đảo có liên kết dòng gốc

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

Ảnh báo chuyển khoản/biên nhận

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

## payment_methods

Danh mục phương thức thu/hoàn

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

Đảo sai hoặc hoàn tiền, giữ receipt gốc, số tiền/ngày/lý do/người/chứng cứ

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

Tiền thực nhận/báo nhận, chờ xác minh/xác nhận/từ chối, chứng từ giao dịch, idempotency

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `tenant_id` | `uuid` | Không | `—` |
| `reservation_id` | `uuid` | Có | `—` |
| `collected_at_property_id` | `uuid` | Có | `—` |
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
- `payments_collected_at_property_id_fkey`: `FOREIGN KEY (collected_at_property_id) REFERENCES smartrent.properties(id)`
- `payments_confirmed_by_fkey`: `FOREIGN KEY (confirmed_by) REFERENCES smartrent.users(id)`
- `payments_method_code_fkey`: `FOREIGN KEY (method_code) REFERENCES smartrent.payment_methods(code)`
- `payments_reported_by_fkey`: `FOREIGN KEY (reported_by) REFERENCES smartrent.users(id)`
- `payments_reservation_id_fkey`: `FOREIGN KEY (reservation_id) REFERENCES smartrent.reservations(id)`
- `payments_tenant_id_fkey`: `FOREIGN KEY (tenant_id) REFERENCES smartrent.tenants(id)`
- `payments_pkey`: `PRIMARY KEY (id)`
- `financial_balanced`: `TRIGGER DEFERRABLE INITIALLY DEFERRED`
- `payments_idempotency_key_key`: `UNIQUE (idempotency_key)`

<details><summary>Indexes</summary>

```sql
CREATE INDEX ix_payments_bank_account_id ON smartrent.payments USING btree (bank_account_id);
CREATE INDEX ix_payments_collected_at_property_id ON smartrent.payments USING btree (collected_at_property_id);
CREATE INDEX ix_payments_confirmed_by ON smartrent.payments USING btree (confirmed_by);
CREATE INDEX ix_payments_method_code ON smartrent.payments USING btree (method_code);
CREATE INDEX ix_payments_reported_by ON smartrent.payments USING btree (reported_by);
CREATE INDEX ix_payments_reservation_id ON smartrent.payments USING btree (reservation_id);
CREATE INDEX ix_payments_tenant_id ON smartrent.payments USING btree (tenant_id);
CREATE UNIQUE INDEX payments_idempotency_key_key ON smartrent.payments USING btree (idempotency_key);
CREATE UNIQUE INDEX payments_pkey ON smartrent.payments USING btree (id);
CREATE UNIQUE INDEX ux_bank_reference ON smartrent.payments USING btree (bank_account_id, external_reference) WHERE ((bank_account_id IS NOT NULL) AND (external_reference IS NOT NULL) AND ((status)::text <> 'rejected'::text));
```

</details>

## permissions

Danh mục quyền nhỏ, phân biệt xem/sửa/phát hành/duyệt/đảo/hoàn

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

Cơ sở, mã duy nhất trong đơn vị, địa chỉ/liên hệ

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `organization_id` | `uuid` | Không | `—` |
| `code` | `character varying(40)` | Không | `—` |
| `name` | `character varying(200)` | Không | `—` |
| `address_id` | `uuid` | Không | `—` |
| `description` | `text` | Có | `—` |
| `contact_name` | `character varying(200)` | Có | `—` |
| `phone` | `character varying(30)` | Có | `—` |
| `email` | `character varying(256)` | Có | `—` |
| `is_active` | `boolean` | Không | `true` |
| `created_at` | `timestamp with time zone` | Không | `now()` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `properties_address_id_fkey`: `FOREIGN KEY (address_id) REFERENCES smartrent.addresses(id)`
- `properties_organization_id_fkey`: `FOREIGN KEY (organization_id) REFERENCES smartrent.organizations(id)`
- `properties_pkey`: `PRIMARY KEY (id)`
- `properties_organization_id_code_key`: `UNIQUE (organization_id, code)`

<details><summary>Indexes</summary>

```sql
CREATE INDEX ix_properties_address_id ON smartrent.properties USING btree (address_id);
CREATE UNIQUE INDEX properties_organization_id_code_key ON smartrent.properties USING btree (organization_id, code);
CREATE UNIQUE INDEX properties_pkey ON smartrent.properties USING btree (id);
```

</details>

## property_billing_settings

1–0..1 cơ sở–lịch lập hóa đơn/hạn/mốc cảnh báo/chính sách chia ngày

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `property_id` | `uuid` | Không | `—` |
| `invoice_day` | `smallint` | Không | `1` |
| `due_after_days` | `smallint` | Không | `7` |
| `contract_warning_days` | `smallint` | Không | `30` |
| `timezone` | `character varying(60)` | Không | `'Asia/Ho_Chi_Minh'::character varying` |
| `proration_policy` | `character varying(20)` | Không | `'actual_days'::character varying` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `property_billing_settings_contract_warning_days_check`: `CHECK ((contract_warning_days >= 0))`
- `property_billing_settings_due_after_days_check`: `CHECK (((due_after_days >= 0) AND (due_after_days <= 365)))`
- `property_billing_settings_invoice_day_check`: `CHECK (((invoice_day >= 1) AND (invoice_day <= 31)))`
- `property_billing_settings_proration_policy_check`: `CHECK (((proration_policy)::text = ANY ((ARRAY['actual_days'::character varying, 'full_month'::character varying])::text[])))`
- `property_billing_settings_property_id_fkey`: `FOREIGN KEY (property_id) REFERENCES smartrent.properties(id)`
- `property_billing_settings_pkey`: `PRIMARY KEY (property_id)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX property_billing_settings_pkey ON smartrent.property_billing_settings USING btree (property_id);
```

</details>

## rate_plans

Một phạm vi duy nhất: cơ sở hoặc phòng hoặc phiên bản hợp đồng

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `property_id` | `uuid` | Có | `—` |
| `room_id` | `uuid` | Có | `—` |
| `contract_version_id` | `uuid` | Có | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `rate_plans_check`: `CHECK ((num_nonnulls(property_id, room_id, contract_version_id) = 1))`
- `rate_plans_contract_version_id_fkey`: `FOREIGN KEY (contract_version_id) REFERENCES smartrent.contract_versions(id)`
- `rate_plans_property_id_fkey`: `FOREIGN KEY (property_id) REFERENCES smartrent.properties(id)`
- `rate_plans_room_id_fkey`: `FOREIGN KEY (room_id) REFERENCES smartrent.rooms(id)`
- `rate_plans_pkey`: `PRIMARY KEY (id)`
- `rate_plans_contract_version_id_key`: `UNIQUE (contract_version_id)`
- `rate_plans_property_id_key`: `UNIQUE (property_id)`
- `rate_plans_room_id_key`: `UNIQUE (room_id)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX rate_plans_contract_version_id_key ON smartrent.rate_plans USING btree (contract_version_id);
CREATE UNIQUE INDEX rate_plans_pkey ON smartrent.rate_plans USING btree (id);
CREATE UNIQUE INDEX rate_plans_property_id_key ON smartrent.rate_plans USING btree (property_id);
CREATE UNIQUE INDEX rate_plans_room_id_key ON smartrent.rate_plans USING btree (room_id);
```

</details>

## reminder_rules

Sự kiện/mốc ngày/mẫu/bật tắt

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `organization_id` | `uuid` | Không | `—` |
| `event_type` | `character varying(40)` | Không | `—` |
| `day_offset` | `integer` | Không | `0` |
| `template_id` | `uuid` | Không | `—` |
| `is_enabled` | `boolean` | Không | `true` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `reminder_rules_organization_id_fkey`: `FOREIGN KEY (organization_id) REFERENCES smartrent.organizations(id)`
- `reminder_rules_template_id_fkey`: `FOREIGN KEY (template_id) REFERENCES smartrent.message_templates(id)`
- `reminder_rules_pkey`: `PRIMARY KEY (id)`
- `reminder_rules_organization_id_event_type_day_offset_templa_key`: `UNIQUE (organization_id, event_type, day_offset, template_id)`

<details><summary>Indexes</summary>

```sql
CREATE INDEX ix_reminder_rules_template_id ON smartrent.reminder_rules USING btree (template_id);
CREATE UNIQUE INDEX reminder_rules_organization_id_event_type_day_offset_templa_key ON smartrent.reminder_rules USING btree (organization_id, event_type, day_offset, template_id);
CREATE UNIQUE INDEX reminder_rules_pkey ON smartrent.reminder_rules USING btree (id);
```

</details>

## rental_inquiries

Yêu cầu xem/thuê, liên hệ, ngày nhận, số người, tư vấn và kết quả

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `room_id` | `uuid` | Không | `—` |
| `contact_name` | `character varying(200)` | Không | `—` |
| `phone` | `character varying(30)` | Có | `—` |
| `email` | `character varying(256)` | Có | `—` |
| `desired_move_in` | `date` | Có | `—` |
| `occupants` | `smallint` | Không | `1` |
| `message` | `text` | Có | `—` |
| `status` | `character varying(15)` | Không | `'new'::character varying` |
| `assigned_to` | `uuid` | Có | `—` |
| `tenant_id` | `uuid` | Có | `—` |
| `closed_reason` | `text` | Có | `—` |
| `created_at` | `timestamp with time zone` | Không | `now()` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `rental_inquiries_check`: `CHECK (((NULLIF(btrim((phone)::text), ''::text) IS NOT NULL) OR (NULLIF(btrim((email)::text), ''::text) IS NOT NULL)))`
- `rental_inquiries_occupants_check`: `CHECK ((occupants > 0))`
- `rental_inquiries_status_check`: `CHECK (((status)::text = ANY ((ARRAY['new'::character varying, 'accepted'::character varying, 'consulting'::character varying, 'viewing'::character varying, 'approved'::character varying, 'rejected'::character varying, 'cancelled'::character varying, 'converted'::character varying])::text[])))`
- `rental_inquiries_assigned_to_fkey`: `FOREIGN KEY (assigned_to) REFERENCES smartrent.users(id)`
- `rental_inquiries_room_id_fkey`: `FOREIGN KEY (room_id) REFERENCES smartrent.rooms(id)`
- `rental_inquiries_tenant_id_fkey`: `FOREIGN KEY (tenant_id) REFERENCES smartrent.tenants(id)`
- `rental_inquiries_pkey`: `PRIMARY KEY (id)`

<details><summary>Indexes</summary>

```sql
CREATE INDEX ix_rental_inquiries_assigned_to ON smartrent.rental_inquiries USING btree (assigned_to);
CREATE INDEX ix_rental_inquiries_room_id ON smartrent.rental_inquiries USING btree (room_id);
CREATE INDEX ix_rental_inquiries_tenant_id ON smartrent.rental_inquiries USING btree (tenant_id);
CREATE UNIQUE INDEX rental_inquiries_pkey ON smartrent.rental_inquiries USING btree (id);
```

</details>

## reservations

Giữ chỗ cho khách, liên kết lịch chiếm dụng, điều kiện hủy, trạng thái và người xử lý

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `inquiry_id` | `uuid` | Có | `—` |
| `allocation_id` | `uuid` | Không | `—` |
| `tenant_id` | `uuid` | Không | `—` |
| `status` | `character varying(12)` | Không | `'holding'::character varying` |
| `cancellation_terms` | `text` | Không | `—` |
| `cancelled_reason` | `text` | Có | `—` |
| `handled_by` | `uuid` | Không | `—` |
| `created_at` | `timestamp with time zone` | Không | `now()` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `reservations_status_check`: `CHECK (((status)::text = ANY ((ARRAY['holding'::character varying, 'converted'::character varying, 'expired'::character varying, 'cancelled'::character varying])::text[])))`
- `reservations_allocation_id_fkey`: `FOREIGN KEY (allocation_id) REFERENCES smartrent.room_allocations(id)`
- `reservations_handled_by_fkey`: `FOREIGN KEY (handled_by) REFERENCES smartrent.users(id)`
- `reservations_inquiry_id_fkey`: `FOREIGN KEY (inquiry_id) REFERENCES smartrent.rental_inquiries(id)`
- `reservations_tenant_id_fkey`: `FOREIGN KEY (tenant_id) REFERENCES smartrent.tenants(id)`
- `reservations_pkey`: `PRIMARY KEY (id)`
- `reservation_consistent`: `TRIGGER DEFERRABLE INITIALLY DEFERRED`
- `reservations_allocation_id_key`: `UNIQUE (allocation_id)`

<details><summary>Indexes</summary>

```sql
CREATE INDEX ix_reservations_handled_by ON smartrent.reservations USING btree (handled_by);
CREATE INDEX ix_reservations_inquiry_id ON smartrent.reservations USING btree (inquiry_id);
CREATE INDEX ix_reservations_tenant_id ON smartrent.reservations USING btree (tenant_id);
CREATE UNIQUE INDEX reservations_allocation_id_key ON smartrent.reservations USING btree (allocation_id);
CREATE UNIQUE INDEX reservations_pkey ON smartrent.reservations USING btree (id);
```

</details>

## role_claims

Claim của vai trò toàn hệ thống

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

Vai trò toàn hệ thống, ví dụ SystemAdmin; không dùng để cấp quyền chủ trọ xuyên đơn vị

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

## room_allocations

Lịch chiếm dụng dùng chung giữ chỗ và thuê; EXCLUDE chống chồng khoảng

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `room_id` | `uuid` | Không | `—` |
| `starts_on` | `date` | Không | `—` |
| `ends_on` | `date` | Có | `—` |
| `state` | `character varying(12)` | Không | `—` |
| `hold_expires_at` | `timestamp with time zone` | Có | `—` |
| `created_at` | `timestamp with time zone` | Không | `now()` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `room_allocations_check`: `CHECK (((ends_on IS NULL) OR (ends_on > starts_on)))`
- `room_allocations_check1`: `CHECK ((((state)::text <> 'held'::text) OR ((hold_expires_at IS NOT NULL) AND (ends_on IS NOT NULL))))`
- `room_allocations_check2`: `CHECK ((((state)::text <> 'completed'::text) OR (ends_on IS NOT NULL)))`
- `room_allocations_state_check`: `CHECK (((state)::text = ANY ((ARRAY['held'::character varying, 'reserved'::character varying, 'occupied'::character varying, 'completed'::character varying, 'released'::character varying])::text[])))`
- `room_allocations_room_id_fkey`: `FOREIGN KEY (room_id) REFERENCES smartrent.rooms(id)`
- `room_allocations_pkey`: `PRIMARY KEY (id)`
- `reservation_consistent`: `TRIGGER DEFERRABLE INITIALLY DEFERRED`
- `tenancy_consistent`: `TRIGGER DEFERRABLE INITIALLY DEFERRED`
- `room_allocations_room_id_daterange_excl`: `EXCLUDE USING gist (room_id WITH =, daterange(starts_on, ends_on, '[)'::text) WITH &&) WHERE (((state)::text = ANY ((ARRAY['held'::character varying, 'reserved'::character varying, 'occupied'::character varying, 'completed'::character varying])::text[])))`

<details><summary>Indexes</summary>

```sql
CREATE INDEX ix_room_allocations_room_id ON smartrent.room_allocations USING btree (room_id);
CREATE UNIQUE INDEX room_allocations_pkey ON smartrent.room_allocations USING btree (id);
CREATE INDEX room_allocations_room_id_daterange_excl ON smartrent.room_allocations USING gist (room_id, daterange(starts_on, ends_on, '[)'::text)) WHERE ((state)::text = ANY ((ARRAY['held'::character varying, 'reserved'::character varying, 'occupied'::character varying, 'completed'::character varying])::text[]));
```

</details>

## room_amenities

N–N phòng–tiện nghi

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `room_id` | `uuid` | Không | `—` |
| `amenity_id` | `uuid` | Không | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `room_amenities_amenity_id_fkey`: `FOREIGN KEY (amenity_id) REFERENCES smartrent.amenities(id)`
- `room_amenities_room_id_fkey`: `FOREIGN KEY (room_id) REFERENCES smartrent.rooms(id)`
- `room_amenities_pkey`: `PRIMARY KEY (room_id, amenity_id)`

<details><summary>Indexes</summary>

```sql
CREATE INDEX ix_room_amenities_amenity_id ON smartrent.room_amenities USING btree (amenity_id);
CREATE UNIQUE INDEX room_amenities_pkey ON smartrent.room_amenities USING btree (room_id, amenity_id);
```

</details>

## room_assets

Nội thất/tài sản với số lượng, mã trong phòng, tình trạng

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `room_id` | `uuid` | Không | `—` |
| `code` | `character varying(50)` | Không | `—` |
| `name` | `character varying(200)` | Không | `—` |
| `quantity` | `numeric(12,3)` | Không | `—` |
| `condition_notes` | `text` | Có | `—` |
| `acquired_on` | `date` | Có | `—` |
| `retired_on` | `date` | Có | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `room_assets_quantity_check`: `CHECK ((quantity > (0)::numeric))`
- `room_assets_room_id_fkey`: `FOREIGN KEY (room_id) REFERENCES smartrent.rooms(id)`
- `room_assets_pkey`: `PRIMARY KEY (id)`
- `room_assets_room_id_code_key`: `UNIQUE (room_id, code)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX room_assets_pkey ON smartrent.room_assets USING btree (id);
CREATE UNIQUE INDEX room_assets_room_id_code_key ON smartrent.room_assets USING btree (room_id, code);
```

</details>

## room_images

Ảnh phòng, thứ tự, bìa; tối đa một ảnh bìa mỗi phòng

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
- `room_images_room_id_fkey`: `FOREIGN KEY (room_id) REFERENCES smartrent.rooms(id)`
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

1–0..1 phòng–tin đăng; slug duy nhất; nháp/công khai/ẩn độc lập khách đang ở

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `room_id` | `uuid` | Không | `—` |
| `slug` | `character varying(250)` | Không | `—` |
| `title` | `character varying(250)` | Không | `—` |
| `description` | `text` | Có | `—` |
| `status` | `character varying(10)` | Không | `'draft'::character varying` |
| `published_at` | `timestamp with time zone` | Có | `—` |
| `updated_at` | `timestamp with time zone` | Không | `now()` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `room_listings_status_check`: `CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'published'::character varying, 'hidden'::character varying])::text[])))`
- `room_listings_room_id_fkey`: `FOREIGN KEY (room_id) REFERENCES smartrent.rooms(id)`
- `room_listings_pkey`: `PRIMARY KEY (id)`
- `room_listings_room_id_key`: `UNIQUE (room_id)`
- `room_listings_slug_key`: `UNIQUE (slug)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX room_listings_pkey ON smartrent.room_listings USING btree (id);
CREATE UNIQUE INDEX room_listings_room_id_key ON smartrent.room_listings USING btree (room_id);
CREATE UNIQUE INDEX room_listings_slug_key ON smartrent.room_listings USING btree (slug);
```

</details>

## room_status_events

Lịch sử thao tác bảo trì/ngừng/đưa vào khai thác

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

- `room_status_events_changed_by_fkey`: `FOREIGN KEY (changed_by) REFERENCES smartrent.users(id)`
- `room_status_events_room_id_fkey`: `FOREIGN KEY (room_id) REFERENCES smartrent.rooms(id)`
- `room_status_events_pkey`: `PRIMARY KEY (id)`

<details><summary>Indexes</summary>

```sql
CREATE INDEX ix_room_status_events_changed_by ON smartrent.room_status_events USING btree (changed_by);
CREATE INDEX ix_room_status_events_room_id ON smartrent.room_status_events USING btree (room_id);
CREATE UNIQUE INDEX room_status_events_pkey ON smartrent.room_status_events USING btree (id);
```

</details>

## room_transfers

Nối đợt cũ đã kết thúc với đợt mới đang ở cùng đại diện, cùng ngày chuyển

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `old_tenancy_id` | `uuid` | Không | `—` |
| `new_tenancy_id` | `uuid` | Không | `—` |
| `transfer_on` | `date` | Không | `—` |
| `reason` | `text` | Không | `—` |
| `confirmed_by` | `uuid` | Không | `—` |
| `confirmed_at` | `timestamp with time zone` | Không | `now()` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `room_transfers_check`: `CHECK ((old_tenancy_id <> new_tenancy_id))`
- `room_transfers_confirmed_by_fkey`: `FOREIGN KEY (confirmed_by) REFERENCES smartrent.users(id)`
- `room_transfers_new_tenancy_id_fkey`: `FOREIGN KEY (new_tenancy_id) REFERENCES smartrent.tenancies(id)`
- `room_transfers_old_tenancy_id_fkey`: `FOREIGN KEY (old_tenancy_id) REFERENCES smartrent.tenancies(id)`
- `room_transfers_pkey`: `PRIMARY KEY (id)`
- `room_transfers_new_tenancy_id_key`: `UNIQUE (new_tenancy_id)`
- `room_transfers_old_tenancy_id_key`: `UNIQUE (old_tenancy_id)`

<details><summary>Indexes</summary>

```sql
CREATE INDEX ix_room_transfers_confirmed_by ON smartrent.room_transfers USING btree (confirmed_by);
CREATE UNIQUE INDEX room_transfers_new_tenancy_id_key ON smartrent.room_transfers USING btree (new_tenancy_id);
CREATE UNIQUE INDEX room_transfers_old_tenancy_id_key ON smartrent.room_transfers USING btree (old_tenancy_id);
CREATE UNIQUE INDEX room_transfers_pkey ON smartrent.room_transfers USING btree (id);
```

</details>

## room_types

Loại phòng riêng theo đơn vị

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `organization_id` | `uuid` | Không | `—` |
| `code` | `character varying(40)` | Không | `—` |
| `name` | `character varying(100)` | Không | `—` |

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

Lịch xem, người hẹn, kết quả/vắng/hủy

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `inquiry_id` | `uuid` | Không | `—` |
| `starts_at` | `timestamp with time zone` | Không | `—` |
| `ends_at` | `timestamp with time zone` | Không | `—` |
| `host_user_id` | `uuid` | Có | `—` |
| `status` | `character varying(12)` | Không | `'scheduled'::character varying` |
| `result_notes` | `text` | Có | `—` |

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

Phòng, mã duy nhất trong cơ sở, diện tích, sức chứa, mức cọc chào thuê, trạng thái khai thác

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
| `required_deposit` | `numeric(18,0)` | Không | `0` |
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

## settlement_invoices

Các hóa đơn được đưa vào quyết toán, kể cả nợ cũ

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `settlement_id` | `uuid` | Không | `—` |
| `invoice_id` | `uuid` | Không | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `settlement_invoices_invoice_id_fkey`: `FOREIGN KEY (invoice_id) REFERENCES smartrent.invoices(id)`
- `settlement_invoices_settlement_id_fkey`: `FOREIGN KEY (settlement_id) REFERENCES smartrent.checkout_settlements(id)`
- `settlement_invoices_pkey`: `PRIMARY KEY (settlement_id, invoice_id)`

<details><summary>Indexes</summary>

```sql
CREATE INDEX ix_settlement_invoices_invoice_id ON smartrent.settlement_invoices USING btree (invoice_id);
CREATE UNIQUE INDEX settlement_invoices_pkey ON smartrent.settlement_invoices USING btree (settlement_id, invoice_id);
```

</details>

## sla_policies

Ưu tiên, giờ xử lý, liên tục/giờ làm việc

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `organization_id` | `uuid` | Không | `—` |
| `priority` | `character varying(10)` | Không | `—` |
| `target_hours` | `integer` | Không | `—` |
| `clock_mode` | `character varying(15)` | Không | `'continuous'::character varying` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `sla_policies_clock_mode_check`: `CHECK (((clock_mode)::text = ANY ((ARRAY['continuous'::character varying, 'business_hours'::character varying])::text[])))`
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

Metadata file; file thật ở storage; riêng tư/công khai, trạng thái quét/thiếu file

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `organization_id` | `uuid` | Không | `—` |
| `storage_key` | `text` | Không | `—` |
| `original_name` | `text` | Không | `—` |
| `content_type` | `character varying(150)` | Không | `—` |
| `byte_size` | `bigint` | Không | `—` |
| `sha256` | `character(64)` | Có | `—` |
| `visibility` | `character varying(10)` | Không | `'private'::character varying` |
| `scan_status` | `character varying(15)` | Không | `'pending'::character varying` |
| `uploaded_by` | `uuid` | Có | `—` |
| `created_at` | `timestamp with time zone` | Không | `now()` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `stored_files_byte_size_check`: `CHECK ((byte_size > 0))`
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

Quyền hỗ trợ truy cập đơn vị có lý do, hạn và người cấp

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

Đợt thuê, đại diện, liên kết giữ chỗ, ngày dự kiến/nhận/trả thực tế, trạng thái

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `allocation_id` | `uuid` | Không | `—` |
| `representative_tenant_id` | `uuid` | Không | `—` |
| `reservation_id` | `uuid` | Có | `—` |
| `status` | `character varying(12)` | Không | `'planned'::character varying` |
| `planned_move_in` | `date` | Không | `—` |
| `actual_move_in` | `date` | Có | `—` |
| `actual_move_out` | `date` | Có | `—` |
| `onboarding_mode` | `character varying(10)` | Không | `'normal'::character varying` |
| `end_reason` | `text` | Có | `—` |
| `ended_by` | `uuid` | Có | `—` |
| `created_at` | `timestamp with time zone` | Không | `now()` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `tenancies_check`: `CHECK (((actual_move_out IS NULL) OR ((actual_move_in IS NOT NULL) AND (actual_move_out > actual_move_in))))`
- `tenancies_check1`: `CHECK ((((status)::text <> ALL ((ARRAY['active'::character varying, 'ended'::character varying])::text[])) OR (actual_move_in IS NOT NULL)))`
- `tenancies_check2`: `CHECK ((((status)::text <> 'ended'::text) OR ((actual_move_out IS NOT NULL) AND (ended_by IS NOT NULL) AND (NULLIF(btrim(end_reason), ''::text) IS NOT NULL))))`
- `tenancies_check3`: `CHECK ((((status)::text <> 'active'::text) OR (actual_move_out IS NULL)))`
- `tenancies_check4`: `CHECK ((((status)::text <> ALL ((ARRAY['planned'::character varying, 'cancelled'::character varying])::text[])) OR ((actual_move_in IS NULL) AND (actual_move_out IS NULL))))`
- `tenancies_onboarding_mode_check`: `CHECK (((onboarding_mode)::text = ANY ((ARRAY['normal'::character varying, 'import'::character varying])::text[])))`
- `tenancies_status_check`: `CHECK (((status)::text = ANY ((ARRAY['planned'::character varying, 'active'::character varying, 'ended'::character varying, 'cancelled'::character varying])::text[])))`
- `tenancies_allocation_id_fkey`: `FOREIGN KEY (allocation_id) REFERENCES smartrent.room_allocations(id)`
- `tenancies_ended_by_fkey`: `FOREIGN KEY (ended_by) REFERENCES smartrent.users(id)`
- `tenancies_representative_tenant_id_fkey`: `FOREIGN KEY (representative_tenant_id) REFERENCES smartrent.tenants(id)`
- `tenancies_reservation_id_fkey`: `FOREIGN KEY (reservation_id) REFERENCES smartrent.reservations(id)`
- `tenancies_pkey`: `PRIMARY KEY (id)`
- `tenancy_consistent`: `TRIGGER DEFERRABLE INITIALLY DEFERRED`
- `tenancies_allocation_id_key`: `UNIQUE (allocation_id)`
- `tenancies_reservation_id_key`: `UNIQUE (reservation_id)`

<details><summary>Indexes</summary>

```sql
CREATE INDEX ix_tenancies_ended_by ON smartrent.tenancies USING btree (ended_by);
CREATE INDEX ix_tenancies_representative_tenant_id ON smartrent.tenancies USING btree (representative_tenant_id);
CREATE UNIQUE INDEX tenancies_allocation_id_key ON smartrent.tenancies USING btree (allocation_id);
CREATE UNIQUE INDEX tenancies_pkey ON smartrent.tenancies USING btree (id);
CREATE UNIQUE INDEX tenancies_reservation_id_key ON smartrent.tenancies USING btree (reservation_id);
CREATE UNIQUE INDEX ux_representative_active ON smartrent.tenancies USING btree (representative_tenant_id) WHERE ((status)::text = ANY ((ARRAY['planned'::character varying, 'active'::character varying])::text[]));
```

</details>

## tenancy_requests

Đề nghị gia hạn/chuyển/trả của khách; chưa thay đổi thuê khi chỉ mới gửi

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `tenancy_id` | `uuid` | Không | `—` |
| `request_type` | `character varying(12)` | Không | `—` |
| `desired_on` | `date` | Không | `—` |
| `target_room_id` | `uuid` | Có | `—` |
| `message` | `text` | Có | `—` |
| `status` | `character varying(12)` | Không | `'pending'::character varying` |
| `requested_by` | `uuid` | Không | `—` |
| `reviewed_by` | `uuid` | Có | `—` |
| `decision_notes` | `text` | Có | `—` |
| `created_at` | `timestamp with time zone` | Không | `now()` |
| `reviewed_at` | `timestamp with time zone` | Có | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `tenancy_requests_check`: `CHECK ((((request_type)::text = 'transfer'::text) = (target_room_id IS NOT NULL)))`
- `tenancy_requests_request_type_check`: `CHECK (((request_type)::text = ANY ((ARRAY['renewal'::character varying, 'transfer'::character varying, 'checkout'::character varying])::text[])))`
- `tenancy_requests_status_check`: `CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying, 'cancelled'::character varying, 'completed'::character varying])::text[])))`
- `tenancy_requests_requested_by_fkey`: `FOREIGN KEY (requested_by) REFERENCES smartrent.users(id)`
- `tenancy_requests_reviewed_by_fkey`: `FOREIGN KEY (reviewed_by) REFERENCES smartrent.users(id)`
- `tenancy_requests_target_room_id_fkey`: `FOREIGN KEY (target_room_id) REFERENCES smartrent.rooms(id)`
- `tenancy_requests_tenancy_id_fkey`: `FOREIGN KEY (tenancy_id) REFERENCES smartrent.tenancies(id)`
- `tenancy_requests_pkey`: `PRIMARY KEY (id)`

<details><summary>Indexes</summary>

```sql
CREATE INDEX ix_tenancy_requests_requested_by ON smartrent.tenancy_requests USING btree (requested_by);
CREATE INDEX ix_tenancy_requests_reviewed_by ON smartrent.tenancy_requests USING btree (reviewed_by);
CREATE INDEX ix_tenancy_requests_target_room_id ON smartrent.tenancy_requests USING btree (target_room_id);
CREATE INDEX ix_tenancy_requests_tenancy_id ON smartrent.tenancy_requests USING btree (tenancy_id);
CREATE UNIQUE INDEX tenancy_requests_pkey ON smartrent.tenancy_requests USING btree (id);
```

</details>

## tenancy_residents

Người ở cùng và khoảng thời gian ở; không mặc định nghĩa vụ tài chính

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

Giấy tờ, số mã hóa + fingerprint tra trùng, ngày/nơi cấp, hai mặt, người xác minh

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `tenant_id` | `uuid` | Không | `—` |
| `document_type` | `character varying(30)` | Không | `—` |
| `number_ciphertext` | `bytea` | Không | `—` |
| `number_fingerprint` | `character varying(128)` | Không | `—` |
| `issued_on` | `date` | Có | `—` |
| `issuing_authority` | `text` | Có | `—` |
| `expires_on` | `date` | Có | `—` |
| `front_file_id` | `uuid` | Có | `—` |
| `back_file_id` | `uuid` | Có | `—` |
| `verified_by` | `uuid` | Có | `—` |
| `verified_at` | `timestamp with time zone` | Có | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `tenant_identity_documents_check`: `CHECK (((verified_by IS NULL) = (verified_at IS NULL)))`
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

Khách đề nghị đổi dữ liệu; duyệt trước khi áp dụng vào hồ sơ

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `tenant_id` | `uuid` | Không | `—` |
| `requested_by` | `uuid` | Không | `—` |
| `requested_at` | `timestamp with time zone` | Không | `now()` |
| `status` | `character varying(12)` | Không | `'pending'::character varying` |
| `proposed_full_name` | `character varying(200)` | Có | `—` |
| `proposed_phone` | `character varying(30)` | Có | `—` |
| `proposed_email` | `character varying(256)` | Có | `—` |
| `proposed_address_id` | `uuid` | Có | `—` |
| `reason` | `text` | Có | `—` |
| `reviewed_by` | `uuid` | Có | `—` |
| `reviewed_at` | `timestamp with time zone` | Có | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `tenant_profile_change_requests_status_check`: `CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying, 'cancelled'::character varying])::text[])))`
- `tenant_profile_change_requests_proposed_address_id_fkey`: `FOREIGN KEY (proposed_address_id) REFERENCES smartrent.addresses(id)`
- `tenant_profile_change_requests_requested_by_fkey`: `FOREIGN KEY (requested_by) REFERENCES smartrent.users(id)`
- `tenant_profile_change_requests_reviewed_by_fkey`: `FOREIGN KEY (reviewed_by) REFERENCES smartrent.users(id)`
- `tenant_profile_change_requests_tenant_id_fkey`: `FOREIGN KEY (tenant_id) REFERENCES smartrent.tenants(id)`
- `tenant_profile_change_requests_pkey`: `PRIMARY KEY (id)`

<details><summary>Indexes</summary>

```sql
CREATE INDEX ix_tenant_profile_change_requests_proposed_address_id ON smartrent.tenant_profile_change_requests USING btree (proposed_address_id);
CREATE INDEX ix_tenant_profile_change_requests_requested_by ON smartrent.tenant_profile_change_requests USING btree (requested_by);
CREATE INDEX ix_tenant_profile_change_requests_reviewed_by ON smartrent.tenant_profile_change_requests USING btree (reviewed_by);
CREATE INDEX ix_tenant_profile_change_requests_tenant_id ON smartrent.tenant_profile_change_requests USING btree (tenant_id);
CREATE UNIQUE INDEX tenant_profile_change_requests_pkey ON smartrent.tenant_profile_change_requests USING btree (id);
```

</details>

## tenants

Hồ sơ khách thuộc đơn vị, liên kết tài khoản tùy chọn; liên hệ không buộc duy nhất

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
| `address_id` | `uuid` | Có | `—` |
| `emergency_contact_name` | `character varying(200)` | Có | `—` |
| `emergency_contact_phone` | `character varying(30)` | Có | `—` |
| `notes` | `text` | Có | `—` |
| `created_at` | `timestamp with time zone` | Không | `now()` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `tenants_address_id_fkey`: `FOREIGN KEY (address_id) REFERENCES smartrent.addresses(id)`
- `tenants_organization_id_fkey`: `FOREIGN KEY (organization_id) REFERENCES smartrent.organizations(id)`
- `tenants_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES smartrent.users(id)`
- `tenants_pkey`: `PRIMARY KEY (id)`
- `tenants_organization_id_code_key`: `UNIQUE (organization_id, code)`

<details><summary>Indexes</summary>

```sql
CREATE INDEX ix_tenant_email ON smartrent.tenants USING btree (organization_id, lower((email)::text));
CREATE INDEX ix_tenant_phone ON smartrent.tenants USING btree (organization_id, phone);
CREATE INDEX ix_tenants_address_id ON smartrent.tenants USING btree (address_id);
CREATE INDEX ix_tenants_user_id ON smartrent.tenants USING btree (user_id);
CREATE UNIQUE INDEX tenants_organization_id_code_key ON smartrent.tenants USING btree (organization_id, code);
CREATE UNIQUE INDEX tenants_pkey ON smartrent.tenants USING btree (id);
CREATE UNIQUE INDEX ux_tenant_account ON smartrent.tenants USING btree (organization_id, user_id) WHERE (user_id IS NOT NULL);
```

</details>

## ticket_categories

Danh mục sự cố

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

Lịch sử trạng thái/phân công/mở lại; append-only

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

File sự cố hoặc một tin nhắn trong cùng ticket

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

Hội thoại và ghi chú nội bộ; khách không thấy ghi chú nội bộ

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

Sự cố theo phòng/đợt thuê, báo/nhận việc, ưu tiên, hạn, kết quả

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `room_id` | `uuid` | Không | `—` |
| `tenancy_id` | `uuid` | Có | `—` |
| `category_id` | `uuid` | Không | `—` |
| `code` | `character varying(80)` | Không | `—` |
| `title` | `character varying(250)` | Không | `—` |
| `description` | `text` | Không | `—` |
| `priority` | `character varying(10)` | Không | `—` |
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

Claim của tài khoản; PK integer identity theo chuẩn Identity

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

Tài khoản đăng nhập ngoài, khóa ghép provider/key

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

N–N users–roles

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

Phiên/refresh token băm, hết hạn/thu hồi, phiên kế tiếp

| Cột | PostgreSQL | NULL | Default / identity |
|---|---|---|---|
| `id` | `uuid` | Không | `gen_random_uuid()` |
| `user_id` | `uuid` | Không | `—` |
| `refresh_token_hash` | `character varying(128)` | Không | `—` |
| `created_at` | `timestamp with time zone` | Không | `now()` |
| `expires_at` | `timestamp with time zone` | Không | `—` |
| `revoked_at` | `timestamp with time zone` | Có | `—` |
| `replaced_by_id` | `uuid` | Có | `—` |
| `ip_address` | `inet` | Có | `—` |
| `user_agent` | `text` | Có | `—` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `user_sessions_check`: `CHECK ((expires_at > created_at))`
- `user_sessions_replaced_by_id_fkey`: `FOREIGN KEY (replaced_by_id) REFERENCES smartrent.user_sessions(id)`
- `user_sessions_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES smartrent.users(id)`
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

Token store của Identity, khóa ghép user/provider/name

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

Tài khoản Identity; khóa UUID; username/email chuẩn hóa duy nhất; mật khẩu băm

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
| `is_active` | `boolean` | Không | `true` |
| `created_at` | `timestamp with time zone` | Không | `now()` |

**PK, FK, UNIQUE, CHECK, EXCLUDE:**

- `users_access_failed_count_check`: `CHECK ((access_failed_count >= 0))`
- `users_pkey`: `PRIMARY KEY (id)`

<details><summary>Indexes</summary>

```sql
CREATE UNIQUE INDEX users_pkey ON smartrent.users USING btree (id);
CREATE UNIQUE INDEX ux_users_email ON smartrent.users USING btree (normalized_email) WHERE (normalized_email IS NOT NULL);
CREATE UNIQUE INDEX ux_users_name ON smartrent.users USING btree (normalized_user_name) WHERE (normalized_user_name IS NOT NULL);
```

</details>

## Views

- `v_allocation_movements`
- `v_cash_movements`
- `v_deposit_balances`
- `v_deposit_movements`
- `v_invoice_balances`
- `v_invoice_totals`
- `v_payment_balances`
- `v_room_status`
- `v_tenant_debts`
