-- Add location links without changing existing addresses or room data.
BEGIN;
ALTER TABLE smartrent.properties ADD COLUMN IF NOT EXISTS map_url text;
ALTER TABLE smartrent.properties ADD COLUMN IF NOT EXISTS map_embed_url text;
COMMIT;
