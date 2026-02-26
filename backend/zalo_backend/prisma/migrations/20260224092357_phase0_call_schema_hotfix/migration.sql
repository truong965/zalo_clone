/*
  Warnings:

  - Added the required column `call_type` to the `call_history` table without a default value. This is not possible if the table is not empty.
  - Added the required column `provider` to the `call_history` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "call_type" AS ENUM ('VOICE', 'VIDEO');

-- CreateEnum
CREATE TYPE "call_provider" AS ENUM ('WEBRTC_P2P', 'DAILY_CO');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "call_status" ADD VALUE 'NO_ANSWER';
ALTER TYPE "call_status" ADD VALUE 'FAILED';

-- AlterTable
ALTER TABLE "call_history" ADD COLUMN     "call_type" "call_type" NOT NULL,
ADD COLUMN     "conversation_id" UUID,
ADD COLUMN     "daily_room_name" VARCHAR(100),
ADD COLUMN     "end_reason" VARCHAR(50),
ADD COLUMN     "provider" "call_provider" NOT NULL,
ALTER COLUMN "deleted_at" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "idx_call_history_conversation" ON "call_history"("conversation_id");

-- CreateIndex
CREATE INDEX "idx_call_history_type_analytics" ON "call_history"("call_type", "started_at");

-- AddForeignKey
ALTER TABLE "call_history" ADD CONSTRAINT "call_history_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
