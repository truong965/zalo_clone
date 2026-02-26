-- DropIndex
DROP INDEX "idx_reminder_pending";

-- AlterTable
ALTER TABLE "reminders" ADD COLUMN     "is_triggered" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "triggered_at" TIMESTAMPTZ;

-- CreateIndex
CREATE INDEX "idx_reminder_pending_poll" ON "reminders"("is_triggered", "is_completed", "remind_at" ASC);
