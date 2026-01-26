-- AlterEnum
ALTER TYPE "message_type" ADD VALUE 'AUDIO';

-- AlterTable
ALTER TABLE "media_attachments" ALTER COLUMN "s3_key" DROP NOT NULL;
