/**
 * Media Module Types
 *
 * Media upload, processing status and attachment entities.
 */

// ============================================================================
// ENUMS
// ============================================================================

export const MediaType = {
      IMAGE: 'IMAGE',
      VIDEO: 'VIDEO',
      DOCUMENT: 'DOCUMENT',
      AUDIO: 'AUDIO',
} as const;

export type MediaType = (typeof MediaType)[keyof typeof MediaType];

export const MediaProcessingStatus = {
      PENDING: 'PENDING',
      UPLOADED: 'UPLOADED',
      CONFIRMED: 'CONFIRMED',
      PROCESSING: 'PROCESSING',
      READY: 'READY',
      FAILED: 'FAILED',
      EXPIRED: 'EXPIRED',
} as const;

export type MediaProcessingStatus =
      (typeof MediaProcessingStatus)[keyof typeof MediaProcessingStatus];

// ============================================================================
// ENTITIES
// ============================================================================

export interface MediaAttachment {
      id: string;
      messageId?: number;
      originalName: string;
      mimeType: string;
      mediaType: MediaType;
      size: number;
      s3Key?: string;
      s3Bucket: string;
      cdnUrl?: string;
      thumbnailUrl?: string;
      thumbnailS3Key?: string;
      optimizedUrl?: string;
      hlsPlaylistUrl?: string;
      duration?: number;
      width?: number;
      height?: number;
      processingStatus: MediaProcessingStatus;
      processingError?: string;
      processedAt?: string;
      uploadId?: string;
      s3KeyTemp?: string;
      retryCount: number;
      uploadedBy: string;
      uploadedFrom?: string;
      createdAt: string;
      updatedAt: string;
      deletedAt?: string;
      deletedById?: string;
}
