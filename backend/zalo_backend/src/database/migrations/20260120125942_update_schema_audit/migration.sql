/*
  Warnings:

  - You are about to drop the column `created_at` on the `privacy_settings` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[api_path,method,module]` on the table `permissions` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "media_attachments" ADD COLUMN     "deleted_by" UUID;

-- AlterTable
ALTER TABLE "privacy_settings" DROP COLUMN "created_at";

-- CreateIndex
CREATE UNIQUE INDEX "permissions_api_path_method_module_key" ON "permissions"("api_path", "method", "module");
