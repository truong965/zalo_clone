-- This is an empty migration.
-- 1. Index cho tìm kiếm tên nhóm
CREATE INDEX IF NOT EXISTS "idx_conversations_name_trgm"
  ON "conversations" USING GIN ("name" gin_trgm_ops);

-- 2. Index cho tìm kiếm tên file
CREATE INDEX IF NOT EXISTS "idx_media_attachments_original_name_trgm"
  ON "media_attachments" USING GIN ("original_name" gin_trgm_ops);

-- 3. Composite Partial Index
CREATE INDEX IF NOT EXISTS "idx_media_attachments_deleted_at_media_type"
  ON "media_attachments" ("deleted_at", "media_type")
  WHERE "deleted_at" IS NULL;