/*
  Warnings:

  - The values [COMPLETED] on the enum `media_processing_status` will be removed. If these variants are still used in the database, this will fail.
  - A unique constraint covering the columns `[upload_id]` on the table `media_attachments` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "media_processing_status_new" AS ENUM ('PENDING', 'UPLOADED', 'CONFIRMED', 'PROCESSING', 'READY', 'FAILED', 'EXPIRED');
ALTER TABLE "public"."media_attachments" ALTER COLUMN "processing_status" DROP DEFAULT;
ALTER TABLE "media_attachments" ALTER COLUMN "processing_status" TYPE "media_processing_status_new" USING ("processing_status"::text::"media_processing_status_new");
ALTER TYPE "media_processing_status" RENAME TO "media_processing_status_old";
ALTER TYPE "media_processing_status_new" RENAME TO "media_processing_status";
DROP TYPE "public"."media_processing_status_old";
ALTER TABLE "media_attachments" ALTER COLUMN "processing_status" SET DEFAULT 'PENDING';
COMMIT;

-- AlterTable
ALTER TABLE "media_attachments" ADD COLUMN     "retry_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "s3_key_temp" VARCHAR(500),
ADD COLUMN     "upload_id" VARCHAR(36);

-- CreateIndex
CREATE UNIQUE INDEX "media_attachments_upload_id_key" ON "media_attachments"("upload_id");

-- CreateIndex
CREATE INDEX "media_attachments_upload_id_idx" ON "media_attachments"("upload_id");
