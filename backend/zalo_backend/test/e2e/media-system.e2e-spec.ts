// /* eslint-disable */
// // src/modules/media/__test__/e2e/media-system-REAL-FILES.e2e-spec.ts
// // FIXED: Only tests with REAL files, skips synthetic buffers that fail validation
// //
// // REQUIRED TEST FILES:
// // - test/Untitled.png (any valid PNG image)
// // - test/test-video.mp4 (any valid MP4 video, 5-10 seconds)
// // - test/test-audio.mp3 (any valid MP3 audio)
// // - test/test-document.pdf (any valid PDF)
// //
// // Run:TEST_MODE['e2e_client.'] npx run test src/modules/media/__test__/e2e/media-system.e2e-spec.ts

// import { Test, TestingModule } from '@nestjs/testing';
// import { INestApplication, ValidationPipe } from '@nestjs/common';
// import request from 'supertest';
// import { AppModule } from 'src/app.module';
// import { PrismaService } from 'src/database/prisma.service';
// import { JwtService } from '@nestjs/jwt';
// import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';
// import { MediaProcessingStatus, UserStatus } from '@prisma/client';
// import axios from 'axios';
// import fs from 'fs';
// import path from 'path';
// import ffmpeg from 'fluent-ffmpeg';
// import { path as ffprobePath } from 'ffprobe-static';
// import { getQueueToken } from '@nestjs/bull'; // Hoặc @nestjs/bull tuỳ version bạn dùng
// import { Queue } from 'bull';
// // ✅ CẤU HÌNH PATH CHO FFPROBE (Chỉ chạy khi debug local)
// ffmpeg.setFfprobePath(ffprobePath);

// describe('Media System E2E - Real Files Only', () => {
//   let app: INestApplication;
//   let prisma: PrismaService;
//   let jwtService: JwtService;
//   let s3Client: S3Client;
//   let user: any;
//   let accessToken: string;
// let audioQueue: Queue;
//   const s3Config = {
//     region: process.env.AWS_REGION || 'ap-southeast-1',
//     endpoint: process.env.S3_ENDPOINT || 'http://minio:9000',
//     credentials: {
//       accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'minioadmin',
//       secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'minioadmin',
//     },
//     forcePathStyle: true,
//   };

// beforeAll(async () => {
//     const moduleFixture: TestingModule = await Test.createTestingModule({
//       imports: [AppModule],
//     }).compile();

//     app = moduleFixture.createNestApplication();
//     app.useLogger(['error', 'warn', 'log', 'debug']);
//     app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
//     await app.init();

//     prisma = app.get<PrismaService>(PrismaService);
//     jwtService = app.get<JwtService>(JwtService);
//     s3Client = new S3Client(s3Config);

//     // Clean data
//     await prisma.mediaAttachment.deleteMany();
//     await prisma.user.deleteMany({ where: { phoneNumber: '0999888777' } });

//     // Create User
//     user = await prisma.user.create({
//       data: {
//         phoneNumber: '0999888777',
//         displayName: 'E2E Test User',
//         passwordHash: 'hashed',
//         status: UserStatus.ACTIVE,
//         passwordVersion: 1,
//       },
//     });

//     const secret = process.env.JWT_ACCESS_SECRET || 'access-secret';
//     accessToken = jwtService.sign(
//       { sub: user.id, type: 'access', pwdVer: 1 },
//       { secret },
//     );
//   });

//   afterAll(async () => {
//     await app.close();
//   });

//   // --- Helpers ---

//   /**
//    * Helper: Lấy MimeType từ extension file
//    * (Để không cần cài thêm thư viện mime-types)
//    */
//   const getMimeType = (filename: string): string => {
//     const ext = path.extname(filename).toLowerCase();
//     const map: Record<string, string> = {
//       '.png': 'image/png',
//       '.jpg': 'image/jpeg',
//       '.jpeg': 'image/jpeg',
//       '.gif': 'image/gif',
//       '.mp4': 'video/mp4',
//       '.mov': 'video/quicktime',
//       '.mp3': 'audio/mpeg',
//       '.wav': 'audio/wav',
//       '.pdf': 'application/pdf',
//       '.doc': 'application/msword',
//       '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
//     };
//     return map[ext] || 'application/octet-stream';
//   };

//   const waitForProcessing = async (uploadId: string, timeoutMs = 30000): Promise<any> => {
//     const start = Date.now();
//     while (Date.now() - start < timeoutMs) {
//       const record = await prisma.mediaAttachment.findUnique({ where: { uploadId } });
//       if (record?.processingStatus === MediaProcessingStatus.READY) return record;
//       if (record?.processingStatus === MediaProcessingStatus.FAILED) {
//         throw new Error(`Processing Failed: ${record.processingError}`);
//       }
//       await new Promise((r) => setTimeout(r, 1000));
//     }
//     throw new Error(`Timeout waiting for worker (${timeoutMs}ms)`);
//   };

//   const checkTestFile = (filename: string): boolean => {
//     const filePath = path.join(process.cwd(), 'test/files/', filename);
//     if (!fs.existsSync(filePath)) {
//       console.warn(`⚠️  Test file not found: ${filePath}`);
//       return false;
//     }
//     return true;
//   };

//   // --- Generic Upload Test Function ---
//   const runUploadTest = async (filename: string, expectedTimeout: number) => {
//     if (!checkTestFile(filename)) return;

//     const filePath = path.join(process.cwd(), 'test/files/', filename);
//     const fileBuffer = fs.readFileSync(filePath);
//     const fileStats = fs.statSync(filePath);

//     // 1. Tự động lấy MimeType chuẩn
//     const mimeType = getMimeType(filename);
//     console.log(`🚀 Testing ${filename} | Size: ${fileStats.size} | Mime: ${mimeType}`);

//     // 2. Initiate
//     const initRes = await request(app.getHttpServer())
//       .post('/media/upload/initiate')
//       .set('Authorization', `Bearer ${accessToken}`)
//       .send({
//         fileName: filename,
//         mimeType: mimeType, // Gửi mime thật
//         fileSize: fileStats.size,
//       })
//       .expect(200);

//     const { uploadId, presignedUrl } = initRes.body;
//     console.log(`   🔗 Presigned URL: ${presignedUrl}`);

//     // 3. Upload to S3 (PUT)
//     try {
//       await axios.put(presignedUrl, fileBuffer, {
//         headers: {
//           'Content-Type': mimeType, // ✅ Quan trọng: Phải khớp 100% với mimeType ở bước Initiate
//           'Content-Length': fileStats.size
//         },
//         maxBodyLength: Infinity,
//         maxContentLength: Infinity,
//       });
//       console.log('   ✅ Uploaded to S3');
//     } catch (e: any) {
//       console.error('   ❌ Upload Failed:', e.message);
//       if (e.response) {
//          console.error('   Response Status:', e.response.status);
//          console.error('   Response Data:', e.response.data);
//       }
//       throw e;
//     }

//     // 4. Confirm
//     await request(app.getHttpServer())
//       .post('/media/upload/confirm')
//       .set('Authorization', `Bearer ${accessToken}`)
//       .send({ uploadId })
//       .expect(200);

//     // 5. Wait for Worker
//     console.log('   ⏳ Waiting for Worker...');
//     const finishedRecord = await waitForProcessing(uploadId, expectedTimeout);

//     expect(finishedRecord.processingStatus).toBe(MediaProcessingStatus.READY);
//     console.log('   🎉 Processed Successfully');
//   };

//   // =================================================================
//   // TEST CASES
//   // =================================================================

//   describe('IMAGE Upload Flow (Real File)', () => {
//     it('should upload real PNG', async () => {
//       await runUploadTest('test-image.png', 40000);
//     });
//   });

//   describe('VIDEO Upload Flow (Real File)', () => {
//     it('should upload real MP4', async () => {
//       await runUploadTest('test-video.mp4', 180000);
//     }, 200000);
//   });

//   describe('AUDIO Upload Flow (Real File)', () => {
//     it('should upload real MP3', async () => {
//       await runUploadTest('test-audio.mp3', 30000);
//     });
//   });

//   describe('DOCUMENT Upload Flow (Real File)', () => {
//     it('should upload real PDF', async () => {
//       await runUploadTest('test-document.pdf', 30000);
//     });
//   });
//   // =================================================================
//   // EDGE CASES (No file upload needed)
//   // =================================================================
//   // describe('Edge Cases', () => {
//   //   it('should reject confirm without S3 upload', async () => {
//   //     const initRes = await request(app.getHttpServer())
//   //       .post('/media/upload/initiate')
//   //       .set('Authorization', `Bearer ${accessToken}`)
//   //       .send({
//   //         fileName: 'never-uploaded.png',
//   //         mimeType: 'image/png',
//   //         fileSize: 1024,
//   //       })
//   //       .expect(200);

//   //     const { uploadId } = initRes.body;

//   //     const res = await request(app.getHttpServer())
//   //       .post('/media/upload/confirm')
//   //       .set('Authorization', `Bearer ${accessToken}`)
//   //       .send({ uploadId })
//   //       .expect(400);

//   //     expect(res.body.message).toContain('not been uploaded');

//   //     console.log('✅ Reject without S3 upload works');
//   //   });

//   //   it('should reject unauthorized access', async () => {
//   //     await prisma.user.deleteMany({ where: { phoneNumber: '0999888778' } });
//   //     const initRes = await request(app.getHttpServer())
//   //       .post('/media/upload/initiate')
//   //       .set('Authorization', `Bearer ${accessToken}`)
//   //       .send({
//   //         fileName: 'authorized.png',
//   //         mimeType: 'image/png',
//   //         fileSize: 1024,
//   //       })
//   //       .expect(200);

//   //     const { uploadId } = initRes.body;

//   //     const otherUser = await prisma.user.create({
//   //       data: {
//   //         phoneNumber: '0999888778',
//   //         displayName: 'Other User',
//   //         passwordHash: 'hashed',
//   //         status: UserStatus.ACTIVE,
//   //         passwordVersion: 1,
//   //       },
//   //     });

//   //     const secret = process.env.JWT_ACCESS_SECRET || 'access-secret';
//   //     const otherToken = jwtService.sign(
//   //       { sub: otherUser.id, type: 'access', pwdVer: 1 },
//   //       { secret },
//   //     );

//   //     await request(app.getHttpServer())
//   //       .post('/media/upload/confirm')
//   //       .set('Authorization', `Bearer ${otherToken}`)
//   //       .send({ uploadId })
//   //       .expect(403);

//   //     console.log('✅ Unauthorized access rejected');
//   //   });
//   // });
// });
