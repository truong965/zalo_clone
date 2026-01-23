-- CreateTable
CREATE TABLE "socket_connections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "socket_id" VARCHAR(100) NOT NULL,
    "device_id" VARCHAR(255) NOT NULL,
    "server_instance" VARCHAR(50),
    "ip_address" VARCHAR(45) NOT NULL,
    "user_agent" TEXT,
    "connected_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disconnected_at" TIMESTAMPTZ,
    "disconnect_reason" VARCHAR(100),
    "messages_sent" INTEGER NOT NULL DEFAULT 0,
    "messages_received" INTEGER NOT NULL DEFAULT 0,
    "duration_seconds" INTEGER,

    CONSTRAINT "socket_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "presence_logs" (
    "id" BIGSERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "device_id" VARCHAR(255),
    "timestamp" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "presence_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "socket_connections_user_id_connected_at_idx" ON "socket_connections"("user_id", "connected_at" DESC);

-- CreateIndex
CREATE INDEX "socket_connections_socket_id_idx" ON "socket_connections"("socket_id");

-- CreateIndex
CREATE INDEX "socket_connections_server_instance_idx" ON "socket_connections"("server_instance");

-- CreateIndex
CREATE INDEX "socket_connections_connected_at_idx" ON "socket_connections"("connected_at");

-- CreateIndex
CREATE INDEX "presence_logs_user_id_timestamp_idx" ON "presence_logs"("user_id", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "presence_logs_timestamp_idx" ON "presence_logs"("timestamp");

-- AddForeignKey
ALTER TABLE "socket_connections" ADD CONSTRAINT "socket_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presence_logs" ADD CONSTRAINT "presence_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
