// src/modules/media/dto/media-response.dto.ts
import { MediaProcessingStatus, MediaType } from '@prisma/client';

export class MediaResponseDto {
  id: string;
  uploadId: string;
  originalName: string;
  mimeType: string;
  mediaType: MediaType;

  /** File size — serialized as string to avoid BigInt JSON issues */
  size: string;

  s3Key: string | null;

  /** CDN URL (null before processing completes) */
  cdnUrl: string | null;

  /** Thumbnail image URL (images & videos only; null while processing) */
  thumbnailUrl: string | null;

  /** Optimized/resized variant URL (images only) */
  optimizedUrl: string | null;

  /** HLS master playlist URL (videos only; null while HLS is disabled) */
  hlsPlaylistUrl: string | null;

  /** Video/audio duration in seconds */
  duration: number | null;

  /** Width in pixels (images & videos) */
  width: number | null;

  /** Height in pixels (images & videos) */
  height: number | null;

  processingStatus: MediaProcessingStatus;

  /** Reason for FAILED status; null otherwise */
  processingError: string | null;

  createdAt: Date;
  updatedAt: Date | null;

  constructor(partial: Partial<MediaResponseDto>) {
    Object.assign(this, partial);
  }
}
