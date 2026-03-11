/*
  Warnings:

  - You are about to drop the `socket_connections` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "socket_connections" DROP CONSTRAINT "socket_connections_user_id_fkey";

-- DropTable
DROP TABLE "socket_connections";
