/**
 * ReplyQuote — Inline quote block inside a message bubble showing the
 * parent message being replied to.
 *
 * Composition: stateless presentational component.
 * Click → scrolls to the original message (via onJumpToMessage callback).
 *
 * Edge cases:
 *   - Parent deleted → show "Tin nhắn đã bị xóa" fallback
 *   - Parent is media-only → show media type label
 *   - Long content → truncated with ellipsis
 *
 * Rules applied:
 *   - rendering-conditional-render: ternary, not &&
 *   - architecture-avoid-boolean-props: uses parentMessage shape
 */

import { FileOutlined, PictureOutlined, VideoCameraOutlined } from '@ant-design/icons';
import type { MessageParentMessage } from '@/types/api';

interface ReplyQuoteProps {
      parentMessage: MessageParentMessage;
      onJumpToMessage?: (messageId: string) => void;
}

function getContentPreview(parent: MessageParentMessage): string {
      if (parent.deletedAt) return 'Tin nhắn đã bị xóa';
      if (parent.content) return parent.content;

      const attachment = parent.mediaAttachments?.[0];
      if (attachment) {
            const typeLabel = attachment.mediaType === 'IMAGE' ? 'Hình ảnh'
                  : attachment.mediaType === 'VIDEO' ? 'Video'
                        : attachment.mediaType === 'AUDIO' ? 'Audio'
                              : 'File';
            return `[${typeLabel}] ${attachment.originalName}`;
      }

      return '[Tin nhắn]';
}

function MediaIcon({ mediaType }: { mediaType: string }) {
      switch (mediaType) {
            case 'IMAGE':
                  return <PictureOutlined className="text-blue-400 text-xs" />;
            case 'VIDEO':
                  return <VideoCameraOutlined className="text-blue-400 text-xs" />;
            default:
                  return <FileOutlined className="text-blue-400 text-xs" />;
      }
}

export function ReplyQuote({ parentMessage, onJumpToMessage }: ReplyQuoteProps) {
      const isDeleted = !!parentMessage.deletedAt;
      const senderName = parentMessage.sender?.resolvedDisplayName
            ?? parentMessage.sender?.displayName
            ?? 'Người dùng';
      const attachment = parentMessage.mediaAttachments?.[0];

      return (
            <button
                  type="button"
                  className="flex items-start gap-1.5 w-full text-left mb-1.5 px-2 py-1.5 bg-black/5 rounded-md cursor-pointer hover:bg-black/10 transition-colors border-l-2 border-blue-400"
                  onClick={() => onJumpToMessage?.(parentMessage.id)}
            >
                  {/* Thumbnail preview for media */}
                  {!isDeleted && attachment?.thumbnailUrl ? (
                        <img
                              src={attachment.thumbnailUrl}
                              alt=""
                              className="w-8 h-8 rounded object-cover flex-shrink-0"
                        />
                  ) : !isDeleted && attachment ? (
                        <div className="w-8 h-8 rounded bg-blue-50 flex items-center justify-center flex-shrink-0">
                              <MediaIcon mediaType={attachment.mediaType} />
                        </div>
                  ) : null}

                  <div className="flex-1 min-w-0 overflow-hidden">
                        <div className={`text-[11px] font-medium truncate ${isDeleted ? 'text-gray-400' : 'text-blue-600'}`}>
                              {senderName}
                        </div>
                        <div className={`text-[11px] truncate ${isDeleted ? 'text-gray-400 italic' : 'text-gray-500'}`}>
                              {getContentPreview(parentMessage)}
                        </div>
                  </div>
            </button>
      );
}
