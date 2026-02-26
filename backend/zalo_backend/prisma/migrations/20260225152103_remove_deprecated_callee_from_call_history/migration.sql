/*
  Warnings:

  - You are about to drop the column `callee_id` on the `call_history` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "call_history" DROP CONSTRAINT "call_history_callee_id_fkey";

-- AlterTable
ALTER TABLE "call_history" DROP COLUMN "callee_id";
