BEGIN;
SET LOCAL search_path = smartrent, public;

-- Một nguồn duy nhất cho tổng tiền, công nợ và cọc. Không lưu các tổng này trên khách/phòng.
CREATE VIEW v_invoice_totals AS
SELECT i.id AS invoice_id,
       coalesce(sum(l.sign * round(l.quantity*l.unit_price*l.proration_numerator/l.proration_denominator,0)),0)::numeric(18,0) AS amount
FROM invoices i LEFT JOIN invoice_lines l ON l.invoice_id=i.id GROUP BY i.id;
CREATE VIEW v_deposit_movements AS
SELECT d.*, (CASE d.kind WHEN 'receipt' THEN 1 WHEN 'transfer_in' THEN 1
    WHEN 'reversal' THEN CASE o.kind WHEN 'receipt' THEN -1 ELSE 1 END ELSE -1 END * d.amount)::numeric(18,0) AS signed_amount
FROM deposit_entries d LEFT JOIN deposit_entries o ON o.id=d.related_entry_id;
CREATE VIEW v_allocation_movements AS
SELECT a.*, CASE WHEN a.kind='apply' THEN a.amount ELSE -a.amount END AS signed_amount,
       coalesce(a.payment_id,d.payment_id) AS funding_payment_id
FROM payment_allocations a LEFT JOIN deposit_entries d ON d.id=a.deposit_entry_id;
CREATE VIEW v_invoice_balances AS
WITH adjustments AS (
  SELECT i.original_invoice_id,
    sum(CASE WHEN i.kind='credit_adjustment' THEN -t.amount ELSE t.amount END) AS amount
  FROM invoices i JOIN v_invoice_totals t ON t.invoice_id=i.id
  WHERE i.status='issued' AND i.kind IN ('debit_adjustment','credit_adjustment') GROUP BY i.original_invoice_id
), paid AS (
  SELECT invoice_id,sum(signed_amount) AS amount FROM v_allocation_movements GROUP BY invoice_id
)
SELECT i.id AS invoice_id, i.tenancy_id, i.billing_period_id, i.code, i.kind, i.status, i.issued_on, i.due_on,
  t.amount AS original_amount,
  (t.amount+coalesce(a.amount,0))::numeric(18,0) AS receivable_amount,
  coalesce(p.amount,0)::numeric(18,0) AS paid_amount,
  (CASE WHEN i.status='issued' THEN t.amount+coalesce(a.amount,0)-coalesce(p.amount,0) ELSE 0 END)::numeric(18,0) AS outstanding_amount,
  CASE WHEN t.amount+coalesce(a.amount,0)=0 THEN 'paid'
       WHEN coalesce(p.amount,0)=0 THEN 'unpaid'
       WHEN coalesce(p.amount,0)<t.amount+coalesce(a.amount,0) THEN 'partial' ELSE 'paid' END AS payment_status,
  (i.status='issued' AND i.due_on < (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
    AND t.amount+coalesce(a.amount,0)-coalesce(p.amount,0)>0) AS is_overdue
FROM invoices i JOIN v_invoice_totals t ON t.invoice_id=i.id
LEFT JOIN adjustments a ON a.original_invoice_id=i.id LEFT JOIN paid p ON p.invoice_id=i.id
WHERE i.kind NOT IN ('debit_adjustment','credit_adjustment');
CREATE VIEW v_tenant_debts AS
SELECT t.id AS tenant_id,t.organization_id,coalesce(sum(b.outstanding_amount),0)::numeric(18,0) AS outstanding_amount
FROM tenants t LEFT JOIN tenancies n ON n.representative_tenant_id=t.id
LEFT JOIN v_invoice_balances b ON b.tenancy_id=n.id GROUP BY t.id;
CREATE VIEW v_deposit_balances AS
SELECT n.id AS tenancy_id, coalesce(sum(d.signed_amount),0)::numeric(18,0) AS held_amount
FROM tenancies n LEFT JOIN v_deposit_movements d ON d.tenancy_id=n.id GROUP BY n.id;
CREATE VIEW v_payment_balances AS
SELECT p.id AS payment_id,p.tenant_id,p.status,p.amount,
  coalesce(r.amount,0)::numeric(18,0) AS reversed_amount,
  coalesce(a.amount,0)::numeric(18,0) AS invoice_allocated_amount,
  coalesce(d.amount,0)::numeric(18,0) AS deposit_held_amount,
  (CASE WHEN p.status='confirmed' THEN p.amount-coalesce(r.amount,0)-coalesce(a.amount,0)-coalesce(d.amount,0) ELSE 0 END)::numeric(18,0) AS unapplied_amount
FROM payments p
LEFT JOIN (SELECT payment_id,sum(amount) AS amount FROM payment_reversals GROUP BY payment_id) r ON r.payment_id=p.id
LEFT JOIN (SELECT funding_payment_id,sum(signed_amount) AS amount FROM v_allocation_movements GROUP BY funding_payment_id) a ON a.funding_payment_id=p.id
LEFT JOIN (SELECT payment_id,sum(signed_amount) AS amount FROM v_deposit_movements GROUP BY payment_id) d ON d.payment_id=p.id;
CREATE VIEW v_room_status AS
SELECT r.*, CASE WHEN EXISTS (
  SELECT 1 FROM room_allocations a JOIN tenancies t ON t.allocation_id=a.id
  WHERE a.room_id=r.id AND t.status='active') THEN 'occupied' ELSE r.operating_status END AS occupancy_status
FROM rooms r;
CREATE VIEW v_cash_movements AS
SELECT p.id AS transaction_id,p.tenant_id,p.received_at AS occurred_at,p.method_code,
       p.amount AS signed_amount,'receipt'::text AS kind FROM payments p WHERE p.status='confirmed'
UNION ALL
SELECT r.id,p.tenant_id,r.occurred_at,r.method_code,-r.amount,r.kind
FROM payment_reversals r JOIN payments p ON p.id=r.payment_id;

-- Tính ngày lập/hạn và giá theo ngày. Toàn bộ khoảng thời gian dùng [đầu, cuối).
CREATE FUNCTION invoice_date(p_month date,p_day integer) RETURNS date LANGUAGE sql IMMUTABLE AS $$
 SELECT (date_trunc('month',p_month)::date +
   (least(p_day,extract(day FROM date_trunc('month',p_month)+interval '1 month - 1 day')::int)-1))::date
$$;
CREATE FUNCTION quick_contract_end_exclusive(p_start date,p_months integer) RETURNS date LANGUAGE sql IMMUTABLE AS $$
 SELECT (p_start+make_interval(months=>p_months))::date
$$;
CREATE FUNCTION effective_rates(p_tenancy uuid,p_on date)
RETURNS TABLE (charge_type_id uuid,rate_id uuid,unit_price numeric,calculation_method varchar,
 billing_cycle varchar,proration_mode varchar,source_scope text)
LANGUAGE sql STABLE AS $$
 WITH context AS (
   SELECT a.room_id,r.property_id FROM smartrent.tenancies t
   JOIN smartrent.room_allocations a ON a.id=t.allocation_id JOIN smartrent.rooms r ON r.id=a.room_id WHERE t.id=p_tenancy
 ), candidates AS (
   SELECT cr.*,CASE WHEN rp.contract_version_id IS NOT NULL THEN 3 WHEN rp.room_id IS NOT NULL THEN 2 ELSE 1 END AS rank,
          cv.effective_from AS contract_start,
          CASE WHEN rp.contract_version_id IS NOT NULL THEN 'contract' WHEN rp.room_id IS NOT NULL THEN 'room' ELSE 'property' END AS source
   FROM smartrent.charge_rates cr JOIN smartrent.rate_plans rp ON rp.id=cr.rate_plan_id CROSS JOIN context x
   LEFT JOIN smartrent.contract_versions cv ON cv.id=rp.contract_version_id
   LEFT JOIN smartrent.contracts c ON c.id=cv.contract_id
   WHERE ((rp.property_id=x.property_id) OR (rp.room_id=x.room_id)
      OR (c.tenancy_id=p_tenancy AND cv.signed_at IS NOT NULL AND cv.effective_from<=p_on))
     AND cr.effective_from<=p_on AND (cr.effective_to IS NULL OR cr.effective_to>p_on)
 )
 SELECT DISTINCT ON (c.charge_type_id) c.charge_type_id,c.id,c.unit_price,c.calculation_method,c.billing_cycle,c.proration_mode,c.source
 FROM candidates c ORDER BY c.charge_type_id,c.rank DESC,c.contract_start DESC NULLS LAST,c.effective_from DESC
$$;

-- Truy ngược đơn vị theo đường sở hữu; không lặp organization_id ở mọi bảng con.
CREATE FUNCTION organization_of(p_table text,p_id uuid) RETURNS uuid LANGUAGE plpgsql STABLE AS $$
DECLARE parent_table text; parent_column text; parent_id uuid;
BEGIN
 IF p_id IS NULL THEN RETURN NULL; END IF;
 IF p_table='organizations' THEN RETURN p_id; END IF;
 IF p_table IN ('organization_memberships','business_roles','support_access_grants','stored_files','properties','room_types',
   'amenities','tenants','charge_types','ticket_categories','sla_policies','expense_categories','bank_accounts',
   'message_templates','reminder_rules','notifications','outbox_messages','export_jobs','ai_conversations','integration_connections') THEN
   EXECUTE format('SELECT organization_id FROM smartrent.%I WHERE id=$1',p_table) INTO parent_id USING p_id;
   RETURN parent_id;
 END IF;
 IF p_table='rate_plans' THEN
   SELECT coalesce(smartrent.organization_of('properties',property_id),smartrent.organization_of('rooms',room_id),
     smartrent.organization_of('contract_versions',contract_version_id)) INTO parent_id FROM smartrent.rate_plans WHERE id=p_id;
   RETURN parent_id;
 END IF;
 SELECT x.pt,x.pc INTO parent_table,parent_column FROM (VALUES
   ('rooms','properties','property_id'),('room_images','rooms','room_id'),('room_assets','rooms','room_id'),
   ('room_listings','rooms','room_id'),('rental_inquiries','rooms','room_id'),('room_allocations','rooms','room_id'),
   ('reservations','room_allocations','allocation_id'),('tenancies','room_allocations','allocation_id'),
   ('contracts','tenancies','tenancy_id'),('contract_versions','contracts','contract_id'),
   ('charge_rates','rate_plans','rate_plan_id'),('billing_periods','properties','property_id'),
   ('handovers','tenancies','tenancy_id'),('meters','rooms','room_id'),('meter_readings','meters','meter_id'),
   ('invoices','tenancies','tenancy_id'),('invoice_lines','invoices','invoice_id'),('charge_instances','tenancies','tenancy_id'),
   ('invoice_issue_batches','billing_periods','billing_period_id'),('payments','tenants','tenant_id'),
   ('payment_reversals','payments','payment_id'),('checkout_settlements','tenancies','tenancy_id'),
   ('deposit_entries','tenancies','tenancy_id'),('tickets','rooms','room_id'),('ticket_messages','tickets','ticket_id'),
   ('expenses','properties','property_id'),('notification_deliveries','outbox_messages','outbox_message_id')
 ) x(t,pt,pc) WHERE x.t=p_table;
 IF parent_table IS NULL THEN RAISE EXCEPTION 'Unknown ownership path: %',p_table; END IF;
 EXECUTE format('SELECT %I FROM smartrent.%I WHERE id=$1',parent_column,p_table) INTO parent_id USING p_id;
 RETURN smartrent.organization_of(parent_table,parent_id);
END $$;
CREATE FUNCTION guard_same_organization() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE j jsonb:=to_jsonb(NEW); left_org uuid; right_org uuid;
BEGIN
 left_org:=smartrent.organization_of(TG_ARGV[0],(j->>TG_ARGV[1])::uuid);
 right_org:=smartrent.organization_of(TG_ARGV[2],(j->>TG_ARGV[3])::uuid);
 IF left_org IS NOT NULL AND right_org IS NOT NULL AND left_org<>right_org THEN
   RAISE EXCEPTION 'Cross-organization reference on % (% / %)',TG_TABLE_NAME,TG_ARGV[1],TG_ARGV[3] USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
DO $$
DECLARE r record; seq integer:=0;
BEGIN
 FOR r IN SELECT * FROM (VALUES
 ('membership_roles','organization_memberships','membership_id','business_roles','role_id'),
 ('membership_properties','organization_memberships','membership_id','properties','property_id'),
 ('rooms','properties','property_id','room_types','room_type_id'),
 ('room_amenities','rooms','room_id','amenities','amenity_id'),
 ('room_images','rooms','room_id','stored_files','file_id'),
 ('tenant_identity_documents','tenants','tenant_id','stored_files','front_file_id'),
 ('tenant_identity_documents','tenants','tenant_id','stored_files','back_file_id'),
 ('rental_inquiries','rooms','room_id','tenants','tenant_id'),
 ('reservations','room_allocations','allocation_id','tenants','tenant_id'),
 ('reservations','room_allocations','allocation_id','rental_inquiries','inquiry_id'),
 ('tenancies','room_allocations','allocation_id','tenants','representative_tenant_id'),
 ('tenancies','room_allocations','allocation_id','reservations','reservation_id'),
 ('tenancy_residents','tenancies','tenancy_id','tenants','tenant_id'),
 ('contracts','tenancies','tenancy_id','contracts','predecessor_contract_id'),
 ('contract_parties','contract_versions','contract_version_id','tenants','tenant_id'),
 ('contract_files','contract_versions','contract_version_id','stored_files','file_id'),
 ('tenancy_requests','tenancies','tenancy_id','rooms','target_room_id'),
 ('room_transfers','tenancies','old_tenancy_id','tenancies','new_tenancy_id'),
 ('charge_rates','rate_plans','rate_plan_id','charge_types','charge_type_id'),
 ('handover_assets','handovers','handover_id','room_assets','room_asset_id'),
 ('handover_files','handovers','handover_id','stored_files','file_id'),
 ('meter_readings','meters','meter_id','tenancies','tenancy_id'),
 ('meter_readings','meters','meter_id','billing_periods','billing_period_id'),
 ('meter_readings','meters','meter_id','handovers','handover_id'),
 ('meter_reading_files','meter_readings','reading_id','stored_files','file_id'),
 ('invoices','tenancies','tenancy_id','billing_periods','billing_period_id'),
 ('invoices','tenancies','tenancy_id','invoices','original_invoice_id'),
 ('charge_instances','tenancies','tenancy_id','charge_types','charge_type_id'),
 ('charge_instances','tenancies','tenancy_id','billing_periods','billing_period_id'),
 ('invoice_lines','invoices','invoice_id','charge_types','charge_type_id'),
 ('invoice_lines','invoices','invoice_id','charge_instances','charge_instance_id'),
 ('invoice_lines','invoices','invoice_id','charge_rates','source_rate_id'),
 ('invoice_meter_segments','invoice_lines','invoice_line_id','meter_readings','from_reading_id'),
 ('invoice_meter_segments','invoice_lines','invoice_line_id','meter_readings','to_reading_id'),
 ('invoice_files','invoices','invoice_id','stored_files','file_id'),
 ('invoice_issue_batch_items','invoice_issue_batches','batch_id','tenancies','tenancy_id'),
 ('invoice_issue_batch_items','tenancies','tenancy_id','invoices','invoice_id'),
 ('payments','tenants','tenant_id','reservations','reservation_id'),
 ('payments','tenants','tenant_id','properties','collected_at_property_id'),
 ('payments','tenants','tenant_id','bank_accounts','bank_account_id'),
 ('payment_files','payments','payment_id','stored_files','file_id'),
 ('payment_reversals','payments','payment_id','stored_files','evidence_file_id'),
 ('checkout_settlements','tenancies','tenancy_id','handovers','checkout_handover_id'),
 ('settlement_invoices','checkout_settlements','settlement_id','invoices','invoice_id'),
 ('deposit_entries','tenancies','tenancy_id','payments','payment_id'),
 ('deposit_entries','tenancies','tenancy_id','checkout_settlements','settlement_id'),
 ('payment_allocations','invoices','invoice_id','payments','payment_id'),
 ('payment_allocations','invoices','invoice_id','deposit_entries','deposit_entry_id'),
 ('tickets','rooms','room_id','tenancies','tenancy_id'),
 ('tickets','rooms','room_id','ticket_categories','category_id'),
 ('tickets','rooms','room_id','sla_policies','sla_policy_id'),
 ('ticket_files','tickets','ticket_id','ticket_messages','message_id'),
 ('ticket_files','tickets','ticket_id','stored_files','file_id'),
 ('expenses','properties','property_id','rooms','room_id'),
 ('expenses','properties','property_id','tickets','ticket_id'),
 ('expenses','properties','property_id','expense_categories','category_id'),
 ('expenses','properties','property_id','stored_files','evidence_file_id'),
 ('expenses','properties','property_id','expenses','reversal_of_id'),
 ('reminder_rules','organizations','organization_id','message_templates','template_id'),
 ('notification_deliveries','outbox_messages','outbox_message_id','message_templates','template_id'),
 ('export_jobs','organizations','organization_id','stored_files','result_file_id'),
 ('integration_events','integration_connections','connection_id','payments','payment_id')
 ) x(t,lt,lc,rt,rc)
 LOOP
   seq:=seq+1;
   EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON smartrent.%I FOR EACH ROW EXECUTE FUNCTION smartrent.guard_same_organization(%L,%L,%L,%L)',
     'scope_'||seq,r.t,r.lt,r.lc,r.rt,r.rc);
 END LOOP;
END $$;

-- Không cho đổi đường sở hữu làm các FK đang có trở thành liên kết sai đơn vị/phòng.
CREATE FUNCTION guard_fixed_columns() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c text;
BEGIN
 FOREACH c IN ARRAY TG_ARGV LOOP
   IF to_jsonb(OLD)->c IS DISTINCT FROM to_jsonb(NEW)->c THEN
     RAISE EXCEPTION 'Immutable ownership: %.%',TG_TABLE_NAME,c USING ERRCODE='23514';
   END IF;
 END LOOP;
 RETURN NEW;
END $$;
DO $$
DECLARE r record;
BEGIN
 FOR r IN SELECT * FROM (VALUES
 ('organization_memberships','organization_id'),('business_roles','organization_id'),('properties','organization_id'),
 ('room_types','organization_id'),('amenities','organization_id'),('tenants','organization_id'),('stored_files','organization_id'),
 ('rooms','property_id'),('room_allocations','room_id'),('tenancies','allocation_id'),('tenancies','representative_tenant_id'),
 ('contracts','tenancy_id'),('contract_versions','contract_id'),('charge_types','organization_id'),
 ('rate_plans','property_id'),('rate_plans','room_id'),('rate_plans','contract_version_id'),
 ('charge_rates','rate_plan_id'),('charge_rates','charge_type_id'),('meters','room_id'),('meters','meter_kind'),
 ('billing_periods','property_id'),('billing_periods','month_start'),('invoices','tenancy_id'),
 ('invoice_lines','invoice_id'),('charge_instances','tenancy_id'),('tickets','room_id'),
 ('ticket_categories','organization_id'),('sla_policies','organization_id'),('bank_accounts','organization_id')
 ) x(t,c)
 LOOP
   EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON smartrent.%I FOR EACH ROW EXECUTE FUNCTION smartrent.guard_fixed_columns(%L)',
     'fixed_'||r.c,r.t,r.c);
 END LOOP;
END $$;

CREATE FUNCTION reject_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION '% is append-only; use a linked reversal/new version',TG_TABLE_NAME USING ERRCODE='23514'; END $$;
DO $$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['payment_reversals','payment_allocations','deposit_entries','audit_logs','ticket_events',
 'inquiry_events','room_status_events','billing_period_events','contract_terminations','room_transfers','expenses'] LOOP
   EXECUTE format('CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON smartrent.%I FOR EACH ROW EXECUTE FUNCTION smartrent.reject_mutation()',t);
 END LOOP;
END $$;

CREATE FUNCTION guard_contract() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE version_id uuid; signed_time timestamptz;
BEGIN
 IF TG_TABLE_NAME='contract_versions' THEN
   IF TG_OP<>'INSERT' AND OLD.signed_at IS NOT NULL THEN
     RAISE EXCEPTION 'Signed contract version is immutable' USING ERRCODE='23514';
   END IF;
   IF TG_OP<>'DELETE' AND NEW.signed_at IS NOT NULL THEN
     IF NOT EXISTS (SELECT 1 FROM smartrent.contract_parties WHERE contract_version_id=NEW.id AND party_role='landlord')
        OR NOT EXISTS (SELECT 1 FROM smartrent.contract_parties WHERE contract_version_id=NEW.id AND party_role='representative')
        OR NOT EXISTS (SELECT 1 FROM smartrent.contract_files WHERE contract_version_id=NEW.id AND file_kind='signed') THEN
       RAISE EXCEPTION 'Signing requires party snapshots and signed file' USING ERRCODE='23514';
     END IF;
   END IF;
 ELSE
   version_id:=CASE WHEN TG_OP='DELETE' THEN OLD.contract_version_id ELSE NEW.contract_version_id END;
   IF EXISTS (SELECT 1 FROM smartrent.contract_versions WHERE id=version_id AND signed_at IS NOT NULL) THEN
     RAISE EXCEPTION 'Signed contract children are immutable' USING ERRCODE='23514';
   END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER contract_guard BEFORE INSERT OR UPDATE OR DELETE ON contract_versions FOR EACH ROW EXECUTE FUNCTION guard_contract();
CREATE TRIGGER contract_guard BEFORE INSERT OR UPDATE OR DELETE ON contract_parties FOR EACH ROW EXECUTE FUNCTION guard_contract();
CREATE TRIGGER contract_guard BEFORE INSERT OR UPDATE OR DELETE ON contract_files FOR EACH ROW EXECUTE FUNCTION guard_contract();

CREATE FUNCTION guard_rate() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE plan_id uuid; version_id uuid;
BEGIN
 plan_id:=CASE WHEN TG_OP='DELETE' THEN OLD.rate_plan_id ELSE NEW.rate_plan_id END;
 SELECT contract_version_id INTO version_id FROM smartrent.rate_plans WHERE id=plan_id;
 IF EXISTS (SELECT 1 FROM smartrent.contract_versions WHERE id=version_id AND signed_at IS NOT NULL) THEN
   RAISE EXCEPTION 'Rates of signed version are immutable' USING ERRCODE='23514';
 END IF;
 IF TG_OP<>'INSERT' THEN
   IF TG_OP='DELETE' OR (to_jsonb(NEW)-'effective_to') IS DISTINCT FROM (to_jsonb(OLD)-'effective_to') THEN
     RAISE EXCEPTION 'Create a new dated rate; only closing effective_to is permitted' USING ERRCODE='23514';
   END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER rate_guard BEFORE INSERT OR UPDATE OR DELETE ON charge_rates FOR EACH ROW EXECUTE FUNCTION guard_rate();

CREATE FUNCTION guard_domain_links() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected_id uuid; actual_id uuid; old_stay record; new_stay record;
BEGIN
 IF TG_TABLE_NAME='reservations' THEN
  IF NEW.inquiry_id IS NOT NULL THEN
   SELECT room_id INTO expected_id FROM smartrent.rental_inquiries WHERE id=NEW.inquiry_id;
   SELECT room_id INTO actual_id FROM smartrent.room_allocations WHERE id=NEW.allocation_id;
  END IF;
 ELSIF TG_TABLE_NAME='tenancies' THEN
  IF NEW.reservation_id IS NOT NULL THEN
   IF NOT EXISTS (SELECT 1 FROM smartrent.reservations WHERE id=NEW.reservation_id
       AND allocation_id=NEW.allocation_id AND tenant_id=NEW.representative_tenant_id) THEN
     RAISE EXCEPTION 'Tenancy must consume the same reservation and tenant' USING ERRCODE='23514'; END IF;
  END IF;
 ELSIF TG_TABLE_NAME='invoices' THEN
  IF NEW.billing_period_id IS NOT NULL THEN
   SELECT r.property_id INTO expected_id FROM smartrent.tenancies t JOIN smartrent.room_allocations a ON a.id=t.allocation_id
     JOIN smartrent.rooms r ON r.id=a.room_id WHERE t.id=NEW.tenancy_id;
   SELECT property_id INTO actual_id FROM smartrent.billing_periods WHERE id=NEW.billing_period_id;
  END IF;
 ELSIF TG_TABLE_NAME='handover_assets' THEN
   SELECT a.room_id INTO expected_id FROM smartrent.handovers h JOIN smartrent.tenancies t ON t.id=h.tenancy_id
     JOIN smartrent.room_allocations a ON a.id=t.allocation_id WHERE h.id=NEW.handover_id;
   SELECT room_id INTO actual_id FROM smartrent.room_assets WHERE id=NEW.room_asset_id;
 ELSIF TG_TABLE_NAME='tickets' THEN
  IF NEW.tenancy_id IS NOT NULL THEN
   SELECT a.room_id INTO expected_id FROM smartrent.tenancies t JOIN smartrent.room_allocations a ON a.id=t.allocation_id WHERE t.id=NEW.tenancy_id;
   actual_id:=NEW.room_id;
  END IF;
 ELSIF TG_TABLE_NAME='ticket_files' THEN
  IF NEW.message_id IS NOT NULL THEN
   expected_id:=NEW.ticket_id; SELECT ticket_id INTO actual_id FROM smartrent.ticket_messages WHERE id=NEW.message_id;
  END IF;
 ELSIF TG_TABLE_NAME='room_transfers' THEN
   SELECT * INTO old_stay FROM smartrent.tenancies WHERE id=NEW.old_tenancy_id;
   SELECT * INTO new_stay FROM smartrent.tenancies WHERE id=NEW.new_tenancy_id;
   IF old_stay.representative_tenant_id<>new_stay.representative_tenant_id OR old_stay.status<>'ended' OR new_stay.status<>'active'
      OR old_stay.actual_move_out<>NEW.transfer_on OR new_stay.actual_move_in<>NEW.transfer_on THEN
     RAISE EXCEPTION 'Transfer must atomically close/open stays of the same representative on transfer date' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='administrative_units' THEN
  IF NEW.parent_id IS NOT NULL THEN
   SELECT dataset_id INTO expected_id FROM smartrent.administrative_units WHERE id=NEW.parent_id;
   actual_id:=NEW.dataset_id;
  END IF;
 ELSIF TG_TABLE_NAME='tenant_identity_documents' THEN
   IF EXISTS (SELECT 1 FROM smartrent.stored_files WHERE id IN (NEW.front_file_id,NEW.back_file_id) AND visibility<>'private') THEN
     RAISE EXCEPTION 'Identity files must be private' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='expenses' THEN
  IF NEW.room_id IS NOT NULL THEN
   expected_id:=NEW.property_id; SELECT property_id INTO actual_id FROM smartrent.rooms WHERE id=NEW.room_id;
  END IF;
 END IF;
 IF expected_id IS DISTINCT FROM actual_id THEN
   RAISE EXCEPTION 'Mismatched property/room/document on %',TG_TABLE_NAME USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['reservations','tenancies','invoices','handover_assets','tickets','ticket_files','room_transfers',
 'administrative_units','tenant_identity_documents','expenses'] LOOP
 EXECUTE format('CREATE TRIGGER domain_links BEFORE INSERT OR UPDATE ON smartrent.%I FOR EACH ROW EXECUTE FUNCTION smartrent.guard_domain_links()',t);
 END LOOP;
END $$;

CREATE FUNCTION guard_reading() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE m record; prev numeric; following numeric; room uuid; period_state text;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Void a reading and append a correction' USING ERRCODE='23514'; END IF;
 SELECT * INTO m FROM smartrent.meters WHERE id=NEW.meter_id FOR UPDATE;
 IF TG_OP='UPDATE' AND ((to_jsonb(NEW)-ARRAY['status','void_reason']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','void_reason'])
     OR OLD.status<>'valid' OR NEW.status<>'void') THEN
   RAISE EXCEPTION 'Only valid -> void is allowed; append replacement reading' USING ERRCODE='23514'; END IF;
 SELECT status INTO period_state FROM smartrent.billing_periods WHERE id=NEW.billing_period_id FOR UPDATE;
 IF period_state='locked' THEN RAISE EXCEPTION 'Billing period is locked' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND EXISTS (
   SELECT 1 FROM smartrent.invoice_meter_segments s JOIN smartrent.invoice_lines l ON l.id=s.invoice_line_id
   JOIN smartrent.invoices i ON i.id=l.invoice_id WHERE i.status IN ('issued','void') AND OLD.id IN (s.from_reading_id,s.to_reading_id)) THEN
   RAISE EXCEPTION 'Reading belongs to an issued document; use financial adjustment' USING ERRCODE='23514'; END IF;
 IF NEW.observed_at<m.installed_at OR (m.removed_at IS NOT NULL AND NEW.observed_at>m.removed_at) THEN
   RAISE EXCEPTION 'Reading outside meter lifecycle' USING ERRCODE='23514'; END IF;
 IF NEW.tenancy_id IS NOT NULL THEN
   SELECT a.room_id INTO room FROM smartrent.tenancies t JOIN smartrent.room_allocations a ON a.id=t.allocation_id WHERE t.id=NEW.tenancy_id;
   IF room<>m.room_id THEN RAISE EXCEPTION 'Reading/tenancy room mismatch' USING ERRCODE='23514'; END IF;
 END IF;
 IF NEW.handover_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM smartrent.handovers h WHERE h.id=NEW.handover_id AND h.tenancy_id=NEW.tenancy_id) THEN
   RAISE EXCEPTION 'Reading/handover tenancy mismatch' USING ERRCODE='23514'; END IF;
 IF NEW.billing_period_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM smartrent.billing_periods bp JOIN smartrent.rooms r ON r.property_id=bp.property_id WHERE bp.id=NEW.billing_period_id AND r.id=m.room_id) THEN
   RAISE EXCEPTION 'Reading/billing property mismatch' USING ERRCODE='23514'; END IF;
 IF NEW.supersedes_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM smartrent.meter_readings x WHERE x.id=NEW.supersedes_id AND x.meter_id=NEW.meter_id AND x.status='void') THEN
   RAISE EXCEPTION 'Correction must reference void reading of the same meter' USING ERRCODE='23514'; END IF;
 IF NEW.status='valid' THEN
   SELECT reading_value INTO prev FROM smartrent.meter_readings WHERE meter_id=NEW.meter_id AND status='valid' AND observed_at<NEW.observed_at ORDER BY observed_at DESC LIMIT 1;
   SELECT reading_value INTO following FROM smartrent.meter_readings WHERE meter_id=NEW.meter_id AND status='valid' AND observed_at>NEW.observed_at ORDER BY observed_at LIMIT 1;
   IF NEW.reading_value<prev OR NEW.reading_value>following THEN RAISE EXCEPTION 'Non-monotonic meter reading' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER reading_guard BEFORE INSERT OR UPDATE OR DELETE ON meter_readings FOR EACH ROW EXECUTE FUNCTION guard_reading();

CREATE FUNCTION guard_meter_segment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a record; b record; tenancy uuid;
BEGIN
 SELECT * INTO a FROM smartrent.meter_readings WHERE id=NEW.from_reading_id;
 SELECT * INTO b FROM smartrent.meter_readings WHERE id=NEW.to_reading_id;
 SELECT i.tenancy_id INTO tenancy FROM smartrent.invoice_lines l JOIN smartrent.invoices i ON i.id=l.invoice_id WHERE l.id=NEW.invoice_line_id;
 IF a.meter_id<>b.meter_id OR a.observed_at>=b.observed_at OR a.reading_value>b.reading_value
    OR a.status<>'valid' OR b.status<>'valid' OR a.tenancy_id IS DISTINCT FROM tenancy OR b.tenancy_id IS DISTINCT FROM tenancy THEN
   RAISE EXCEPTION 'Invalid meter segment; both readings must belong to this tenancy and meter' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER segment_guard BEFORE INSERT OR UPDATE ON invoice_meter_segments FOR EACH ROW EXECUTE FUNCTION guard_meter_segment();

CREATE FUNCTION guard_invoice() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE doc smartrent.invoices%ROWTYPE; doc_id uuid; total numeric;
BEGIN
 IF TG_TABLE_NAME='invoices' THEN
   IF TG_OP<>'INSERT' AND OLD.status IN ('issued','void') THEN
     IF TG_OP='DELETE' OR OLD.status='void' OR NEW.status<>'void'
       OR (to_jsonb(OLD)-ARRAY['status','voided_at','voided_by','void_reason']) IS DISTINCT FROM (to_jsonb(NEW)-ARRAY['status','voided_at','voided_by','void_reason']) THEN
       RAISE EXCEPTION 'Issued invoice is immutable; adjust or void with reason' USING ERRCODE='23514'; END IF;
   END IF;
   IF TG_OP='INSERT' AND NEW.status<>'draft' THEN RAISE EXCEPTION 'Create draft first' USING ERRCODE='23514'; END IF;
   IF TG_OP<>'DELETE' AND NEW.original_invoice_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM smartrent.invoices o WHERE o.id=NEW.original_invoice_id AND o.tenancy_id=NEW.tenancy_id
         AND o.kind NOT IN ('debit_adjustment','credit_adjustment')
         AND ((NEW.kind='replacement' AND o.status='void') OR (NEW.kind<>'replacement' AND o.status='issued'))) THEN
     RAISE EXCEPTION 'Invalid original invoice' USING ERRCODE='23514'; END IF;
   IF TG_OP='UPDATE' AND NEW.status='issued' AND OLD.status='draft' THEN
     SELECT amount INTO total FROM smartrent.v_invoice_totals WHERE invoice_id=NEW.id;
     IF total<0 OR NOT EXISTS (SELECT 1 FROM smartrent.invoice_lines WHERE invoice_id=NEW.id) THEN
       RAISE EXCEPTION 'Invoice must have lines and a nonnegative face amount' USING ERRCODE='23514'; END IF;
     IF NEW.kind NOT IN ('debit_adjustment','credit_adjustment') AND NOT EXISTS (
         SELECT 1 FROM smartrent.contracts c JOIN smartrent.contract_versions v ON v.contract_id=c.id
         WHERE c.tenancy_id=NEW.tenancy_id AND v.signed_at IS NOT NULL) THEN
       RAISE EXCEPTION 'No signed contract for tenancy' USING ERRCODE='23514'; END IF;
     IF EXISTS (
       SELECT 1 FROM smartrent.invoice_lines l JOIN smartrent.charge_types c ON c.id=l.charge_type_id
       LEFT JOIN smartrent.charge_rates r ON r.id=l.source_rate_id
       WHERE l.invoice_id=NEW.id AND NEW.kind NOT IN ('debit_adjustment','credit_adjustment')
         AND c.category IN ('rent','electricity','water','service')
         AND (r.id IS NULL OR r.charge_type_id<>l.charge_type_id OR r.unit_price<>l.unit_price)) THEN
       RAISE EXCEPTION 'Missing/mismatched rate snapshot' USING ERRCODE='23514'; END IF;
     IF EXISTS (
       SELECT 1 FROM smartrent.invoice_lines l JOIN smartrent.charge_rates r ON r.id=l.source_rate_id
       LEFT JOIN smartrent.charge_instances ci ON ci.id=l.charge_instance_id
       LEFT JOIN smartrent.invoice_charge_claims cl ON cl.invoice_line_id=l.id
       WHERE l.invoice_id=NEW.id AND r.billing_cycle='once' AND
         (ci.id IS NULL OR ci.billing_period_id IS NOT NULL OR cl.charge_instance_id IS DISTINCT FROM ci.id)) THEN
       RAISE EXCEPTION 'One-time fee requires a unique non-periodic charge occurrence' USING ERRCODE='23514'; END IF;
     IF EXISTS (
       SELECT 1 FROM smartrent.invoice_lines l JOIN smartrent.charge_rates r ON r.id=l.source_rate_id
       WHERE l.invoice_id=NEW.id AND r.calculation_method='metered' AND (
         NOT EXISTS (SELECT 1 FROM smartrent.invoice_meter_segments s WHERE s.invoice_line_id=l.id)
         OR l.quantity<>(SELECT sum(b.reading_value-a.reading_value) FROM smartrent.invoice_meter_segments s
             JOIN smartrent.meter_readings a ON a.id=s.from_reading_id JOIN smartrent.meter_readings b ON b.id=s.to_reading_id WHERE s.invoice_line_id=l.id))) THEN
       RAISE EXCEPTION 'Missing meter readings or consumption mismatch' USING ERRCODE='23514'; END IF;
   END IF;
   IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
 END IF;
 IF TG_TABLE_NAME='invoice_lines' THEN
   doc_id:=CASE WHEN TG_OP='DELETE' THEN OLD.invoice_id ELSE NEW.invoice_id END;
 ELSE
   SELECT l.invoice_id INTO doc_id FROM smartrent.invoice_lines l
     WHERE l.id=CASE WHEN TG_OP='DELETE' THEN OLD.invoice_line_id ELSE NEW.invoice_line_id END;
 END IF;
 SELECT * INTO doc FROM smartrent.invoices WHERE id=doc_id FOR UPDATE;
 IF doc.status<>'draft' THEN RAISE EXCEPTION 'Invoice details are immutable after issue/void' USING ERRCODE='23514'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER invoice_guard BEFORE INSERT OR UPDATE OR DELETE ON invoices FOR EACH ROW EXECUTE FUNCTION guard_invoice();
CREATE TRIGGER invoice_line_guard BEFORE INSERT OR UPDATE OR DELETE ON invoice_lines FOR EACH ROW EXECUTE FUNCTION guard_invoice();
CREATE TRIGGER invoice_segment_guard BEFORE INSERT OR UPDATE OR DELETE ON invoice_meter_segments FOR EACH ROW EXECUTE FUNCTION guard_invoice();

CREATE FUNCTION sync_charge_claim() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='invoices' THEN
   IF NEW.status='void' THEN DELETE FROM smartrent.invoice_charge_claims c USING smartrent.invoice_lines l WHERE c.invoice_line_id=l.id AND l.invoice_id=NEW.id; END IF;
 ELSE
   IF TG_OP='UPDATE' AND OLD.charge_instance_id IS DISTINCT FROM NEW.charge_instance_id THEN
     DELETE FROM smartrent.invoice_charge_claims WHERE invoice_line_id=OLD.id;
   END IF;
   IF NEW.charge_instance_id IS NOT NULL THEN
     IF NOT EXISTS (SELECT 1 FROM smartrent.charge_instances c JOIN smartrent.invoices i ON i.tenancy_id=c.tenancy_id
       WHERE c.id=NEW.charge_instance_id AND i.id=NEW.invoice_id AND c.charge_type_id=NEW.charge_type_id
       AND (c.billing_period_id IS NULL OR c.billing_period_id=i.billing_period_id)) THEN
       RAISE EXCEPTION 'Charge occurrence does not match invoice' USING ERRCODE='23514'; END IF;
     INSERT INTO smartrent.invoice_charge_claims(charge_instance_id,invoice_line_id) VALUES (NEW.charge_instance_id,NEW.id)
       ON CONFLICT (invoice_line_id) DO NOTHING;
   END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER charge_claim_line AFTER INSERT OR UPDATE ON invoice_lines FOR EACH ROW EXECUTE FUNCTION sync_charge_claim();
CREATE TRIGGER charge_claim_void AFTER UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION sync_charge_claim();

CREATE FUNCTION guard_period_lock() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE period_id uuid; period_status text;
BEGIN
 IF TG_TABLE_NAME='billing_periods' THEN
   IF OLD.status='locked' AND NEW.status='open' AND nullif(btrim(current_setting('smartrent.reason',true)),'') IS NULL THEN
     RAISE EXCEPTION 'Unlock requires transaction-local reason' USING ERRCODE='23514'; END IF;
 ELSE
   IF TG_TABLE_NAME='invoices' THEN
     period_id:=CASE WHEN TG_OP='DELETE' THEN OLD.billing_period_id ELSE NEW.billing_period_id END;
   ELSE
     SELECT i.billing_period_id INTO period_id FROM smartrent.invoices i
       WHERE i.id=CASE WHEN TG_OP='DELETE' THEN OLD.invoice_id ELSE NEW.invoice_id END;
   END IF;
   SELECT status INTO period_status FROM smartrent.billing_periods WHERE id=period_id FOR UPDATE;
   IF period_status='locked' THEN RAISE EXCEPTION 'Billing period is locked; unlock with reason before adjustment' USING ERRCODE='23514'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER period_guard BEFORE UPDATE ON billing_periods FOR EACH ROW EXECUTE FUNCTION guard_period_lock();
CREATE TRIGGER period_guard BEFORE INSERT OR UPDATE OR DELETE ON invoices FOR EACH ROW EXECUTE FUNCTION guard_period_lock();
CREATE TRIGGER period_guard BEFORE INSERT OR UPDATE OR DELETE ON invoice_lines FOR EACH ROW EXECUTE FUNCTION guard_period_lock();

CREATE FUNCTION guard_meter_replacement() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a record; b record;
BEGIN
 SELECT * INTO a FROM smartrent.meters WHERE id=NEW.old_meter_id;
 SELECT * INTO b FROM smartrent.meters WHERE id=NEW.new_meter_id;
 IF a.room_id<>b.room_id OR a.meter_kind<>b.meter_kind OR a.removed_at IS DISTINCT FROM NEW.replaced_at
   OR b.installed_at<>NEW.replaced_at
   OR NOT EXISTS (SELECT 1 FROM smartrent.meter_readings WHERE id=NEW.final_reading_id AND meter_id=a.id AND observed_at=NEW.replaced_at AND status='valid')
   OR NOT EXISTS (SELECT 1 FROM smartrent.meter_readings WHERE id=NEW.initial_reading_id AND meter_id=b.id AND observed_at=NEW.replaced_at AND status='valid') THEN
   RAISE EXCEPTION 'Meter replacement requires same room/type, matching lifecycle and closing/opening readings' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER replacement_guard BEFORE INSERT ON meter_replacements FOR EACH ROW EXECUTE FUNCTION guard_meter_replacement();
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON meter_replacements FOR EACH ROW EXECUTE FUNCTION reject_mutation();

-- Sổ tài chính: khóa cùng một hồ sơ khách trước mọi thay đổi, rồi kiểm tra cuối transaction.
CREATE FUNCTION financial_tenant(p_table text,j jsonb) RETURNS uuid LANGUAGE plpgsql STABLE AS $$
DECLARE result uuid;
BEGIN
 IF p_table='payments' THEN RETURN (j->>'tenant_id')::uuid;
 ELSIF p_table='payment_reversals' THEN SELECT tenant_id INTO result FROM smartrent.payments WHERE id=(j->>'payment_id')::uuid;
 ELSIF p_table='deposit_entries' THEN SELECT representative_tenant_id INTO result FROM smartrent.tenancies WHERE id=(j->>'tenancy_id')::uuid;
 ELSIF p_table='invoices' THEN SELECT representative_tenant_id INTO result FROM smartrent.tenancies WHERE id=(j->>'tenancy_id')::uuid;
 ELSE SELECT t.representative_tenant_id INTO result FROM smartrent.invoices i JOIN smartrent.tenancies t ON t.id=i.tenancy_id WHERE i.id=(j->>'invoice_id')::uuid;
 END IF; RETURN result;
END $$;
CREATE FUNCTION lock_financial_tenant() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tenant uuid; p smartrent.payments%ROWTYPE; d smartrent.deposit_entries%ROWTYPE; original record;
BEGIN
 tenant:=smartrent.financial_tenant(TG_TABLE_NAME,CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END);
 PERFORM 1 FROM smartrent.tenants WHERE id=tenant FOR UPDATE;
 IF TG_TABLE_NAME='payments' THEN
   IF TG_OP<>'INSERT' AND OLD.status<>'pending' THEN
     RAISE EXCEPTION 'Confirmed/rejected payment is immutable' USING ERRCODE='23514'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF TG_TABLE_NAME IN ('payment_reversals','deposit_entries') THEN
   SELECT * INTO p FROM smartrent.payments WHERE id=NEW.payment_id;
   IF p.status<>'confirmed' OR p.tenant_id<>tenant THEN RAISE EXCEPTION 'Funding must be confirmed and belong to tenant' USING ERRCODE='23514'; END IF;
 END IF;
 IF TG_TABLE_NAME='deposit_entries' THEN
   IF NEW.kind='reversal' THEN
     SELECT * INTO d FROM smartrent.deposit_entries WHERE id=NEW.related_entry_id;
     IF d.kind NOT IN ('receipt','offset') OR d.tenancy_id<>NEW.tenancy_id OR d.payment_id<>NEW.payment_id THEN
       RAISE EXCEPTION 'Invalid deposit reversal' USING ERRCODE='23514'; END IF;
   ELSIF NEW.kind='transfer_in' THEN
     SELECT * INTO d FROM smartrent.deposit_entries WHERE id=NEW.related_entry_id;
     IF d.kind<>'transfer_out' OR d.tenancy_id=NEW.tenancy_id OR d.payment_id<>NEW.payment_id OR d.amount<>NEW.amount THEN
       RAISE EXCEPTION 'Invalid deposit transfer pair' USING ERRCODE='23514'; END IF;
   ELSIF NEW.kind='refund' AND NOT EXISTS (
     SELECT 1 FROM smartrent.payment_reversals r WHERE r.id=NEW.payment_reversal_id AND r.payment_id=NEW.payment_id AND r.kind='refund') THEN
     RAISE EXCEPTION 'Deposit refund requires confirmed cash refund' USING ERRCODE='23514';
   END IF;
 ELSIF TG_TABLE_NAME='payment_allocations' THEN
   IF NEW.payment_id IS NOT NULL THEN SELECT * INTO p FROM smartrent.payments WHERE id=NEW.payment_id;
   ELSE
     SELECT * INTO d FROM smartrent.deposit_entries WHERE id=NEW.deposit_entry_id;
     SELECT * INTO p FROM smartrent.payments WHERE id=d.payment_id;
     IF d.kind<>'offset' THEN RAISE EXCEPTION 'Deposit allocation requires offset entry' USING ERRCODE='23514'; END IF;
   END IF;
   IF p.tenant_id<>tenant OR p.status<>'confirmed' THEN RAISE EXCEPTION 'Allocation payer mismatch/unconfirmed' USING ERRCODE='23514'; END IF;
   IF NEW.kind='reversal' THEN
     SELECT * INTO original FROM smartrent.payment_allocations WHERE id=NEW.reverses_id;
     IF original.kind<>'apply' OR original.invoice_id<>NEW.invoice_id
        OR original.payment_id IS DISTINCT FROM NEW.payment_id OR original.deposit_entry_id IS DISTINCT FROM NEW.deposit_entry_id THEN
       RAISE EXCEPTION 'Reversal must keep original invoice and funding source' USING ERRCODE='23514'; END IF;
   END IF;
 END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['payments','payment_reversals','deposit_entries','payment_allocations','invoices','invoice_lines'] LOOP
 EXECUTE format('CREATE TRIGGER financial_lock BEFORE INSERT OR UPDATE OR DELETE ON smartrent.%I FOR EACH ROW EXECUTE FUNCTION smartrent.lock_financial_tenant()',t);
 END LOOP;
END $$;

CREATE FUNCTION validate_financial_tenant(p_tenant uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS (SELECT 1 FROM smartrent.v_payment_balances WHERE tenant_id=p_tenant AND
     (unapplied_amount<0 OR reversed_amount>amount OR invoice_allocated_amount<0 OR deposit_held_amount<0
       OR (status<>'confirmed' AND (reversed_amount<>0 OR invoice_allocated_amount<>0 OR deposit_held_amount<>0)))) THEN
   RAISE EXCEPTION 'Payment overallocated/reversed or not confirmed' USING ERRCODE='23514'; END IF;
 IF EXISTS (SELECT 1 FROM smartrent.v_deposit_movements d JOIN smartrent.payments p ON p.id=d.payment_id
     WHERE p.tenant_id=p_tenant GROUP BY d.tenancy_id,d.payment_id HAVING sum(d.signed_amount)<0) THEN
   RAISE EXCEPTION 'Deposit funding lot cannot be negative' USING ERRCODE='23514'; END IF;
 IF EXISTS (SELECT 1 FROM smartrent.v_invoice_balances b JOIN smartrent.tenancies t ON t.id=b.tenancy_id
     WHERE t.representative_tenant_id=p_tenant AND (b.paid_amount<0 OR (b.status='issued' AND (b.outstanding_amount<0 OR b.receivable_amount<0))
       OR (b.status<>'issued' AND b.paid_amount<>0))) THEN
   RAISE EXCEPTION 'Invoice overpaid, negative, or void/draft with live allocation' USING ERRCODE='23514'; END IF;
 IF EXISTS (SELECT 1 FROM smartrent.payment_allocations a JOIN smartrent.invoices i ON i.id=a.invoice_id
     JOIN smartrent.tenancies t ON t.id=i.tenancy_id WHERE t.representative_tenant_id=p_tenant
       AND i.kind IN ('debit_adjustment','credit_adjustment')) THEN
   RAISE EXCEPTION 'Allocate against base invoice, not adjustment document' USING ERRCODE='23514'; END IF;
 IF EXISTS (SELECT 1 FROM smartrent.payment_allocations a JOIN smartrent.invoices i ON i.id=a.invoice_id
     JOIN smartrent.tenancies t ON t.id=i.tenancy_id LEFT JOIN smartrent.payment_allocations r ON r.reverses_id=a.id
     WHERE t.representative_tenant_id=p_tenant AND a.kind='apply' GROUP BY a.id HAVING coalesce(sum(r.amount),0)>a.amount) THEN
   RAISE EXCEPTION 'Allocation reversal exceeds original' USING ERRCODE='23514'; END IF;
 IF EXISTS (SELECT 1 FROM smartrent.deposit_entries d JOIN smartrent.payments p ON p.id=d.payment_id
     LEFT JOIN smartrent.deposit_entries r ON r.related_entry_id=d.id AND r.kind='reversal'
     WHERE p.tenant_id=p_tenant GROUP BY d.id HAVING coalesce(sum(r.amount),0)>d.amount) THEN
   RAISE EXCEPTION 'Deposit reversal exceeds original' USING ERRCODE='23514'; END IF;
 IF EXISTS (SELECT 1 FROM smartrent.deposit_entries d JOIN smartrent.payments p ON p.id=d.payment_id
     WHERE p.tenant_id=p_tenant AND d.kind='offset' AND
       d.amount-coalesce((SELECT sum(r.amount) FROM smartrent.deposit_entries r WHERE r.related_entry_id=d.id AND r.kind='reversal'),0)
       <>coalesce((SELECT sum(a.signed_amount) FROM smartrent.v_allocation_movements a WHERE a.deposit_entry_id=d.id),0)) THEN
   RAISE EXCEPTION 'Deposit offset must equal net invoice allocation' USING ERRCODE='23514'; END IF;
 IF EXISTS (SELECT 1 FROM smartrent.deposit_entries d JOIN smartrent.payments p ON p.id=d.payment_id
     WHERE p.tenant_id=p_tenant AND d.kind='transfer_out' AND NOT EXISTS
       (SELECT 1 FROM smartrent.deposit_entries x WHERE x.related_entry_id=d.id AND x.kind='transfer_in')) THEN
   RAISE EXCEPTION 'Deposit transfer requires both entries in the same transaction' USING ERRCODE='23514'; END IF;
 IF EXISTS (SELECT 1 FROM smartrent.payment_reversals r JOIN smartrent.payments p ON p.id=r.payment_id
     JOIN smartrent.deposit_entries d ON d.payment_reversal_id=r.id WHERE p.tenant_id=p_tenant
     GROUP BY r.id HAVING sum(d.amount)>r.amount) THEN
   RAISE EXCEPTION 'Deposit refund exceeds associated cash refund' USING ERRCODE='23514'; END IF;
 IF EXISTS (SELECT 1 FROM smartrent.invoices o JOIN smartrent.tenancies t ON t.id=o.tenancy_id
     JOIN smartrent.invoices a ON a.original_invoice_id=o.id
     WHERE t.representative_tenant_id=p_tenant AND o.status<>'issued' AND a.status='issued'
       AND a.kind IN ('debit_adjustment','credit_adjustment')) THEN
   RAISE EXCEPTION 'Void adjustments before voiding their base invoice' USING ERRCODE='23514'; END IF;
END $$;
CREATE FUNCTION deferred_financial_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM smartrent.validate_financial_tenant(smartrent.financial_tenant(TG_TABLE_NAME,CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END));
 RETURN NULL;
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['payments','payment_reversals','deposit_entries','payment_allocations','invoices','invoice_lines'] LOOP
 EXECUTE format('CREATE CONSTRAINT TRIGGER financial_balanced AFTER INSERT OR UPDATE OR DELETE ON smartrent.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION smartrent.deferred_financial_check()',t);
 END LOOP;
END $$;

-- Nhận/trả có thể ghi nhiều bảng trong transaction, nhưng trạng thái cuối phải đồng bộ.
CREATE FUNCTION validate_tenancy_state() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE t record; a record;
BEGIN
 FOR t IN SELECT * FROM smartrent.tenancies WHERE id=CASE WHEN TG_TABLE_NAME='tenancies' THEN NEW.id ELSE NULL END
       OR allocation_id=CASE WHEN TG_TABLE_NAME='room_allocations' THEN NEW.id ELSE NULL END LOOP
   SELECT * INTO a FROM smartrent.room_allocations WHERE id=t.allocation_id;
   IF (t.status='active' AND (a.state<>'occupied' OR a.ends_on IS NOT NULL OR a.starts_on<>t.actual_move_in))
      OR (t.status='ended' AND (a.state<>'completed' OR a.ends_on<>t.actual_move_out))
      OR (t.status='planned' AND (a.state<>'reserved' OR a.starts_on<>t.planned_move_in)) OR (t.status='cancelled' AND a.state<>'released') THEN
     RAISE EXCEPTION 'Allocation/tenancy state mismatch' USING ERRCODE='23514'; END IF;
   IF t.status='active' AND t.onboarding_mode='normal' THEN
     IF NOT EXISTS (SELECT 1 FROM smartrent.contracts c JOIN smartrent.contract_versions v ON v.contract_id=c.id
        WHERE c.tenancy_id=t.id AND v.signed_at IS NOT NULL AND v.effective_from<=t.actual_move_in AND v.ends_on>t.actual_move_in)
        OR NOT EXISTS (SELECT 1 FROM smartrent.handovers h WHERE h.tenancy_id=t.id AND h.kind IN ('checkin','transfer_in') AND h.confirmed_at IS NOT NULL) THEN
       RAISE EXCEPTION 'Normal check-in needs signed contract and confirmed handover' USING ERRCODE='23514'; END IF;
     IF EXISTS (SELECT 1 FROM smartrent.effective_rates(t.id,t.actual_move_in) er
       JOIN smartrent.charge_types ct ON ct.id=er.charge_type_id WHERE er.calculation_method='metered'
       AND NOT EXISTS (SELECT 1 FROM smartrent.meters m JOIN smartrent.meter_readings mr ON mr.meter_id=m.id
         JOIN smartrent.handovers h ON h.id=mr.handover_id WHERE m.room_id=a.room_id AND m.meter_kind=ct.category
         AND mr.tenancy_id=t.id AND mr.status='valid' AND h.confirmed_at IS NOT NULL AND h.kind IN ('checkin','transfer_in'))) THEN
       RAISE EXCEPTION 'Missing handover baseline for metered utility' USING ERRCODE='23514'; END IF;
   END IF;
 END LOOP;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER tenancy_consistent AFTER INSERT OR UPDATE ON tenancies DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_tenancy_state();
CREATE CONSTRAINT TRIGGER tenancy_consistent AFTER INSERT OR UPDATE ON room_allocations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_tenancy_state();

CREATE FUNCTION validate_reservation_state() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE reservation record; allocation record;
BEGIN
 FOR reservation IN SELECT * FROM smartrent.reservations r
   WHERE r.id=CASE WHEN TG_TABLE_NAME='reservations' THEN NEW.id ELSE NULL END
      OR r.allocation_id=CASE WHEN TG_TABLE_NAME='room_allocations' THEN NEW.id ELSE NULL END LOOP
   SELECT * INTO allocation FROM smartrent.room_allocations WHERE id=reservation.allocation_id;
   IF (reservation.status='holding' AND allocation.state<>'held')
     OR (reservation.status IN ('expired','cancelled') AND allocation.state<>'released')
     OR (reservation.status='converted' AND NOT EXISTS (SELECT 1 FROM smartrent.tenancies t WHERE t.reservation_id=reservation.id AND t.allocation_id=allocation.id)) THEN
     RAISE EXCEPTION 'Reservation/allocation state mismatch' USING ERRCODE='23514'; END IF;
 END LOOP; RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER reservation_consistent AFTER INSERT OR UPDATE ON reservations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_reservation_state();
CREATE CONSTRAINT TRIGGER reservation_consistent AFTER INSERT OR UPDATE ON room_allocations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_reservation_state();

CREATE FUNCTION expire_reservations(p_now timestamptz DEFAULT now()) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE r record; affected integer:=0;
BEGIN
 FOR r IN SELECT rs.id,rs.allocation_id FROM smartrent.reservations rs JOIN smartrent.room_allocations a ON a.id=rs.allocation_id
   WHERE rs.status='holding' AND a.state='held' AND a.hold_expires_at<=p_now
   FOR UPDATE OF rs,a SKIP LOCKED LOOP
   UPDATE smartrent.reservations SET status='expired' WHERE id=r.id;
   UPDATE smartrent.room_allocations SET state='released' WHERE id=r.allocation_id;
   affected:=affected+1;
 END LOOP; RETURN affected;
END $$;

-- Ghi audit tự động; app đặt SET LOCAL smartrent.actor_id/reason/correlation_id trong transaction.
CREATE FUNCTION audit_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE j jsonb; oldj jsonb; org uuid; entity_id uuid; ownership record;
BEGIN
 IF TG_OP<>'DELETE' THEN j:=to_jsonb(NEW); END IF;
 IF TG_OP<>'INSERT' THEN oldj:=to_jsonb(OLD); END IF;
 entity_id:=coalesce((j->>'id')::uuid,(oldj->>'id')::uuid);
 IF TG_OP<>'DELETE' THEN org:=smartrent.organization_of(TG_TABLE_NAME,entity_id);
 ELSE
   org:=(oldj->>'organization_id')::uuid;
   IF org IS NULL THEN
     FOR ownership IN SELECT * FROM (VALUES
       ('tenancy_id','tenancies'),('tenant_id','tenants'),('property_id','properties'),
       ('room_id','rooms'),('rate_plan_id','rate_plans'),('meter_id','meters'),
       ('invoice_id','invoices'),('contract_id','contracts'),('allocation_id','room_allocations')
     ) x(parent_column,parent_table) LOOP
       IF nullif(oldj->>ownership.parent_column,'') IS NOT NULL THEN
         org:=smartrent.organization_of(ownership.parent_table,(oldj->>ownership.parent_column)::uuid);
         EXIT;
       END IF;
     END LOOP;
   END IF;
 END IF;
 INSERT INTO smartrent.audit_logs(organization_id,actor_id,action,table_name,record_key,old_data,new_data,reason,correlation_id)
 VALUES (org,nullif(current_setting('smartrent.actor_id',true),'')::uuid,TG_OP,TG_TABLE_NAME,
   jsonb_build_object('id',entity_id),oldj,j,nullif(current_setting('smartrent.reason',true),''),
   nullif(current_setting('smartrent.correlation_id',true),'')::uuid);
 RETURN NULL;
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['organizations','properties','rooms','tenants','rental_inquiries','room_allocations','reservations','tenancies',
 'contracts','contract_versions','charge_rates','meters','meter_readings','invoices','invoice_lines','payments','payment_reversals',
 'deposit_entries','checkout_settlements','tickets','expenses'] LOOP
 EXECUTE format('CREATE TRIGGER audit_row AFTER INSERT OR UPDATE OR DELETE ON smartrent.%I FOR EACH ROW EXECUTE FUNCTION smartrent.audit_change()',t);
 END LOOP;
END $$;
-- Phân bổ cũng cần audit nhưng organization_of không dùng PK đa nguồn; suy qua invoice.
-- Các dòng phân bổ append-only đã lưu người/thời điểm/lý do; ứng dụng ghi audit nghiệp vụ cấp cao thêm.
COMMIT;
