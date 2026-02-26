/**
 * ReplyPreviewBar — Compact preview strip shown above the chat input
 * when the user is replying to a specific message.
 *
 * Composition: stateless presentational component.
 * State comes from useChatStore.replyTarget.
 *
 * Rules applied:
 *   - architecture-avoid-boolean-props: no booleans — uses ReplyTarget | null
 *   - rendering-conditional-render: ternary, not &&
 *   - rerender-memo: pure presentational, no internal state
 */

import { CloseOutlined, FileOutlined, PictureOutlined, VideoCameraOutlined } from '@ant-design/icons';
import type { ReplyTarget } from '../stores/chat.store';

interface ReplyPreviewBarProps {
      target: ReplyTarget;
      onCancel: () => void;
}

function getMediaIcon(mediaType: string) {
      switch (mediaType) {
            case 'IMAGE':
                  return <PictureOutlined className="text-blue-500" />;
            case 'VIDEO':
                  return <VideoCameraOutlined className="text-blue-500" />;
            default:
                  return <FileOutlined className="text-blue-500" />;
      }
}

function getPreviewText(target: ReplyTarget): string {
      if (target.content) return target.content;

      const attachment = target.mediaAttachments?.[0];
      if (attachment) {
            const typeLabel = attachment.mediaType === 'IMAGE' ? 'Hình ảnh'
                  : attachment.mediaType === 'VIDEO' ? 'Video'
                        : attachment.mediaType === 'AUDIO' ? 'Audio'
                              : 'File';
            return `[${typeLabel}] ${attachment.originalName}`;
      }

      return '[Tin nhắn]';
}

export function ReplyPreviewBar({ target, onCancel }: ReplyPreviewBarProps) {
      const attachment = target.mediaAttachments?.[0];

      return (
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-t border-gray-200">
                  {/* Blue left accent bar */}
                  <div className="w-0.5 h-8 bg-blue-500 rounded-full flex-shrink-0" />

                  {/* Media icon (if applicable) */}
                  {attachment ? (
                        <div className="flex-shrink-0">
                              {getMediaIcon(attachment.mediaType)}
                        </div>
                  ) : null}

                  {/* Text content */}
                  <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-blue-600 truncate">
                              Trả lời {target.senderName}
                        </div>
                        <div className="text-xs text-gray-500 truncate">
                              {getPreviewText(target)}
                        </div>
                  </div>

                  {/* Cancel button */}
                  <button
                        type="button"
                        onClick={onCancel}
                        className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full hover:bg-gray-200 transition-colors text-gray-400 hover:text-gray-600"
                        aria-label="Hủy trả lời"
                  >
                        <CloseOutlined className="text-xs" />
                  </button>
            </div>
      );
}
