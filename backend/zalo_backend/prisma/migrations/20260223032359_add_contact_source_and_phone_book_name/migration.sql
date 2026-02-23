-- CreateEnum
CREATE TYPE "contact_source" AS ENUM ('PHONE_SYNC', 'MANUAL');

-- AlterTable
ALTER TABLE "user_contacts" ADD COLUMN     "phone_book_name" VARCHAR(100),
ADD COLUMN     "source" "contact_source" NOT NULL DEFAULT 'MANUAL';
