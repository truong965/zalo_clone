-- AlterTable
ALTER TABLE "permissions" ADD COLUMN     "created_by" UUID,
ADD COLUMN     "deleted_at" TIMESTAMPTZ,
ADD COLUMN     "deleted_by" UUID,
ADD COLUMN     "updated_by" UUID;

-- AlterTable
ALTER TABLE "roles" ADD COLUMN     "created_by" UUID,
ADD COLUMN     "deleted_at" TIMESTAMPTZ,
ADD COLUMN     "deleted_by" UUID,
ADD COLUMN     "updated_by" UUID;
