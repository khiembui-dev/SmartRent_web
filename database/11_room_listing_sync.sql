-- Migration cho database đã cài trước 13/11/2026 (baseline 02_rules.sql mới đã có sẵn). Chạy lại được.
-- 1. Cho chuyển phòng sang cơ sở khác khi phòng chưa từng có hợp đồng (trước đây luôn bị chặn).
-- 2. Tin đăng đi theo hợp đồng: có hợp đồng hiệu lực/sắp vào ở thì tạm ẩn, trả phòng hoặc hủy thì công khai lại.
-- 3. Ẩn tin của những phòng hiện đang có người thuê mà vẫn để "đang công khai".
-- Chạy bằng tài khoản sở hữu database:
--   docker compose exec -T db psql -U postgres -d smartrent -v ON_ERROR_STOP=1 -f /smartrent-database/11_room_listing_sync.sql
BEGIN;
SET LOCAL search_path=smartrent,public;
SET LOCAL lock_timeout='10s';

CREATE OR REPLACE FUNCTION smartrent.guard_catalog() RETURNS trigger LANGUAGE plpgsql AS $$
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

CREATE OR REPLACE FUNCTION smartrent.sync_room_listing() RETURNS trigger LANGUAGE plpgsql AS $$
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
DROP TRIGGER IF EXISTS contract_listing_sync ON smartrent.contracts;
CREATE TRIGGER contract_listing_sync AFTER INSERT OR UPDATE OF status ON smartrent.contracts FOR EACH ROW EXECUTE FUNCTION smartrent.sync_room_listing();

-- Quyền giống các hàm có sẵn: không cấp cho PUBLIC, cấp cho đúng các role đang được chạy guard_catalog.
REVOKE ALL ON FUNCTION smartrent.sync_room_listing() FROM PUBLIC;
DO $grant$
DECLARE grantee_name text;
BEGIN
 FOR grantee_name IN
  SELECT DISTINCT a.grantee::regrole::text FROM pg_proc f CROSS JOIN LATERAL aclexplode(f.proacl) a
  WHERE f.oid='smartrent.guard_catalog()'::regprocedure AND a.privilege_type='EXECUTE' AND a.grantee<>0 AND a.grantee<>f.proowner
 LOOP
  EXECUTE format('GRANT EXECUTE ON FUNCTION smartrent.sync_room_listing() TO %s', grantee_name);
 END LOOP;
END $grant$;

UPDATE smartrent.rooms r SET listing_status='hidden'
WHERE r.listing_status<>'hidden' AND EXISTS(SELECT 1 FROM smartrent.contracts c WHERE c.room_id=r.id AND c.status IN ('active','planned'));
COMMIT;
