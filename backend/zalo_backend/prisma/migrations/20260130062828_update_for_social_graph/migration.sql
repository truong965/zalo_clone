/*
  Warnings:

  - The values [NOBODY] on the enum `privacy_level` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `deleted_by` on the `friendships` table. All the data in the column will be lost.
  - You are about to drop the column `updated_by` on the `friendships` table. All the data in the column will be lost.
  - You are about to drop the column `show_phone_number` on the `privacy_settings` table. All the data in the column will be lost.
  - The `show_online_status` column on the `privacy_settings` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "call_status" AS ENUM ('COMPLETED', 'MISSED', 'REJECTED', 'CANCELLED');

-- AlterEnum
BEGIN;

CREATE TYPE "privacy_level_new" AS ENUM ('EVERYONE', 'CONTACTS');
ALTER TABLE "public"."privacy_settings" ALTER COLUMN "show_phone_number" DROP DEFAULT;
ALTER TABLE "public"."privacy_settings" ALTER COLUMN "show_online_status" DROP DEFAULT;
ALTER TABLE "public"."privacy_settings" ALTER COLUMN "who_can_call_me" DROP DEFAULT;
ALTER TABLE "public"."privacy_settings" ALTER COLUMN "who_can_message_me" DROP DEFAULT;
ALTER TABLE "privacy_settings" ALTER COLUMN "who_can_message_me" TYPE "privacy_level_new" USING ("who_can_message_me"::text::"privacy_level_new");
ALTER TABLE "privacy_settings" ALTER COLUMN "who_can_call_me" TYPE "privacy_level_new" USING ("who_can_call_me"::text::"privacy_level_new");
ALTER TYPE "privacy_level" RENAME TO "privacy_level_old";
ALTER TYPE "privacy_level_new" RENAME TO "privacy_level";
-- AlterTable
ALTER TABLE "privacy_settings" DROP COLUMN "show_phone_number",
ADD COLUMN     "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "show_last_seen" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "show_profile" "privacy_level" NOT NULL DEFAULT 'CONTACTS',
DROP COLUMN "show_online_status",
ADD COLUMN     "show_online_status" BOOLEAN NOT NULL DEFAULT true;

DROP TYPE "public"."privacy_level_old";
ALTER TABLE "privacy_settings" ALTER COLUMN "who_can_call_me" SET DEFAULT 'CONTACTS';
ALTER TABLE "privacy_settings" ALTER COLUMN "who_can_message_me" SET DEFAULT 'EVERYONE';
COMMIT;

-- AlterTable
ALTER TABLE "blocks" ADD COLUMN     "reason" VARCHAR(500);

-- AlterTable
ALTER TABLE "conversation_members" ADD COLUMN     "demoted_at" TIMESTAMPTZ,
ADD COLUMN     "demoted_by" UUID,
ADD COLUMN     "promoted_at" TIMESTAMPTZ,
ADD COLUMN     "promoted_by" UUID;

-- AlterTable
ALTER TABLE "friendships" DROP COLUMN "deleted_by",
DROP COLUMN "updated_by",
ADD COLUMN     "accepted_at" TIMESTAMPTZ,
ADD COLUMN     "declined_at" TIMESTAMPTZ,
ADD COLUMN     "expires_at" TIMESTAMPTZ,
ADD COLUMN     "last_action_at" TIMESTAMPTZ,
ADD COLUMN     "last_action_by" UUID;

-- AlterTable
ALTER TABLE "group_join_requests" ADD COLUMN     "expires_at" TIMESTAMPTZ,
ADD COLUMN     "inviter_id" UUID;


-- AlterTable
ALTER TABLE "users" ADD COLUMN     "phone_number_hash" VARCHAR(64);

-- CreateTable
CREATE TABLE "user_contacts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_id" UUID NOT NULL,
    "contact_user_id" UUID NOT NULL,
    "alias_name" VARCHAR(100),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "caller_id" UUID NOT NULL,
    "callee_id" UUID NOT NULL,
    "duration" INTEGER,
    "status" "call_status" NOT NULL,
    "started_at" TIMESTAMPTZ NOT NULL,
    "ended_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "call_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_contacts_owner_id_alias_name_idx" ON "user_contacts"("owner_id", "alias_name");

-- CreateIndex
CREATE INDEX "user_contacts_owner_id_created_at_idx" ON "user_contacts"("owner_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "user_contacts_owner_id_contact_user_id_key" ON "user_contacts"("owner_id", "contact_user_id");

-- CreateIndex
CREATE INDEX "call_history_caller_id_started_at_idx" ON "call_history"("caller_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "call_history_callee_id_started_at_idx" ON "call_history"("callee_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "call_history_started_at_idx" ON "call_history"("started_at");

-- CreateIndex
CREATE INDEX "blocks_blocked_id_idx" ON "blocks"("blocked_id");

-- CreateIndex
CREATE INDEX "blocks_created_at_idx" ON "blocks"("created_at");

-- CreateIndex
CREATE INDEX "friendships_requester_id_status_idx" ON "friendships"("requester_id", "status");

-- CreateIndex
CREATE INDEX "friendships_status_expires_at_idx" ON "friendships"("status", "expires_at");

-- CreateIndex
CREATE INDEX "group_join_requests_status_expires_at_idx" ON "group_join_requests"("status", "expires_at");

-- CreateIndex
CREATE INDEX "users_phone_number_hash_idx" ON "users"("phone_number_hash");

-- AddForeignKey
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_last_action_by_fkey" FOREIGN KEY ("last_action_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_contacts" ADD CONSTRAINT "user_contacts_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_contacts" ADD CONSTRAINT "user_contacts_contact_user_id_fkey" FOREIGN KEY ("contact_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_join_requests" ADD CONSTRAINT "group_join_requests_inviter_id_fkey" FOREIGN KEY ("inviter_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_history" ADD CONSTRAINT "call_history_caller_id_fkey" FOREIGN KEY ("caller_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_history" ADD CONSTRAINT "call_history_callee_id_fkey" FOREIGN KEY ("callee_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Tạo Index duy nhất có điều kiện (Partial Index)
-- Chỉ cho phép 1 Admin (role='ADMIN') đang hoạt động (status='ACTIVE') trong 1 Conversation
CREATE UNIQUE INDEX "unique_admin_per_active_group" 
ON "conversation_members"("conversation_id", "role") 
WHERE "role" = 'ADMIN' AND "status" = 'ACTIVE';
