// src/modules/media/services/s3-cleanup.service.ts
import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { ConfigType } from '@nestjs/config';
import uploadConfig from 'src/config/upload.config';
import { S3Service } from './s3.service';
import { PrismaService } from 'src/database/prisma.service';
import {
  MediaAttachment,
  MediaProcessingStatus,
  MediaType,
} from '@prisma/client';
import * as path from 'path'; // Cần để parse đường dẫn HLS

interface CleanupResult {
  deletedFiles: number;
  deletedFolders: number;
  abortedMultipart: number;
  failedOperations: number;
  errors: string[];
}

@Injectable()
export class S3CleanupService {
  private readonly logger = new Logger(S3CleanupService.name);

  constructor(
    private readonly s3Service: S3Service,
    private readonly prisma: PrismaService,
    @Inject(uploadConfig.KEY)
    private readonly config: ConfigType<typeof uploadConfig>,
  ) { }

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async scheduledCleanup(): Promise<void> {
    this.logger.log('Starting scheduled S3 cleanup...');
    await this.cleanupNow();
  }

  async cleanupNow(): Promise<CleanupResult> {
    const result: CleanupResult = {
      deletedFiles: 0,
      deletedFolders: 0,
      abortedMultipart: 0,
      failedOperations: 0,
      errors: [],
    };

    try {
      // 1. Dọn dẹp Multipart uploads bị treo (Tiết kiệm chi phí nhất)
      result.abortedMultipart =
        await this.s3Service.abortIncompleteMultipartUploads('temp/');

      // 2. Xử lý "Stale Uploads" (Upload dở dang quá 24h)
      // FIX: Đổi tên hàm cho đúng ngữ nghĩa
      const staleCount = await this.cleanupStalePendingUploads();
      result.deletedFiles += staleCount;

      // 3. Xóa file của các Job đã Failed quá 7 ngày
      const failedCount = await this.cleanFailedUploads();
      result.deletedFiles += failedCount;

      // 4. NEW: Xóa vật lý các file đã Soft Delete quá 30 ngày
      const softDeletedCount = await this.cleanupSoftDeletedMedia();
      result.deletedFiles += softDeletedCount;

      this.logger.log('Cleanup completed', result);
      return result;
    } catch (error) {
      this.logger.error('Cleanup failed', error);
      result.errors.push((error as Error).message);
      return result;
    }
  }

  /**
   * FIX LOGIC: Xử lý các upload đang treo ở PENDING/UPLOADED quá lâu (24h)
   * Đây là trường hợp User upload xong nhưng không bao giờ bấm "Gửi" hoặc "Confirm"
   */
  private async cleanupStalePendingUploads(): Promise<number> {
    try {
      const threshold = new Date(
        Date.now() - this.config.cleanup.tempFileMaxAgeHours * 60 * 60 * 1000,
      );

      const staleUploads = await this.prisma.mediaAttachment.findMany({
        where: {
          processingStatus: {
            in: [MediaProcessingStatus.PENDING, MediaProcessingStatus.UPLOADED],
          },
          createdAt: { lt: threshold },
          s3KeyTemp: { not: null }, // Chỉ quan tâm cái nào có key
        },
        select: { id: true, s3KeyTemp: true, uploadId: true },
        take: this.config.cleanup.batchSize, // Batch size để tránh overload
      });

      let deletedCount = 0;

      for (const upload of staleUploads) {
        try {
          // 1. Xóa file trên S3 (Dù tồn tại hay không, cứ gọi xóa cho chắc)
          if (upload.s3KeyTemp) {
            await this.s3Service.deleteFile(upload.s3KeyTemp);
          }

          // 2. Update DB status sang EXPIRED
          await this.prisma.mediaAttachment.update({
            where: { id: upload.id },
            data: {
              processingStatus: MediaProcessingStatus.EXPIRED,
              processingError: 'Upload timed out (Stale PENDING cleanup)',
              s3KeyTemp: null, // Clear key để không xóa lại lần sau
            },
          });

          deletedCount++;
        } catch (error) {
          this.logger.error(
            `Failed to clean stale upload ${upload.uploadId}`,
            error,
          );
        }
      }

      if (deletedCount > 0) {
        this.logger.log(`Cleaned ${deletedCount} stale PENDING uploads`);
      }
      return deletedCount;
    } catch (error) {
      this.logger.error('Error in cleanupStalePendingUploads', error);
      return 0;
    }
  }

  /**
   * Xóa file của các upload bị FAILED quá lâu
   */
  private async cleanFailedUploads(): Promise<number> {
    try {
      const threshold = new Date(
        Date.now() - this.config.cleanup.failedUploadMaxAgeDays * 24 * 60 * 60 * 1000,
      );

      const failedUploads = await this.prisma.mediaAttachment.findMany({
        where: {
          processingStatus: MediaProcessingStatus.FAILED,
          updatedAt: { lt: threshold },
          // Lấy những bản ghi vẫn còn giữ key rác
          OR: [{ s3KeyTemp: { not: null } }, { s3Key: { not: null } }],
        },
        take: this.config.cleanup.batchSize,
      });

      let deletedCount = 0;

      for (const upload of failedUploads) {
        try {
          // Helper xóa toàn bộ assets (Gốc, Temp, Thumb, HLS)
          await this.deleteMediaAssets(upload);

          // Clear keys trong DB nhưng giữ lại record để audit log lỗi
          await this.prisma.mediaAttachment.update({
            where: { id: upload.id },
            data: {
              s3Key: null,
              s3KeyTemp: null,
              thumbnailS3Key: null,
              hlsPlaylistUrl: null,
            },
          });

          deletedCount++;
        } catch (error) {
          this.logger.error(
            `Failed to clean FAILED upload ${upload.id}`,
            error,
          );
        }
      }

      return deletedCount;
    } catch (error) {
      this.logger.error('Error in cleanFailedUploads', error);
      return 0;
    }
  }

  /**
   * NEW: Xóa vật lý các file đã bị Soft Delete quá 30 ngày
   */
  private async cleanupSoftDeletedMedia(): Promise<number> {
    try {
      const threshold = new Date(
        Date.now() - this.config.cleanup.softDeletedMaxAgeDays * 24 * 60 * 60 * 1000,
      );

      const softDeletedMedia = await this.prisma.mediaAttachment.findMany({
        where: {
          deletedAt: { lt: threshold },
        },
        take: this.config.cleanup.batchSize,
      });

      let deletedCount = 0;

      for (const media of softDeletedMedia) {
        try {
          await this.deleteMediaAssets(media);

          // Xóa cứng record khỏi DB (Hard Delete)
          await this.prisma.mediaAttachment.delete({
            where: { id: media.id },
          });

          deletedCount++;
        } catch (error) {
          this.logger.error(`Failed to hard delete media ${media.id}`, error);
        }
      }

      if (deletedCount > 0) {
        this.logger.log(`Hard deleted ${deletedCount} soft-deleted items`);
      }
      return deletedCount;
    } catch (error) {
      this.logger.error('Error in cleanupSoftDeletedMedia', error);
      return 0;
    }
  }

  /**
   * Helper: Xóa toàn diện (File gốc, Temp, Thumbnails, HLS Folders)
   */
  private async deleteMediaAssets(media: MediaAttachment) {
    const promises: Promise<void>[] = [];

    // 1. Xóa Temp Key
    if (media.s3KeyTemp) {
      promises.push(this.s3Service.deleteFile(media.s3KeyTemp));
    }

    // 2. Xóa Permanent Key (Cẩn thận với Video HLS)
    if (media.s3Key) {
      if (media.mediaType === MediaType.VIDEO && media.hlsPlaylistUrl) {
        // Nếu là video HLS, s3Key thường trỏ đến file gốc mp4 hoặc folder
        // Logic generate key của bạn: `${dir}/${name}-hls/`
        // Cần xóa cả folder HLS
        const parsed = path.parse(media.s3Key);
        // Giả định cấu trúc folder HLS dựa trên logic trong video.processor.ts
        const hlsPrefix = `${parsed.dir}/${parsed.name}-hls/`;
        promises.push(this.s3Service.deleteFolder(hlsPrefix));
      }
      // Luôn xóa file gốc (mp4/jpg)
      promises.push(this.s3Service.deleteFile(media.s3Key));
    }

    // 3. Xóa Thumbnail
    if (media.thumbnailS3Key) {
      promises.push(this.s3Service.deleteFile(media.thumbnailS3Key));
    }

    // 4. Xóa Optimized Image
    if (media.mediaType === MediaType.IMAGE && media.optimizedUrl) {
      // Cần logic suy diễn key từ URL hoặc lưu optimizedS3Key vào DB
      // Ở đây giả định bạn có thể parse được key từ optimizedUrl hoặc nên thêm optimizedS3Key vào DB
      // promises.push(this.s3Service.deleteFile(derivedOptimizedKey));
    }

    await Promise.allSettled(promises);
  }

  /**
   * ✅ NEW: Clean temp folder completely (for testing/dev)
   * WARNING: Use with caution!
   */
  async cleanTempFolderCompletely(): Promise<number> {
    this.logger.warn(
      'Cleaning entire temp/ folder - ALL FILES WILL BE DELETED',
    );

    try {
      // First abort all multipart uploads
      const aborted =
        await this.s3Service.abortIncompleteMultipartUploads('temp/');
      this.logger.log(`Aborted ${aborted} multipart uploads`);

      // Then delete all temp files
      await this.s3Service.deleteFolder('temp/');

      // Update DB - clear all s3KeyTemp
      const updated = await this.prisma.mediaAttachment.updateMany({
        where: {
          s3KeyTemp: { not: null },
        },
        data: {
          s3KeyTemp: null,
          processingStatus: MediaProcessingStatus.FAILED,
          processingError: 'Temp folder cleaned (manual operation)',
        },
      });

      this.logger.warn('Temp folder cleaned completely', {
        abortedMultipart: aborted,
        updatedRecords: updated.count,
      });

      return updated.count;
    } catch (error) {
      this.logger.error('Failed to clean temp folder', {
        error: (error as Error).message,
      });
      throw error;
    }
  }
}
