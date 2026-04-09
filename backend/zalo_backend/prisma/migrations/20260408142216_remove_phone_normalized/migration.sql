/*
  Warnings:

  - You are about to drop the column `phone_number_normalized` on the `users` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "users_phone_number_normalized_idx";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "phone_number_normalized";
