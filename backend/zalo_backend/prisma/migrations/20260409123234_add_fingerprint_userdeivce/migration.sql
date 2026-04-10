-- AlterTable
ALTER TABLE "user_devices" ADD COLUMN     "fingerprint" VARCHAR(64);

-- CreateIndex
CREATE INDEX "user_devices_user_id_fingerprint_idx" ON "user_devices"("user_id", "fingerprint");
