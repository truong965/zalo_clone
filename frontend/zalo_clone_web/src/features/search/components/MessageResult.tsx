/**
 * MessageResult – Search result card for messages
 *
 * Hiển thị:
 * - Avatar sender + conversation name
 * - Highlighted preview text (parse highlights[] → <mark>)
 * - Timestamp + conversation type badge
 *
 * FIX: preview giờ là plain text (không có HTML tag).
 * Component tự render <mark> từ highlights[] với offset chính xác.
 */

import { Avatar, Typography, Tag } from 'antd';
import type { MessageSearchResult } from '../types';
import { formatSearchTimestamp, getConversationTypeLabel } from '../utils/search.util';

const { Text } = Typography;

interface MessageResultProps {
      data: MessageSearchResult;
      /** Hide conversation name + type badge (for in-conversation search) */
      hideConversationInfo?: boolean;
      onClick?: (result: MessageSearchResult) => void;
}

/**
 * FIX (THÊM MỚI): Render plain text + highlights[] thành React nodes.
 *
 * Vấn đề cũ với getHighlightSegments() + truncatePreview():
 *   - preview đã chứa sẵn <mark>150</mark> (HTML string từ ts_headline)
 *   - getHighlightSegments() dùng highlights[].start/end để cắt string
 *   - Nhưng start/end được tính từ content gốc (extractHighlights/indexOf)
 *     trong khi preview là snippet ngắn (MaxWords=20) với offset khác
 *   → highlights[] trỏ sai vị trí trong preview → mark đặt nhầm chỗ
 *   → Hoặc nếu dùng HTML trực tiếp thì <mark> bị double/escaped
 *
 * Giải pháp: preview = plain text, highlights[] = offset chính xác trong
 * plain text đó (được parse từ [[HL]] placeholder ở backend).
 * Hàm này cắt preview theo highlights[] và trả về React nodes.
 */
function renderHighlightedPreview(
      preview: string,
      highlights: Array<{ start: number; end: number; text: string }>,
): React.ReactNode[] {
      if (!highlights.length) {
            return [<span key="all">{preview}</span>];
      }

      const nodes: React.ReactNode[] = [];
      let cursor = 0;

      // Sắp xếp highlights theo start để đảm bảo thứ tự
      const sorted = [...highlights].sort((a, b) => a.start - b.start);

      sorted.forEach((hl, i) => {
            // Clamp để không bao giờ vượt quá độ dài preview
            const start = Math.min(hl.start, preview.length);
            const end = Math.min(hl.end, preview.length);

            // Text bình thường trước highlight này
            if (cursor < start) {
                  nodes.push(<span key={`plain-${i}`}>{preview.slice(cursor, start)}</span>);
            }

            // Text được highlight
            if (start < end) {
                  nodes.push(
                        <mark key={`hl-${i}`} className="bg-yellow-200 text-gray-900 rounded-sm px-0.5">
                              {preview.slice(start, end)}
                        </mark>,
                  );
            }

            cursor = end;
      });

      // Text bình thường sau highlight cuối
      if (cursor < preview.length) {
            nodes.push(<span key="tail">{preview.slice(cursor)}</span>);
      }

      return nodes;
}

export function MessageResult({ data, hideConversationInfo = false, onClick }: MessageResultProps) {
      const timestamp = formatSearchTimestamp(data.createdAt);
      const typeLabel = getConversationTypeLabel(data.conversationType);

      // FIX: Dùng renderHighlightedPreview thay vì getHighlightSegments + truncatePreview
      // preview là plain text, highlights[] có offset chính xác từ backend
      const previewNodes = renderHighlightedPreview(data.preview, data.highlights ?? []);

      return (
            <div
                  className="flex items-start gap-3 px-3 py-3 cursor-pointer rounded-lg hover:bg-gray-50 transition-colors"
                  onClick={() => onClick?.(data)}
            >
                  {/* Avatar */}
                  <div className="relative flex-shrink-0">
                        <Avatar
                              size={40}
                              src={data.senderAvatarUrl || undefined}
                              className={!data.senderAvatarUrl ? 'bg-blue-500' : ''}
                        >
                              {data.senderName?.[0]?.toUpperCase() ?? 'U'}
                        </Avatar>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                        {/* Row 1: Sender name + time */}
                        <div className="flex justify-between items-baseline mb-0.5">
                              <div className="flex items-center gap-1.5 min-w-0 flex-1 mr-2">
                                    <Text
                                          strong
                                          className="truncate text-sm text-gray-800"
                                          title={data.senderName}
                                    >
                                          {data.senderName}
                                    </Text>
                              </div>
                              <Text className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">
                                    {timestamp}
                              </Text>
                        </div>

                        {/* Row 2: Highlighted preview */}
                        {/* FIX: Render từ plain text + highlights[], không dùng dangerouslySetInnerHTML */}
                        {/* FIX Issue 1: Dùng line-clamp-2 thay vì truncate để hiển thị 2 dòng */}
                        <div className="text-sm text-gray-600 line-clamp-2">
                              {previewNodes}
                        </div>

                        {/* Row 3: Type badge — only show when not in-conversation */}
                        {!hideConversationInfo && (
                              <div className="mt-1">
                                    <Tag
                                          className="text-[10px] leading-none border-0"
                                          color={data.conversationType === 'GROUP' ? 'orange' : 'blue'}
                                    >
                                          {typeLabel}
                                    </Tag>
                              </div>
                        )}
                  </div>
            </div>
      );
}