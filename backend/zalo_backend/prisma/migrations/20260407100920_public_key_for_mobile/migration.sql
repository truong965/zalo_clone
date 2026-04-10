-- AlterTable
ALTER TABLE "user_devices" ADD COLUMN     "attestation_type" VARCHAR(20),
ADD COLUMN     "attestation_verified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "attested_at" TIMESTAMPTZ,
ADD COLUMN     "device_type" "device_type",
ADD COLUMN     "key_algorithm" VARCHAR(20),
ADD COLUMN     "public_key" TEXT,
ADD COLUMN     "registered_at" TIMESTAMPTZ,
ADD COLUMN     "registration_ip" VARCHAR(45);

-- CreateIndex
CREATE INDEX "user_devices_user_id_device_type_idx" ON "user_devices"("user_id", "device_type");

-- CreateIndex
CREATE INDEX "user_devices_user_id_last_active_at_idx" ON "user_devices"("user_id", "last_active_at" DESC);
