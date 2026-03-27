import { env } from '../config/env';

/**
 * Converts a relative path to a full URL using the backend base URL.
 * Useful for images from MinIO or static assets from the backend.
 * 
 * @param url Input path (null, relative, or absolute)
 * @returns Absolute URL or undefined
 */
export function getFullUrl(url?: string | null): string | undefined {
      if (!url) return undefined;

      // If already an absolute URL (e.g., Google/Facebook avatar), return it as is
      if (
            url.startsWith('http://') ||
            url.startsWith('https://') ||
            url.startsWith('data:') ||
            url.startsWith('blob:')
      ) {
            return url;
      }

      // Prepend backend base URL to relative paths
      const baseUrl = env.BACKEND_URL.endsWith('/')
            ? env.BACKEND_URL.slice(0, -1)
            : env.BACKEND_URL;

      const normalizedPath = url.startsWith('/') ? url : `/${url}`;
      
      return `${baseUrl}${normalizedPath}`;
}
