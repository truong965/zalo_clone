/*
  Warnings:

  - The values [OWNER] on the enum `member_role` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `system_role` on the `users` table. All the data in the column will be lost.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "member_role_new" AS ENUM ('ADMIN', 'MEMBER');
ALTER TABLE "public"."conversation_members" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "conversation_members" ALTER COLUMN "role" TYPE "member_role_new" USING ("role"::text::"member_role_new");
ALTER TYPE "member_role" RENAME TO "member_role_old";
ALTER TYPE "member_role_new" RENAME TO "member_role";
DROP TYPE "public"."member_role_old";
ALTER TABLE "conversation_members" ALTER COLUMN "role" SET DEFAULT 'MEMBER';
COMMIT;

-- DropIndex
DROP INDEX "users_system_role_idx";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "system_role",
ADD COLUMN     "role_id" UUID;

-- DropEnum
DROP TYPE "system_role_type";

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(50) NOT NULL,
    "description" VARCHAR(255),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "api_path" TEXT NOT NULL,
    "method" VARCHAR(10) NOT NULL,
    "module" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_name_key" ON "permissions"("name");

-- CreateIndex
CREATE INDEX "users_role_id_idx" ON "users"("role_id");

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
