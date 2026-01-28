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
import { RETRY_CONFIG } from 'src/common/constants/media.constant';

export interface AwsError extends Error {
  $metadata?: { httpStatusCode?: number };
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

  async initiateUpload(
    userId: string,
    dto: InitiateUploadDto,
  ): Promise<InitiateUploadResponse> {
    const mediaType = this.inferMediaType(dto.mimeType);
    const limitMB = this.getLimitForType(mediaType);

    const sizeValidation = this.fileValidation.validateFileSize(
      dto.fileSize,
      limitMB,
    );
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
          maxRetries: RETRY_CONFIG.S3_CHECK.MAX_ATTEMPTS,
          retryDelay: RETRY_CONFIG.S3_CHECK.RETRY_DELAY_MS,
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

      // Inline Processing for Audio/Doc
      if (this.isInlineProcessing(media.mediaType)) {
        return await this.processInline(media, actualSize);
      }

      // Worker Processing for Image/Video
      const updated = await this.prisma.mediaAttachment.update({
        where: { id: media.id },
        data: {
          processingStatus: MediaProcessingStatus.PROCESSING,
          size: BigInt(actualSize),
        },
      });

      await this.enqueueProcessing(updated);
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

  private isInlineProcessing(type: MediaType): boolean {
    return type === MediaType.AUDIO || type === MediaType.DOCUMENT;
  }

  /**
   * Logic xử lý Inline cho Audio và Document
   * 1. Download file tạm về Local
   * 2. Validate nội dung (Deep Scan)
   * 3. Move sang S3 Permanent (Atomic)
   * 4. Update DB
   * 5. Cleanup file tạm
   */
  private async processInline(
    media: MediaAttachment,
    size: number,
  ): Promise<MediaResponseDto> {
    this.logger.debug(
      `Inline processing started for ${media.mediaType}: ${media.uploadId}`,
    );

    let tempFilePath: string | null = null;
    try {
      // 1. Download temp file
      tempFilePath = await this.s3Service.downloadToLocalTemp(media.s3KeyTemp!);

      // 2. Deep Validation
      const validation =
        await this.fileValidation.validateFileOnDisk(tempFilePath);
      if (!validation.isValid) {
        throw new Error(`Validation failed: ${validation.reason}`);
      }

      // 3. Generate Permanent Key
      const realExt = validation.extension || 'bin';
      const realMime = validation.mimeType || 'application/octet-stream';
      const permanentKey = this.generatePermanentKey(media.uploadId!, realExt);

      // 4. Move to Permanent S3
      await this.s3Service.moveObjectAtomic(media.s3KeyTemp!, permanentKey);

      // 5. Update DB (Finalize)
      const updated = await this.prisma.mediaAttachment.update({
        where: { id: media.id },
        data: {
          s3Key: permanentKey,
          s3KeyTemp: null,
          mimeType: realMime,
          cdnUrl: this.s3Service.getCloudFrontUrl(permanentKey),
          processingStatus: MediaProcessingStatus.READY,
          size: BigInt(size),
        },
      });

      this.logger.log(
        `${media.mediaType} processed inline successfully: ${media.uploadId}`,
      );
      return this.formatMediaResponse(updated);
    } catch (error) {
      // Cleanup S3 temp file on failure
      await this.s3Service.deleteFile(media.s3KeyTemp!).catch(() => {});

      const msg = error instanceof Error ? error.message : 'Unknown error';
      await this.markAsFailed(media.id, msg);
      throw new BadRequestException(
        `${media.mediaType} processing failed: ${msg}`,
      );
    } finally {
      // Cleanup local temp file
      if (tempFilePath) {
        await import('fs')
          .then((fs) => fs.promises.unlink(tempFilePath!))
          .catch(() => {});
      }
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
        // Logic inline ở trên đã xử lý rồi, nhưng giữ lại case này cho fallback hoặc manual re-queue
        await this.mediaQueue.enqueueFileProcessing(
          {
            ...jobPayload,
            fileSize: Number(media.size),
            mimeType: media.mimeType,
          },
          media.mediaType,
        );
        break;
      default:
        throw new Error(`Unsupported type: ${media.mediaType as any}`);
    }
  }

  private inferMediaType(mime: string): MediaType {
    if (mime.startsWith('image/')) return MediaType.IMAGE;
    if (mime.startsWith('video/')) return MediaType.VIDEO;
    if (mime.startsWith('audio/')) return MediaType.AUDIO;
    return MediaType.DOCUMENT;
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
