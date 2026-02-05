-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "event_type" ADD VALUE 'CONVERSATION_MEMBER_ADDED';
ALTER TYPE "event_type" ADD VALUE 'CONVERSATION_MEMBER_LEFT';
ALTER TYPE "event_type" ADD VALUE 'CONVERSATION_MEMBER_PROMOTED';
ALTER TYPE "event_type" ADD VALUE 'CONVERSATION_MEMBER_DEMOTED';
