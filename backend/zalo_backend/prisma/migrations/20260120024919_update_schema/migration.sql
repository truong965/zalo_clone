/*
  Warnings:

  - Made the column `password_hash` on table `users` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "created_by" UUID,
ADD COLUMN     "deleted_by" UUID,
ADD COLUMN     "updated_by" UUID;

-- AlterTable
ALTER TABLE "friendships" ADD COLUMN     "deleted_at" TIMESTAMPTZ,
ADD COLUMN     "deleted_by" UUID,
ADD COLUMN     "updated_by" UUID;

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "updated_by" UUID;

-- AlterTable
ALTER TABLE "privacy_settings" ADD COLUMN     "updated_by" UUID;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "created_by" UUID,
ADD COLUMN     "deleted_by" UUID,
ADD COLUMN     "updated_by" UUID,
ALTER COLUMN "password_hash" SET NOT NULL,
ALTER COLUMN "updated_at" DROP NOT NULL;
