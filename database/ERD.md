# Sơ đồ quan hệ SmartRent

74 bảng, 168 khóa ngoại. Sơ đồ chia theo phân hệ, chỉ ghi cột khóa và cột đặc trưng; cột đầy đủ xem [từ điển dữ liệu](TU_DIEN_DU_LIEU.md).

## Tổng thể

```mermaid
flowchart LR
  ORG[organizations] --> PROP[properties] --> ROOM[rooms]
  ORG --> TENANT[tenants]
  ROOM --> STAY[tenancies]
  TENANT --> STAY
  ROOM --> INQ[rental_inquiries] --> VIEW[room_viewings]
  STAY --> CONTRACT[contracts] --> VER[contract_versions]
  ROOM --> METER[meters] --> READ[meter_readings]
  STAY --> INV[invoices] --> LINE[invoice_lines]
  TENANT --> PAY[payments] --> ALLOC[payment_allocations]
  ALLOC --> INV
  STAY --> DEP[deposit_entries]
  PAY --> DEP
  ROOM --> TICKET[tickets]
  USER[users] --> MEMBER[organization_memberships] --> ORG
  USER --> TENANT
```

## Tài khoản, đơn vị, phân quyền

```mermaid
erDiagram
  users ||--o{ user_sessions : "phiên"
  users ||--o{ user_roles : ""
  roles ||--o{ user_roles : ""
  organizations ||--|| organization_settings : "lịch nhắc"
  organizations ||--o{ organization_memberships : ""
  users ||--o{ organization_memberships : ""
  organizations ||--o{ business_roles : ""
  business_roles ||--o{ business_role_permissions : ""
  permissions ||--o{ business_role_permissions : ""
  organization_memberships ||--o{ membership_roles : ""
  business_roles ||--o{ membership_roles : ""
  organization_memberships ||--o{ membership_properties : ""
  properties ||--o{ membership_properties : ""
  organizations ||--o{ support_access_grants : ""
```

## Cơ sở, phòng, tin đăng

```mermaid
erDiagram
  organizations ||--o{ properties : ""
  properties ||--o{ rooms : ""
  room_types ||--o{ rooms : ""
  rooms ||--o{ room_images : ""
  stored_files ||--o{ room_images : ""
  rooms ||--o{ room_amenities : ""
  amenities ||--o{ room_amenities : ""
  rooms ||--o| room_listings : "tin đăng"
  rooms ||--o{ room_status_events : ""
  rooms ||--o{ meters : ""
  properties ||--o{ charge_rates : "giá cơ sở"
  rooms ||--o{ charge_rates : "giá riêng"
  contract_versions ||--o{ charge_rates : "giá chốt"
  charge_types ||--o{ charge_rates : ""
```

## Khách, xem phòng, đợt thuê, hợp đồng

```mermaid
erDiagram
  organizations ||--o{ tenants : ""
  users |o--o{ tenants : "tài khoản"
  tenants ||--o{ tenant_identity_documents : ""
  tenants ||--o{ tenant_profile_change_requests : ""
  rooms ||--o{ rental_inquiries : ""
  tenants |o--o{ rental_inquiries : ""
  rental_inquiries ||--o{ room_viewings : ""
  rooms ||--o{ tenancies : "lịch sử thuê"
  tenants ||--o{ tenancies : "đại diện"
  rental_inquiries |o--o{ tenancies : ""
  tenancies ||--o{ tenancy_residents : "người ở cùng"
  tenancies ||--o{ tenancy_requests : "gia hạn, trả phòng"
  tenancies ||--o{ handovers : "nhận, trả"
  handovers ||--o{ handover_items : ""
  handovers ||--o{ handover_files : ""
  tenancies ||--o{ contracts : ""
  contracts ||--o{ contract_versions : "phiên bản"
  contracts |o--o{ contracts : "tiền nhiệm"
  contract_versions ||--o{ contract_parties : ""
  contract_versions ||--o{ contract_files : ""
  contracts ||--o{ contract_attachments : ""
  tenancies ||--o| checkout_settlements : "quyết toán"
```

## Tính tiền và hóa đơn

```mermaid
erDiagram
  properties ||--o{ billing_periods : "tháng"
  billing_periods ||--o{ billing_period_events : "khóa, mở"
  meters ||--o{ meter_readings : ""
  tenancies ||--o{ meter_readings : ""
  billing_periods ||--o{ meter_readings : ""
  handovers ||--o{ meter_readings : ""
  tenancies ||--o{ invoices : ""
  billing_periods ||--o{ invoices : ""
  invoices |o--o{ invoices : "gốc của điều chỉnh, thay thế"
  invoices ||--o{ invoice_lines : ""
  charge_types ||--o{ invoice_lines : ""
  charge_rates |o--o{ invoice_lines : "nguồn giá"
  charge_instances |o--o{ invoice_lines : ""
  charge_instances ||--o| invoice_charge_claims : "chống thu trùng"
  invoice_lines ||--o{ invoice_meter_segments : ""
  meter_readings ||--o{ invoice_meter_segments : ""
```

## Thu tiền và cọc

```mermaid
erDiagram
  tenants ||--o{ payments : ""
  bank_accounts |o--o{ payments : ""
  payment_methods ||--o{ payments : ""
  payments ||--o{ payment_files : ""
  payments ||--o{ payment_intended_invoices : "gợi ý"
  invoices ||--o{ payment_intended_invoices : ""
  payments ||--o{ payment_reversals : "đảo, hoàn"
  invoices ||--o{ payment_allocations : ""
  payments |o--o{ payment_allocations : ""
  deposit_entries |o--o{ payment_allocations : "bù trừ cọc"
  payment_allocations |o--o{ payment_allocations : "dòng đảo"
  tenancies ||--o{ deposit_entries : ""
  payments ||--o{ deposit_entries : "nguồn tiền"
  payment_reversals |o--o{ deposit_entries : "hoàn cọc"
  checkout_settlements |o--o{ deposit_entries : ""
```

## Ticket, thông báo, vận hành

```mermaid
erDiagram
  rooms ||--o{ tickets : ""
  tenancies |o--o{ tickets : ""
  ticket_categories ||--o{ tickets : ""
  sla_policies |o--o{ tickets : ""
  tickets ||--o{ ticket_messages : ""
  tickets ||--o{ ticket_files : ""
  tickets ||--o{ ticket_events : ""
  users ||--o{ notifications : ""
  users |o--o{ email_outbox : ""
  users ||--o{ api_idempotency_keys : ""
  organizations ||--o{ document_counters : ""
  organizations |o--o{ audit_logs : ""
```
