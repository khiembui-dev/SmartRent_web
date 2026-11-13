BEGIN;
SET search_path=smartrent,public;
CREATE SEQUENCE document_codes;
CREATE FUNCTION next_code(prefix text) RETURNS text LANGUAGE sql VOLATILE AS $$
 SELECT prefix||'-'||lpad(nextval('smartrent.document_codes')::text,8,'0')
$$;
CREATE FUNCTION request_user_id() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT nullif(current_setting('smartrent.user_id',true),'')::uuid
$$;
CREATE FUNCTION require_admin(uid uuid) RETURNS void LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN IF NOT EXISTS(SELECT 1 FROM users WHERE id=uid AND role='admin' AND is_active) THEN
 RAISE EXCEPTION 'admin_required' USING ERRCODE='23514'; END IF; END $$;
CREATE FUNCTION require_customer(uid uuid) RETURNS void LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN PERFORM 1 FROM users WHERE id=uid AND role='user' FOR KEY SHARE;
IF NOT FOUND THEN
 RAISE EXCEPTION 'customer_required' USING ERRCODE='23514'; END IF; END $$;
CREATE FUNCTION lock_customer(uid uuid) RETURNS void LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN PERFORM 1 FROM users WHERE id=uid FOR NO KEY UPDATE; END $$;
CREATE FUNCTION require_files(ids jsonb, public_only boolean DEFAULT false) RETURNS void LANGUAGE plpgsql AS $$
#variable_conflict use_column
DECLARE v jsonb; f files;
BEGIN
 IF jsonb_typeof(ids) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'file_ids_must_be_array' USING ERRCODE='23514'; END IF;
 FOR v IN SELECT value FROM jsonb_array_elements(ids) LOOP
  SELECT * INTO f FROM files WHERE id=(v#>>'{}')::uuid FOR SHARE;
  IF f.id IS NULL OR f.scan_status<>'clean' OR (public_only AND f.visibility<>'public') OR (NOT public_only AND f.visibility<>'private') THEN
   RAISE EXCEPTION 'invalid_file_reference' USING ERRCODE='23514'; END IF;
 END LOOP;
END $$;
CREATE FUNCTION unique_json_keys(items jsonb, key_name text) RETURNS void LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(items) x WHERE jsonb_typeof(x)<>'object' OR nullif(x->>key_name,'') IS NULL)
 OR (SELECT count(*)<>count(DISTINCT x->>key_name) FROM jsonb_array_elements(items) x) THEN
  RAISE EXCEPTION 'invalid_or_duplicate_json_key: %',key_name USING ERRCODE='23514'; END IF;
END $$;
CREATE FUNCTION require_json_fields(item jsonb, fields text[]) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR EXISTS(
  SELECT 1 FROM unnest(fields) k WHERE NOT item ? k OR item->k='null'::jsonb OR nullif(btrim(item->>k),'') IS NULL
 ) THEN RAISE EXCEPTION 'missing_json_field' USING ERRCODE='23514'; END IF;
END $$;
CREATE FUNCTION validate_rates(items jsonb) RETURNS void LANGUAGE plpgsql AS $$
#variable_conflict use_column
DECLARE x jsonb;
BEGIN
 PERFORM unique_json_keys(items,'id');
 FOR x IN SELECT value FROM jsonb_array_elements(items) LOOP
  PERFORM require_json_fields(x,ARRAY['code','name','unit','category','method','cycle','unitPrice','effectiveFrom']);
  IF NOT x ?& ARRAY['id','code','name','unit','category','method','cycle','unitPrice','effectiveFrom']
    OR jsonb_typeof(x->'unitPrice') IS DISTINCT FROM 'number'
    OR (x->>'unitPrice')::numeric<0 OR (x->>'unitPrice')::numeric<>trunc((x->>'unitPrice')::numeric)
    OR x->>'category' NOT IN ('rent','electricity','water','service','other')
    OR x->>'method' NOT IN ('fixed','metered','per_person','per_quantity')
    OR x->>'cycle' NOT IN ('monthly','once')
    OR nullif(x->>'effectiveFrom','') IS NULL
    OR (x->>'effectiveTo')::date<=(x->>'effectiveFrom')::date THEN
   RAISE EXCEPTION 'invalid_rate' USING ERRCODE='23514'; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(items) a,jsonb_array_elements(items) b
 WHERE a->>'id'<b->>'id' AND a->>'code'=b->>'code'
 AND daterange((a->>'effectiveFrom')::date,(a->>'effectiveTo')::date,'[)') &&
     daterange((b->>'effectiveFrom')::date,(b->>'effectiveTo')::date,'[)')) THEN
  RAISE EXCEPTION 'overlapping_rates' USING ERRCODE='23514'; END IF;
END $$;
CREATE FUNCTION protect_user() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.role='admin' THEN RAISE EXCEPTION 'cannot_delete_admin' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM contracts c,jsonb_array_elements(c.occupants) x WHERE x->>'userId'=OLD.id::text) THEN
   RAISE EXCEPTION 'user_is_contract_occupant' USING ERRCODE='23514'; END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.role<>OLD.role THEN RAISE EXCEPTION 'role_is_immutable' USING ERRCODE='23514'; END IF;
  IF NEW.password_hash IS DISTINCT FROM OLD.password_hash OR NOT NEW.is_active OR NOT NEW.login_enabled THEN
   NEW.security_stamp=gen_random_uuid();
   UPDATE auth_tokens SET revoked_at=coalesce(revoked_at,now()) WHERE user_id=OLD.id;
  END IF;
 END IF;
 NEW.updated_at=now(); RETURN NEW;
END $$;
CREATE TRIGGER protect_user BEFORE UPDATE OR DELETE ON users FOR EACH ROW EXECUTE FUNCTION protect_user();

CREATE FUNCTION guard_catalog() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
DECLARE img jsonb; changes boolean;
BEGIN
 PERFORM validate_rates(NEW.rates);
 IF TG_TABLE_NAME='properties' THEN
  PERFORM unique_json_keys(NEW.amenity_options,'code');
  IF NOT NEW.is_active AND EXISTS(SELECT 1 FROM contracts c JOIN rooms r ON r.id=c.room_id WHERE r.property_id=NEW.id AND c.status IN ('active','planned')) THEN
   RAISE EXCEPTION 'property_has_occupants' USING ERRCODE='23514'; END IF;
 ELSE
  PERFORM 1 FROM properties WHERE id=NEW.property_id FOR UPDATE;
  -- Chuyển phòng sang cơ sở khác chỉ khi phòng chưa từng có hợp đồng: hóa đơn và kỳ tính tiền đã gắn với cơ sở cũ.
  IF TG_OP='UPDATE' AND NEW.property_id<>OLD.property_id AND EXISTS(SELECT 1 FROM contracts WHERE room_id=NEW.id AND status<>'cancelled') THEN
   RAISE EXCEPTION 'room_property_locked_by_contracts' USING ERRCODE='23514'; END IF;
  -- Phòng đang có hợp đồng hiệu lực hoặc sắp vào ở thì tin tạm ẩn; sync_room_listing công khai lại khi trả phòng.
  IF NEW.listing_status='published' AND (TG_OP='INSERT' OR OLD.listing_status IS DISTINCT FROM 'published')
   AND EXISTS(SELECT 1 FROM contracts WHERE room_id=NEW.id AND status IN ('active','planned')) THEN
   RAISE EXCEPTION 'room_occupied_cannot_publish' USING ERRCODE='23514'; END IF;
  PERFORM unique_json_keys(NEW.amenities,'code');
  PERFORM unique_json_keys(NEW.images,'fileId');
  IF (SELECT count(*) FROM jsonb_array_elements(NEW.images) x WHERE coalesce((x->>'isCover')::boolean,false))>1 THEN
   RAISE EXCEPTION 'one_cover_image' USING ERRCODE='23514'; END IF;
  FOR img IN SELECT value FROM jsonb_array_elements(NEW.images) LOOP
   PERFORM require_files(jsonb_build_array(img->>'fileId'),true);
   IF coalesce((img->>'sortOrder')::int,0)<0 THEN RAISE EXCEPTION 'invalid_image_order' USING ERRCODE='23514'; END IF;
  END LOOP;
  -- Ảnh có thể bổ sung sau. Trang khách hiển thị khung chưa có ảnh khi tin đã đăng.
  -- Các ảnh được gắn vào phòng vẫn phải qua require_files ở phía trên.
  IF NEW.operating_status<>'available' AND EXISTS(SELECT 1 FROM contracts WHERE room_id=NEW.id AND status IN ('active','planned')) THEN
   RAISE EXCEPTION 'room_has_occupants' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND NEW.operating_status<>OLD.operating_status THEN
   NEW.status_history=OLD.status_history||jsonb_build_array(jsonb_build_object('at',now(),'from',OLD.operating_status,'to',NEW.operating_status,'reason',NEW.status_reason,'actorId',request_user_id()));
  END IF;
 END IF;
 NEW.updated_at=now(); RETURN NEW;
END $$;
CREATE TRIGGER catalog_property BEFORE INSERT OR UPDATE ON properties FOR EACH ROW EXECUTE FUNCTION guard_catalog();
CREATE TRIGGER catalog_room BEFORE INSERT OR UPDATE ON rooms FOR EACH ROW EXECUTE FUNCTION guard_catalog();

CREATE FUNCTION expire_holds() RETURNS void LANGUAGE sql AS $$
 UPDATE bookings SET hold_status='expired' WHERE hold_status='holding' AND hold_expires_at<=now()
$$;
CREATE FUNCTION guard_booking() RETURNS trigger LANGUAGE plpgsql AS $$
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
CREATE TRIGGER booking_guard BEFORE INSERT OR UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION guard_booking();

CREATE FUNCTION validate_reading_snapshot(value jsonb) RETURNS void LANGUAGE plpgsql AS $$
#variable_conflict use_column
DECLARE x jsonb;
BEGIN
 FOR x IN SELECT v FROM jsonb_each(value) e(k,v) LOOP
  PERFORM require_json_fields(x,ARRAY['value','observedAt']);
  IF NOT x ?& ARRAY['value','observedAt'] OR jsonb_typeof(x->'value') IS DISTINCT FROM 'number' OR (x->>'value')::numeric<0 OR nullif(x->>'observedAt','') IS NULL THEN RAISE EXCEPTION 'invalid_reading_snapshot' USING ERRCODE='23514'; END IF;
  PERFORM (x->>'observedAt')::timestamptz;
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(value) k WHERE k NOT IN ('electricity','water')) THEN RAISE EXCEPTION 'invalid_reading_kind' USING ERRCODE='23514'; END IF;
END $$;
CREATE FUNCTION guard_contract() RETURNS trigger LANGUAGE plpgsql AS $$
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
CREATE TRIGGER contract_guard BEFORE INSERT OR UPDATE OR DELETE ON contracts FOR EACH ROW EXECUTE FUNCTION guard_contract();
CREATE FUNCTION link_booking() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
 IF NEW.booking_id IS NOT NULL AND NEW.status<>'cancelled' THEN UPDATE bookings SET status='converted',hold_status=CASE WHEN hold_status IS NOT NULL THEN 'converted' END WHERE id=NEW.booking_id; END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER contract_booking AFTER INSERT ON contracts FOR EACH ROW EXECUTE FUNCTION link_booking();
-- Tin đăng đi theo hợp đồng: có hợp đồng hiệu lực/sắp vào ở thì tạm ẩn; trả phòng hoặc hủy mà phòng trống lại thì công khai.
-- Chỉ công khai khi phòng còn khai thác, cơ sở hoạt động và có giá thuê > 0; tiêu đề/slug trống thì dùng mặc định như API.
CREATE FUNCTION sync_room_listing() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
DECLARE r rooms; p properties;
BEGIN
 IF NEW.status IN ('active','planned') AND (TG_OP='INSERT' OR OLD.status NOT IN ('active','planned')) THEN
  UPDATE rooms SET listing_status='hidden' WHERE id=NEW.room_id AND listing_status<>'hidden';
 ELSIF TG_OP='UPDATE' AND NEW.status IN ('ended','cancelled') AND OLD.status IN ('active','planned')
  AND NOT EXISTS(SELECT 1 FROM contracts WHERE room_id=NEW.room_id AND id<>NEW.id AND status IN ('active','planned')) THEN
  SELECT * INTO r FROM rooms WHERE id=NEW.room_id;
  SELECT * INTO p FROM properties WHERE id=r.property_id;
  IF r.operating_status='available' AND p.is_active AND EXISTS(SELECT 1 FROM jsonb_array_elements(r.rates||p.rates) x
   WHERE x->>'category'='rent' AND (x->>'unitPrice')::numeric>0 AND (nullif(x->>'effectiveTo','') IS NULL OR (x->>'effectiveTo')::date>current_date)) THEN
   UPDATE rooms SET listing_status='published',published_at=now(),
    listing_slug=coalesce(listing_slug,'phong-'||lower(code)||'-'||substr(id::text,1,8)),
    listing_title=coalesce(nullif(btrim(listing_title),''),name||' – '||p.name)
   WHERE id=r.id;
  END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER contract_listing_sync AFTER INSERT OR UPDATE OF status ON contracts FOR EACH ROW EXECUTE FUNCTION sync_room_listing();

CREATE FUNCTION guard_period() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
 IF NEW.locked_by IS NOT NULL AND (TG_OP='INSERT' OR NEW.locked_by IS DISTINCT FROM OLD.locked_by) THEN PERFORM require_admin(NEW.locked_by); END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.property_id<>OLD.property_id OR NEW.month_start<>OLD.month_start THEN RAISE EXCEPTION 'period_identity_is_immutable' USING ERRCODE='23514'; END IF;
  IF OLD.status='locked' AND NEW.status='open' AND nullif(btrim(NEW.unlock_reason),'') IS NULL THEN RAISE EXCEPTION 'unlock_reason_required' USING ERRCODE='23514'; END IF;
  IF NEW.status<>OLD.status THEN NEW.history=OLD.history||jsonb_build_array(jsonb_build_object('at',now(),'status',NEW.status,'reason',NEW.unlock_reason,'actorId',request_user_id())); END IF;
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER period_guard BEFORE INSERT OR UPDATE ON billing_periods FOR EACH ROW EXECUTE FUNCTION guard_period();
CREATE FUNCTION require_open_period(pid uuid) RETURNS void LANGUAGE plpgsql AS $$
#variable_conflict use_column
DECLARE state text;
BEGIN
 IF pid IS NOT NULL THEN
  SELECT status INTO state FROM billing_periods WHERE id=pid FOR UPDATE;
  IF state IS DISTINCT FROM 'open' THEN RAISE EXCEPTION 'billing_period_locked' USING ERRCODE='23514'; END IF;
 END IF;
END $$;

CREATE VIEW v_invoice_balances AS
 SELECT i.id,i.contract_id,i.status,i.total_amount,
 (CASE WHEN i.status='issued' AND i.adjusts_invoice_id IS NULL THEN i.total_amount+coalesce(adj.amount,0) ELSE 0 END)::numeric(16,0) receivable_amount,
 coalesce(paid.amount,0)::numeric(16,0) paid_amount,
 (CASE WHEN i.status='issued' AND i.adjusts_invoice_id IS NULL THEN i.total_amount+coalesce(adj.amount,0) ELSE 0 END-coalesce(paid.amount,0))::numeric(16,0) outstanding_amount,
 CASE WHEN i.status<>'issued' OR i.adjusts_invoice_id IS NOT NULL THEN NULL WHEN coalesce(paid.amount,0)>=i.total_amount+coalesce(adj.amount,0) THEN 'paid' WHEN coalesce(paid.amount,0)=0 THEN 'unpaid' ELSE 'partial' END payment_status,
 (i.status='issued' AND i.adjusts_invoice_id IS NULL AND i.due_on<(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AND i.total_amount+coalesce(adj.amount,0)>coalesce(paid.amount,0)) is_overdue
 FROM invoices i
 LEFT JOIN LATERAL(SELECT sum(total_amount) amount FROM invoices WHERE adjusts_invoice_id=i.id AND status='issued') adj ON true
 LEFT JOIN LATERAL(SELECT sum((a->>'amount')::numeric*CASE WHEN p.kind IN ('receipt_reversal','deposit_offset_reversal') THEN -1 ELSE 1 END) amount
 FROM payments p CROSS JOIN LATERAL jsonb_array_elements(p.allocations) a WHERE p.status='confirmed' AND a->>'invoiceId'=i.id::text) paid ON true;
CREATE VIEW v_deposit_balances AS
 SELECT c.id contract_id,
 coalesce(sum(CASE WHEN p.kind IN ('deposit_receipt','deposit_offset_reversal') THEN p.amount ELSE -p.amount END),0)::numeric(16,0) held,
 coalesce(sum(p.amount) FILTER(WHERE p.kind='deposit_receipt'),0)::numeric(16,0) received,
 coalesce(sum(p.amount) FILTER(WHERE p.kind='deposit_refund'),0)::numeric(16,0) refunded,
 coalesce(sum(CASE WHEN p.kind='deposit_offset' THEN p.amount WHEN p.kind='deposit_offset_reversal' THEN -p.amount ELSE 0 END),0)::numeric(16,0) offset_amount
 FROM contracts c LEFT JOIN payments p ON p.contract_id=c.id AND p.kind LIKE 'deposit_%' AND p.status='confirmed' GROUP BY c.id;

CREATE FUNCTION guard_invoice() RETURNS trigger LANGUAGE plpgsql AS $$
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
CREATE TRIGGER invoice_guard BEFORE INSERT OR UPDATE OR DELETE ON invoices FOR EACH ROW EXECUTE FUNCTION guard_invoice();

CREATE FUNCTION guard_payment() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
DECLARE a jsonb; i invoices; c contracts; original payments; allocated numeric;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'payment_ledger_is_append_only' USING ERRCODE='23514'; END IF;
 PERFORM require_customer(NEW.user_id); PERFORM lock_customer(NEW.user_id);
 IF TG_OP='UPDATE' AND (OLD.status<>'pending' OR (to_jsonb(NEW)-'status'-'confirmed_by'-'confirmed_at'-'reason'-'allocations') IS DISTINCT FROM (to_jsonb(OLD)-'status'-'confirmed_by'-'confirmed_at'-'reason'-'allocations')) THEN RAISE EXCEPTION 'confirmed_payment_is_immutable' USING ERRCODE='23514'; END IF;
 IF NEW.status='confirmed' THEN PERFORM require_admin(NEW.confirmed_by); END IF;
 IF NEW.contract_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM contracts WHERE id=NEW.contract_id AND user_id=NEW.user_id) THEN RAISE EXCEPTION 'payment_owner_mismatch' USING ERRCODE='23514'; END IF;
 IF NEW.intended_invoice_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM invoices i JOIN contracts c ON c.id=i.contract_id WHERE i.id=NEW.intended_invoice_id AND c.user_id=NEW.user_id AND i.status='issued' AND i.adjusts_invoice_id IS NULL) THEN RAISE EXCEPTION 'payment_owner_mismatch' USING ERRCODE='23514'; END IF;
 PERFORM require_files(NEW.proof_file_ids);
 PERFORM unique_json_keys(NEW.allocations,'invoiceId');
 allocated=0;
 FOR a IN SELECT value FROM jsonb_array_elements(NEW.allocations) ORDER BY value->>'invoiceId' LOOP
  IF jsonb_typeof(a->'amount') IS DISTINCT FROM 'number' OR (a->>'amount')::numeric<=0 OR (a->>'amount')::numeric<>trunc((a->>'amount')::numeric) THEN RAISE EXCEPTION 'invalid_allocation' USING ERRCODE='23514'; END IF;
  SELECT * INTO i FROM invoices WHERE id=(a->>'invoiceId')::uuid FOR UPDATE;
  SELECT * INTO c FROM contracts WHERE id=i.contract_id;
  IF i.id IS NULL OR i.status<>'issued' OR i.adjusts_invoice_id IS NOT NULL OR c.user_id<>NEW.user_id OR (NEW.contract_id IS NOT NULL AND c.id<>NEW.contract_id) THEN RAISE EXCEPTION 'allocation_invoice_mismatch' USING ERRCODE='23514'; END IF;
  allocated=allocated+(a->>'amount')::numeric;
 END LOOP;
 IF allocated>NEW.amount OR (NEW.kind IN ('deposit_receipt','deposit_refund') AND allocated<>0) OR (NEW.kind IN ('deposit_offset','deposit_offset_reversal') AND allocated<>NEW.amount) THEN RAISE EXCEPTION 'allocation_amount_mismatch' USING ERRCODE='23514'; END IF;
 IF NEW.reverses_id IS NOT NULL THEN
  SELECT * INTO original FROM payments WHERE id=NEW.reverses_id;
  IF original.status IS DISTINCT FROM 'confirmed' OR original.user_id IS DISTINCT FROM NEW.user_id OR original.contract_id IS DISTINCT FROM NEW.contract_id
   OR (NEW.kind='receipt_reversal' AND original.kind IS DISTINCT FROM 'receipt') OR (NEW.kind='deposit_offset_reversal' AND original.kind IS DISTINCT FROM 'deposit_offset') THEN RAISE EXCEPTION 'invalid_payment_reversal' USING ERRCODE='23514'; END IF;
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER payment_guard BEFORE INSERT OR UPDATE OR DELETE ON payments FOR EACH ROW EXECUTE FUNCTION guard_payment();
CREATE FUNCTION validate_finance(uid uuid) RETURNS void LANGUAGE plpgsql AS $$
#variable_conflict use_column
DECLARE p payments; a jsonb; reversed numeric; allocated numeric; reversed_allocated numeric;
BEGIN
 IF EXISTS(SELECT 1 FROM v_invoice_balances b JOIN contracts c ON c.id=b.contract_id WHERE c.user_id=uid AND (b.receivable_amount<0 OR b.paid_amount<0 OR b.outstanding_amount<0)) THEN RAISE EXCEPTION 'invoice_overallocated' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM v_deposit_balances b JOIN contracts c ON c.id=b.contract_id WHERE c.user_id=uid AND b.held<0) THEN RAISE EXCEPTION 'deposit_overdrawn' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM v_deposit_balances b JOIN contracts c ON c.id=b.contract_id WHERE c.user_id=uid AND c.status='ended' AND b.held<>0) THEN RAISE EXCEPTION 'ended_contract_deposit_not_settled' USING ERRCODE='23514'; END IF;
 FOR p IN SELECT * FROM payments WHERE user_id=uid AND status='confirmed' AND kind IN ('receipt','deposit_offset') LOOP
  SELECT coalesce(sum(amount),0) INTO reversed FROM payments WHERE reverses_id=p.id AND status='confirmed';
  IF reversed>p.amount THEN RAISE EXCEPTION 'payment_overreversed' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM payments r CROSS JOIN LATERAL jsonb_array_elements(r.allocations) x WHERE r.reverses_id=p.id AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p.allocations) a WHERE a->>'invoiceId'=x->>'invoiceId')) THEN RAISE EXCEPTION 'reversal_allocation_mismatch' USING ERRCODE='23514'; END IF;
  FOR a IN SELECT value FROM jsonb_array_elements(p.allocations) LOOP
   SELECT coalesce(sum((x->>'amount')::numeric),0) INTO reversed_allocated FROM payments r CROSS JOIN LATERAL jsonb_array_elements(r.allocations) x WHERE r.reverses_id=p.id AND r.status='confirmed' AND x->>'invoiceId'=a->>'invoiceId';
   IF reversed_allocated>(a->>'amount')::numeric THEN RAISE EXCEPTION 'allocation_overreversed' USING ERRCODE='23514'; END IF;
  END LOOP;
  SELECT coalesce(sum((x->>'amount')::numeric),0) INTO allocated FROM jsonb_array_elements(p.allocations) x;
  SELECT coalesce(sum((x->>'amount')::numeric),0) INTO reversed_allocated FROM payments r CROSS JOIN LATERAL jsonb_array_elements(r.allocations) x WHERE r.reverses_id=p.id AND r.status='confirmed';
  IF p.amount-reversed-allocated+reversed_allocated<0 THEN RAISE EXCEPTION 'payment_overspent' USING ERRCODE='23514'; END IF;
 END LOOP;
END $$;
CREATE FUNCTION finance_after_write() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
DECLARE uid uuid;
BEGIN
 IF TG_TABLE_NAME='payments' THEN uid=NEW.user_id; ELSE SELECT user_id INTO uid FROM contracts WHERE id=NEW.contract_id; END IF;
 PERFORM validate_finance(uid); RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER payment_balances AFTER INSERT OR UPDATE ON payments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION finance_after_write();
CREATE CONSTRAINT TRIGGER invoice_balances AFTER INSERT OR UPDATE ON invoices DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION finance_after_write();

CREATE FUNCTION validate_checkout() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
DECLARE c contracts; k text;
BEGIN
 SELECT * INTO c FROM contracts WHERE id=NEW.id;
 IF c.status='ended' THEN
  IF EXISTS(SELECT 1 FROM v_deposit_balances WHERE contract_id=c.id AND held<>0) THEN RAISE EXCEPTION 'checkout_deposit_not_settled' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM v_invoice_balances WHERE contract_id=c.id AND outstanding_amount>0) AND nullif(btrim(c.remaining_debt_reason),'') IS NULL THEN RAISE EXCEPTION 'checkout_debt_needs_reason' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS(SELECT 1 FROM invoices WHERE contract_id=c.id AND kind='final' AND status='issued') THEN RAISE EXCEPTION 'checkout_needs_final_invoice' USING ERRCODE='23514'; END IF;
  FOR k IN SELECT jsonb_object_keys(c.initial_readings) LOOP
   IF NOT c.final_readings ? k OR (c.final_readings->k->>'value')::numeric<(c.initial_readings->k->>'value')::numeric THEN RAISE EXCEPTION 'checkout_needs_final_readings' USING ERRCODE='23514'; END IF;
   IF NOT EXISTS(SELECT 1 FROM invoices i WHERE i.contract_id=c.id AND i.kind='final' AND i.status='issued'
     AND (to_jsonb(i)->>(k||'_end'))::numeric=(c.final_readings->k->>'value')::numeric) THEN RAISE EXCEPTION 'checkout_readings_mismatch' USING ERRCODE='23514'; END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(c.occupants) x WHERE x->>'leftOn' IS NULL OR (x->>'leftOn')::date>c.move_out_on) THEN RAISE EXCEPTION 'checkout_must_close_occupants' USING ERRCODE='23514'; END IF;
 END IF; RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER contract_checkout AFTER INSERT OR UPDATE ON contracts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_checkout();

CREATE FUNCTION guard_ticket() RETURNS trigger LANGUAGE plpgsql AS $$
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
CREATE TRIGGER ticket_guard BEFORE INSERT OR UPDATE ON tickets FOR EACH ROW EXECUTE FUNCTION guard_ticket();
CREATE FUNCTION protect_file() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
DECLARE signed_ref boolean; used boolean;
BEGIN
 SELECT EXISTS(SELECT 1 FROM contracts c CROSS JOIN LATERAL jsonb_array_elements(c.versions) v
 WHERE nullif(v->>'signedAt','') IS NOT NULL AND v->'fileIds' @> jsonb_build_array(OLD.id::text)) INTO signed_ref;
 IF signed_ref AND (TG_OP='DELETE' OR (to_jsonb(NEW)-'scan_status') IS DISTINCT FROM (to_jsonb(OLD)-'scan_status')) THEN RAISE EXCEPTION 'signed_file_is_immutable' USING ERRCODE='23514'; END IF;
 IF TG_OP='DELETE' THEN
  SELECT EXISTS(SELECT 1 FROM rooms r,jsonb_array_elements(r.images) x WHERE x->>'fileId'=OLD.id::text)
   OR EXISTS(SELECT 1 FROM contracts c WHERE c.attachments @> jsonb_build_array(OLD.id::text) OR EXISTS(SELECT 1 FROM jsonb_array_elements(c.versions) v WHERE v->'fileIds' @> jsonb_build_array(OLD.id::text)))
   OR EXISTS(SELECT 1 FROM payments p WHERE p.proof_file_ids @> jsonb_build_array(OLD.id::text))
   OR EXISTS(SELECT 1 FROM tickets t WHERE t.attachment_file_ids @> jsonb_build_array(OLD.id::text) OR EXISTS(SELECT 1 FROM jsonb_array_elements(t.messages) m WHERE m->'fileIds' @> jsonb_build_array(OLD.id::text))) INTO used;
  IF used THEN RAISE EXCEPTION 'file_is_referenced' USING ERRCODE='23514'; END IF;
  RETURN OLD;
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER file_guard BEFORE UPDATE OR DELETE ON files FOR EACH ROW EXECUTE FUNCTION protect_file();

CREATE VIEW v_room_occupancy AS
 SELECT r.*,CASE WHEN EXISTS(SELECT 1 FROM contracts c WHERE c.room_id=r.id AND c.status='active') THEN 'occupied'
 WHEN EXISTS(SELECT 1 FROM bookings b WHERE b.room_id=r.id AND b.hold_status='holding' AND b.hold_expires_at>now()) THEN 'reserved' ELSE r.operating_status END occupancy_status FROM rooms r;
CREATE VIEW v_public_rooms AS
 SELECT r.id,r.property_id,r.code,r.name,r.area_m2,r.capacity,r.room_type_code,r.room_type_name,r.listing_slug,r.listing_title,r.listing_description,r.video_url,r.rules_text,r.required_deposit,r.amenities,r.rates,
 coalesce((SELECT jsonb_agg(x) FROM jsonb_array_elements(r.images) x JOIN files f ON f.id=(x->>'fileId')::uuid WHERE f.visibility='public' AND f.scan_status='clean'),'[]'::jsonb) images
 FROM rooms r JOIN properties p ON p.id=r.property_id WHERE r.listing_status='published' AND p.is_active AND r.operating_status<>'inactive'
 AND EXISTS(SELECT 1 FROM jsonb_array_elements(r.images) x JOIN files f ON f.id=(x->>'fileId')::uuid WHERE f.visibility='public' AND f.scan_status='clean');
CREATE VIEW v_user_contracts AS
 SELECT c.id,c.code,c.room_id,c.user_id,c.status,c.starts_on,c.ends_on,c.move_in_on,c.move_out_on,(c.user_id=request_user_id()) finance_visible
 FROM contracts c WHERE c.user_id=request_user_id() OR EXISTS(SELECT 1 FROM jsonb_array_elements(c.occupants) p WHERE p->>'userId'=request_user_id()::text AND p->>'leftOn' IS NULL);
CREATE VIEW v_user_invoices AS
 SELECT i.*,b.receivable_amount,b.paid_amount,b.outstanding_amount,b.payment_status,b.is_overdue FROM invoices i JOIN v_invoice_balances b ON b.id=i.id JOIN contracts c ON c.id=i.contract_id WHERE c.user_id=request_user_id() AND i.status<>'draft';
CREATE VIEW v_user_bookings AS SELECT * FROM bookings WHERE user_id=request_user_id();
CREATE VIEW v_user_tickets AS
 SELECT t.id,t.code,t.room_id,t.contract_id,t.reported_by,t.category_code,t.title,t.description,t.priority,t.status,t.due_at,t.resolution_notes,t.attachment_file_ids,
 coalesce((SELECT jsonb_agg(m ORDER BY m->>'createdAt') FROM jsonb_array_elements(t.messages) m WHERE NOT coalesce((m->>'isInternal')::boolean,false)),'[]'::jsonb) messages,
 t.history,t.created_at,t.updated_at
 FROM tickets t WHERE t.reported_by=request_user_id() OR EXISTS(SELECT 1 FROM contracts c WHERE c.id=t.contract_id AND c.user_id=request_user_id());
CREATE VIEW v_user_notifications AS SELECT * FROM notifications WHERE recipient_id=request_user_id();

-- SQL runtime chỉ dùng ở backend. Đây không phải RLS: API vẫn kiểm tra ownership.
CREATE FUNCTION configure_runtime(role_name name) RETURNS void LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
 EXECUTE format('GRANT USAGE ON SCHEMA smartrent TO %I',role_name);
 EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA smartrent TO %I',role_name);
 EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA smartrent TO %I',role_name);
 EXECUTE format('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA smartrent TO %I',role_name);
 EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON smartrent.users FROM %I',role_name);
 EXECUTE format('GRANT INSERT (id,code,display_name,email,phone,password_hash,login_enabled,is_active,avatar_file_id,date_of_birth,address_line,locality,province,emergency_contact_name,emergency_contact_phone,notes,identity_documents,email_verified_at,accepted_terms_at) ON smartrent.users TO %I',role_name);
 EXECUTE format('GRANT UPDATE (code,display_name,email,phone,password_hash,login_enabled,is_active,avatar_file_id,date_of_birth,address_line,locality,province,emergency_contact_name,emergency_contact_phone,notes,identity_documents,favorite_rooms,failed_login_count,locked_until,last_login_at,email_verified_at,accepted_terms_at) ON smartrent.users TO %I',role_name);
 EXECUTE format('REVOKE EXECUTE ON FUNCTION smartrent.configure_runtime(name) FROM %I',role_name);
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA smartrent FROM PUBLIC;
COMMIT;
