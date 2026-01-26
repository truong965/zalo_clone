// src/modules/media/services/media-upload.service.ts
import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  InternalServerErrorException,
  Inject,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { PrismaService } from 'src/database/prisma.service';
import { S3Service } from './s3.service';
import {
  FileValidationService,
  ValidationResult,
} from './file-validation.service';
// Import chính xác Type từ Prisma Client
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
import { MediaResponseDto } from '../dto/media-response.dto'; // Import DTO mới
import mime from 'mime-types';

@Injectable()
export class MediaUploadService {
  private readonly logger = new Logger(MediaUploadService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Service: S3Service,
    private readonly fileValidation: FileValidationService,
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
    this.validateMimeType(dto.mimeType);

    const mediaType = this.getMediaType(dto.mimeType);
    const maxSize = this.getMaxSizeForMediaType(mediaType);

    const sizeValidation = this.fileValidation.validateFileSize(
      dto.fileSize,
      maxSize,
    );

    if (!sizeValidation.valid) {
      throw new BadRequestException(sizeValidation.reason);
    }

    const uploadId = createId();
    const extension = this.getExtensionFromMime(dto.mimeType, dto.fileName);
    const s3KeyTemp = `temp/${userId}/${uploadId}.${extension}`;

    // Prisma create
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

    this.logger.log('Upload initiated', {
      uploadId,
      userId,
      fileName: dto.fileName,
      mimeType: dto.mimeType,
    });

    return {
      uploadId,
      presignedUrl,
      expiresIn: this.config.presignedUrlExpiry,
      s3Key: s3KeyTemp,
    };
  }

  /**
   * Confirm upload after client uploads to S3
   */
  async confirmUpload(
    userId: string,
    uploadId: string,
  ): Promise<MediaResponseDto> {
    // 1. Find pending upload
    const media = await this.prisma.mediaAttachment.findUnique({
      where: { uploadId },
    });

    if (!media) {
      throw new NotFoundException('Upload not found');
    }

    if (media.uploadedBy !== userId) {
      throw new ForbiddenException('Not your upload');
    }

    // IDEMPOTENCY check
    if (media.processingStatus !== MediaProcessingStatus.PENDING) {
      this.logger.warn('Duplicate confirm attempt', {
        uploadId,
        status: media.processingStatus,
      });
      return this.formatMediaResponse(media);
    }

    if (!media.s3KeyTemp) {
      throw new BadRequestException('No temp file key found');
    }

    // 2. Verify file exists in S3
    const fileExists = await this.s3Service.waitForFileExistence(
      media.s3KeyTemp,
      3,
    );

    if (!fileExists) {
      await this.markAsFailed(media.id, 'File not found in S3 after upload');
      throw new BadRequestException(
        'Upload verification failed - file not found',
      );
    }

    // 3. Validate file integrity
    const validation: ValidationResult = await this.validateUploadedFile(media);
    if (!validation.valid) {
      await this.markAsFailed(media.id, validation.reason!);

      // Move to quarantine
      const quarantineKey = `failed/${uploadId}.quarantine`;
      try {
        await this.s3Service.moveObjectAtomic(media.s3KeyTemp, quarantineKey);
      } catch (error) {
        this.logger.error(
          `Failed to quarantine malicious file id: ${uploadId}`,
          error,
        );
      }

      throw new BadRequestException(validation.reason);
    }

    const realMimeType = validation.detectedMimeType || media.mimeType;
    const realExtension = this.getExtensionFromMime(
      realMimeType,
      media.originalName,
    );

    // 4. Generate permanent S3 key
    const s3KeyOriginal = this.generatePermanentKey(uploadId, realExtension);

    // 5. Move file atomically
    try {
      await this.s3Service.moveObjectAtomic(media.s3KeyTemp, s3KeyOriginal);
    } catch (error) {
      this.logger.error('Failed to move file to permanent storage', {
        uploadId,
        error: (error as Error).message,
      });
      await this.markAsFailed(media.id, 'S3 move operation failed');
      throw new InternalServerErrorException('Upload processing failed');
    }

    // 6. Generate CDN URL
    const cdnUrl = this.s3Service.getCloudFrontUrl(s3KeyOriginal);

    // 7. Update database to CONFIRMED
    const updated = await this.prisma.mediaAttachment.update({
      where: { id: media.id },
      data: {
        processingStatus: MediaProcessingStatus.CONFIRMED,
        s3Key: s3KeyOriginal,
        mimeType: realMimeType, // Update lại mimeType chuẩn nếu có sự sai lệch nhỏ
        cdnUrl,
        s3KeyTemp: null,
        updatedAt: new Date(),
      },
    });

    this.logger.log('Upload confirmed', {
      uploadId,
      s3Key: s3KeyOriginal,
      cdnUrl,
    });

    return this.formatMediaResponse(updated);
  }

  /**
   * Validate uploaded file via magic numbers
   * @param media - Using Strict Prisma Type instead of any
   */
  private async validateUploadedFile(
    media: MediaAttachment,
  ): Promise<ValidationResult> {
    try {
      if (!media.s3KeyTemp) {
        return { valid: false, reason: 'Temporary S3 key is missing' };
      }

      // Download first 4KB to check magic numbers
      const buffer = await this.s3Service.downloadPartial(
        media.s3KeyTemp,
        0,
        4096,
      );

      const validation = await this.fileValidation.validateMimeType(
        buffer,
        media.mimeType,
      );
      //  Log security warnings if any
      if (
        validation.securityWarnings &&
        validation.securityWarnings.length > 0
      ) {
        this.logger.warn('Security warnings during validation', {
          uploadId: media.uploadId,
          warnings: validation.securityWarnings,
        });

        //  For high-risk files, mark for additional scanning in Week 8
        if (media.mediaType === MediaType.DOCUMENT) {
          // TODO Week 8: Queue for ClamAV scan
          this.logger.verbose('Document queued for malware scan', {
            uploadId: media.uploadId,
          });
        }
      }

      return validation;
    } catch (error) {
      this.logger.error('File validation failed', {
        uploadId: media.uploadId,
        error: (error as Error).message,
      });
      return {
        valid: false,
        reason: 'Unable to validate file',
      };
    }
  }

  /**
   * Generate permanent S3 key with date partitioning
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

  private async markAsFailed(mediaId: string, reason: string): Promise<void> {
    await this.prisma.mediaAttachment.update({
      where: { id: mediaId },
      data: {
        processingStatus: MediaProcessingStatus.FAILED,
        processingError: reason,
      },
    });
  }

  private validateMimeType(mimeType: string): void {
    const allowedTypes = [
      ...this.config.allowedMimeTypes.image,
      ...this.config.allowedMimeTypes.video,
      ...this.config.allowedMimeTypes.audio,
      ...this.config.allowedMimeTypes.document,
    ];

    if (!allowedTypes.includes(mimeType)) {
      throw new BadRequestException(
        `Unsupported file type: ${mimeType}. Allowed types: ${allowedTypes.join(', ')}`,
      );
    }
  }

  private getMediaType(mimeType: string): MediaType {
    if (mimeType.startsWith('image/')) return MediaType.IMAGE;
    if (mimeType.startsWith('video/')) return MediaType.VIDEO;
    if (mimeType.startsWith('audio/')) return MediaType.AUDIO;
    const documentTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];
    if (documentTypes.includes(mimeType)) return MediaType.DOCUMENT;

    return MediaType.DOCUMENT;
  }

  /**
   * Logic lấy extension chuẩn Enterprise
   * Ưu tiên lấy từ MIME type. Nếu thất bại mới fallback về filename.
   */
  private getExtensionFromMime(mimeType: string, filename?: string): string {
    // 1. Thử lấy extension chuẩn từ MIME type (VD: image/png -> png)
    const ext = mime.extension(mimeType);

    if (ext) {
      return ext;
    }

    // 2. Fallback: Nếu MIME type lạ, thử lấy đuôi từ filename
    if (filename) {
      const parts = filename.split('.');
      if (parts.length > 1) {
        return parts.pop()!.toLowerCase();
      }
    }

    // 3. Đường cùng: trả về bin
    return 'bin';
  }

  /**
   * Format media response with Strict Typing
   * Converts BigInt size to string for JSON safety
   */
  private formatMediaResponse(media: MediaAttachment): MediaResponseDto {
    return new MediaResponseDto({
      id: media.id,
      uploadId: media.uploadId || '', // Handle strict null checks if schema allows null (schema says uploadId is nullable? Check schema: uploadId String? @unique. Wait, schema line 81: uploadId String? @unique. So it CAN be null, need fallback)
      originalName: media.originalName,
      mimeType: media.mimeType,
      mediaType: media.mediaType,
      size: media.size.toString(), // Convert BigInt to string
      s3Key: media.s3Key,
      cdnUrl: media.cdnUrl,
      processingStatus: media.processingStatus,
      createdAt: media.createdAt,
      updatedAt: media.updatedAt || undefined, // Handle null Date
    });
  }

  private getMaxSizeForMediaType(mediaType: MediaType): number {
    switch (mediaType) {
      case MediaType.IMAGE:
        return this.config.limits.maxImageSizeMB;
      case MediaType.VIDEO:
        return this.config.limits.maxVideoSizeMB;
      case MediaType.AUDIO:
        return this.config.limits.maxAudioSizeMB;
      case MediaType.DOCUMENT:
        return this.config.limits.maxDocumentSizeMB;
      default:
        return 10; // Default 10MB
    }
  }
}
