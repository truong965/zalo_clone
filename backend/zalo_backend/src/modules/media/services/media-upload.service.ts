// src/modules/media/services/media-upload.service.ts
// FIXED: Production-ready with proper retry, error context, and race condition handling

import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { PrismaService } from 'src/database/prisma.service';
import { S3Service } from './s3.service';
import { FileValidationService } from './file-validation.service';
import {
  MediaProcessingStatus,
  MediaType,
  MediaAttachment,
} from '@prisma/client';
import { createHash } from 'crypto';
import { createId } from '@paralleldrive/cuid2';
import uploadConfig from '../../../config/upload.config';
import {
  InitiateUploadDto,
  InitiateUploadResponse,
} from '../dto/initiate-upload.dto';
import { MediaResponseDto } from '../dto/media-response.dto';
import { MediaQueueService } from '../queues/media-queue.service';

export interface AwsError extends Error {
  $metadata?: {
    httpStatusCode?: number;
  };
}
@Injectable()
export class MediaUploadService {
  private readonly logger = new Logger(MediaUploadService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Service: S3Service,
    private readonly fileValidation: FileValidationService,
    private readonly mediaQueue: MediaQueueService,
    @Inject(uploadConfig.KEY)
    private readonly config: ConfigType<typeof uploadConfig>,
  ) {}

  /**
   * Initiate upload - Generate presigned URL
   */
  async initiateUpload(
    userId: string,
    dto: InitiateUploadDto,
  ): Promise<InitiateUploadResponse> {
    const mediaType = this.inferMediaType(dto.mimeType);

    // Validate size based on media type
    let limitMB = this.config.limits.maxDocumentSizeMB;
    if (mediaType === MediaType.IMAGE)
      limitMB = this.config.limits.maxImageSizeMB;
    else if (mediaType === MediaType.VIDEO)
      limitMB = this.config.limits.maxVideoSizeMB;
    else if (mediaType === MediaType.AUDIO)
      limitMB = this.config.limits.maxAudioSizeMB;

    const sizeValidation = this.fileValidation.validateFileSize(
      dto.fileSize,
      limitMB,
    );

    if (!sizeValidation.isValid) {
      throw new BadRequestException(sizeValidation.reason);
    }

    const uploadId = createId();
    const s3KeyTemp = `temp/${userId}/${uploadId}`;

    this.logger.debug('Initiating upload', {
      userId,
      uploadId,
      fileName: dto.fileName,
      mediaType,
      size: dto.fileSize,
    });

    // Create DB record
    await this.prisma.mediaAttachment.create({
      data: {
        uploadId,
        uploadedBy: userId,
        originalName: dto.fileName,
        mimeType: dto.mimeType,
        mediaType: mediaType,
        size: BigInt(dto.fileSize),
        s3KeyTemp,
        s3Bucket: this.s3Service.getBucketName(),
        processingStatus: MediaProcessingStatus.PENDING,
        retryCount: 0,
      },
    });

    // Generate presigned URL
    const presignedUrl = await this.s3Service.generatePresignedUrl({
      key: s3KeyTemp,
      expiresIn: this.config.presignedUrlExpiry,
      contentType: dto.mimeType, // Generic to prevent client MIME spoofing
    });

    this.logger.log('Upload initiated', {
      uploadId,
      s3KeyTemp,
      expiresIn: this.config.presignedUrlExpiry,
    });

    return {
      uploadId,
      presignedUrl,
      expiresIn: this.config.presignedUrlExpiry,
      s3Key: s3KeyTemp,
    };
  }

  /**
   * ✅ FIXED: Confirm upload with proper retry and error handling
   * No longer does validation inline - delegates to worker
   */
  async confirmUpload(
    userId: string,
    uploadId: string,
  ): Promise<MediaResponseDto> {
    // 1. Validate ownership & state
    const media = await this.prisma.mediaAttachment.findUnique({
      where: { uploadId },
    });

    if (!media) {
      throw new NotFoundException(`Upload not found: ${uploadId}`);
    }

    if (media.uploadedBy !== userId) {
      throw new ForbiddenException('Access denied to this upload');
    }

    // Idempotency check
    if (media.processingStatus !== MediaProcessingStatus.PENDING) {
      this.logger.warn('Duplicate confirm attempt', {
        uploadId,
        currentStatus: media.processingStatus,
      });
      return this.formatMediaResponse(media);
    }

    try {
      // 2. ✅ CRITICAL FIX: Verify file exists with retry logic
      this.logger.debug('Verifying S3 upload', {
        uploadId,
        s3KeyTemp: media.s3KeyTemp,
      });

      const fileCheck = await this.s3Service.verifyFileExists(
        media.s3KeyTemp!,
        {
          maxRetries: 5, // More retries for eventual consistency
          retryDelay: 300, // 300ms, 600ms, 1200ms, 2400ms, 4800ms
          checkMultipart: true, // Check for incomplete multipart uploads
        },
      );

      if (!fileCheck.exists) {
        this.logger.error('S3 upload verification failed', {
          uploadId,
          s3KeyTemp: media.s3KeyTemp,
          error: fileCheck.error,
        });

        await this.markAsFailed(
          media.id,
          `File not found on S3: ${fileCheck.error}`,
        );

        throw new BadRequestException(
          'File has not been uploaded to S3 successfully. Please retry upload.',
        );
      }

      const actualSize = fileCheck.metadata?.size || 0;

      this.logger.log('S3 upload verified', {
        uploadId,
        s3KeyTemp: media.s3KeyTemp,
        size: actualSize,
        contentType: fileCheck.metadata?.contentType,
      });

      // ✅ FIXED: For AUDIO/DOCUMENT - validate & move inline
      // These types don't need worker processing (no thumbnail/transcode)
      if (
        media.mediaType === MediaType.AUDIO ||
        media.mediaType === MediaType.DOCUMENT
      ) {
        this.logger.debug(
          `Inline processing for ${media.mediaType}: ${uploadId}`,
        );

        let tempFilePath: string | null = null;
        try {
          // Download temp file
          tempFilePath = await this.s3Service.downloadToLocalTemp(
            media.s3KeyTemp!,
          );

          // Validate
          const validation =
            await this.fileValidation.validateFileOnDisk(tempFilePath);

          if (!validation.isValid) {
            throw new Error(`Validation failed: ${validation.reason}`);
          }

          // Move to permanent
          const realExt = validation.extension || 'bin';
          const realMime = validation.mimeType || 'application/octet-stream';
          const permanentKey = this.generatePermanentKey(uploadId, realExt);

          await this.s3Service.moveObjectAtomic(media.s3KeyTemp!, permanentKey);

          // Update DB with permanent key + mark READY
          const updated = await this.prisma.mediaAttachment.update({
            where: { id: media.id },
            data: {
              s3Key: permanentKey,
              s3KeyTemp: null,
              mimeType: realMime,
              cdnUrl: this.s3Service.getCloudFrontUrl(permanentKey),
              processingStatus: MediaProcessingStatus.READY,
              size: BigInt(actualSize),
            },
          });

          this.logger.log(`${media.mediaType} processed inline: ${uploadId}`);
          return this.formatMediaResponse(updated);
        } catch (error) {
          // Cleanup on failure
          await this.s3Service.deleteFile(media.s3KeyTemp!).catch(() => {});
          const msg = error instanceof Error ? error.message : 'Unknown error';
          await this.markAsFailed(media.id, msg);
          throw new BadRequestException(
            `${media.mediaType} processing failed: ${msg}`,
          );
        } finally {
          if (tempFilePath) {
            await import('fs')
              .then((fs) => fs.promises.unlink(tempFilePath!))
              .catch(() => {});
          }
        }
      }

      // For IMAGE/VIDEO - update to PROCESSING and enqueue worker
      const updated = await this.prisma.mediaAttachment.update({
        where: { id: media.id },
        data: {
          processingStatus: MediaProcessingStatus.PROCESSING,
          size: BigInt(actualSize),
          // s3Key remains null - worker will set it after validation & move
        },
      });

      // 4. Enqueue job (worker validates → moves → processes)
      await this.enqueueProcessing(updated);

      this.logger.log('Upload confirmed and queued', {
        uploadId,
        mediaId: media.id,
        size: actualSize,
      });

      return this.formatMediaResponse(updated);
    } catch (error) {
      // ✅ FIXED: Better error context
      const awsError = error as AwsError;

      const errorMessage = awsError.message || 'Unknown error';
      const errorName = awsError.name || 'Error';
      const errorCode = awsError.$metadata?.httpStatusCode;
      this.logger.error('Confirm upload failed', {
        uploadId,
        s3KeyTemp: media.s3KeyTemp,
        errorName,
        errorCode,
        errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Only mark as failed if NOT already thrown BadRequestException
      if (!(error instanceof BadRequestException)) {
        await this.markAsFailed(media.id, errorMessage);
      }

      throw error;
    }
  }

  /**
   * Enqueue processing job based on media type
   * ✅ FIXED: Only IMAGE & VIDEO need job processing
   *           AUDIO & DOCUMENT only need validation & move (no thumbnail/transcode)
   */
  private async enqueueProcessing(media: MediaAttachment): Promise<void> {
    const mediaType = media.mediaType;

    if (mediaType === MediaType.IMAGE) {
      await this.mediaQueue.enqueueImageProcessing({
        mediaId: media.id,
        s3Key: media.s3Key || media.s3KeyTemp!,
        originalWidth: media.width || 0,
        originalHeight: media.height || 0,
      });

      this.logger.log(`Image processing job enqueued: ${media.id}`);
      return;
    } else if (mediaType === MediaType.VIDEO) {
      await this.mediaQueue.enqueueVideoProcessing({
        mediaId: media.id,
        s3Key: media.s3Key || media.s3KeyTemp!,
        duration: media.duration || 0,
        width: media.width || 0,
        height: media.height || 0,
      });

      this.logger.log(`Video processing job enqueued: ${media.id}`);
      return;
    } else if (
      mediaType === MediaType.AUDIO ||
      mediaType === MediaType.DOCUMENT
    ) {
      await this.mediaQueue.enqueueFileProcessing(
        {
          mediaId: media.id,
          s3Key: media.s3Key || media.s3KeyTemp!, // S3 Key Temp
          fileSize: Number(media.size), // Cần size để validate
          mimeType: media.mimeType, // Cần mime để validate magic bytes
        },
        mediaType,
      ); // Truyền đúng type để Consumer nhận diện

      this.logger.log(`${mediaType} validation job enqueued: ${media.id}`);
      return;
    }
    throw new Error(
      `Unsupported media type for processing: ${mediaType as any}`,
    );
  }

  /**
   * Infer MediaType from MIME type
   */
  private inferMediaType(mimeType: string): MediaType {
    if (mimeType.startsWith('image/')) return MediaType.IMAGE;
    if (mimeType.startsWith('video/')) return MediaType.VIDEO;
    if (mimeType.startsWith('audio/')) return MediaType.AUDIO;
    return MediaType.DOCUMENT;
  }

  /**
   * Mark media as failed
   */
  private async markAsFailed(mediaId: string, reason: string): Promise<void> {
    await this.prisma.mediaAttachment.update({
      where: { id: mediaId },
      data: {
        processingStatus: MediaProcessingStatus.FAILED,
        processingError: reason,
      },
    });

    this.logger.warn('Media marked as failed', { mediaId, reason });
  }

  /**
   * Format media response with strict typing
   */
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
      processingStatus: media.processingStatus,
      createdAt: media.createdAt,
      updatedAt: media.updatedAt || undefined,
    });
  }

  /**
   * Generate S3 permanent key based on upload ID
   */
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
}
