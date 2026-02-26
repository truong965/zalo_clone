/**
 * PinnedMessagesBanner — Compact banner above the chat area.
 *
 * Shows the most recently pinned message. Click → toggles a dropdown panel
 * listing all pinned messages (up to 10). Each item is clickable to scroll
 * to that message. Unpin button on each item.
 *
 * Props are kept minimal; data comes from the parent via usePinMessage.
 */

import { useState } from 'react';
import { PushpinOutlined, CloseOutlined, DeleteOutlined } from '@ant-design/icons';
import { Button, Tooltip } from 'antd';
import type { PinnedMessageItem } from '@/types/api';

interface PinnedMessagesBannerProps {
      pinnedMessages: PinnedMessageItem[];
      onJumpToMessage?: (messageId: string) => void;
      onUnpin?: (messageId: string) => void;
}

/** Truncate text to max chars */
function truncate(text: string | null | undefined, max: number): string {
      if (!text) return '';
      return text.length > max ? text.slice(0, max) + '…' : text;
}

function getMediaTypeLabel(type: string): string {
      switch (type) {
            case 'IMAGE': return '🖼️ Hình ảnh';
            case 'VIDEO': return '🎥 Video';
            case 'AUDIO': return '🎵 Audio';
            case 'DOCUMENT': return '📄 File';
            default: return '📎 Đính kèm';
      }
}

function PinnedItemPreview({ item }: { item: PinnedMessageItem }) {
      if (item.deletedAt) {
            return <span className="italic text-gray-400">Tin nhắn đã bị xóa</span>;
      }
      if (item.content) {
            return <span>{truncate(item.content, 60)}</span>;
      }
      if (item.mediaAttachments?.length) {
            return <span className="text-gray-500">{getMediaTypeLabel(item.mediaAttachments[0].mediaType)}</span>;
      }
      return <span className="text-gray-400">Tin nhắn</span>;
}

export function PinnedMessagesBanner({
      pinnedMessages,
      onJumpToMessage,
      onUnpin,
}: PinnedMessagesBannerProps) {
      const [expanded, setExpanded] = useState(false);

      if (pinnedMessages.length === 0) return null;

      // Latest pinned message = last in array (most recently pinned)
      const latest = pinnedMessages[0];

      return (
            <div className="relative z-20">
                  {/* ── Compact banner ── */}
                  <div
                        className="flex items-center gap-2 px-4 py-2 bg-blue-50 border-b border-blue-100 cursor-pointer select-none hover:bg-blue-100 transition-colors"
                        onClick={() => setExpanded((v) => !v)}
                  >
                        <PushpinOutlined className="text-blue-500 text-sm" />
                        <div className="flex-1 min-w-0 text-sm text-gray-700 truncate">
                              <span className="font-medium text-blue-600 mr-1">
                                    {latest.sender?.displayName ?? 'Người dùng'}:
                              </span>
                              <PinnedItemPreview item={latest} />
                        </div>
                        <span className="text-[11px] text-gray-400 whitespace-nowrap">
                              {pinnedMessages.length > 1 ? `${pinnedMessages.length} tin ghim` : '1 tin ghim'}
                        </span>
                  </div>

                  {/* ── Expanded panel ── */}
                  {expanded && (
                        <div className="absolute top-full left-0 right-0 bg-white border-b border-gray-200 shadow-lg max-h-72 overflow-y-auto z-30">
                              <div className="px-4 py-2 flex items-center justify-between border-b border-gray-100">
                                    <span className="text-sm font-medium text-gray-700">
                                          <PushpinOutlined className="mr-1 text-blue-500" />
                                          Tin nhắn đã ghim ({pinnedMessages.length})
                                    </span>
                                    <Button
                                          type="text"
                                          size="small"
                                          icon={<CloseOutlined />}
                                          onClick={() => setExpanded(false)}
                                    />
                              </div>
                              <div className="divide-y divide-gray-50">
                                    {pinnedMessages.map((item) => (
                                          <div
                                                key={item.id}
                                                className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer group"
                                                onClick={() => {
                                                      onJumpToMessage?.(item.id);
                                                      setExpanded(false);
                                                }}
                                          >
                                                {/* Avatar */}
                                                <div className="w-8 h-8 rounded-full bg-blue-200 flex items-center justify-center text-xs flex-shrink-0">
                                                      {item.sender?.displayName?.[0]?.toUpperCase() ?? 'U'}
                                                </div>
                                                {/* Content */}
                                                <div className="flex-1 min-w-0">
                                                      <div className="text-xs font-medium text-gray-600">
                                                            {item.sender?.displayName ?? 'Người dùng'}
                                                      </div>
                                                      <div className="text-sm text-gray-700 truncate">
                                                            <PinnedItemPreview item={item} />
                                                      </div>
                                                </div>
                                                {/* Unpin button */}
                                                <Tooltip title="Bỏ ghim">
                                                      <Button
                                                            type="text"
                                                            size="small"
                                                            danger
                                                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                                                            icon={<DeleteOutlined />}
                                                            onClick={(e) => {
                                                                  e.stopPropagation();
                                                                  onUnpin?.(item.id);
                                                            }}
                                                      />
                                                </Tooltip>
                                          </div>
                                    ))}
                              </div>
                        </div>
                  )}
            </div>
      );
}
