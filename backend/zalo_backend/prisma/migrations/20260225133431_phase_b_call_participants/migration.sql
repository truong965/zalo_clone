/*
  Warnings:

  - You are about to drop the column `caller_id` on the `call_history` table. All the data in the column will be lost.
  - Added the required column `initiator_id` to the `call_history` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "call_participant_role" AS ENUM ('HOST', 'MEMBER');

-- CreateEnum
CREATE TYPE "call_participant_status" AS ENUM ('JOINED', 'MISSED', 'REJECTED', 'LEFT', 'KICKED');

-- DropForeignKey
ALTER TABLE "call_history" DROP CONSTRAINT "call_history_callee_id_fkey";

-- DropForeignKey
ALTER TABLE "call_history" DROP CONSTRAINT "call_history_caller_id_fkey";

-- DropIndex
DROP INDEX "idx_call_history_callee_feed";

-- DropIndex
DROP INDEX "idx_call_history_caller_feed";

-- DropIndex
DROP INDEX "idx_call_history_conversation";

-- DropIndex
DROP INDEX "idx_call_history_missed";

-- AlterTable: Step 1 — add initiator_id as nullable, add participant_count, make callee_id nullable
ALTER TABLE "call_history"
ADD COLUMN "initiator_id" UUID,
ADD COLUMN "participant_count" INTEGER NOT NULL DEFAULT 2,
ALTER COLUMN "callee_id" DROP NOT NULL;

-- Step 2 — backfill initiator_id from the existing caller_id
UPDATE "call_history" SET "initiator_id" = "caller_id";

-- Step 3 — enforce NOT NULL after backfill
ALTER TABLE "call_history" ALTER COLUMN "initiator_id" SET NOT NULL;

-- Step 4 — drop caller_id (no longer needed; replaced by initiator_id)
ALTER TABLE "call_history" DROP COLUMN "caller_id";

-- CreateTable
CREATE TABLE "call_participants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "call_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "call_participant_role" NOT NULL,
    "status" "call_participant_status" NOT NULL,
    "kicked_by" UUID,
    "joined_at" TIMESTAMPTZ,
    "left_at" TIMESTAMPTZ,
    "duration" INTEGER,

    CONSTRAINT "call_participants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_call_participant_user_status" ON "call_participants"("user_id", "status");

-- CreateIndex
CREATE INDEX "idx_call_participant_user_role_status" ON "call_participants"("user_id", "role", "status");

-- CreateIndex
CREATE INDEX "idx_call_participant_call" ON "call_participants"("call_id");

-- CreateIndex
CREATE UNIQUE INDEX "call_participants_call_id_user_id_key" ON "call_participants"("call_id", "user_id");

-- CreateIndex
CREATE INDEX "idx_call_history_initiator_feed" ON "call_history"("initiator_id", "deleted_at", "started_at" DESC, "id");

-- CreateIndex
CREATE INDEX "idx_call_history_conversation_feed" ON "call_history"("conversation_id", "deleted_at", "started_at" DESC);

-- AddForeignKey
ALTER TABLE "call_history" ADD CONSTRAINT "call_history_initiator_id_fkey" FOREIGN KEY ("initiator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_history" ADD CONSTRAINT "call_history_callee_id_fkey" FOREIGN KEY ("callee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_participants" ADD CONSTRAINT "call_participants_call_id_fkey" FOREIGN KEY ("call_id") REFERENCES "call_history"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_participants" ADD CONSTRAINT "call_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_participants" ADD CONSTRAINT "call_participants_kicked_by_fkey" FOREIGN KEY ("kicked_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- =============================================================================
-- BACKFILL: Create CallParticipant records for all existing CallHistory rows.
-- HOST participant (the initiator) — always present.
-- MEMBER participant (the callee) — only when callee_id is not null.
-- Status mapping: COMPLETED → LEFT, MISSED/NO_ANSWER → MISSED,
--                 REJECTED → REJECTED, CANCELLED/FAILED → MISSED
-- =============================================================================

-- HOST participants
INSERT INTO "call_participants" ("id", "call_id", "user_id", "role", "status", "joined_at", "left_at", "duration")
SELECT
  gen_random_uuid(),
  ch.id,
  ch.initiator_id,
  'HOST'::"call_participant_role",
  'LEFT'::"call_participant_status",
  ch.started_at,
  ch.ended_at,
  ch.duration
FROM "call_history" ch
ON CONFLICT ("call_id", "user_id") DO NOTHING;

-- MEMBER participants (only rows with a callee_id)
INSERT INTO "call_participants" ("id", "call_id", "user_id", "role", "status", "joined_at", "left_at", "duration")
SELECT
  gen_random_uuid(),
  ch.id,
  ch.callee_id,
  'MEMBER'::"call_participant_role",
  CASE ch.status
    WHEN 'COMPLETED' THEN 'LEFT'::"call_participant_status"
    WHEN 'MISSED'    THEN 'MISSED'::"call_participant_status"
    WHEN 'NO_ANSWER' THEN 'MISSED'::"call_participant_status"
    WHEN 'REJECTED'  THEN 'REJECTED'::"call_participant_status"
    ELSE                  'MISSED'::"call_participant_status"
  END,
  CASE WHEN ch.status = 'COMPLETED' THEN ch.started_at ELSE NULL END,
  CASE WHEN ch.status = 'COMPLETED' THEN ch.ended_at   ELSE NULL END,
  CASE WHEN ch.status = 'COMPLETED' THEN ch.duration   ELSE NULL END
FROM "call_history" ch
WHERE ch.callee_id IS NOT NULL
ON CONFLICT ("call_id", "user_id") DO NOTHING;
