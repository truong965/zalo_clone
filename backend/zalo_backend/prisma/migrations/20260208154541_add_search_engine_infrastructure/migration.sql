-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- AlterTable
ALTER TABLE "conversation_members" ADD COLUMN     "is_archived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_muted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "search_vector" tsvector;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "phone_number_normalized" VARCHAR(20);

-- CreateIndex
CREATE INDEX "conversation_members_user_id_is_archived_is_muted_joined_at_idx" ON "conversation_members"("user_id", "is_archived", "is_muted", "joined_at" DESC);

-- CreateIndex
CREATE INDEX "messages_conversation_id_deleted_at_created_at_idx" ON "messages"("conversation_id", "deleted_at", "created_at" DESC);

-- CreateIndex
CREATE INDEX "messages_sender_id_conversation_id_deleted_at_idx" ON "messages"("sender_id", "conversation_id", "deleted_at");

-- CreateIndex
CREATE INDEX "users_phone_number_normalized_idx" ON "users"("phone_number_normalized");
-- Trigger function cho auto-update search_vector
CREATE OR REPLACE FUNCTION update_message_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := 
    setweight(to_tsvector('english', COALESCE(unaccent(NEW.content), '')), 'A');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger trên messages table
CREATE TRIGGER message_search_vector_update
  BEFORE INSERT OR UPDATE OF content
  ON "messages"
  FOR EACH ROW
  EXECUTE FUNCTION update_message_search_vector();

-- Populate search_vector cho existing messages
UPDATE "messages" 
SET "search_vector" = setweight(to_tsvector('english', COALESCE(unaccent(content), '')), 'A')
WHERE "search_vector" IS NULL AND "content" IS NOT NULL;

-- Populate phone_number_normalized cho existing users
UPDATE "users" 
SET "phone_number_normalized" = 
  CASE 
    WHEN "phone_number" LIKE '+%' THEN "phone_number"
    WHEN "phone_number" LIKE '0%' THEN CONCAT('+84', SUBSTRING("phone_number", 2))
    ELSE CONCAT('+84', "phone_number")
  END
WHERE "phone_number_normalized" IS NULL;