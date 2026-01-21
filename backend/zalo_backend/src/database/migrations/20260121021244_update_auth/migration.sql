-- CreateEnum
CREATE TYPE "device_type" AS ENUM ('WEB', 'MOBILE', 'DESKTOP');

-- CreateEnum
CREATE TYPE "platform" AS ENUM ('IOS', 'ANDROID', 'WEB', 'WINDOWS', 'MACOS', 'LINUX');

-- CreateEnum
CREATE TYPE "token_revocation_reason" AS ENUM ('MANUAL_LOGOUT', 'PASSWORD_CHANGED', 'SUSPICIOUS_ACTIVITY', 'TOKEN_ROTATION', 'ADMIN_ACTION');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "password_version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "user_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "refresh_token_hash" VARCHAR(64) NOT NULL,
    "device_id" VARCHAR(255) NOT NULL,
    "device_name" VARCHAR(100),
    "device_type" "device_type",
    "platform" "platform",
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "issued_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "last_used_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_revoked" BOOLEAN NOT NULL DEFAULT false,
    "revoked_at" TIMESTAMPTZ,
    "revoked_reason" "token_revocation_reason",
    "parent_token_id" UUID,

    CONSTRAINT "user_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_tokens_refresh_token_hash_key" ON "user_tokens"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "user_tokens_user_id_is_revoked_idx" ON "user_tokens"("user_id", "is_revoked");

-- CreateIndex
CREATE INDEX "user_tokens_refresh_token_hash_idx" ON "user_tokens"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "user_tokens_expires_at_idx" ON "user_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "user_tokens_last_used_at_idx" ON "user_tokens"("last_used_at");

-- CreateIndex
CREATE UNIQUE INDEX "user_tokens_user_id_device_id_key" ON "user_tokens"("user_id", "device_id");

-- AddForeignKey
ALTER TABLE "user_tokens" ADD CONSTRAINT "user_tokens_parent_token_id_fkey" FOREIGN KEY ("parent_token_id") REFERENCES "user_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_tokens" ADD CONSTRAINT "user_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
