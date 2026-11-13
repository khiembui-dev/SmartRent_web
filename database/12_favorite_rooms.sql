-- Phòng yêu thích của khách: mảng [{roomId, savedAt}] trên users, mới lưu đứng đầu, tối đa 100 phòng.
-- Không thêm bảng. Chạy bằng owner trên database đã cài; chạy lại nhiều lần không đổi dữ liệu.
BEGIN;
ALTER TABLE smartrent.users ADD COLUMN IF NOT EXISTS favorite_rooms jsonb NOT NULL DEFAULT '[]';
DO $check$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='smartrent.users'::regclass AND conname='users_favorite_rooms_check') THEN
  ALTER TABLE smartrent.users ADD CONSTRAINT users_favorite_rooms_check
   CHECK (jsonb_typeof(favorite_rooms)='array' AND jsonb_array_length(favorite_rooms)<=100);
 END IF;
END $check$;

-- users chỉ cấp quyền UPDATE theo cột: cấp thêm cột mới cho đúng các role đang được sửa hồ sơ.
DO $grant$
DECLARE grantee_name text;
BEGIN
 FOR grantee_name IN
  SELECT DISTINCT grantee FROM information_schema.column_privileges
  WHERE table_schema='smartrent' AND table_name='users' AND column_name='display_name' AND privilege_type='UPDATE'
   AND grantee NOT IN (SELECT tableowner FROM pg_tables WHERE schemaname='smartrent' AND tablename='users')
 LOOP
  EXECUTE format('GRANT UPDATE (favorite_rooms) ON smartrent.users TO %I', grantee_name);
 END LOOP;
END $grant$;
COMMIT;
