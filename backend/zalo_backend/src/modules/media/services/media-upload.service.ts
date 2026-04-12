// src/modules/media/services/media-upload.service.ts
import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from 'src/database/prisma.service';
import { S3Service } from './s3.service';
import {
  MediaProcessingStatus,
  MediaType,
  MemberStatus,
  MediaAttachment,
} from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import uploadConfig from '../../../config/upload.config';
import {
  InitiateUploadDto,
  InitiateUploadResponse,
  AvatarUploadDto,
  AvatarUploadResponse,
} from '../dto/initiate-upload.dto';
import { MediaResponseDto } from '../dto/media-response.dto';
import { MEDIA_QUEUE_PROVIDER } from '../queues/media-queue.interface';
import type { IMediaQueueService } from '../queues/media-queue.interface';
import { MEDIA_EVENTS } from 'src/common/constants/media.constant';
import type {
  MediaUploadedEvent,
  MediaDeletedEvent,
} from '../events/media.events';
import { AwsError } from './s3.service';
import { FileUtils } from '../../../common/utils/file.utils';
import { InternalEventNames } from '../../../common/contracts/events/event-names';
import type { MediaAvatarUploadInitiatedPayload } from '../../../common/contracts/events/event-contracts';

@Injectable()
export class MediaUploadService {
  private readonly logger = new Logger(MediaUploadService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Service: S3Service,
    @Inject(MEDIA_QUEUE_PROVIDER)
    private readonly mediaQueue: IMediaQueueService,
    private readonly eventEmitter: EventEmitter2,
    @Inject(uploadConfig.KEY)
    private readonly config: ConfigType<typeof uploadConfig>,
  ) {}

  async getMediaById(
    userId: string,
    mediaId: string,
  ): Promise<MediaResponseDto> {
    const media = await this.prisma.mediaAttachment.findUnique({
      where: { id: mediaId },
    });
    if (!media) throw new NotFoundException(`Media not found: ${mediaId}`);

    // Allow access if: (1) the requester is the uploader, OR
    // (2) the media is linked to a message in a conversation the requester is a member of.
    // This lets conversation partners poll processing status without a 403.
    if (media.uploadedBy !== userId) {
      if (!media.messageId) throw new ForbiddenException('Access denied');

      const message = await this.prisma.message.findUnique({
        where: { id: media.messageId },
        select: { conversationId: true },
      });
      const conversationId = message?.conversationId;
      if (!conversationId) throw new ForbiddenException('Access denied');

      const membership = await this.prisma.conversationMember.findFirst({
        where: { conversationId, userId, status: MemberStatus.ACTIVE },
        select: { userId: true },
      });
      if (!membership) throw new ForbiddenException('Access denied');
    }

    // ── Guard: Prevent polling trap for partial uploads ──
    // If processingStatus is PROCESSING and no permanent s3Key exists,
    // someone created a fake record or the upload never confirmed.
    // Mark as FAILED to stop polling, rather than returning an incomplete record.
    if (
      media.processingStatus === MediaProcessingStatus.PROCESSING &&
      !media.s3Key
    ) {
      this.logger.warn('Detected incomplete upload without s3Key', { mediaId });
      await this.markAsFailed(
        mediaId,
        'Upload was not confirmed; file missing from storage',
      );
      const updated = await this.prisma.mediaAttachment.findUnique({
        where: { id: mediaId },
      });
      if (!updated)
        throw new NotFoundException('Internal error: media record disappeared');
      return this.formatMediaResponse(updated);
    }

    return this.formatMediaResponse(media);
  }

  /**
   * Get a viewable URL for a media item, used by the public serve endpoint.
   * Returns CloudFront URL when configured, otherwise presigned GET URL.
   */
  async getServeUrl(
    mediaId: string,
    variant: 'original' | 'thumbnail' | 'optimized' = 'original',
  ): Promise<string> {
    const media = await this.prisma.mediaAttachment.findUnique({
      where: { id: mediaId, deletedAt: null },
      select: {
        s3Key: true,
        thumbnailS3Key: true,
        optimizedS3Key: true,
        cdnUrl: true,
        thumbnailUrl: true,
        optimizedUrl: true,
      },
    });
    if (!media) throw new NotFoundException(`Media not found: ${mediaId}`);

    // Pick the S3 key for the requested variant (fallback chain)
    let key: string | null = null;
    switch (variant) {
      case 'thumbnail':
        key = media.thumbnailS3Key ?? media.optimizedS3Key ?? media.s3Key;
        break;
      case 'optimized':
        key = media.optimizedS3Key ?? media.s3Key;
        break;
      default:
        key = media.s3Key;
        break;
    }

    if (!key) {
      // Fallback to stored URL if no S3 key (edge case)
      const fallback = media.cdnUrl ?? media.thumbnailUrl ?? media.optimizedUrl;
      if (fallback) return fallback;
      throw new NotFoundException('Media file not available');
    }

    // Generate a presigned GET URL (works for both MinIO and S3 private buckets)
    return this.s3Service.generatePresignedGetUrl(key, 3600);
  }

  async deleteMedia(userId: string, mediaId: string): Promise<void> {
    const media = await this.prisma.mediaAttachment.findUnique({
      where: { id: mediaId },
    });
    if (!media) throw new NotFoundException(`Media not found: ${mediaId}`);
    if (media.uploadedBy !== userId)
      throw new ForbiddenException('Access denied');
    // Guard: already soft-deleted
    if (media.deletedAt) return;

    // Soft-delete — physical S3 cleanup handled by S3CleanupService cron (@EVERY_DAY_AT_2AM)
    // which deletes files with deletedAt older than SOFT_DELETED_MAX_AGE_DAYS (30 days).
    await this.prisma.mediaAttachment.update({
      where: { id: mediaId },
      data: {
        deletedAt: new Date(),
        deletedById: userId,
      },
    });

    this.eventEmitter.emit(MEDIA_EVENTS.DELETED, {
      mediaId,
      userId,
    } satisfies MediaDeletedEvent);

    this.logger.log(`Media soft-deleted: ${mediaId} by user ${userId}`);
  }

  async initiateUpload(
    userId: string,
    dto: InitiateUploadDto,
  ): Promise<InitiateUploadResponse> {
    const mediaType = FileUtils.inferMediaType(dto.fileName, dto.mimeType);
    const limitMB = this.getLimitForType(mediaType);

    const sizeValidation = this.validateFileSize(dto.fileSize, limitMB);
    if (!sizeValidation.isValid)
      throw new BadRequestException(sizeValidation.reason);

    const uploadId = createId();
    const s3KeyTemp = `temp/${userId}/${uploadId}`;

    this.logger.debug('Initiating upload', {
      userId,
      uploadId,
      mediaType,
      size: dto.fileSize,
    });

    await this.prisma.mediaAttachment.create({
      data: {
        uploadId,
        uploadedBy: userId,
        originalName: dto.fileName,
        mimeType: dto.mimeType,
        mediaType,
        size: BigInt(dto.fileSize),
        s3KeyTemp,
        s3Bucket: this.s3Service.getBucketName(),
        processingStatus: MediaProcessingStatus.PENDING,
        retryCount: 0,
      },
    });

    const presignedUrl = await this.s3Service.generatePresignedUrl({
      key: s3KeyTemp,
      expiresIn: this.config.presignedUrlExpiry,
      contentType: dto.mimeType,
    });

    return {
      uploadId,
      presignedUrl,
      expiresIn: this.config.presignedUrlExpiry,
      s3Key: s3KeyTemp,
    };
  }

  /**
   * Avatar upload — presigned PUT URL + CloudFront/S3 final URL.
   * Avatars live under the `avatars/` S3 prefix and are served via CloudFront
   * in production (CLOUDFRONT_DOMAIN set) or via MinIO URL in local dev.
   * No MediaAttachment record is created; the returned fileUrl is saved
   * directly as User.avatarUrl / Conversation.avatarUrl by the caller.
   */
  async avatarUpload(
    userId: string,
    dto: AvatarUploadDto,
  ): Promise<AvatarUploadResponse> {
    if (!dto.mimeType.startsWith('image/')) {
      throw new BadRequestException('Avatar must be an image file');
    }

    const ext = (dto.fileName.split('.').pop() ?? 'jpg').toLowerCase();
    const uploadId = createId();
    const s3Key = `avatars/${userId}/${uploadId}.${ext}`;

    const presignedUrl = await this.s3Service.generatePresignedUrl({
      key: s3Key,
      expiresIn: this.config.presignedUrlExpiry,
      contentType: dto.mimeType,
    });

    // getCloudFrontUrl returns:
    //   prod  → https://cdn.zaloclone.me/avatars/{userId}/{id}.{ext}
    //   dev   → http://localhost:9000/zalo-clone-media-production/avatars/{userId}/{id}.{ext}
    const fileUrl = this.s3Service.getCloudFrontUrl(s3Key);

    this.logger.debug('Avatar upload initiated', { userId, s3Key });

    if (dto.targetId && dto.targetType) {
      this.eventEmitter.emit(InternalEventNames.MEDIA_AVATAR_UPLOAD_INITIATED, {
        targetId: dto.targetId,
        targetType: dto.targetType,
        avatarUrl: fileUrl,
      } satisfies MediaAvatarUploadInitiatedPayload);
      this.logger.debug('Emitted MEDIA_AVATAR_UPLOAD_INITIATED', {
        targetId: dto.targetId,
        targetType: dto.targetType,
      });
    }

    return {
      presignedUrl,
      fileUrl,
      expiresIn: this.config.presignedUrlExpiry,
      s3Key,
    };
  }

  async confirmUpload(
    userId: string,
    uploadId: string,
  ): Promise<MediaResponseDto> {
    const media = await this.prisma.mediaAttachment.findUnique({
      where: { uploadId },
    });
    if (!media) throw new NotFoundException(`Upload not found: ${uploadId}`);
    if (media.uploadedBy !== userId)
      throw new ForbiddenException('Access denied');
    if (media.processingStatus !== MediaProcessingStatus.PENDING)
      return this.formatMediaResponse(media);

    try {
      this.logger.debug('Verifying S3 upload', {
        uploadId,
        s3KeyTemp: media.s3KeyTemp,
      });

      const fileCheck = await this.s3Service.verifyFileExists(
        media.s3KeyTemp!,
        {
          maxRetries: this.config.retry.s3CheckMaxAttempts,
          retryDelay: this.config.retry.s3CheckRetryDelayMs,
          checkMultipart: true,
        },
      );

      if (!fileCheck.exists) {
        await this.markAsFailed(
          media.id,
          `File missing on S3: ${fileCheck.error}`,
        );
        throw new BadRequestException(
          'File has not been uploaded to S3 successfully.',
        );
      }

      const actualSize = fileCheck.metadata?.size || 0;

      // ── Move file to permanent location immediately ──────────────────
      const ext = this.getFileExtension(media.mimeType, media.originalName);
      const permanentKey = this.generatePermanentKey(media.uploadId!, ext);

      await this.s3Service.moveObjectAtomic(media.s3KeyTemp!, permanentKey);

      const cdnUrl = this.s3Service.getCloudFrontUrl(permanentKey);

      // ── Re-infer MediaType to be robust against client-side mislabeling ────
      // (Especially important for mobile where video might be hardcoded as IMAGE)
      const actualMimeType = fileCheck.metadata?.contentType || media.mimeType;
      const inferredType = FileUtils.inferMediaType(
        media.originalName,
        actualMimeType,
      );

      if (inferredType !== media.mediaType) {
        this.logger.log('Correcting media type based on file metadata', {
          old: media.mediaType,
          new: inferredType,
          originalName: media.originalName,
        });
      }

      // ── Mark as READY with cdnUrl — user sees original file immediately ──
      const updated = await this.prisma.mediaAttachment.update({
        where: { id: media.id },
        data: {
          processingStatus: MediaProcessingStatus.READY,
          mediaType: inferredType, // Use inferred type
          s3Key: permanentKey,
          s3KeyTemp: null,
          cdnUrl,
          size: BigInt(actualSize),
          mimeType: actualMimeType,
        },
      });

      // ── Enqueue background work only for IMAGE/VIDEO (thumbnails, optimization) ──
      if (
        updated.mediaType === MediaType.IMAGE ||
        updated.mediaType === MediaType.VIDEO
      ) {
        await this.enqueueProcessing(updated);
      }

      this.eventEmitter.emit(MEDIA_EVENTS.UPLOADED, {
        mediaId: updated.id,
        uploadId: updated.uploadId || '',
        userId,
        mimeType: updated.mimeType,
        mediaType: updated.mediaType,
      } satisfies MediaUploadedEvent);

      return this.formatMediaResponse(updated);
    } catch (error) {
      const awsError = error as AwsError;
      const errorMessage = awsError.message || 'Unknown error';

      this.logger.error('Confirm upload failed', {
        uploadId,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      });

      if (!(error instanceof BadRequestException)) {
        await this.markAsFailed(media.id, errorMessage);
      }
      throw error;
    }
  }

  // --- PRIVATE HELPERS ---

  private getLimitForType(type: MediaType): number {
    switch (type) {
      case MediaType.IMAGE:
        return this.config.limits.maxImageSizeMB;
      case MediaType.VIDEO:
        return this.config.limits.maxVideoSizeMB;
      case MediaType.AUDIO:
        return this.config.limits.maxAudioSizeMB;
      default:
        return this.config.limits.maxDocumentSizeMB;
    }
  }

  private async enqueueProcessing(media: MediaAttachment): Promise<void> {
    const jobPayload = {
      mediaId: media.id,
      s3Key: media.s3Key || media.s3KeyTemp!,
    };

    switch (media.mediaType) {
      case MediaType.IMAGE:
        await this.mediaQueue.enqueueImageProcessing({
          ...jobPayload,
          originalWidth: 0,
          originalHeight: 0,
        });
        break;
      case MediaType.VIDEO:
        await this.mediaQueue.enqueueVideoProcessing({
          ...jobPayload,
          duration: 0,
          width: 0,
          height: 0,
        });
        break;
      case MediaType.AUDIO:
      case MediaType.DOCUMENT:
        // Already READY, no background processing needed for files/audio.
        break;
      default:
        throw new Error(`Unsupported type: ${media.mediaType as any}`);
    }
  }

  private async markAsFailed(mediaId: string, reason: string) {
    await this.prisma.mediaAttachment.update({
      where: { id: mediaId },
      data: {
        processingStatus: MediaProcessingStatus.FAILED,
        processingError: reason,
      },
    });
    this.logger.warn('Media marked as failed', { mediaId, reason });
  }

  private validateFileSize(
    fileSize: number,
    maxSizeMB: number,
  ): { isValid: boolean; reason?: string } {
    const maxBytes = maxSizeMB * 1024 * 1024;
    if (fileSize > maxBytes)
      return { isValid: false, reason: `Exceeds ${maxSizeMB}MB` };
    if (fileSize <= 0)
      return { isValid: false, reason: 'File size must be greater than 0' };
    return { isValid: true };
  }

  private formatMediaResponse(media: MediaAttachment): MediaResponseDto {
    return new MediaResponseDto({
      id: media.id,
      uploadId: media.uploadId || '',
      originalName: media.originalName,
      mimeType: media.mimeType,
      mediaType: media.mediaType,
      size: media.size.toString(),
      s3Key: media.s3Key,
      cdnUrl: media.cdnUrl,
      thumbnailUrl:
        (media as MediaAttachment & { thumbnailUrl?: string | null })
          .thumbnailUrl ?? null,
      optimizedUrl:
        (media as MediaAttachment & { optimizedUrl?: string | null })
          .optimizedUrl ?? null,
      hlsPlaylistUrl:
        (media as MediaAttachment & { hlsPlaylistUrl?: string | null })
          .hlsPlaylistUrl ?? null,
      duration:
        (media as MediaAttachment & { duration?: number | null }).duration ??
        null,
      width:
        (media as MediaAttachment & { width?: number | null }).width ?? null,
      height:
        (media as MediaAttachment & { height?: number | null }).height ?? null,
      processingStatus: media.processingStatus,
      processingError:
        (media as MediaAttachment & { processingError?: string | null })
          .processingError ?? null,
      createdAt: media.createdAt,
      updatedAt: media.updatedAt ?? null,
    });
  }

  // ── Permanent S3 key generation (moved from worker) ─────────────────────

  private generatePermanentKey(uploadId: string, extension: string): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const { createHash } = require('crypto');
    const fileHash = createHash('md5')
      .update(uploadId)
      .digest('hex')
      .substring(0, 12);
    return `permanent/${year}/${month}/unlinked/${fileHash}.${extension}`;
  }

  private getFileExtension(mimeType: string, originalName: string): string {
    // Try to extract from original filename first
    const dotIdx = originalName.lastIndexOf('.');
    if (dotIdx > 0) {
      return originalName.substring(dotIdx + 1).toLowerCase();
    }
    // Fallback: derive from MIME type
    const mimeExtMap: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'image/svg+xml': 'svg',
      'video/mp4': 'mp4',
      'video/webm': 'webm',
      'video/quicktime': 'mov',
      'audio/mpeg': 'mp3',
      'audio/wav': 'wav',
      'audio/ogg': 'ogg',
      'audio/webm': 'weba',
      'audio/mp4': 'm4a',
      'application/pdf': 'pdf',
      'application/msword': 'doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        'docx',
      'application/vnd.ms-excel': 'xls',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
        'xlsx',
    };
    return mimeExtMap[mimeType] || 'bin';
  }
}
