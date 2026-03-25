import { mobileApi } from '@/services/api';

/**
 * Chuyển đổi một đường dẫn tương đối thành URL tuyệt đối hoàn chỉnh.
 * Hữu ích khi xử lý ảnh từ MinIO hoặc đường dẫn tĩnh từ backend.
 * * @param url Đường dẫn đầu vào (có thể là null, relative path, hoặc absolute URL)
 * @returns Đường dẫn tuyệt đối hoặc undefined
 */
export function getFullUrl(url?: string | null): string | undefined {
      if (!url) return undefined;
      // Nếu đã là URL hoàn chỉnh (ví dụ từ Google/Facebook avatar) thì giữ nguyên
      if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('file://') || url.startsWith('content://') || url.startsWith('data:')) return url;
      // Nếu là đường dẫn tương đối (ví dụ từ MinIO), ghép với baseUrl
      return `${mobileApi.baseUrl}${url}`;
}