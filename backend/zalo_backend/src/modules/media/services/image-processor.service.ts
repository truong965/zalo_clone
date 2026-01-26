// // Week 8: image-processor.service.ts
// async processImage(buffer: Buffer, mimeType: string) {
//   try {
//     // ✅ This will FAIL if image is corrupted or exploit
//     const image = sharp(buffer);
//     const metadata = await image.metadata();

//     if (!metadata.width || !metadata.height) {
//       throw new Error('Invalid image - missing dimensions');
//     }

//     // Generate thumbnail (this also validates the image can be decoded)
//     const thumbnail = await image.resize(300, 300).jpeg().toBuffer();

//     return { thumbnail, width: metadata.width, height: metadata.height };
//   } catch (error) {
//     throw new Error(`Image processing failed: ${error.message}`);
//     // Worker will mark as FAILED
//   }
// }
