/*
  Warnings:

  - A unique constraint covering the columns `[client_message_id]` on the table `messages` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "messages_client_message_id_key" ON "messages"("client_message_id");
