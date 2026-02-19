// src/common/constants/media.constant.ts

// Mapping MIME -> Extension (Giữ nguyên cũ)
export const MIME_TO_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/x-msvideo': 'avi',
  'video/webm': 'webm',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/aac': 'aac',
  'audio/m4a': 'm4a',
  'audio/ogg': 'ogg',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/plain': 'txt',
};

// Các mẫu nhận diện file độc hại
export const SECURITY_PATTERNS = {
  SCRIPTS: [
    '<script',
    'javascript:',
    'vbscript:',
    'data:text/html',
    'onerror=',
    'onload=',
  ],
  SVG_DANGEROUS: [
    /<script/i,
    /javascript:/i,
    /on\w+=/i,
    /<iframe/i,
    /<embed/i,
    /<object/i,
  ],
};

// Chữ ký nhị phân (Magic Bytes) để phát hiện Polyglot
export const KNOWN_SIGNATURES = [
  { name: 'JPEG', bytes: [0xff, 0xd8, 0xff] },
  { name: 'PNG', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { name: 'GIF', bytes: [0x47, 0x49, 0x46, 0x38] },
  { name: 'PDF', bytes: [0x25, 0x50, 0x44, 0x46] },
  { name: 'ZIP', bytes: [0x50, 0x4b, 0x03, 0x04] },
];

// Thông báo lỗi chuẩn hóa
export const ERROR_MESSAGES = {
  FFMPEG_NOT_FOUND: 'Cannot find ffmpeg',
  MEDIA_NOT_FOUND: 'Media not found after attempts',
  SECURITY_VIOLATION: 'Security Violation',
  S3_KEY_MISSING: 'S3_KEY_MISSING',
};

/**
 * Domain events emitted by the Media module.
 * Other modules (messaging, notifications) listen to these via EventEmitter2.
 */
export const MEDIA_EVENTS = {
  /** Fired after a presigned upload is confirmed and the DB record exists */
  UPLOADED: 'media.uploaded',
  /** Fired after the worker finishes processing (thumbnail/metadata done) */
  PROCESSED: 'media.processed',
  /** Fired after a job exhausts all retries and is marked FAILED */
  FAILED: 'media.failed',
  /** Fired after a media record is soft-deleted by the owner */
  DELETED: 'media.deleted',
} as const;

