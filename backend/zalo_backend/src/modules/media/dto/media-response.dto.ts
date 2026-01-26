// src/modules/media/dto/media-response.dto.ts
import { MediaProcessingStatus, MediaType } from '@prisma/client';
export class MediaResponseDto {
  id: string;
  uploadId: string;
  originalName: string;
  mimeType: string;
  mediaType: MediaType;

  // Chuyển BigInt thành string để tránh lỗi JSON serialization
  size: string;

  s3Key: string | null;

  // Có thể null nếu chưa có CDN
  cdnUrl: string | null;

  processingStatus: MediaProcessingStatus;

  createdAt: Date;
  updatedAt: Date;

  constructor(partial: Partial<MediaResponseDto>) {
    Object.assign(this, partial);
  }
}
