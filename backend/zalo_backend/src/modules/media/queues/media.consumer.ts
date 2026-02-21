import {
  Processor,
  Process,
  OnQueueActive,
  OnQueueCompleted,
  OnQueueFailed,
} from '@nestjs/bull';
import { Logger, Inject } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { ConfigType } from '@nestjs/config';
import uploadConfig from 'src/config/upload.config';
import type { Job } from 'bull';
import { PrismaService } from 'src/database/prisma.service';
import {
  ImageProcessor,
} from '../processors/image.processor';
import {
  VideoProcessor,
} from '../processors/video.processor';
import {
  ImageProcessingJob,
  VideoProcessingJob,
  MediaJobData,
  MEDIA_QUEUE_NAME,
  FileProcessingJob,
} from './media-queue.service';
import { SocketGateway } from 'src/socket/socket.gateway';
import {
  MediaAttachment,
  MemberStatus,
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
  MEDIA_EVENTS,
} from 'src/common/constants/media.constant';
import type {
  MediaProcessedEvent,
  MediaFailedEvent,
} from '../events/media.events';

import * as os from 'os';
import * as path from 'path';
@Processor(MEDIA_QUEUE_NAME)
export class MediaConsumer {
  private readonly logger = new Logger(MediaConsumer.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Service: S3Service,
    private readonly fileValidation: FileValidationService,
    private readonly imageProcessor: ImageProcessor,
    private readonly videoProcessor: VideoProcessor,
    private readonly socketGateway: SocketGateway,
    private readonly eventEmitter: EventEmitter2,
    @Inject(uploadConfig.KEY)
    private readonly config: ConfigType<typeof uploadConfig>,
  ) { }

  @Process()
  async handleJob(job: Job<MediaJobData>): Promise<void> {
    const { type, payload } = job.data;
    this.logger.log(
      `Processing ${type} job ${job.id} for media ${payload.mediaId}`,
    );

    // 1. Fetch Media Record (With Retry Logic Extracted)
    // Giảm thiểu code lặp, xử lý race condition
    const media = await this.fetchMediaWithRetry(payload.mediaId);
    const userId = media.uploadedBy;

    // 2. Resolve S3 Key Consistency
    // Đảm bảo file nằm đúng chỗ (temp hoặc permanent) trước khi xử lý
    await this.ensureMediaConsistency(media, payload, userId);

    const tempFilePath = path.join(
      os.tmpdir(),
      `${payload.mediaId}_${Date.now()}`,
    );

    try {
      this.logger.log(`📥 Downloading file once for validation: ${payload.s3Key}`);

      // 3. Download ONCE — reuse buffer for validation and any subsequent processing
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
      switch (type) {
        case MediaType.IMAGE:
          await this.processImage(job, payload as ImageProcessingJob, userId);
          break;

        case MediaType.VIDEO:
          await this.processVideo(job, payload as VideoProcessingJob, userId);
          break;

        case MediaType.AUDIO:
        case MediaType.DOCUMENT:
          // Audio/Doc don't need transcoding — upload clean buffer to permanent location
          await this.processDirectFile(
            payload.mediaId,
            media.mimeType,
            fileBuffer,
            userId,
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
        await unlink(tempFilePath).catch(() => { });
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
    const maxAttempts = this.config.retry.dbFetchMaxAttempts;
    const baseDelayMs = this.config.retry.dbFetchBaseDelayMs;

    while (retries < maxAttempts) {
      try {
        const media = await this.prisma.mediaAttachment.findUnique({
          where: { id: mediaId },
        });
        if (media) return media;

        // Exponential Backoff
        retries++;
        if (retries < maxAttempts) {
          const delay = baseDelayMs * Math.pow(2, retries - 1);
          this.logger.debug(
            `Media ${mediaId} missing, retry ${retries}/${maxAttempts} in ${delay}ms`,
          );
          await new Promise((r) => setTimeout(r, delay));
        }
      } catch (error) {
        retries++;
        if (retries >= maxAttempts) throw error;
        await new Promise((r) => setTimeout(r, baseDelayMs));
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
    userId: string,
  ) {
    if (media.s3KeyTemp) {
      // Nếu file vẫn ở temp (chưa ai move), worker tự move
      await this.validateAndMoveMedia(
        media.id,
        media.s3KeyTemp,
        media.uploadId!,
        userId,
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
   *
   * FIX (Bug 2): emit socket `progress:${mediaId}` completed event and the
   * MEDIA_EVENTS.PROCESSED domain event so that:
   *  - the sender's useMediaProgress hook can update the attachment in cache, and
   *  - downstream listeners (e.g. message module) are notified.
   * Previously these were omitted, leaving the attachment in PROCESSING state
   * in the sender's UI indefinitely when this queue path is executed.
   */
  private async processDirectFile(
    mediaId: string,
    mimeType: string,
    buffer: Buffer,
    userId: string,
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

    // Fetch the updated media record to get cdnUrl and messageId for broadcast.
    const media = await this.prisma.mediaAttachment.findUnique({
      where: { id: mediaId },
      select: { id: true, uploadId: true, uploadedBy: true, cdnUrl: true, messageId: true },
    });

    const completedDirectPayload = {
      status: 'completed' as const,
      progress: 100,
      cdnUrl: media?.cdnUrl ?? undefined,
    };

    // Notify the sender that processing completed
    void this.socketGateway.emitToUser(userId, `progress:${mediaId}`, completedDirectPayload);

    if (media) {
      this.eventEmitter.emit(MEDIA_EVENTS.PROCESSED, {
        mediaId: media.id,
        uploadId: media.uploadId || '',
        userId: media.uploadedBy,
        thumbnailUrl: null,
        cdnUrl: media.cdnUrl ?? null,
      } satisfies MediaProcessedEvent);
      // Broadcast to conversation members so recipients (user B) update their UI.
      void this.broadcastProgressToConversationMembers(mediaId, userId, completedDirectPayload, media.messageId);
    }

    this.logger.log(`Direct file processed: ${mediaId}`);
  }

  // --- CORE LOGIC (Giữ nguyên logic cũ nhưng gọn hơn) ---

  private async validateAndMoveMedia(
    mediaId: string,
    tempKey: string,
    uploadId: string,
    userId: string,
  ): Promise<string> {
    void this.socketGateway.emitToUser(userId, `progress:${mediaId}`, {
      status: 'processing',
      progress: 5,
    });

    let tempFilePath: string | null = null;
    try {
      // Download once — used for validation and the permanence move check
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
      await this.s3Service.deleteFile(tempKey).catch(() => { }); // Cleanup S3
      throw error;
    } finally {
      if (tempFilePath) await unlink(tempFilePath).catch(() => { }); // Cleanup Local
    }
  }

  // ... (Các hàm processImage, processVideo, generatePermanentKey giữ nguyên logic cũ)

  private async processImage(
    job: Job,
    payload: ImageProcessingJob,
    userId: string,
  ): Promise<void> {
    // ... logic cũ ...
    const { mediaId } = payload;
    await this.updateMediaStatus(mediaId, MediaProcessingStatus.PROCESSING);
    void this.socketGateway.emitToUser(userId, `progress:${mediaId}`, {
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

    const completedImagePayload = {
      status: 'completed' as const,
      progress: 100,
      thumbnailUrl: this.buildCdnUrl(result.thumbnail.s3Key),
    };
    void this.socketGateway.emitToUser(userId, `progress:${mediaId}`, completedImagePayload);

    const media = await this.prisma.mediaAttachment.findUnique({
      where: { id: mediaId },
      select: { id: true, uploadId: true, uploadedBy: true, thumbnailUrl: true, cdnUrl: true, messageId: true },
    });
    if (media) {
      this.eventEmitter.emit(MEDIA_EVENTS.PROCESSED, {
        mediaId: media.id,
        uploadId: media.uploadId || '',
        userId: media.uploadedBy,
        thumbnailUrl: media.thumbnailUrl ?? null,
        cdnUrl: media.cdnUrl ?? null,
      } satisfies MediaProcessedEvent);
      // Broadcast to conversation members so recipients (user B) update their UI.
      void this.broadcastProgressToConversationMembers(
        mediaId, userId,
        { ...completedImagePayload, cdnUrl: media.cdnUrl ?? undefined },
        media.messageId,
      );
    }
  }

  private async processVideo(
    job: Job,
    payload: VideoProcessingJob,
    userId: string,
  ): Promise<void> {
    // ... logic cũ ...
    const { mediaId } = payload;
    await this.updateMediaStatus(mediaId, MediaProcessingStatus.PROCESSING);
    void this.socketGateway.emitToUser(userId, `progress:${mediaId}`, {
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

    const completedVideoPayload = {
      status: 'completed' as const,
      progress: 100,
      thumbnailUrl: this.buildCdnUrl(result.thumbnail.s3Key),
      hlsPlaylistUrl: result.hls ? this.buildCdnUrl(result.hls.playlistKey) : undefined,
    };
    void this.socketGateway.emitToUser(userId, `progress:${mediaId}`, completedVideoPayload);

    const media = await this.prisma.mediaAttachment.findUnique({
      where: { id: mediaId },
      select: { id: true, uploadId: true, uploadedBy: true, thumbnailUrl: true, cdnUrl: true, messageId: true },
    });
    if (media) {
      this.eventEmitter.emit(MEDIA_EVENTS.PROCESSED, {
        mediaId: media.id,
        uploadId: media.uploadId || '',
        userId: media.uploadedBy,
        thumbnailUrl: media.thumbnailUrl ?? null,
        cdnUrl: media.cdnUrl ?? null,
      } satisfies MediaProcessedEvent);
      void this.broadcastProgressToConversationMembers(
        mediaId, userId,
        { ...completedVideoPayload, cdnUrl: media.cdnUrl ?? undefined },
        media.messageId,
      );
    }
  }

  // ... (OnQueue events giữ nguyên)

  /**
   * Broadcast a `progress:{mediaId}` event to all active conversation members
   * except the uploader. This is the fix for user B being stuck at "đang xử lý":
   * `emitToUser(userId, ...)` only reaches the uploader; everyone else must
   * receive the event via this broadcast.
   */
  private async broadcastProgressToConversationMembers(
    mediaId: string,
    uploaderId: string,
    payload: object,
    messageId: bigint | null | undefined,
  ): Promise<void> {
    if (!messageId) return;
    try {
      const message = await this.prisma.message.findUnique({
        where: { id: messageId },
        select: { conversationId: true },
      });
      if (!message) return;

      const members = await this.prisma.conversationMember.findMany({
        where: {
          conversationId: message.conversationId,
          userId: { not: uploaderId },
          status: MemberStatus.ACTIVE,
        },
        select: { userId: true },
      });

      for (const member of members) {
        void this.socketGateway.emitToUser(member.userId, `progress:${mediaId}`, payload);
      }
    } catch (e) {
      this.logger.warn(
        `Failed to broadcast media progress to conversation members: ${(e as Error).message}`,
      );
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
    const { payload } = job.data;
    const media = await this.prisma.mediaAttachment
      .update({
        where: { id: payload.mediaId },
        data: {
          processingStatus: MediaProcessingStatus.FAILED,
          processingError: error.message,
          retryCount: job.attemptsMade,
        },
        // Include messageId so the frontend can identify which message is affected
        select: { id: true, uploadId: true, uploadedBy: true, messageId: true },
      })
      .catch((e) => {
        this.logger.warn(`Fail update error: ${(e as Error).message}`);
        return null;
      });

    // Bug 3 fix: pass the actual error reason (not the generic 'Failed' string)
    // and include messageId so the sender's UI can mark the right message as broken.
    void this.socketGateway.emitToUser(
      media?.uploadedBy ?? payload.mediaId,
      `progress:${payload.mediaId}`,
      {
        status: 'failed',
        progress: 0,
        error: error.message,
        messageId: media?.messageId?.toString() ?? null,
      },
    );

    // Emit domain event on final failure (all attempts exhausted)
    if (media && job.attemptsMade >= (job.opts.attempts ?? 1)) {
      this.eventEmitter.emit(MEDIA_EVENTS.FAILED, {
        mediaId: media.id,
        uploadId: media.uploadId || '',
        userId: media.uploadedBy,
        reason: error.message,
      } satisfies MediaFailedEvent);
    }
  }
}
