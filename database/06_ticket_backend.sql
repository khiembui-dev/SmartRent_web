-- Migration b? sung Ticket; ch?y ???c l?i, kh?ng x?a d? li?u v? kh?ng th?m b?ng.
BEGIN;
SET search_path=smartrent,public;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS request_hash text;
CREATE UNIQUE INDEX IF NOT EXISTS tickets_reporter_idempotency_unique ON tickets(reported_by,idempotency_key);
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
  -- Ghi chú nội bộ cũ giữ nguyên người viết khi chuyển quyền chủ trọ.
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
