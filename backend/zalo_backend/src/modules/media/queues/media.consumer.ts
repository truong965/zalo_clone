// src/modules/media/queues/media.consumer.ts
// FIXED: All 3 critical bugs resolved
// - Bug #1: Payload mutation doesn't propagate → FIXED with DB re-fetch
// - Bug #2: Worker processes file with stale temp key → FIXED
// - Bug #3: Video processor same issue → FIXED

import {
  Processor,
  Process,
  OnQueueActive,
  OnQueueCompleted,
  OnQueueFailed,
} from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { PrismaService } from 'src/database/prisma.service';
import {
  ImageProcessingJob,
  ImageProcessorService,
} from '../processors/image.processor';
import {
  VideoProcessingJob,
  VideoProcessorService,
} from '../processors/video.processor';
import { MediaJobData, MEDIA_QUEUE_NAME } from './media-queue.service';
import { MediaProgressGateway } from '../gateways/media-progress.gateway';
import {
  MediaAttachment,
  MediaProcessingStatus,
  MediaType,
  Prisma,
} from '@prisma/client';
import { S3Service } from '../services/s3.service';
import { FileValidationService } from '../services/file-validation.service';
import { createHash } from 'crypto';
import fs from 'fs';
import { writeFile } from 'fs/promises';
@Processor(MEDIA_QUEUE_NAME)
export class MediaConsumer {
  private readonly logger = new Logger(MediaConsumer.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Service: S3Service,
    private readonly fileValidation: FileValidationService,
    private readonly imageProcessor: ImageProcessorService,
    private readonly videoProcessor: VideoProcessorService,
    private readonly progressGateway: MediaProgressGateway,
  ) {}

  /**
   * Process jobs based on type
   * FIXED: Re-fetch DB after move to prevent stale s3Key in payload
   */
  @Process()
  async handleJob(job: Job<MediaJobData>): Promise<void> {
    const { type, payload } = job.data;

    this.logger.log(
      `Processing ${type} job ${job.id} for media ${payload.mediaId}`,
    );

    // STEP 1: VALIDATE & MOVE (Common Logic)
    // ✅ FIXED: Retry logic for eventual consistency in Docker
    let media: MediaAttachment | null = null;
    let retries = 0;
    const maxRetries = 5;
    const baseDelay = 500; // 500ms

    while (!media && retries < maxRetries) {
      try {
        media = await this.prisma.mediaAttachment.findUnique({
          where: { id: payload.mediaId },
        });

        if (media) break;

        retries++;
        if (retries < maxRetries) {
          const delay = baseDelay * Math.pow(2, retries - 1); // Exponential backoff
          this.logger.debug(
            `Media ${payload.mediaId} not found (attempt ${retries}/${maxRetries}), retrying in ${delay}ms...`,
          );
          await new Promise((r) => setTimeout(r, delay));
        }
      } catch (error) {
        retries++;
        if (retries < maxRetries) {
          const delay = baseDelay * Math.pow(2, retries - 1);
          this.logger.warn(
            `Error querying media ${payload.mediaId}: ${(error as Error).message}, retrying in ${delay}ms...`,
          );
          await new Promise((r) => setTimeout(r, delay));
        } else {
          throw error;
        }
      }
    }

    if (!media) {
      throw new Error(
        `Media not found after ${maxRetries} attempts: ${payload.mediaId}`,
      );
    }

    // If file still in temp location, validate and move it
    if (media.s3KeyTemp) {
      this.logger.debug(
        `File in temp, validating and moving: ${media.s3KeyTemp}`,
      );

      await this.validateAndMoveMedia(
        media.id,
        media.s3KeyTemp,
        media.uploadId!,
      );

      // ✅ CRITICAL FIX: Re-fetch DB to get updated permanent key
      const updatedMedia = await this.prisma.mediaAttachment.findUnique({
        where: { id: payload.mediaId },
      });

      if (!updatedMedia || !updatedMedia.s3Key) {
        throw new Error('Failed to get permanent key after move');
      }

      // Create fresh payload with permanent key
      payload.s3Key = updatedMedia.s3Key;

      this.logger.debug(`File moved to permanent: ${payload.s3Key}`);
    } else if (media.s3Key) {
      // File already in permanent location (retry scenario)
      payload.s3Key = media.s3Key;
      this.logger.debug(`File already in permanent: ${payload.s3Key}`);
    } else {
      throw new Error('Media has no s3Key (neither temp nor permanent)');
    }
    const tempFilePath = `/tmp/${payload.mediaId}_${Date.now()}`;

    //  STEP 2: PROCESSING (Resize / Transcode)
    try {
      this.logger.log(`📥 Downloading for validation: ${payload.s3Key}`);
      // 1. Download từ S3 Temp về Disk
      // 1. ✅ FIX: Download trả về Buffer (không phải lưu trực tiếp)
      const fileBuffer = await this.s3Service.downloadFile(payload.s3Key);

      // 2. ✅ FIX: Ghi Buffer ra đĩa để FileValidationService có file mà quét (ClamAV/FFprobe)
      await writeFile(tempFilePath, fileBuffer);

      // 3. Validation & Security Scan (Giữ nguyên logic bảo mật)
      this.logger.log(`🛡️ Validating & Scanning...`);
      const validationResult =
        await this.fileValidation.validateFileOnDisk(tempFilePath);

      if (!validationResult.isValid) {
        throw new Error(`Security Violation: ${validationResult.reason}`);
      }

      // Check Mime Type khớp
      if (validationResult.mimeType !== media.mimeType) {
        // (Có thể bỏ qua nếu bạn muốn lỏng tay, nhưng tốt nhất là nên check)
        this.logger.warn(
          `Mime mismatch: DB=${media.mimeType}, Real=${validationResult.mimeType}`,
        );
      }

      if (type === MediaType.IMAGE) {
        await this.processImage(job, payload as ImageProcessingJob);
      } else if (type === MediaType.VIDEO) {
        await this.processVideo(job, payload as VideoProcessingJob);
      } else if (type === MediaType.AUDIO || type === MediaType.DOCUMENT) {
        // For AUDIO and DOCUMENT: validation & move is enough
        // No thumbnail/transcoding needed
        // await this.prisma.mediaAttachment.update({
        //   where: { id: payload.mediaId },
        //   data: { processingStatus: MediaProcessingStatus.READY },
        // });

        // this.progressGateway.sendProgress(payload.mediaId, {
        //   status: 'completed',
        //   progress: 100,
        // });

        // this.logger.log(
        //   `Processing complete for ${type} (no advanced processing needed)`,
        // );
        // ✅ Với Audio/Doc: Sau khi validate thành công ở bước 2, chỉ cần Move file
        // Không cần gọi processor phức tạp
        const permanentKey = this.generatePermanentKey(
          payload.mediaId,
          media.mimeType,
        );

        // Upload file sạch lên Permanent S3
        await this.s3Service.uploadFile(
          permanentKey,
          fileBuffer,
          media.mimeType,
        );

        // Update DB
        await this.updateMediaStatus(
          payload.mediaId,
          MediaProcessingStatus.READY,
          permanentKey,
        );
      } else {
        throw new Error(`Unknown media type: ${type as string}`);
      }
    } catch (error) {
      this.logger.error(`Job ${job.id} failed during processing`, error);
      throw error; // Bull will retry based on config
    } finally {
      // Dọn dẹp file temp trên disk
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    }
  }

  /**
   * Core Logic moved from API to Worker
   * Validate File -> Generate Key -> Move S3 -> Update DB
   */
  private async validateAndMoveMedia(
    mediaId: string,
    tempKey: string,
    uploadId: string,
  ): Promise<string> {
    this.progressGateway.sendProgress(mediaId, {
      status: 'processing',
      progress: 5,
    });

    let tempFilePath: string | null = null;
    try {
      // 1. Download to Temp (Stream)
      tempFilePath = await this.s3Service.downloadToLocalTemp(tempKey);

      // 2. Deep Validation
      const validation =
        await this.fileValidation.validateFileOnDisk(tempFilePath);

      if (!validation.isValid) {
        throw new Error(`Validation Failed: ${validation.reason}`);
      }

      // 3. Generate Permanent Key
      const realExt = validation.extension || 'bin';
      const realMime = validation.mimeType || 'application/octet-stream';
      const permanentKey = this.generatePermanentKey(uploadId, realExt);

      // 4. Move S3 (Atomic)
      await this.s3Service.moveObjectAtomic(tempKey, permanentKey);

      // 5. Update DB (Critical Step)
      await this.prisma.mediaAttachment.update({
        where: { id: mediaId },
        data: {
          s3Key: permanentKey,
          s3KeyTemp: null, // Clear temp key
          mimeType: realMime,
          cdnUrl: this.s3Service.getCloudFrontUrl(permanentKey),
          width: validation.metadata?.width,
          height: validation.metadata?.height,
          duration: validation.metadata?.duration,
        },
      });

      return permanentKey;
    } catch (error) {
      // Cleanup S3 temp file if validation failed
      await this.s3Service.deleteFile(tempKey).catch(() => {});
      throw error;
    } finally {
      // Cleanup local temp file
      if (tempFilePath) {
        await fs.promises.unlink(tempFilePath).catch(() => {});
      }
    }
  }

  private generatePermanentKey(uploadId: string, extension: string): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const fileHash = createHash('md5')
      .update(uploadId)
      .digest('hex')
      .substring(0, 12);
    return `permanent/${year}/${month}/unlinked/${fileHash}.${extension}`;
  }

  /**
   * Process image job
   */
  private async processImage(
    job: Job,
    payload: ImageProcessingJob,
  ): Promise<void> {
    const { mediaId } = payload;

    // Update status to PROCESSING
    await this.updateMediaStatus(mediaId, MediaProcessingStatus.PROCESSING);
    this.progressGateway.sendProgress(mediaId, {
      status: 'processing',
      progress: 0,
    });

    // Process image
    const result = await this.imageProcessor.processImage(payload);

    // Update progress
    await job.progress(50);
    this.progressGateway.sendProgress(mediaId, {
      status: 'processing',
      progress: 50,
    });

    // Update database with thumbnail URLs
    await this.prisma.mediaAttachment.update({
      where: { id: mediaId },
      data: {
        processingStatus: MediaProcessingStatus.READY,
        thumbnailUrl: this.buildCdnUrl(result.thumbnail.s3Key),
        optimizedUrl: result.optimized
          ? this.buildCdnUrl(result.optimized.s3Key)
          : null,
        processingError: null,
      },
    });

    // Final progress update
    await job.progress(100);
    this.progressGateway.sendProgress(mediaId, {
      status: 'completed',
      progress: 100,
      thumbnailUrl: this.buildCdnUrl(result.thumbnail.s3Key),
    });

    this.logger.log(`Image processing completed: ${mediaId}`);
  }

  /**
   * Process video job
   */
  private async processVideo(
    job: Job,
    payload: VideoProcessingJob,
  ): Promise<void> {
    const { mediaId } = payload;

    await this.updateMediaStatus(mediaId, MediaProcessingStatus.PROCESSING);
    this.progressGateway.sendProgress(mediaId, {
      status: 'processing',
      progress: 0,
    });

    // Process video (this may take several minutes)
    const result = await this.videoProcessor.processVideo(payload);

    await job.progress(80);
    this.progressGateway.sendProgress(mediaId, {
      status: 'processing',
      progress: 80,
    });

    // Update database
    await this.prisma.mediaAttachment.update({
      where: { id: mediaId },
      data: {
        processingStatus: MediaProcessingStatus.READY,
        thumbnailUrl: this.buildCdnUrl(result.thumbnail.s3Key),
        hlsPlaylistUrl: result.hls
          ? this.buildCdnUrl(result.hls.playlistKey)
          : null,
        processingError: null,
      },
    });

    await job.progress(100);
    this.progressGateway.sendProgress(mediaId, {
      status: 'completed',
      progress: 100,
      thumbnailUrl: this.buildCdnUrl(result.thumbnail.s3Key),
      hlsPlaylistUrl: result.hls
        ? this.buildCdnUrl(result.hls.playlistKey)
        : undefined,
    });

    this.logger.log(`Video processing completed: ${mediaId}`);
  }

  /**
   * Job lifecycle hooks
   */
  @OnQueueActive()
  onActive(job: Job) {
    this.logger.debug(`Job ${job.id} started processing`);
  }

  @OnQueueCompleted()
  onCompleted(job: Job) {
    this.logger.log(`Job ${job.id} completed successfully`);
  }

  @OnQueueFailed()
  async onFailed(job: Job<MediaJobData>, error: Error) {
    this.logger.error(
      `Job ${job.id} failed after ${job.attemptsMade} attempts`,
      error,
    );

    // Mark as FAILED in database after all retries exhausted
    const { payload } = job.data;
    const mediaId = payload.mediaId;

    try {
      await this.prisma.mediaAttachment.update({
        where: { id: mediaId },
        data: {
          processingStatus: MediaProcessingStatus.FAILED,
          processingError: error.message,
          retryCount: job.attemptsMade,
        },
      });
    } catch (err) {
      // Record might not exist if AUDIO/DOCUMENT was processed inline
      this.logger.warn(
        `Could not update media ${mediaId} on job failure: ${(err as Error).message}`,
      );
    }

    // Notify client
    this.progressGateway.sendProgress(mediaId, {
      status: 'failed',
      progress: 0,
      error: 'Processing failed. Please try again.',
    });

    // Cleanup S3 temp files if job fails completely
    const media = await this.prisma.mediaAttachment.findUnique({
      where: { id: mediaId },
    });
    if (media?.s3KeyTemp) {
      await this.s3Service.deleteFile(media.s3KeyTemp).catch(() => {});
    }
  }

  /**
   * Helper: Update media status
   */
  private async updateMediaStatus(
    mediaId: string,
    status: MediaProcessingStatus,
    s3Key?: string,
    size?: bigint,
  ): Promise<void> {
    const data: Prisma.MediaAttachmentUpdateInput = {
      processingStatus: status,
    };

    // Nếu có key mới (khi move sang permanent), update luôn
    if (s3Key) {
      data.s3Key = s3Key;
      data.s3KeyTemp = null; // Xóa key temp đi cho sạch
    }

    if (size) {
      data.size = size;
    }

    await this.prisma.mediaAttachment.update({
      where: { id: mediaId },
      data: data,
    });
  }

  /**
   * Helper: Build CDN URL
   */
  private buildCdnUrl(s3Key: string): string {
    return this.s3Service.getCloudFrontUrl(s3Key);
  }
}
