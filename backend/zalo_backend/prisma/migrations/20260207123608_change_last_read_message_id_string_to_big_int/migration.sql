/*
  Warnings:

  - The `last_read_message_id` column on the `conversation_members` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "conversation_members" DROP COLUMN "last_read_message_id",
ADD COLUMN     "last_read_message_id" BIGINT;
