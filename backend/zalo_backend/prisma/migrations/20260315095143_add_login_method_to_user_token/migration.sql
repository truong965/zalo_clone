-- CreateEnum
CREATE TYPE "login_method" AS ENUM ('PASSWORD', 'QR_CODE');

-- AlterEnum
ALTER TYPE "event_type" ADD VALUE 'CONVERSATION_DISSOLVED';

-- AlterEnum
ALTER TYPE "token_revocation_reason" ADD VALUE 'NEW_LOGIN_OVERRIDE';

-- AlterTable
ALTER TABLE "user_tokens" ADD COLUMN     "login_method" "login_method" NOT NULL DEFAULT 'PASSWORD';
