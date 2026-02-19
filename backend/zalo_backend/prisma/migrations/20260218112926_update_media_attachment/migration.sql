/*
  Warnings:

  - You are about to drop the column `hlsPlaylistUrl` on the `media_attachments` table. All the data in the column will be lost.
  - You are about to drop the column `optimizedUrl` on the `media_attachments` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "media_attachments" DROP COLUMN "hlsPlaylistUrl",
DROP COLUMN "optimizedUrl",
ADD COLUMN     "hls_playlist_url" VARCHAR(1000),
ADD COLUMN     "optimized_s3_key" VARCHAR(500),
ADD COLUMN     "optimized_url" VARCHAR(1000);
