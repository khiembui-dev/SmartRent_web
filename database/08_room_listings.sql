-- Publishing without a photo is allowed; explicit published status is still required.
-- Rerunnable migration for existing databases. No room is published automatically.
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
  IF TG_OP='UPDATE' AND NEW.property_id<>OLD.property_id THEN RAISE EXCEPTION 'room_property_is_immutable' USING ERRCODE='23514'; END IF;
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
COMMIT;
