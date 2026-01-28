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
import {
  MediaJobData,
  MEDIA_QUEUE_NAME,
  FileProcessingJob,
} from './media-queue.service';
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
import { writeFile, unlink } from 'fs/promises';
import {
  ERROR_MESSAGES,
  RETRY_CONFIG,
} from 'src/common/constants/media.constant';

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

  @Process()
  async handleJob(job: Job<MediaJobData>): Promise<void> {
    const { type, payload } = job.data;
    this.logger.log(
      `Processing ${type} job ${job.id} for media ${payload.mediaId}`,
    );

    // 1. Fetch Media Record (With Retry Logic Extracted)
    // Giảm thiểu code lặp, xử lý race condition
    const media = await this.fetchMediaWithRetry(payload.mediaId);

    // 2. Resolve S3 Key Consistency
    // Đảm bảo file nằm đúng chỗ (temp hoặc permanent) trước khi xử lý
    await this.ensureMediaConsistency(media, payload);

    const tempFilePath = `/tmp/${payload.mediaId}_${Date.now()}`;

    try {
      this.logger.log(`📥 Downloading for validation: ${payload.s3Key}`);

      // 3. Download & Validate (Standard Security Check)
      const fileBuffer = await this.s3Service.downloadFile(payload.s3Key);
      await writeFile(tempFilePath, fileBuffer);

      const validationResult =
        await this.fileValidation.validateFileOnDisk(tempFilePath);
      if (!validationResult.isValid) {
        throw new Error(
          `${ERROR_MESSAGES.SECURITY_VIOLATION}: ${validationResult.reason}`,
        );
      }

      // Check Mime Type integrity
      if (validationResult.mimeType !== media.mimeType) {
        this.logger.warn(
          `Mime mismatch: DB=${media.mimeType}, Real=${validationResult.mimeType}`,
        );
      }

      // 4. Routing Processing based on Type
      // Sử dụng switch-case rõ ràng hơn if-else
      switch (type) {
        case MediaType.IMAGE:
          await this.processImage(job, payload as ImageProcessingJob);
          break;

        case MediaType.VIDEO:
          await this.processVideo(job, payload as VideoProcessingJob);
          break;

        case MediaType.AUDIO:
        case MediaType.DOCUMENT:
          // Audio/Doc không cần transcode, chỉ cần move và update DB
          await this.processDirectFile(
            payload.mediaId,
            media.mimeType,
            fileBuffer,
          );
          break;

        default:
          throw new Error(`Unknown media type: ${type as string}`);
      }
    } catch (error) {
      this.logger.error(`Job ${job.id} failed processing`, error);
      throw error;
    } finally {
      // Clean up temp file (Always run)
      if (fs.existsSync(tempFilePath)) {
        await unlink(tempFilePath).catch(() => {});
      }
    }
  }

  // --- PRIVATE HELPERS (Code Cleaning) ---

  /**
   * Helper: Retry logic to fetch media from DB
   * Helps with Eventual Consistency or Race Conditions between API and Worker
   */
  private async fetchMediaWithRetry(mediaId: string): Promise<MediaAttachment> {
    let retries = 0;
    const { MAX_ATTEMPTS, BASE_DELAY_MS } = RETRY_CONFIG.DB_FETCH;

    while (retries < MAX_ATTEMPTS) {
      try {
        const media = await this.prisma.mediaAttachment.findUnique({
          where: { id: mediaId },
        });
        if (media) return media;

        // Exponential Backoff
        retries++;
        if (retries < MAX_ATTEMPTS) {
          const delay = BASE_DELAY_MS * Math.pow(2, retries - 1);
          this.logger.debug(
            `Media ${mediaId} missing, retry ${retries}/${MAX_ATTEMPTS} in ${delay}ms`,
          );
          await new Promise((r) => setTimeout(r, delay));
        }
      } catch (error) {
        retries++;
        if (retries >= MAX_ATTEMPTS) throw error;
        await new Promise((r) => setTimeout(r, BASE_DELAY_MS));
      }
    }
    throw new Error(`${ERROR_MESSAGES.MEDIA_NOT_FOUND}: ${mediaId}`);
  }

  /**
   * Helper: Ensure Payload has the correct S3 Key
   * Handles race condition where file might be in temp or already moved to permanent
   */
  private async ensureMediaConsistency(
    media: MediaAttachment,
    payload: ImageProcessingJob | VideoProcessingJob | FileProcessingJob,
  ) {
    if (media.s3KeyTemp) {
      // Nếu file vẫn ở temp (chưa ai move), worker tự move
      await this.validateAndMoveMedia(
        media.id,
        media.s3KeyTemp,
        media.uploadId!,
      );

      // Re-fetch để lấy permanent key mới nhất
      const updated = await this.prisma.mediaAttachment.findUnique({
        where: { id: media.id },
      });
      if (!updated?.s3Key)
        throw new Error('Failed to get permanent key after move');

      payload.s3Key = updated.s3Key;
    } else if (media.s3Key) {
      // File đã an toàn ở permanent
      payload.s3Key = media.s3Key;
    } else {
      throw new Error(ERROR_MESSAGES.S3_KEY_MISSING);
    }
  }

  /**
   * Helper: Process Audio/Document (Direct Move, No Transcoding)
   */
  private async processDirectFile(
    mediaId: string,
    mimeType: string,
    buffer: Buffer,
  ) {
    const permanentKey = this.generatePermanentKey(mediaId, mimeType);

    // Upload clean file (from buffer) to permanent location
    await this.s3Service.uploadFile(permanentKey, buffer, mimeType);

    // Update DB status to READY
    await this.updateMediaStatus(
      mediaId,
      MediaProcessingStatus.READY,
      permanentKey,
    );
    this.logger.log(`Direct file processed: ${mediaId}`);
  }

  // --- CORE LOGIC (Giữ nguyên logic cũ nhưng gọn hơn) ---

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
      tempFilePath = await this.s3Service.downloadToLocalTemp(tempKey);

      const validation =
        await this.fileValidation.validateFileOnDisk(tempFilePath);
      if (!validation.isValid)
        throw new Error(`Validation Failed: ${validation.reason}`);

      const permanentKey = this.generatePermanentKey(
        uploadId,
        validation.extension || 'bin',
      );
      await this.s3Service.moveObjectAtomic(tempKey, permanentKey);

      await this.prisma.mediaAttachment.update({
        where: { id: mediaId },
        data: {
          s3Key: permanentKey,
          s3KeyTemp: null,
          mimeType: validation.mimeType || 'application/octet-stream',
          cdnUrl: this.s3Service.getCloudFrontUrl(permanentKey),
          width: validation.metadata?.width,
          height: validation.metadata?.height,
          duration: validation.metadata?.duration,
        },
      });

      return permanentKey;
    } catch (error) {
      await this.s3Service.deleteFile(tempKey).catch(() => {}); // Cleanup S3
      throw error;
    } finally {
      if (tempFilePath) await unlink(tempFilePath).catch(() => {}); // Cleanup Local
    }
  }

  // ... (Các hàm processImage, processVideo, generatePermanentKey giữ nguyên logic cũ)

  private async processImage(
    job: Job,
    payload: ImageProcessingJob,
  ): Promise<void> {
    // ... logic cũ ...
    const { mediaId } = payload;
    await this.updateMediaStatus(mediaId, MediaProcessingStatus.PROCESSING);
    this.progressGateway.sendProgress(mediaId, {
      status: 'processing',
      progress: 0,
    });

    const result = await this.imageProcessor.processImage(payload);
    await job.progress(100);

    await this.prisma.mediaAttachment.update({
      where: { id: mediaId },
      data: {
        processingStatus: MediaProcessingStatus.READY,
        thumbnailUrl: this.buildCdnUrl(result.thumbnail.s3Key),
        optimizedUrl: result.optimized
          ? this.buildCdnUrl(result.optimized.s3Key)
          : null,
      },
    });

    this.progressGateway.sendProgress(mediaId, {
      status: 'completed',
      progress: 100,
      thumbnailUrl: this.buildCdnUrl(result.thumbnail.s3Key),
    });
  }

  private async processVideo(
    job: Job,
    payload: VideoProcessingJob,
  ): Promise<void> {
    // ... logic cũ ...
    const { mediaId } = payload;
    await this.updateMediaStatus(mediaId, MediaProcessingStatus.PROCESSING);
    this.progressGateway.sendProgress(mediaId, {
      status: 'processing',
      progress: 0,
    });

    const result = await this.videoProcessor.processVideo(payload);
    await job.progress(100);

    await this.prisma.mediaAttachment.update({
      where: { id: mediaId },
      data: {
        processingStatus: MediaProcessingStatus.READY,
        thumbnailUrl: this.buildCdnUrl(result.thumbnail.s3Key),
        hlsPlaylistUrl: result.hls
          ? this.buildCdnUrl(result.hls.playlistKey)
          : null,
      },
    });

    this.progressGateway.sendProgress(mediaId, {
      status: 'completed',
      progress: 100,
      thumbnailUrl: this.buildCdnUrl(result.thumbnail.s3Key),
      hlsPlaylistUrl: result.hls
        ? this.buildCdnUrl(result.hls.playlistKey)
        : undefined,
    });
  }

  // ... (OnQueue events giữ nguyên)

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

  private async updateMediaStatus(
    mediaId: string,
    status: MediaProcessingStatus,
    s3Key?: string,
    size?: bigint,
  ): Promise<void> {
    const data: Prisma.MediaAttachmentUpdateInput = {
      processingStatus: status,
    };
    if (s3Key) {
      data.s3Key = s3Key;
      data.s3KeyTemp = null;
    }
    if (size) data.size = size;

    await this.prisma.mediaAttachment.update({
      where: { id: mediaId },
      data: data,
    });
  }

  private buildCdnUrl(s3Key: string): string {
    return this.s3Service.getCloudFrontUrl(s3Key);
  }

  // Job Hooks
  @OnQueueActive()
  onActive(job: Job) {
    this.logger.debug(`Job ${job.id} started`);
  }

  @OnQueueCompleted()
  onCompleted(job: Job) {
    this.logger.log(`Job ${job.id} completed`);
  }

  @OnQueueFailed()
  async onFailed(job: Job<MediaJobData>, error: Error) {
    this.logger.error(`Job ${job.id} failed`, error);
    // ... logic failed cũ (update DB failed, send socket) ...
    const { payload } = job.data;
    await this.prisma.mediaAttachment
      .update({
        where: { id: payload.mediaId },
        data: {
          processingStatus: MediaProcessingStatus.FAILED,
          processingError: error.message,
          retryCount: job.attemptsMade,
        },
      })
      .catch((e) =>
        this.logger.warn(`Fail update error: ${(e as Error).message}`),
      );

    this.progressGateway.sendProgress(payload.mediaId, {
      status: 'failed',
      progress: 0,
      error: 'Failed',
    });
  }
}
