import { MediaType } from '@prisma/client';

export const FILE_SIZE_LIMITS_MB = {
  IMAGE: 10,
  VIDEO: 100,
  AUDIO: 20,
  DOCUMENT: 25,
} as const;

export const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'bmp', 'svg'];
export const VIDEO_EXTENSIONS = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'wmv', 'm4v'];
export const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'weba', 'amr', 'wma'];

export const FileUtils = {
  /**
   * Get normalized extension from a filename
   */
  getExtension(filename: string): string {
    if (!filename || !filename.includes('.')) return '';
    const parts = filename.split('.');
    return parts[parts.length - 1].toLowerCase();
  },

  /**
   * Hàm Single Source of Truth để suy ra MediaType.
   * Dựa vào whitelist extension để xử lý mọi file chính xác,
   * các file có đuôi ngoại lệ sẽ được fallback về DOCUMENT.
   */
  inferMediaType(filename: string, mimeType: string): MediaType {
    const ext = this.getExtension(filename);

    if (ext) {
      if (IMAGE_EXTENSIONS.includes(ext)) return MediaType.IMAGE;
      if (VIDEO_EXTENSIONS.includes(ext)) return MediaType.VIDEO;
      if (AUDIO_EXTENSIONS.includes(ext)) return MediaType.AUDIO;
      return MediaType.DOCUMENT;
    }

    if (mimeType.startsWith('image/')) return MediaType.IMAGE;
    if (mimeType.startsWith('video/')) return MediaType.VIDEO;
    if (mimeType.startsWith('audio/')) return MediaType.AUDIO;

    return MediaType.DOCUMENT;
  },

  /**
   * Get size limit in bytes for a specific file based on its inferred type.
   */
  getFileSizeLimitBytes(filename: string, mimeType: string): number {
    const type = this.inferMediaType(filename, mimeType);
    const mb = FILE_SIZE_LIMITS_MB[type];
    return mb * 1024 * 1024;
  },
};
