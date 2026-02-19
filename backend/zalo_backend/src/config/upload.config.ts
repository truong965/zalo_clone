// src/config/upload.config.ts
import { registerAs } from '@nestjs/config';

export default registerAs('upload', () => ({
  limits: {
    maxImageSizeMB: parseInt(process.env.MAX_IMAGE_SIZE_MB || '10', 10),
    maxVideoSizeMB: parseInt(process.env.MAX_VIDEO_SIZE_MB || '100', 10),
    maxAudioSizeMB: parseInt(process.env.MAX_AUDIO_SIZE_MB || '20', 10),
    maxDocumentSizeMB: parseInt(process.env.MAX_DOCUMENT_SIZE_MB || '25', 10),
    maxVideoDurationSeconds: parseInt(
      process.env.MAX_VIDEO_DURATION_SECONDS || '180',
      10,
    ),
    maxAudioDurationSeconds: parseInt(
      process.env.MAX_AUDIO_DURATION_SECONDS || '600',
      10,
    ), // 10 minutes
    // Stream threshold: default 100 MB
    streamThresholdBytes:
      parseInt(process.env.STREAM_THRESHOLD_MB || '100', 10) * 1024 * 1024,
    // Deep validation limits (Pixel)
    maxImageDimension: parseInt(process.env.MAX_IMAGE_DIMENSION || '8192', 10),
    maxVideoDimension: parseInt(process.env.MAX_VIDEO_DIMENSION || '4096', 10), // 4K
  },
  retry: {
    dbFetchMaxAttempts: parseInt(process.env.RETRY_DB_MAX_ATTEMPTS || '5', 10),
    dbFetchBaseDelayMs: parseInt(process.env.RETRY_DB_BASE_DELAY_MS || '500', 10),
    s3CheckMaxAttempts: parseInt(process.env.RETRY_S3_MAX_ATTEMPTS || '5', 10),
    s3CheckRetryDelayMs: parseInt(process.env.RETRY_S3_RETRY_DELAY_MS || '300', 10),
  },
  cleanup: {
    tempFileMaxAgeHours: parseInt(process.env.CLEANUP_TEMP_MAX_AGE_HOURS || '24', 10),
    failedUploadMaxAgeDays: parseInt(process.env.CLEANUP_FAILED_MAX_AGE_DAYS || '7', 10),
    softDeletedMaxAgeDays: parseInt(process.env.CLEANUP_SOFT_DELETE_MAX_AGE_DAYS || '30', 10),
    batchSize: parseInt(process.env.CLEANUP_BATCH_SIZE || '100', 10),
    concurrentBatches: parseInt(process.env.CLEANUP_CONCURRENT_BATCHES || '5', 10),
  },
  // Image processing quality settings
  processing: {
    // Thumbnail size for chat previews (only 'small' is actively used)
    thumbnailSmallWidth: parseInt(process.env.THUMBNAIL_SMALL_WIDTH || '150', 10),
    thumbnailSmallHeight: parseInt(process.env.THUMBNAIL_SMALL_HEIGHT || '150', 10),
    // Max dimension before generating an optimized WebP variant
    maxOptimizedDimension: parseInt(process.env.MAX_OPTIMIZED_DIMENSION || '2048', 10),
  },
  rateLimit: {
    uploadsPerMinute: parseInt(
      process.env.UPLOAD_RATE_LIMIT_PER_MINUTE || '10',
      10,
    ),
  },
  // Cấu hình ClamAV
  clamav: {
    enabled: process.env.CLAMAV_ENABLED === 'true',
    host: process.env.CLAMAV_HOST || 'clamav', // Tên service trong docker-compose
    port: parseInt(process.env.CLAMAV_PORT || '3310', 10),
    timeout: 60000,
  },
  allowedMimeTypes: {
    image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    video: ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm'],
    audio: [
      'audio/mpeg', // MP3
      'audio/wav',
      'audio/ogg',
      'audio/aac',
      'audio/m4a',
    ],
    document: [
      'application/pdf',
      'application/msword', // .doc
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'application/vnd.ms-excel', // .xls
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'text/plain', // .txt
    ],
  },
  presignedUrlExpiry: parseInt(process.env.PRESIGNED_URL_EXPIRY || '300', 10),
}));
