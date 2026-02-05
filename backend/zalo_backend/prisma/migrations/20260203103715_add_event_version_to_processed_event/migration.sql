-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "participants" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "processed_events" ADD COLUMN     "event_version" INTEGER NOT NULL DEFAULT 1;
