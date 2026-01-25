/*
  Warnings:

  - You are about to drop the column `is_active` on the `conversation_members` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[client_message_id]` on the table `messages` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "member_status" AS ENUM ('PENDING', 'ACTIVE', 'KICKED', 'LEFT');

-- CreateEnum
CREATE TYPE "join_request_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "receipt_status" AS ENUM ('SENT', 'DELIVERED', 'SEEN');

-- AlterTable
ALTER TABLE "conversation_members" DROP COLUMN "is_active",
ADD COLUMN     "kicked_at" TIMESTAMPTZ,
ADD COLUMN     "kicked_by" UUID,
ADD COLUMN     "left_at" TIMESTAMPTZ,
ADD COLUMN     "status" "member_status" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "require_approval" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "settings" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "client_message_id" VARCHAR(36);

-- CreateTable
CREATE TABLE "group_join_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "join_request_status" NOT NULL DEFAULT 'PENDING',
    "requested_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "message" VARCHAR(500),
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ,

    CONSTRAINT "group_join_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_receipts" (
    "message_id" BIGINT NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "receipt_status" NOT NULL,
    "timestamp" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_receipts_pkey" PRIMARY KEY ("message_id","user_id")
);

-- CreateIndex
CREATE INDEX "group_join_requests_conversation_id_status_idx" ON "group_join_requests"("conversation_id", "status");

-- CreateIndex
CREATE INDEX "group_join_requests_user_id_status_idx" ON "group_join_requests"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "group_join_requests_conversation_id_user_id_key" ON "group_join_requests"("conversation_id", "user_id");

-- CreateIndex
CREATE INDEX "message_receipts_user_id_status_timestamp_idx" ON "message_receipts"("user_id", "status", "timestamp");

-- CreateIndex
CREATE INDEX "message_receipts_message_id_status_idx" ON "message_receipts"("message_id", "status");

-- CreateIndex
CREATE INDEX "conversation_members_user_id_status_idx" ON "conversation_members"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "messages_client_message_id_key" ON "messages"("client_message_id");

-- CreateIndex
CREATE INDEX "messages_sender_id_created_at_idx" ON "messages"("sender_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "messages_client_message_id_idx" ON "messages"("client_message_id");

-- AddForeignKey
ALTER TABLE "group_join_requests" ADD CONSTRAINT "group_join_requests_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_join_requests" ADD CONSTRAINT "group_join_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_join_requests" ADD CONSTRAINT "group_join_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_receipts" ADD CONSTRAINT "message_receipts_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
