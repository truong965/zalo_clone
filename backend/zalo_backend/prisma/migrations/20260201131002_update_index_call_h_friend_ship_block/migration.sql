-- DropIndex
DROP INDEX "blocks_created_at_idx";

-- DropIndex
DROP INDEX "call_history_callee_id_started_at_idx";

-- DropIndex
DROP INDEX "call_history_caller_id_started_at_idx";

-- DropIndex
DROP INDEX "friendships_requester_id_status_idx";

-- DropIndex
DROP INDEX "friendships_user1_id_status_idx";

-- DropIndex
DROP INDEX "friendships_user2_id_status_idx";

-- CreateIndex
CREATE INDEX "idx_block_cursor" ON "blocks"("blocker_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "idx_call_history_caller_feed" ON "call_history"("caller_id", "deleted_at", "started_at" DESC, "id");

-- CreateIndex
CREATE INDEX "idx_call_history_callee_feed" ON "call_history"("callee_id", "deleted_at", "started_at" DESC, "id");

-- CreateIndex
CREATE INDEX "idx_call_history_missed" ON "call_history"("callee_id", "status", "started_at" DESC);

-- CreateIndex
CREATE INDEX "idx_friendship_user1_list" ON "friendships"("user1_id", "status", "created_at" DESC, "id");

-- CreateIndex
CREATE INDEX "idx_friendship_user2_list" ON "friendships"("user2_id", "status", "created_at" DESC, "id");

-- CreateIndex
CREATE INDEX "idx_friendship_sent_requests" ON "friendships"("requester_id", "status", "expires_at");

-- RenameIndex
ALTER INDEX "call_history_started_at_idx" RENAME TO "idx_call_history_time_range";

-- RenameIndex
ALTER INDEX "friendships_status_expires_at_idx" RENAME TO "idx_friendship_cleanup";
