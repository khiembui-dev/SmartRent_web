-- Cho ph?p tr? trong ng?y nh?n ph?ng; v?n ch?n ng?y tr? tr??c ng?y v?o ?.
-- Ch? thay CHECK v? guard; kh?ng s?a h?p ??ng/h?a ??n ?ang c?.
BEGIN;
SET LOCAL search_path=smartrent,public;
DO $$ DECLARE item record; BEGIN
 FOR item IN SELECT conname FROM pg_constraint WHERE conrelid='smartrent.contracts'::regclass AND contype='c'
  AND pg_get_constraintdef(oid) LIKE '%move_out_on%' AND pg_get_constraintdef(oid) LIKE '%COALESCE(move_in_on, starts_on)%'
 LOOP EXECUTE format('ALTER TABLE contracts DROP CONSTRAINT %I',item.conname); END LOOP;
 ALTER TABLE contracts ADD CONSTRAINT contracts_move_out_date CHECK(move_out_on IS NULL OR move_out_on>=coalesce(move_in_on,starts_on));
END $$;
CREATE OR REPLACE FUNCTION guard_contract() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
DECLARE v jsonb; person jsonb; r rooms; b bookings; latest jsonb;
BEGIN
 IF TG_OP='DELETE' THEN
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(OLD.versions) v WHERE nullif(v->>'signedAt','') IS NOT NULL) THEN RAISE EXCEPTION 'signed_contract_cannot_delete' USING ERRCODE='23514'; END IF;
  RETURN OLD;
 END IF;
 PERFORM require_customer(NEW.user_id);
 PERFORM lock_customer(NEW.user_id);
 SELECT * INTO r FROM rooms WHERE id=NEW.room_id FOR UPDATE;
 PERFORM 1 FROM properties WHERE id=r.property_id FOR UPDATE;
 IF TG_OP='UPDATE' THEN
  IF NEW.user_id<>OLD.user_id OR NEW.room_id<>OLD.room_id OR NEW.starts_on<>OLD.starts_on OR NEW.code<>OLD.code OR NEW.booking_id IS DISTINCT FROM OLD.booking_id THEN RAISE EXCEPTION 'contract_identity_is_immutable' USING ERRCODE='23514'; END IF;
  FOR v IN SELECT value FROM jsonb_array_elements(OLD.versions) WHERE nullif(value->>'signedAt','') IS NOT NULL LOOP
   IF NOT NEW.versions @> jsonb_build_array(v) THEN RAISE EXCEPTION 'signed_version_is_immutable' USING ERRCODE='23514'; END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(OLD.versions) x WHERE nullif(x->>'signedAt','') IS NOT NULL) AND NEW.initial_readings<>OLD.initial_readings THEN RAISE EXCEPTION 'signed_initial_readings_are_immutable' USING ERRCODE='23514'; END IF;
  IF OLD.status IN ('ended','cancelled') AND (to_jsonb(NEW)-'archived_at'-'updated_at') IS DISTINCT FROM (to_jsonb(OLD)-'archived_at'-'updated_at') THEN RAISE EXCEPTION 'closed_contract_is_immutable' USING ERRCODE='23514'; END IF;
 END IF;
 IF NEW.status IN ('active','planned') THEN
  IF r.operating_status<>'available' OR NOT EXISTS(SELECT 1 FROM properties WHERE id=r.property_id AND is_active) THEN RAISE EXCEPTION 'room_not_available' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM bookings WHERE room_id=NEW.room_id AND hold_status='holding' AND hold_expires_at>now() AND id IS DISTINCT FROM NEW.booking_id AND daterange(hold_from,hold_to,'[)')&&daterange(NEW.starts_on,NEW.move_out_on,'[)')) THEN RAISE EXCEPTION 'room_is_reserved' USING ERRCODE='23514'; END IF;
 END IF;
 IF NEW.booking_id IS NOT NULL THEN
  SELECT * INTO b FROM bookings WHERE id=NEW.booking_id;
  IF b.kind IS DISTINCT FROM 'viewing' OR b.user_id IS DISTINCT FROM NEW.user_id OR b.room_id IS DISTINCT FROM NEW.room_id OR b.status IN ('rejected','cancelled') THEN RAISE EXCEPTION 'booking_mismatch' USING ERRCODE='23514'; END IF;
 END IF;
 PERFORM unique_json_keys(NEW.versions,'id');
 PERFORM unique_json_keys(NEW.versions,'versionNo');
 IF (SELECT count(*) FROM jsonb_array_elements(NEW.versions) x WHERE nullif(x->>'signedAt','') IS NULL)>1 THEN RAISE EXCEPTION 'one_draft_version' USING ERRCODE='23514'; END IF;
 FOR v IN SELECT value FROM jsonb_array_elements(NEW.versions) LOOP
  PERFORM require_json_fields(v,ARRAY['effectiveFrom','endsOn','requiredDeposit','invoiceDay','dueAfterDays','termsText','rates','fileIds']);
  IF NOT v ?& ARRAY['effectiveFrom','endsOn','requiredDeposit','invoiceDay','dueAfterDays','termsText','rates','fileIds'] OR
   (v->>'versionNo')::int<1 OR (v->>'endsOn')::date<=(v->>'effectiveFrom')::date OR
   (v->>'requiredDeposit')::numeric<0 OR (v->>'invoiceDay')::int NOT BETWEEN 1 AND 31 OR
   (v->>'dueAfterDays')::int NOT BETWEEN 0 AND 365 OR jsonb_typeof(v->'rates') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'invalid_contract_version' USING ERRCODE='23514'; END IF;
  PERFORM validate_rates(v->'rates');
  PERFORM require_files(v->'fileIds');
  IF nullif(v->>'signedAt','') IS NOT NULL THEN
   -- Bản đã ký giữ nguyên người ký dù tài khoản đó chuyển role về sau.
   IF TG_OP='INSERT' OR NOT OLD.versions @> jsonb_build_array(v) THEN
    PERFORM require_admin((v->>'signedBy')::uuid);
   END IF;
   IF jsonb_array_length(v->'fileIds')=0 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v->'rates') x WHERE x->>'category'='rent' AND (x->>'unitPrice')::numeric>0) THEN RAISE EXCEPTION 'signed_version_needs_file_and_rent' USING ERRCODE='23514'; END IF;
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.versions) a,jsonb_array_elements(NEW.versions) b
 WHERE (a->>'versionNo')::int<(b->>'versionNo')::int AND nullif(a->>'signedAt','') IS NOT NULL AND nullif(b->>'signedAt','') IS NOT NULL
 AND daterange((a->>'effectiveFrom')::date,(a->>'endsOn')::date,'[)')&&daterange((b->>'effectiveFrom')::date,(b->>'endsOn')::date,'[)')) THEN RAISE EXCEPTION 'overlapping_contract_versions' USING ERRCODE='23514'; END IF;
 SELECT value INTO latest FROM jsonb_array_elements(NEW.versions) WHERE nullif(value->>'signedAt','') IS NOT NULL ORDER BY (value->>'versionNo')::int DESC LIMIT 1;
 IF latest IS NOT NULL THEN NEW.ends_on=(latest->>'endsOn')::date; NEW.required_deposit=(latest->>'requiredDeposit')::numeric; END IF;
 IF NEW.status='active' AND NEW.onboarding_mode='new' AND latest IS NULL THEN RAISE EXCEPTION 'new_checkin_needs_signed_contract' USING ERRCODE='23514'; END IF;
 PERFORM require_files(NEW.attachments);
 PERFORM unique_json_keys(NEW.occupants,'userId');
 FOR person IN SELECT value FROM jsonb_array_elements(NEW.occupants) LOOP
  PERFORM require_json_fields(person,ARRAY['userId','joinedOn']);
  PERFORM require_customer((person->>'userId')::uuid);
  IF person->>'userId'=NEW.user_id::text OR NOT person ? 'joinedOn' OR (person->>'joinedOn')::date<NEW.starts_on OR
   (person->>'leftOn')::date<(person->>'joinedOn')::date OR
   ((person->>'leftOn')::date=(person->>'joinedOn')::date AND NEW.status<>'ended') THEN RAISE EXCEPTION 'invalid_contract_occupant' USING ERRCODE='23514'; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.occupants) point WHERE
  1+(SELECT count(*) FROM jsonb_array_elements(NEW.occupants) p WHERE daterange((p->>'joinedOn')::date,(p->>'leftOn')::date,'[)') @> (point->>'joinedOn')::date)>r.capacity) THEN RAISE EXCEPTION 'room_capacity_exceeded' USING ERRCODE='23514'; END IF;
 PERFORM validate_reading_snapshot(NEW.initial_readings); PERFORM validate_reading_snapshot(NEW.final_readings);
 IF NEW.status='active' AND NEW.onboarding_mode='new' AND EXISTS(
  SELECT 1 FROM jsonb_array_elements(latest->'rates') x WHERE x->>'method'='metered' AND x->>'category' IN ('electricity','water') AND NOT NEW.initial_readings ? (x->>'category')) THEN RAISE EXCEPTION 'checkin_needs_initial_readings' USING ERRCODE='23514'; END IF;
 IF NEW.status='cancelled' AND (latest IS NOT NULL OR EXISTS(SELECT 1 FROM invoices WHERE contract_id=NEW.id) OR EXISTS(SELECT 1 FROM payments WHERE contract_id=NEW.id)) THEN RAISE EXCEPTION 'cannot_cancel_contract_with_documents' USING ERRCODE='23514'; END IF;
 NEW.updated_at=now(); RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION guard_invoice() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
DECLARE c contracts; x jsonb; total numeric; k text; start_value numeric; end_value numeric; from_at timestamptz; to_at timestamptz; previous_value numeric; previous_at timestamptz; version jsonb;
BEGIN
 SELECT * INTO c FROM contracts WHERE id=coalesce(NEW.contract_id,OLD.contract_id);
 PERFORM lock_customer(c.user_id);
 IF TG_OP='DELETE' THEN
  IF OLD.status<>'draft' THEN RAISE EXCEPTION 'issued_invoice_cannot_delete' USING ERRCODE='23514'; END IF;
  PERFORM require_open_period(OLD.period_id); RETURN OLD;
 END IF;
 PERFORM require_open_period(NEW.period_id);
 IF NEW.period_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM billing_periods p JOIN rooms r ON r.property_id=p.property_id WHERE p.id=NEW.period_id AND r.id=c.room_id) THEN RAISE EXCEPTION 'invoice_period_mismatch' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.contract_id<>OLD.contract_id THEN RAISE EXCEPTION 'invoice_contract_is_immutable' USING ERRCODE='23514'; END IF;
  IF OLD.status<>'draft' THEN
   IF OLD.status<>'issued' OR NEW.status<>'void' OR (to_jsonb(NEW)-'status'-'voided_at'-'void_reason'-'total_amount') IS DISTINCT FROM (to_jsonb(OLD)-'status'-'voided_at'-'void_reason'-'total_amount') THEN RAISE EXCEPTION 'issued_invoice_is_immutable' USING ERRCODE='23514'; END IF;
   IF EXISTS(SELECT 1 FROM v_invoice_balances WHERE id=OLD.id AND paid_amount<>0) OR EXISTS(SELECT 1 FROM invoices WHERE adjusts_invoice_id=OLD.id AND status='issued') THEN RAISE EXCEPTION 'release_payments_and_adjustments_before_void' USING ERRCODE='23514'; END IF;
  END IF;
  IF ROW(NEW.electricity_start,NEW.electricity_end,NEW.electricity_from_at,NEW.electricity_to_at,NEW.water_start,NEW.water_end,NEW.water_from_at,NEW.water_to_at)
   IS DISTINCT FROM ROW(OLD.electricity_start,OLD.electricity_end,OLD.electricity_from_at,OLD.electricity_to_at,OLD.water_start,OLD.water_end,OLD.water_from_at,OLD.water_to_at) THEN
   IF (OLD.electricity_end IS NOT NULL OR OLD.water_end IS NOT NULL) AND nullif(btrim(NEW.correction_reason),'') IS NULL THEN RAISE EXCEPTION 'reading_correction_needs_reason' USING ERRCODE='23514'; END IF;
   NEW.readings_history=OLD.readings_history||jsonb_build_array(jsonb_build_object('at',now(),'electricityStart',OLD.electricity_start,'electricityEnd',OLD.electricity_end,'waterStart',OLD.water_start,'waterEnd',OLD.water_end,'reason',NEW.correction_reason,'actorId',request_user_id()));
  END IF;
 END IF;
 PERFORM unique_json_keys(NEW.lines,'id');
 FOR x IN SELECT value FROM jsonb_array_elements(NEW.lines) LOOP
  PERFORM require_json_fields(x,ARRAY['code','category','description','unit','quantity','unitPrice']);
  IF NOT x ?& ARRAY['code','category','description','unit','quantity','unitPrice'] OR
   jsonb_typeof(x->'quantity') IS DISTINCT FROM 'number' OR jsonb_typeof(x->'unitPrice') IS DISTINCT FROM 'number' OR
   (x->>'quantity')::numeric<0 OR (x->>'unitPrice')::numeric<0 OR (x->>'unitPrice')::numeric<>trunc((x->>'unitPrice')::numeric) OR
   coalesce((x->>'sign')::int,1) NOT IN (-1,1) OR coalesce((x->>'denominator')::int,1)<=0 OR coalesce((x->>'numerator')::int,1)<0 OR
   x->>'category' NOT IN ('rent','electricity','water','service','other') THEN RAISE EXCEPTION 'invalid_invoice_line' USING ERRCODE='23514'; END IF;
 END LOOP;
 IF NEW.adjusts_invoice_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM invoices WHERE id=NEW.adjusts_invoice_id AND contract_id=NEW.contract_id AND status='issued' AND adjusts_invoice_id IS NULL) THEN RAISE EXCEPTION 'invalid_adjustment_target' USING ERRCODE='23514'; END IF;
 IF NEW.status='issued' AND (TG_OP='INSERT' OR OLD.status='draft') THEN
  PERFORM require_admin(NEW.issued_by);
  IF NEW.kind<>'opening_balance' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c.versions) v WHERE nullif(v->>'signedAt','') IS NOT NULL) THEN RAISE EXCEPTION 'signed_contract_required' USING ERRCODE='23514'; END IF;
  total=invoice_total(NEW.lines);
  IF (jsonb_array_length(NEW.lines)=0 AND NOT(NEW.kind='final' AND NEW.metered_only)) OR (NEW.kind='credit_adjustment' AND total>=0) OR (NEW.kind<>'credit_adjustment' AND total<0) THEN RAISE EXCEPTION 'invalid_invoice_total' USING ERRCODE='23514'; END IF;
  IF NEW.metered_only AND EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.lines) x WHERE x->>'category' NOT IN ('electricity','water')) THEN RAISE EXCEPTION 'metered_final_cannot_charge_rent' USING ERRCODE='23514'; END IF;
  IF NEW.adjusts_invoice_id IS NULL THEN
   IF EXISTS(SELECT x->>'code' FROM jsonb_array_elements(NEW.lines) x WHERE coalesce((x->>'oneTime')::boolean,false) GROUP BY x->>'code' HAVING count(*)>1) THEN RAISE EXCEPTION 'duplicate_one_time_charge' USING ERRCODE='23514'; END IF;
   FOREACH k IN ARRAY ARRAY['electricity','water'] LOOP
    start_value=(to_jsonb(NEW)->>(k||'_start'))::numeric; end_value=(to_jsonb(NEW)->>(k||'_end'))::numeric;
    from_at=(to_jsonb(NEW)->>(k||'_from_at'))::timestamptz; to_at=(to_jsonb(NEW)->>(k||'_to_at'))::timestamptz;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.lines) x WHERE x->>'category'=k) OR end_value IS NOT NULL THEN
     IF end_value IS NULL OR (SELECT sum((x->>'quantity')::numeric) FROM jsonb_array_elements(NEW.lines) x WHERE x->>'category'=k) IS DISTINCT FROM end_value-start_value THEN RAISE EXCEPTION 'invoice_reading_quantity_mismatch' USING ERRCODE='23514'; END IF;
     IF EXISTS(SELECT 1 FROM invoices other WHERE other.id<>NEW.id AND other.contract_id=NEW.contract_id AND other.status='issued' AND other.adjusts_invoice_id IS NULL
      AND (to_jsonb(other)->>(k||'_end')) IS NOT NULL
      AND tstzrange(from_at,to_at,'[)')&&tstzrange((to_jsonb(other)->>(k||'_from_at'))::timestamptz,(to_jsonb(other)->>(k||'_to_at'))::timestamptz,'[)')) THEN RAISE EXCEPTION 'consumption_already_billed' USING ERRCODE='23514'; END IF;
     SELECT (to_jsonb(i)->>(k||'_end'))::numeric,(to_jsonb(i)->>(k||'_to_at'))::timestamptz INTO previous_value,previous_at
      FROM invoices i WHERE i.contract_id=NEW.contract_id AND i.id<>NEW.id AND i.status='issued' AND i.adjusts_invoice_id IS NULL
      AND (to_jsonb(i)->>(k||'_to_at'))::timestamptz<=from_at ORDER BY (to_jsonb(i)->>(k||'_to_at'))::timestamptz DESC LIMIT 1;
     IF previous_value IS NULL THEN previous_value=(c.initial_readings->k->>'value')::numeric; previous_at=(c.initial_readings->k->>'observedAt')::timestamptz; END IF;
     IF previous_value IS NULL OR start_value IS DISTINCT FROM previous_value OR from_at IS DISTINCT FROM previous_at THEN RAISE EXCEPTION 'reading_start_mismatch' USING ERRCODE='23514'; END IF;
    END IF;
   END LOOP;
   SELECT value INTO version FROM jsonb_array_elements(c.versions) WHERE nullif(value->>'signedAt','') IS NOT NULL AND (value->>'effectiveFrom')::date<=NEW.service_from ORDER BY (value->>'versionNo')::int DESC LIMIT 1;
   IF NEW.kind IN ('periodic','final') AND EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(version->'rates','[]')) rate
    WHERE rate->>'method'='metered' AND rate->>'category' IN ('electricity','water') AND to_jsonb(NEW)->>((rate->>'category')||'_end') IS NULL) THEN RAISE EXCEPTION 'invoice_needs_all_readings' USING ERRCODE='23514'; END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.lines) x JOIN invoices other ON other.contract_id=NEW.contract_id AND other.id<>NEW.id AND other.status='issued' AND other.adjusts_invoice_id IS NULL
    CROSS JOIN LATERAL jsonb_array_elements(other.lines) y WHERE coalesce((x->>'oneTime')::boolean,false) AND coalesce((y->>'oneTime')::boolean,false) AND x->>'code'=y->>'code') THEN RAISE EXCEPTION 'one_time_charge_already_billed' USING ERRCODE='23514'; END IF;
  END IF;
 END IF; RETURN NEW;
END $$;
COMMIT;
