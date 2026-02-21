/**
 * Media Upload Service
 *
 * Handles the 3-step presigned URL upload flow:
 *   1. initiateUpload  → POST /media/upload/initiate  → { uploadId, presignedUrl }
 *   2. uploadToS3      → PUT  presignedUrl (XHR)      → direct S3 upload with progress
 *   3. confirmUpload   → POST /media/upload/confirm    → MediaResponseDto
 *
 * Uses XMLHttpRequest for S3 upload to get real upload progress via
 * xhr.upload.onprogress (fetch API does not support upload progress).
 */

import { API_ENDPOINTS } from '@/constants/api-endpoints';
import apiClient from '@/lib/axios';
import type { ApiResponse, MediaProcessingStatus, MediaType } from '@/types/api';

// ============================================================================
// REQUEST / RESPONSE TYPES
// ============================================================================

export interface InitiateUploadRequest {
      fileName: string;
      mimeType: string;
      fileSize: number;
}

export interface InitiateUploadResponse {
      uploadId: string;
      presignedUrl: string;
      expiresIn: number;
      s3Key: string;
}

export interface MediaResponseDto {
      id: string;
      uploadId: string;
      originalName: string;
      mimeType: string;
      mediaType: MediaType;
      size: string;
      s3Key: string | null;
      cdnUrl: string | null;
      thumbnailUrl: string | null;
      optimizedUrl: string | null;
      hlsPlaylistUrl: string | null;
      duration: number | null;
      width: number | null;
      height: number | null;
      processingStatus: MediaProcessingStatus;
      processingError: string | null;
      createdAt: string;
      updatedAt: string | null;
}

// ============================================================================
// FILE SIZE LIMITS (mirrored from backend upload.config — MB)
// ============================================================================

export const FILE_SIZE_LIMITS_MB = {
      IMAGE: 10,
      VIDEO: 100,
      AUDIO: 20,
      DOCUMENT: 25,
} as const;

/**
 * Maximum number of files per upload batch.
 * Mirrors backend MESSAGE_LIMITS aggregate.
 */
export const MAX_FILES_PER_SEND = 10;

// ============================================================================
// ACCEPTED MIME TYPES (mirrored from backend MIME_TO_EXTENSION)
// ============================================================================

export const ACCEPTED_MIME_TYPES = [
      // Images
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      // Videos
      'video/mp4',
      'video/quicktime',
      'video/x-msvideo',
      'video/webm',
      // Audio
      'audio/mpeg',
      'audio/wav',
      'audio/aac',
      'audio/x-m4a',
      'audio/ogg',
      // Documents
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
] as const;

/**
 * Accept string for <input type="file"> — derived from ACCEPTED_MIME_TYPES.
 */
export const FILE_INPUT_ACCEPT = ACCEPTED_MIME_TYPES.join(',');

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Infer the MediaType category from a MIME string.
 * Mirrors backend `MediaUploadService.inferMediaType`.
 */
export function inferMediaTypeFromMime(mime: string): MediaType {
      if (mime.startsWith('image/')) return 'IMAGE';
      if (mime.startsWith('video/')) return 'VIDEO';
      if (mime.startsWith('audio/')) return 'AUDIO';
      return 'DOCUMENT';
}

/**
 * Get the size limit (in bytes) for a given MIME type.
 */
export function getFileSizeLimitBytes(mime: string): number {
      const type = inferMediaTypeFromMime(mime);
      const mb = FILE_SIZE_LIMITS_MB[type];
      return mb * 1024 * 1024;
}

/**
 * Sanitize a filename to match backend regex: `^[a-zA-Z0-9._-\s()]+$`
 * Replaces disallowed characters with underscores.
 */
export function sanitizeFileName(name: string): string {
      return name.replace(/[^a-zA-Z0-9._\-\s()]/g, '_');
}

/**
 * Validate a single file before upload.
 * Returns null if valid, or an error message string.
 */
export function validateFile(file: File): string | null {
      // Check MIME type
      if (
            !ACCEPTED_MIME_TYPES.includes(file.type as (typeof ACCEPTED_MIME_TYPES)[number])
      ) {
            return `Định dạng file "${file.name}" không được hỗ trợ (${file.type || 'unknown'})`;
      }

      // Check size
      const limitBytes = getFileSizeLimitBytes(file.type);
      if (file.size > limitBytes) {
            const limitMB = limitBytes / (1024 * 1024);
            return `File "${file.name}" vượt quá giới hạn ${limitMB}MB`;
      }

      // Check empty
      if (file.size === 0) {
            return `File "${file.name}" rỗng (0 bytes)`;
      }

      return null;
}

// ============================================================================
// SERVICE
// ============================================================================

export const mediaService = {
      /**
       * Step 1: Request a presigned S3 upload URL + create MediaAttachment record.
       */
      async initiateUpload(
            dto: InitiateUploadRequest,
      ): Promise<InitiateUploadResponse> {
            const response = await apiClient.post<ApiResponse<InitiateUploadResponse>>(
                  API_ENDPOINTS.MEDIA.INITIATE,
                  {
                        fileName: sanitizeFileName(dto.fileName),
                        mimeType: dto.mimeType,
                        fileSize: dto.fileSize,
                  },
            );
            return response.data.data;
      },

      /**
       * Step 2: Upload file directly to S3 using the presigned URL.
       *
       * Uses XMLHttpRequest for `upload.onprogress` support.
       * Returns a Promise that resolves on success, rejects on failure.
       *
       * @param presignedUrl - S3 presigned PUT URL
       * @param file - The File object to upload
       * @param onProgress - Callback receiving percent (0–100)
       * @param signal - Optional AbortSignal for cancellation
       */
      uploadToS3(
            presignedUrl: string,
            file: File,
            onProgress?: (percent: number) => void,
            signal?: AbortSignal,
      ): Promise<void> {
            return new Promise<void>((resolve, reject) => {
                  const xhr = new XMLHttpRequest();

                  // Abort support
                  const handleAbort = () => {
                        xhr.abort();
                        reject(new DOMException('Upload aborted', 'AbortError'));
                  };

                  if (signal?.aborted) {
                        reject(new DOMException('Upload aborted', 'AbortError'));
                        return;
                  }
                  signal?.addEventListener('abort', handleAbort, { once: true });

                  // Progress tracking
                  xhr.upload.addEventListener('progress', (event) => {
                        if (event.lengthComputable && onProgress) {
                              const percent = Math.round((event.loaded / event.total) * 100);
                              onProgress(percent);
                        }
                  });

                  // Completion
                  xhr.addEventListener('load', () => {
                        signal?.removeEventListener('abort', handleAbort);
                        if (xhr.status >= 200 && xhr.status < 300) {
                              onProgress?.(100);
                              resolve();
                        } else {
                              reject(
                                    new Error(`S3 upload failed with status ${xhr.status}: ${xhr.statusText}`),
                              );
                        }
                  });

                  // Network error
                  xhr.addEventListener('error', () => {
                        signal?.removeEventListener('abort', handleAbort);
                        reject(new Error('Network error during S3 upload'));
                  });

                  // Timeout
                  xhr.addEventListener('timeout', () => {
                        signal?.removeEventListener('abort', handleAbort);
                        reject(new Error('S3 upload timed out'));
                  });

                  xhr.open('PUT', presignedUrl);
                  xhr.setRequestHeader('Content-Type', file.type);
                  xhr.send(file);
            });
      },

      /**
       * Step 3: Confirm upload completed — backend verifies S3 + enqueues processing.
       */
      async confirmUpload(uploadId: string): Promise<MediaResponseDto> {
            const response = await apiClient.post<ApiResponse<MediaResponseDto>>(
                  API_ENDPOINTS.MEDIA.CONFIRM,
                  { uploadId },
            );
            return response.data.data;
      },

      /**
       * Get media attachment details by ID.
       */
      async getMedia(mediaId: string): Promise<MediaResponseDto> {
            const response = await apiClient.get<ApiResponse<MediaResponseDto>>(
                  API_ENDPOINTS.MEDIA.GET(mediaId),
            );
            return response.data.data;
      },

      /**
       * Soft-delete a media attachment (before or after linking to message).
       */
      async deleteMedia(mediaId: string): Promise<void> {
            await apiClient.delete(API_ENDPOINTS.MEDIA.DELETE(mediaId));
      },
};
