-- DropIndex
DROP INDEX "user_tokens_user_id_device_id_key";

-- CreateIndex
CREATE INDEX "user_tokens_user_id_device_id_idx" ON "user_tokens"("user_id", "device_id");
