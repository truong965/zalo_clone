-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "event_type" ADD VALUE 'CONVERSATION_ARCHIVED';
ALTER TYPE "event_type" ADD VALUE 'CONVERSATION_MUTED';

-- CreateTable
CREATE TABLE "daily_stats" (
    "date" DATE NOT NULL,
    "new_users" INTEGER NOT NULL DEFAULT 0,
    "active_users" INTEGER NOT NULL DEFAULT 0,
    "messages_total" INTEGER NOT NULL DEFAULT 0,
    "messages_by_type" JSONB NOT NULL DEFAULT '{}',
    "calls_total" INTEGER NOT NULL DEFAULT 0,
    "calls_by_type" JSONB NOT NULL DEFAULT '{}',
    "calls_by_status" JSONB NOT NULL DEFAULT '{}',
    "call_avg_duration" INTEGER NOT NULL DEFAULT 0,
    "media_uploads" INTEGER NOT NULL DEFAULT 0,
    "media_bytes" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "daily_stats_pkey" PRIMARY KEY ("date")
);
