/*
  Warnings:

  - You are about to drop the column `type` on the `media_attachments` table. All the data in the column will be lost.
  - You are about to drop the column `url` on the `media_attachments` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[s3_key]` on the table `media_attachments` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `media_type` to the `media_attachments` table without a default value. This is not possible if the table is not empty.
  - Added the required column `mime_type` to the `media_attachments` table without a default value. This is not possible if the table is not empty.
  - Added the required column `original_name` to the `media_attachments` table without a default value. This is not possible if the table is not empty.
  - Added the required column `s3_bucket` to the `media_attachments` table without a default value. This is not possible if the table is not empty.
  - Added the required column `s3_key` to the `media_attachments` table without a default value. This is not possible if the table is not empty.
  - Added the required column `uploaded_by` to the `media_attachments` table without a default value. This is not possible if the table is not empty.
  - Made the column `size` on table `media_attachments` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "media_type" AS ENUM ('IMAGE', 'VIDEO', 'DOCUMENT', 'AUDIO');

-- CreateEnum
CREATE TYPE "media_processing_status" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "media_attachments" DROP COLUMN "type",
DROP COLUMN "url",
ADD COLUMN     "cdn_url" VARCHAR(1000),
ADD COLUMN     "duration" INTEGER,
ADD COLUMN     "height" INTEGER,
ADD COLUMN     "media_type" "media_type" NOT NULL,
ADD COLUMN     "mime_type" VARCHAR(100) NOT NULL,
ADD COLUMN     "original_name" VARCHAR(255) NOT NULL,
ADD COLUMN     "processed_at" TIMESTAMPTZ,
ADD COLUMN     "processing_error" TEXT,
ADD COLUMN     "processing_status" "media_processing_status" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "s3_bucket" VARCHAR(100) NOT NULL,
ADD COLUMN     "s3_key" VARCHAR(500) NOT NULL,
ADD COLUMN     "thumbnail_s3_key" VARCHAR(500),
ADD COLUMN     "thumbnail_url" VARCHAR(1000),
ADD COLUMN     "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "uploaded_by" UUID NOT NULL,
ADD COLUMN     "uploaded_from" VARCHAR(50),
ADD COLUMN     "width" INTEGER,
ALTER COLUMN "message_id" DROP NOT NULL,
ALTER COLUMN "size" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "media_attachments_s3_key_key" ON "media_attachments"("s3_key");

-- CreateIndex
CREATE INDEX "media_attachments_uploaded_by_created_at_idx" ON "media_attachments"("uploaded_by", "created_at" DESC);

-- CreateIndex
CREATE INDEX "media_attachments_processing_status_idx" ON "media_attachments"("processing_status");

-- CreateIndex
CREATE INDEX "media_attachments_s3_key_idx" ON "media_attachments"("s3_key");

-- CreateIndex
CREATE INDEX "media_attachments_message_id_idx" ON "media_attachments"("message_id");

-- CreateIndex
CREATE INDEX "media_attachments_created_at_idx" ON "media_attachments"("created_at");

-- AddForeignKey
ALTER TABLE "media_attachments" ADD CONSTRAINT "media_attachments_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
