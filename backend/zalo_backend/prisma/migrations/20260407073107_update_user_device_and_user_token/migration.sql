/*
  Warnings:

  - Added the required column `device_name` to the `user_devices` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "token_revocation_reason" ADD VALUE 'ACCOUNT_DEACTIVATED';
ALTER TYPE "token_revocation_reason" ADD VALUE 'ACCOUNT_DELETED';

-- AlterTable
ALTER TABLE "user_devices" ADD COLUMN     "browser_name" VARCHAR(50),
ADD COLUMN     "browser_version" VARCHAR(50),
ADD COLUMN     "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "device_name" VARCHAR(200) NOT NULL,
ADD COLUMN     "is_trusted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "last_ip" VARCHAR(45),
ADD COLUMN     "last_location" VARCHAR(100),
ADD COLUMN     "os_name" VARCHAR(50),
ADD COLUMN     "os_version" VARCHAR(50),
ADD COLUMN     "trusted_at" TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "user_tokens" ADD COLUMN     "browser_name" VARCHAR(50),
ADD COLUMN     "browser_version" VARCHAR(50),
ADD COLUMN     "location" VARCHAR(100),
ADD COLUMN     "os_name" VARCHAR(50),
ADD COLUMN     "os_version" VARCHAR(50),
ALTER COLUMN "device_name" SET DATA TYPE VARCHAR(200);

-- CreateIndex
CREATE INDEX "user_devices_user_id_is_trusted_idx" ON "user_devices"("user_id", "is_trusted");
