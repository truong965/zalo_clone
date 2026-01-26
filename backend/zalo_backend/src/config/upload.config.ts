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
  },
  rateLimit: {
    uploadsPerMinute: parseInt(
      process.env.UPLOAD_RATE_LIMIT_PER_MINUTE || '10',
      10,
    ),
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
