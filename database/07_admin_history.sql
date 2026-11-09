-- Preserve historical administrators when the single owner account changes.
-- Safe to rerun. No tables or business rows are created/deleted by this migration.
-- Definitions match the current baseline in 02_rules.sql.
BEGIN;
SET LOCAL search_path=smartrent,public;
SET LOCAL lock_timeout='10s';

CREATE OR REPLACE FUNCTION smartrent.guard_booking() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
DECLARE x jsonb; rid uuid; c contracts;
BEGIN
 PERFORM require_customer(NEW.user_id);
 IF TG_OP='UPDATE' AND (NEW.user_id<>OLD.user_id OR NEW.kind<>OLD.kind OR NEW.room_id IS DISTINCT FROM OLD.room_id OR NEW.contract_id IS DISTINCT FROM OLD.contract_id) THEN
  RAISE EXCEPTION 'booking_identity_is_immutable' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND OLD.kind<>'viewing' AND OLD.status<>'pending' THEN RAISE EXCEPTION 'closed_request_is_immutable' USING ERRCODE='23514'; END IF;
 IF NEW.kind<>'viewing' AND NEW.status NOT IN ('pending','approved','rejected','cancelled') THEN RAISE EXCEPTION 'invalid_request_status' USING ERRCODE='23514'; END IF;
 IF NEW.kind='profile_change' AND EXISTS(SELECT 1 FROM jsonb_object_keys(NEW.changes) k WHERE k NOT IN ('phone','email')) THEN
  RAISE EXCEPTION 'unsupported_profile_change_field' USING ERRCODE='23514'; END IF;
 IF NEW.contract_id IS NOT NULL THEN
  SELECT * INTO c FROM contracts WHERE id=NEW.contract_id;
  IF c.user_id IS DISTINCT FROM NEW.user_id THEN RAISE EXCEPTION 'request_not_representative' USING ERRCODE='23514'; END IF;
 END IF;
 -- Người duyệt cũ là lịch sử; chỉ xác minh role khi ghi một người duyệt mới.
 IF NEW.reviewed_by IS NOT NULL AND (TG_OP='INSERT' OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by) THEN PERFORM require_admin(NEW.reviewed_by); END IF;
 IF NEW.kind<>'viewing' AND NEW.status IN ('approved','rejected') AND NEW.reviewed_by IS NULL THEN RAISE EXCEPTION 'request_needs_reviewer' USING ERRCODE='23514'; END IF;
 PERFORM unique_json_keys(NEW.appointments,'id');
 IF NEW.kind<>'viewing' AND NEW.appointments<>'[]' THEN RAISE EXCEPTION 'appointments_require_viewing' USING ERRCODE='23514'; END IF;
 IF (SELECT count(*) FROM jsonb_array_elements(NEW.appointments) a WHERE a->>'status'='scheduled')>1 THEN RAISE EXCEPTION 'one_scheduled_appointment' USING ERRCODE='23514'; END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(NEW.appointments) LOOP
  PERFORM require_json_fields(x,ARRAY['startsAt','endsAt','status','hostId']);
  IF NOT x ?& ARRAY['startsAt','endsAt','status','hostId'] OR (x->>'endsAt')::timestamptz<=(x->>'startsAt')::timestamptz
   OR x->>'status' NOT IN ('scheduled','completed','no_show','cancelled') THEN RAISE EXCEPTION 'invalid_appointment' USING ERRCODE='23514'; END IF;
  -- Đổi chủ trọ không làm mất hiệu lực lịch cũ. Host mới vẫn phải là admin hiện tại.
  IF TG_OP='INSERT' OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(OLD.appointments) previous
    WHERE previous->>'id'=x->>'id' AND previous->>'hostId'=x->>'hostId') THEN
   PERFORM require_admin((x->>'hostId')::uuid);
  END IF;
 END LOOP;
 IF NEW.hold_status='holding' THEN
  PERFORM 1 FROM rooms WHERE id=NEW.room_id FOR UPDATE;
  IF NEW.hold_expires_at<=now() OR NOT EXISTS(SELECT 1 FROM rooms r JOIN properties p ON p.id=r.property_id WHERE r.id=NEW.room_id AND r.operating_status='available' AND p.is_active) THEN RAISE EXCEPTION 'room_not_available' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM contracts WHERE room_id=NEW.room_id AND status<>'cancelled' AND daterange(starts_on,move_out_on,'[)')&&daterange(NEW.hold_from,NEW.hold_to,'[)')) THEN RAISE EXCEPTION 'room_is_occupied' USING ERRCODE='23514'; END IF;
 END IF;
 IF TG_OP='UPDATE' AND (NEW.status<>OLD.status OR NEW.hold_status IS DISTINCT FROM OLD.hold_status OR NEW.appointments<>OLD.appointments) THEN
  NEW.history=OLD.history||jsonb_build_array(jsonb_build_object('at',now(),'status',NEW.status,'holdStatus',NEW.hold_status,'notes',NEW.decision_notes,'actorId',request_user_id()));
 END IF;
 NEW.updated_at=now(); RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION smartrent.guard_contract() RETURNS trigger LANGUAGE plpgsql AS $$
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
   (person->>'leftOn')::date<=(person->>'joinedOn')::date THEN RAISE EXCEPTION 'invalid_contract_occupant' USING ERRCODE='23514'; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.occupants) point WHERE
  1+(SELECT count(*) FROM jsonb_array_elements(NEW.occupants) p WHERE daterange((p->>'joinedOn')::date,(p->>'leftOn')::date,'[)') @> (point->>'joinedOn')::date)>r.capacity) THEN RAISE EXCEPTION 'room_capacity_exceeded' USING ERRCODE='23514'; END IF;
 PERFORM validate_reading_snapshot(NEW.initial_readings); PERFORM validate_reading_snapshot(NEW.final_readings);
 IF NEW.status='active' AND NEW.onboarding_mode='new' AND EXISTS(
  SELECT 1 FROM jsonb_array_elements(latest->'rates') x WHERE x->>'method'='metered' AND x->>'category' IN ('electricity','water') AND NOT NEW.initial_readings ? (x->>'category')) THEN RAISE EXCEPTION 'checkin_needs_initial_readings' USING ERRCODE='23514'; END IF;
 IF NEW.status='cancelled' AND (latest IS NOT NULL OR EXISTS(SELECT 1 FROM invoices WHERE contract_id=NEW.id) OR EXISTS(SELECT 1 FROM payments WHERE contract_id=NEW.id)) THEN RAISE EXCEPTION 'cannot_cancel_contract_with_documents' USING ERRCODE='23514'; END IF;
 NEW.updated_at=now(); RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION smartrent.guard_period() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
 IF NEW.locked_by IS NOT NULL AND (TG_OP='INSERT' OR NEW.locked_by IS DISTINCT FROM OLD.locked_by) THEN PERFORM require_admin(NEW.locked_by); END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.property_id<>OLD.property_id OR NEW.month_start<>OLD.month_start THEN RAISE EXCEPTION 'period_identity_is_immutable' USING ERRCODE='23514'; END IF;
  IF OLD.status='locked' AND NEW.status='open' AND nullif(btrim(NEW.unlock_reason),'') IS NULL THEN RAISE EXCEPTION 'unlock_reason_required' USING ERRCODE='23514'; END IF;
  IF NEW.status<>OLD.status THEN NEW.history=OLD.history||jsonb_build_array(jsonb_build_object('at',now(),'status',NEW.status,'reason',NEW.unlock_reason,'actorId',request_user_id())); END IF;
 END IF; RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION smartrent.guard_ticket() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
DECLARE x jsonb; previous jsonb;
BEGIN
 IF NEW.assigned_to IS NOT NULL AND (TG_OP='INSERT' OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to) THEN PERFORM require_admin(NEW.assigned_to); END IF;
 IF NEW.contract_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM contracts WHERE id=NEW.contract_id AND room_id=NEW.room_id) THEN RAISE EXCEPTION 'ticket_room_mismatch' USING ERRCODE='23514'; END IF;
 PERFORM require_files(NEW.attachment_file_ids);
 PERFORM unique_json_keys(NEW.messages,'id');
 FOR x IN SELECT value FROM jsonb_array_elements(NEW.messages) LOOP
  PERFORM require_json_fields(x,ARRAY['authorId','body','createdAt','isInternal']);
  PERFORM (x->>'createdAt')::timestamptz;
  IF jsonb_typeof(x->'isInternal') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'invalid_ticket_message' USING ERRCODE='23514'; END IF;
  IF NOT x ?& ARRAY['authorId','body','createdAt','isInternal'] OR nullif(btrim(x->>'body'),'') IS NULL OR NOT EXISTS(SELECT 1 FROM users WHERE id=(x->>'authorId')::uuid) THEN RAISE EXCEPTION 'invalid_ticket_message' USING ERRCODE='23514'; END IF;
  -- Ghi chú nội bộ cũ là append-only, không xét lại role tác giả sau chuyển chủ trọ.
  IF (x->>'isInternal')::boolean AND (TG_OP='INSERT' OR NOT OLD.messages @> jsonb_build_array(x)) THEN
   PERFORM require_admin((x->>'authorId')::uuid);
  END IF;
  PERFORM require_files(coalesce(x->'fileIds','[]'));
 END LOOP;
 IF TG_OP='UPDATE' THEN
  IF NEW.room_id<>OLD.room_id OR NEW.contract_id IS DISTINCT FROM OLD.contract_id OR NEW.reported_by<>OLD.reported_by THEN RAISE EXCEPTION 'ticket_identity_is_immutable' USING ERRCODE='23514'; END IF;
  FOR previous IN SELECT value FROM jsonb_array_elements(OLD.messages) LOOP
   IF NOT NEW.messages @> jsonb_build_array(previous) THEN RAISE EXCEPTION 'ticket_messages_are_append_only' USING ERRCODE='23514'; END IF;
  END LOOP;
  IF NEW.status<>OLD.status OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
   OR (current_setting('smartrent.ticket_action',true)='assign'
       AND nullif(current_setting('smartrent.ticket_reason',true),'') IS NOT NULL) THEN
   -- GUC LOCAL do API đặt trong transaction: giữ lý do chờ/mở lại và không tạo event trùng.
   NEW.history=OLD.history||jsonb_build_array(jsonb_build_object(
    'id',gen_random_uuid(),'kind',CASE WHEN current_setting('smartrent.ticket_action',true)='reopen' THEN 'reopen'
      WHEN current_setting('smartrent.ticket_action',true)='assign' THEN 'assign' ELSE 'status' END,
    'at',now(),'from',OLD.status,'to',NEW.status,'assignedTo',NEW.assigned_to,'actorId',request_user_id(),
    'reason',nullif(current_setting('smartrent.ticket_reason',true),'')));
  END IF;
 END IF;
 NEW.updated_at=now(); RETURN NEW;
END $$;

COMMIT;
