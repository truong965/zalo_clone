-- AlterTable
ALTER TABLE "conversation_members" ADD COLUMN     "is_pinned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pinned_at" TIMESTAMPTZ;

-- CreateIndex
CREATE INDEX "conversation_members_user_id_is_pinned_status_idx" ON "conversation_members"("user_id", "is_pinned", "status");
