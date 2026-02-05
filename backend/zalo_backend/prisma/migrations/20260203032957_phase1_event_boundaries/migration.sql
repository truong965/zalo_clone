/*
  Warnings:

  - You are about to drop the `presence_logs` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "event_type" AS ENUM ('USER_BLOCKED', 'USER_UNBLOCKED', 'FRIEND_REQUEST_SENT', 'FRIEND_REQUEST_ACCEPTED', 'FRIEND_REQUEST_REJECTED', 'UNFRIENDED', 'MESSAGE_SENT', 'CONVERSATION_CREATED', 'GROUP_CREATED', 'MESSAGE_DELIVERED', 'MESSAGE_SEEN', 'CALL_INITIATED', 'CALL_ANSWERED', 'CALL_ENDED', 'CALL_REJECTED', 'USER_REGISTERED', 'USER_PROFILE_UPDATED', 'USER_WENT_ONLINE', 'USER_WENT_OFFLINE', 'PRIVACY_SETTINGS_UPDATED', 'CONTACT_SYNCED', 'CONTACT_ADDED', 'CONTACT_REMOVED', 'NOTIFICATION_SENT', 'MEDIA_UPLOADED', 'MEDIA_DELETED');

-- DropForeignKey
ALTER TABLE "presence_logs" DROP CONSTRAINT "presence_logs_user_id_fkey";

-- DropTable
DROP TABLE "presence_logs";

-- CreateTable
CREATE TABLE "domain_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "event_type" "event_type" NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "aggregate_type" VARCHAR(50) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "source" VARCHAR(50) NOT NULL,
    "correlation_id" UUID,
    "causation_id" UUID,
    "payload" JSONB NOT NULL,
    "metadata" JSONB,
    "occurred_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issued_by" UUID,

    CONSTRAINT "domain_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "event_type" "event_type" NOT NULL,
    "handler_id" VARCHAR(100) NOT NULL,
    "processed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" VARCHAR(20) NOT NULL DEFAULT 'SUCCESS',
    "error_message" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "correlation_id" UUID,

    CONSTRAINT "processed_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "domain_events_event_id_key" ON "domain_events"("event_id");

-- CreateIndex
CREATE INDEX "domain_events_event_type_occurred_at_idx" ON "domain_events"("event_type", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "domain_events_aggregate_id_aggregate_type_idx" ON "domain_events"("aggregate_id", "aggregate_type");

-- CreateIndex
CREATE INDEX "domain_events_correlation_id_idx" ON "domain_events"("correlation_id");

-- CreateIndex
CREATE INDEX "domain_events_occurred_at_idx" ON "domain_events"("occurred_at" DESC);

-- CreateIndex
CREATE INDEX "domain_events_source_idx" ON "domain_events"("source");

-- CreateIndex
CREATE INDEX "processed_events_event_id_idx" ON "processed_events"("event_id");

-- CreateIndex
CREATE INDEX "processed_events_handler_id_idx" ON "processed_events"("handler_id");

-- CreateIndex
CREATE INDEX "processed_events_processed_at_idx" ON "processed_events"("processed_at" DESC);

-- CreateIndex
CREATE INDEX "processed_events_status_idx" ON "processed_events"("status");

-- CreateIndex
CREATE UNIQUE INDEX "processed_events_event_id_handler_id_key" ON "processed_events"("event_id", "handler_id");
