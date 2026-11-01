# Sơ đồ quan hệ SmartRent

Các hình dưới chia theo nghiệp vụ để dễ đọc. Tất cả 226 FK thực tế, bao gồm file/người thao tác, được liệt kê trong [từ điển dữ liệu](TU_DIEN_DU_LIEU.md). `||` là một, `o|` là không hoặc một, `o{` là nhiều tùy chọn.

## Đơn vị, tài khoản và phòng

```mermaid
erDiagram
    users ||--o{ organization_memberships : joins
    organizations ||--o{ organization_memberships : has
    organization_memberships ||--o{ membership_roles : receives
    business_roles ||--o{ membership_roles : assigned
    organizations ||--o{ business_roles : defines
    business_roles ||--o{ business_role_permissions : grants
    permissions ||--o{ business_role_permissions : permits
    organization_memberships ||--o{ membership_properties : covers
    properties ||--o{ membership_properties : assigned
    organizations ||--o{ properties : owns
    addresses ||--o{ properties : locates
    address_datasets ||--o{ administrative_units : versions
    administrative_units o|--o{ addresses : identifies
    properties ||--o| property_billing_settings : configures
    properties ||--o{ rooms : contains
    room_types ||--o{ rooms : classifies
    rooms ||--o| room_listings : advertises
    rooms ||--o{ room_images : illustrates
    stored_files ||--o{ room_images : stores
    rooms ||--o{ room_assets : equips
    rooms ||--o{ room_amenities : has
    amenities ||--o{ room_amenities : tags
    users o|--o{ tenants : portal
    organizations ||--o{ tenants : maintains
```

## Yêu cầu, giữ chỗ và vòng đời thuê

```mermaid
erDiagram
    rooms ||--o{ rental_inquiries : receives
    rental_inquiries ||--o{ inquiry_events : tracks
    rental_inquiries ||--o{ room_viewings : schedules
    rental_inquiries o|--o{ reservations : converts
    rooms ||--o{ room_allocations : reserves_calendar
    room_allocations ||--o| reservations : holds
    tenants ||--o{ reservations : requests
    room_allocations ||--o| tenancies : occupies
    reservations o|--o| tenancies : consumed_by
    tenants ||--o{ tenancies : represents
    tenancies ||--o{ tenancy_residents : includes
    tenants ||--o{ tenancy_residents : stays
    tenancies ||--o{ contracts : signs
    contracts ||--o{ contract_versions : versions
    contract_versions ||--o{ contract_parties : snapshots
    contract_versions ||--o{ contract_files : attaches
    contracts ||--o| contract_terminations : terminates
    tenancies ||--o{ handovers : inspects
    handovers ||--o{ handover_assets : inventories
    tenancies ||--o{ tenancy_requests : requests
    tenancies ||--o| checkout_settlements : settles
    tenancies ||--o| room_transfers : old_stay
    tenancies ||--o| room_transfers : new_stay
```

## Giá, công tơ và chứng từ

```mermaid
erDiagram
    properties o|--o| rate_plans : default_scope
    rooms o|--o| rate_plans : override_scope
    contract_versions o|--o| rate_plans : agreed_scope
    rate_plans ||--o{ charge_rates : dates
    charge_types ||--o{ charge_rates : prices
    properties ||--o{ billing_periods : bills
    rooms ||--o{ meters : installs
    meters ||--o{ meter_readings : records
    tenancies o|--o{ meter_readings : attributes
    handovers o|--o{ meter_readings : measures
    meters ||--o| meter_replacements : old_meter
    meters ||--o| meter_replacements : new_meter
    tenancies ||--o{ invoices : charged
    billing_periods o|--o{ invoices : groups
    invoices o|--o{ invoices : adjusts_or_replaces
    invoices ||--o{ invoice_lines : itemizes
    charge_types ||--o{ invoice_lines : classifies
    charge_rates o|--o{ invoice_lines : source_snapshot
    tenancies ||--o{ charge_instances : incurs
    charge_instances o|--o{ invoice_lines : historical_occurrence
    charge_instances ||--o| invoice_charge_claims : active_claim
    invoice_lines ||--o| invoice_charge_claims : owns
    invoice_lines ||--o{ invoice_meter_segments : consumes
    meter_readings ||--o{ invoice_meter_segments : from_reading
    meter_readings ||--o{ invoice_meter_segments : to_reading
```

Mỗi rate plan bắt buộc đúng một scope; không phải đồng thời có cả ba quan hệ. Mỗi claim chỉ một dòng còn hiệu lực, nhưng một occurrence có thể được giữ trên các dòng lịch sử đã hủy.

## Tiền, cọc và quyết toán

```mermaid
erDiagram
    tenants ||--o{ payments : pays
    payments ||--o{ payment_reversals : reverses_or_refunds
    payments ||--o{ payment_files : proves
    payments o|--o{ payment_allocations : cash_source
    invoices ||--o{ payment_allocations : receives
    payment_allocations o|--o{ payment_allocations : reverses
    tenancies ||--o{ deposit_entries : holds
    payments ||--o{ deposit_entries : traces_funding
    deposit_entries o|--o{ deposit_entries : reverses_or_transfers
    deposit_entries o|--o{ payment_allocations : offset_source
    payment_reversals o|--o{ deposit_entries : cash_refund
    checkout_settlements o|--o{ deposit_entries : reconciles
    checkout_settlements ||--o{ settlement_invoices : includes
    invoices ||--o{ settlement_invoices : settles
```

Payment allocation bắt buộc đúng một nguồn `payment_id` hoặc `deposit_entry_id`. Cọc hoàn có cash refund tương ứng; cọc bù trừ có phân bổ tương ứng. Các cặp được kiểm tra khi commit.

## Hỗ trợ và thông báo

```mermaid
erDiagram
    rooms ||--o{ tickets : reports
    tenancies o|--o{ tickets : relates
    ticket_categories ||--o{ tickets : classifies
    sla_policies o|--o{ tickets : targets
    tickets ||--o{ ticket_messages : discusses
    tickets ||--o{ ticket_events : tracks
    tickets ||--o{ ticket_files : illustrates
    ticket_messages o|--o{ ticket_files : attaches
    properties ||--o{ expenses : incurs
    tickets o|--o{ expenses : costs
    expense_categories ||--o{ expenses : categorizes
    organizations ||--o{ outbox_messages : emits
    outbox_messages ||--o{ notification_deliveries : sends
    notification_deliveries ||--o{ delivery_attempts : retries
    message_templates o|--o{ notification_deliveries : renders
    organizations ||--o{ reminder_rules : schedules
    message_templates ||--o{ reminder_rules : formats
    users ||--o{ notifications : reads
    organizations ||--o{ ai_conversations : scopes
    ai_conversations ||--o{ ai_messages : contains
    organizations ||--o{ integration_connections : integrates
    integration_connections ||--o{ integration_events : deduplicates
```
