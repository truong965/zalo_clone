/**
 * Search Utilities
 *
 * Helper functions for search result rendering and data processing.
 */

import type { HighlightLocation } from '../types';

// ============================================================================
// HIGHLIGHT RENDERING
// ============================================================================

/**
 * Split text into segments based on highlight locations.
 * Returns array of { text, highlighted } for rendering.
 *
 * @example
 * ```tsx
 * const segments = getHighlightSegments('Hello world', [{ start: 6, end: 11, text: 'world' }]);
 * // [{ text: 'Hello ', highlighted: false }, { text: 'world', highlighted: true }]
 * ```
 */
export interface TextSegment {
      text: string;
      highlighted: boolean;
}

export function getHighlightSegments(
      text: string,
      highlights: HighlightLocation[],
): TextSegment[] {
      if (!highlights || highlights.length === 0) {
            return [{ text, highlighted: false }];
      }

      // Sort highlights by start position
      const sorted = [...highlights].sort((a, b) => a.start - b.start);

      const segments: TextSegment[] = [];
      let lastIndex = 0;

      for (const highlight of sorted) {
            // Clamp to text bounds
            const start = Math.max(0, Math.min(highlight.start, text.length));
            const end = Math.max(start, Math.min(highlight.end, text.length));

            // Add non-highlighted text before this highlight
            if (start > lastIndex) {
                  segments.push({
                        text: text.slice(lastIndex, start),
                        highlighted: false,
                  });
            }

            // Add highlighted text
            if (end > start) {
                  segments.push({
                        text: text.slice(start, end),
                        highlighted: true,
                  });
            }

            lastIndex = end;
      }

      // Add remaining text after last highlight
      if (lastIndex < text.length) {
            segments.push({
                  text: text.slice(lastIndex),
                  highlighted: false,
            });
      }

      return segments;
}

// ============================================================================
// PREVIEW TEXT
// ============================================================================

/**
 * Truncate text to maxLength, adding ellipsis if needed.
 * Tries to break at word boundary.
 */
export function truncatePreview(text: string, maxLength = 120): string {
      if (text.length <= maxLength) return text;

      const truncated = text.slice(0, maxLength);
      const lastSpace = truncated.lastIndexOf(' ');

      if (lastSpace > maxLength * 0.7) {
            return truncated.slice(0, lastSpace) + '…';
      }

      return truncated + '…';
}

// ============================================================================
// FORMAT HELPERS
// ============================================================================

/**
 * Format file size from string (BigInt serialized) to readable format.
 */
export function formatFileSize(sizeStr: string): string {
      const bytes = Number(sizeStr);
      if (isNaN(bytes) || bytes === 0) return '0 B';

      const units = ['B', 'KB', 'MB', 'GB'];
      const k = 1024;
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      const value = bytes / Math.pow(k, i);

      return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/**
 * Format search execution time for display.
 */
export function formatExecutionTime(ms: number): string {
      if (ms < 1000) return `${Math.round(ms)}ms`;
      return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Format relative time for search results.
 */
export function formatSearchTimestamp(isoDate: string): string {
      const date = new Date(isoDate);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60_000);
      const diffHours = Math.floor(diffMs / 3_600_000);
      const diffDays = Math.floor(diffMs / 86_400_000);

      if (diffMins < 1) return 'Vừa xong';
      if (diffMins < 60) return `${diffMins} phút trước`;
      if (diffHours < 24) return `${diffHours} giờ trước`;
      if (diffDays < 7) return `${diffDays} ngày trước`;

      return date.toLocaleDateString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
      });
}

// ============================================================================
// CONVERSATION TYPE LABELS
// ============================================================================

/**
 * Get display label for conversation type.
 */
export function getConversationTypeLabel(
      type: 'DIRECT' | 'GROUP',
): string {
      return type === 'DIRECT' ? 'Trò chuyện' : 'Nhóm';
}

/**
 * Get display label for relationship status.
 */
export function getRelationshipLabel(
      status: 'FRIEND' | 'REQUEST' | 'NONE' | 'BLOCKED',
      direction?: 'OUTGOING' | 'INCOMING',
): string {
      switch (status) {
            case 'FRIEND':
                  return 'Bạn bè';
            case 'REQUEST':
                  return direction === 'INCOMING' ? 'Có lời mời kết bạn' : 'Đã gửi lời mời';
            case 'BLOCKED':
                  return 'Đã chặn';
            case 'NONE':
            default:
                  return 'Người lạ';
      }
}

// ============================================================================
// MEDIA TYPE HELPERS
// ============================================================================

/**
 * Check if a media type is a visual type (image/video).
 */
export function isVisualMedia(mediaType: string): boolean {
      return mediaType === 'IMAGE' || mediaType === 'VIDEO';
}

/**
 * Get icon name for media type (for Ant Design icons).
 */
export function getMediaTypeIcon(mediaType: string): string {
      switch (mediaType) {
            case 'IMAGE':
                  return 'FileImageOutlined';
            case 'VIDEO':
                  return 'PlaySquareOutlined';
            case 'AUDIO':
                  return 'SoundOutlined';
            case 'DOCUMENT':
            default:
                  return 'FileOutlined';
      }
}
