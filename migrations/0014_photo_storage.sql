-- Photos move into Cloudflare R2 file storage, so the shared database stays small. r2_key says where a photo's
-- file is in R2 (empty for a photo still kept only in the database), size is its size in bytes.
ALTER TABLE photos ADD COLUMN r2_key TEXT;
ALTER TABLE photos ADD COLUMN size INTEGER;
