-- CreateEnum
CREATE TYPE "two_factor_method" AS ENUM ('TOTP', 'SMS', 'EMAIL');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "login_method" ADD VALUE 'BIOMETRIC';
ALTER TYPE "login_method" ADD VALUE 'TWO_FACTOR';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "two_factor_backup_codes" TEXT[],
ADD COLUMN     "two_factor_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "two_factor_method" "two_factor_method",
ADD COLUMN     "two_factor_secret" TEXT,
ADD COLUMN     "two_factor_setup_at" TIMESTAMPTZ;
