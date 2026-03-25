import type { HighlightLocation } from '../types';

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

      const sorted = [...highlights].sort((a, b) => a.start - b.start);
      const segments: TextSegment[] = [];
      let lastIndex = 0;

      for (const highlight of sorted) {
            const start = Math.max(0, Math.min(highlight.start, text.length));
            const end = Math.max(start, Math.min(highlight.end, text.length));

            if (start > lastIndex) {
                  segments.push({
                        text: text.slice(lastIndex, start),
                        highlighted: false,
                  });
            }

            if (end > start) {
                  segments.push({
                        text: text.slice(start, end),
                        highlighted: true,
                  });
            }
            lastIndex = end;
      }

      if (lastIndex < text.length) {
            segments.push({
                  text: text.slice(lastIndex),
                  highlighted: false,
            });
      }

      return segments;
}

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

export function getConversationTypeLabel(type: 'DIRECT' | 'GROUP'): string {
      return type === 'DIRECT' ? 'Trò chuyện' : 'Nhóm';
}

export function getRelationshipLabel(
      status: 'FRIEND' | 'REQUEST' | 'NONE' | 'BLOCKED',
      direction?: 'OUTGOING' | 'INCOMING',
): string {
      switch (status) {
            case 'FRIEND': return 'Bạn bè';
            case 'REQUEST': return direction === 'INCOMING' ? 'Có lời mời kết bạn' : 'Đã gửi lời mời';
            case 'BLOCKED': return 'Đã chặn';
            case 'NONE':
            default: return 'Người lạ';
      }
}

export function isVisualMedia(mediaType: string): boolean {
      return mediaType === 'IMAGE' || mediaType === 'VIDEO';
}

export function formatFileSize(sizeStr: string): string {
      const bytes = Number(sizeStr);
      if (isNaN(bytes) || bytes === 0) return '0 B';

      const units = ['B', 'KB', 'MB', 'GB'];
      const k = 1024;
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      const value = bytes / Math.pow(k, i);

      return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
