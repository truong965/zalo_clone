-- AlterEnum
ALTER TYPE "message_type" ADD VALUE IF NOT EXISTS 'POLL';

-- AlterEnum
ALTER TYPE "event_type" ADD VALUE IF NOT EXISTS 'POLL_CREATED';
ALTER TYPE "event_type" ADD VALUE IF NOT EXISTS 'POLL_VOTE_CHANGED';
ALTER TYPE "event_type" ADD VALUE IF NOT EXISTS 'POLL_CLOSED';

-- Remove legacy/partial poll tables (e.g. from prisma db push with outdated schema)
DROP TABLE IF EXISTS "poll_votes" CASCADE;
DROP TABLE IF EXISTS "poll_options" CASCADE;
DROP TABLE IF EXISTS "polls" CASCADE;

-- CreateTable
CREATE TABLE "polls" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversation_id" UUID NOT NULL,
    "message_id" BIGINT NOT NULL,
    "creator_id" UUID NOT NULL,
    "question" VARCHAR(500) NOT NULL,
    "is_multiple_choices" BOOLEAN NOT NULL DEFAULT false,
    "allow_add_options" BOOLEAN NOT NULL DEFAULT false,
    "is_closed" BOOLEAN NOT NULL DEFAULT false,
    "closed_at" TIMESTAMPTZ,
    "closed_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "polls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "poll_options" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "poll_id" UUID NOT NULL,
    "text" VARCHAR(200) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID,

    CONSTRAINT "poll_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "poll_votes" (
    "poll_id" UUID NOT NULL,
    "option_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "poll_votes_pkey" PRIMARY KEY ("poll_id","option_id","user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "polls_message_id_key" ON "polls"("message_id");

-- CreateIndex
CREATE INDEX "polls_conversation_id_created_at_idx" ON "polls"("conversation_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "poll_options_poll_id_sort_order_idx" ON "poll_options"("poll_id", "sort_order");

-- CreateIndex
CREATE INDEX "poll_votes_poll_id_user_id_idx" ON "poll_votes"("poll_id", "user_id");

-- AddForeignKey
ALTER TABLE "polls" ADD CONSTRAINT "polls_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "polls" ADD CONSTRAINT "polls_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_options" ADD CONSTRAINT "poll_options_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "polls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "polls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "poll_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;
