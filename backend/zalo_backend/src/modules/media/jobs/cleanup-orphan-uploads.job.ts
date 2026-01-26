// // src/modules/media/jobs/cleanup-orphan-uploads.job.ts

// import { Injectable, Logger } from '@nestjs/common';
// import { Cron, CronExpression } from '@nestjs/schedule';
// import { PrismaService } from 'src/modules/prisma/prisma.service';
// import { S3Service } from '../services/s3.service';
// import { MediaProcessingStatus } from '@prisma/client';
// import { ConfigService } from '@nestjs/config';

// @Injectable()
// export class CleanupOrphanUploadsJob {
//   private readonly logger = new Logger(CleanupOrphanUploadsJob.name);
//   private readonly enabled: boolean;
//   private readonly ageMinutes: number;

//   constructor(
//     private readonly prisma: PrismaService,
//     private readonly s3: S3Service,
//     private readonly config: ConfigService,
//   ) {
//     this.enabled = this.config.get('media.cleanup.orphanUploadsEnabled', true);
//     this.ageMinutes = this.config.get(
//       'media.cleanup.orphanUploadsAgeMinutes',
//       30,
//     );
//   }

//   /**
//    * Run every 30 minutes
//    * Delete UPLOADING records older than 30 minutes
//    */
//   @Cron(CronExpression.EVERY_30_MINUTES)
//   async handleOrphanUploads() {
//     if (!this.enabled) {
//       return;
//     }

//     const cutoffTime = new Date(Date.now() - this.ageMinutes * 60 * 1000);

//     try {
//       // Find orphan uploads
//       const orphans = await this.prisma.mediaAttachment.findMany({
//         where: {
//           processingStatus: MediaProcessingStatus.UPLOADING,
//           createdAt: {
//             lt: cutoffTime,
//           },
//         },
//         select: {
//           id: true,
//           s3Key: true,
//           uploadedBy: true,
//         },
//       });

//       if (orphans.length === 0) {
//         this.logger.debug('No orphan uploads found');
//         return;
//       }

//       this.logger.log(`Found ${orphans.length} orphan uploads to clean`);

//       // Delete from S3 (if still in temp/)
//       for (const orphan of orphans) {
//         if (orphan.s3Key.startsWith('temp/')) {
//           await this.s3.deleteFile(orphan.s3Key).catch((err) => {
//             this.logger.warn(`Failed to delete ${orphan.s3Key}`, err);
//           });
//         }
//       }

//       // Mark as FAILED in database
//       await this.prisma.mediaAttachment.updateMany({
//         where: {
//           id: {
//             in: orphans.map((o) => o.id),
//           },
//         },
//         data: {
//           processingStatus: MediaProcessingStatus.FAILED,
//           processingError: 'Upload timeout - client did not confirm',
//         },
//       });

//       this.logger.log(`Cleaned ${orphans.length} orphan uploads`);
//     } catch (error) {
//       this.logger.error('Error cleaning orphan uploads', error.stack);
//     }
//   }
// }
