// // Week 8: video-processor.service.ts
// async processVideo(buffer: Buffer, uploadId: string) {
//   const tempFile = `/tmp/${uploadId}.mp4`;

//   try {
//     await fs.writeFile(tempFile, buffer);

//     // ✅ ffprobe will FAIL if video is corrupted or exploit
//     const metadata = await this.getVideoMetadata(tempFile);

//     if (metadata.duration > 180) {
//       throw new Error('Video exceeds 3 minute limit');
//     }

//     // Extract thumbnail
//     const thumbnail = await this.extractThumbnail(tempFile);

//     return { thumbnail, ...metadata };
//   } finally {
//     await fs.unlink(tempFile);
//   }
// }
