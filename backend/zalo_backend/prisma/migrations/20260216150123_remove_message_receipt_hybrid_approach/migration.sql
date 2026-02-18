-- Migration: Remove MessageReceipt table, add hybrid receipt columns to Message
-- Phase A of MESSAGE-RECEIPT-OPTIMIZATION-PLAN.md

-- Step 1: Add new receipt columns to messages table
ALTER TABLE "messages" ADD COLUMN "delivered_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "messages" ADD COLUMN "seen_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "messages" ADD COLUMN "total_recipients" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "messages" ADD COLUMN "direct_receipts" JSONB;

-- Step 2: Drop indexes on message_receipts
DROP INDEX IF EXISTS "message_receipts_user_id_status_timestamp_idx";
DROP INDEX IF EXISTS "message_receipts_message_id_status_idx";

-- Step 3: Drop the message_receipts table
DROP TABLE IF EXISTS "message_receipts";

-- Step 4: Drop the receipt_status enum type
DROP TYPE IF EXISTS "receipt_status";
