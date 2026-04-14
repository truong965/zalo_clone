import { MediaType } from '@/types/api';

export const FILE_SIZE_LIMITS_MB = {
      IMAGE: 10,
      VIDEO: 100,
      AUDIO: 20,
      DOCUMENT: 25,
} as const;

export const MAX_FILES_PER_SEND = 10;

export const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'bmp', 'svg'];
export const VIDEO_EXTENSIONS = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'wmv', 'm4v'];
export const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'weba', 'amr', 'wma'];

export const FileUtils = {
      /**
       * Get normalized extension from a filename
       */
      getExtension(filename: string): string {
            if (!filename.includes('.')) return '';
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
                  if (IMAGE_EXTENSIONS.includes(ext)) return 'IMAGE';
                  if (VIDEO_EXTENSIONS.includes(ext)) return 'VIDEO';
                  if (AUDIO_EXTENSIONS.includes(ext)) return 'AUDIO';
                  return 'DOCUMENT';
            }

            // Fallback khi không có extension (vd: blob)
            if (mimeType.startsWith('image/')) return 'IMAGE';
            if (mimeType.startsWith('video/')) return 'VIDEO';
            if (mimeType.startsWith('audio/')) return 'AUDIO';
            
            return 'DOCUMENT';
      },

      /**
       * Get size limit in bytes for a specific file based on its inferred type.
       */
      getFileSizeLimitBytes(filename: string, mimeType: string): number {
            const type = this.inferMediaType(filename, mimeType);
            const mb = FILE_SIZE_LIMITS_MB[type];
            return mb * 1024 * 1024;
      },

      /**
       * Validate file for upload: only checks file size limits and emptyness.
       * Dạng Generic Bucket không cấm đuôi file.
       */
      validateFileUpload(file: File): string | null {
            // Check empty
            if (file.size === 0) {
                  return `File "${file.name}" rỗng (0 bytes)`;
            }

            // Check size limit according to its category
            const limitBytes = this.getFileSizeLimitBytes(file.name, file.type);
            if (file.size > limitBytes) {
                  const limitMB = limitBytes / (1024 * 1024);
                  return `File "${file.name}" vượt quá giới hạn ${limitMB}MB`;
            }

            return null;
      },

      /**
       * Check if file is purely an image based on mimetype (For Avatars).
       */
      isImageFile(file: File): boolean {
            return file.type.startsWith('image/');
      },

      /**
       * Sanitize a filename to match backend regex: `^[a-zA-Z0-9._-\s()]+$`
       * Replaces disallowed characters with underscores.
       */
      sanitizeFileName(name: string): string {
            // Remove control characters and path separators, but keep Unicode (accents)
            return name.replace(/[\0-\x1F\x7F<>:"/\\|?*]/g, '_');
      }
};
