/**
 * GroupListItem — Single group card for the Groups tab
 *
 * Displays group avatar, name, member count, last message preview, and timestamp.
 * Follows the FriendCard composition pattern (actions slot).
 * Memoized to prevent re-renders when sibling items change (rerender-memo).
 */

import { memo } from 'react';
import { Avatar, Typography, Badge } from 'antd';
import { TeamOutlined } from '@ant-design/icons';
import type { GroupListItem } from '../../types';

const { Text } = Typography;

interface GroupListItemProps {
      group: GroupListItem;
      onClick?: (groupId: string) => void;
}

function formatTimestamp(dateStr: string | null): string {
      if (!dateStr) return '';
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays === 0) {
            return date.toLocaleTimeString('vi-VN', {
                  hour: '2-digit',
                  minute: '2-digit',
            });
      }
      if (diffDays === 1) return 'Hôm qua';
      if (diffDays < 7) {
            return date.toLocaleDateString('vi-VN', { weekday: 'short' });
      }
      return date.toLocaleDateString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
      });
}

function getLastMessagePreview(
      lastMessage: GroupListItem['lastMessage'],
): string {
      if (!lastMessage) return 'Chưa có tin nhắn nào';
      if (lastMessage.type !== 'TEXT') return '📎 Tệp đính kèm';
      return lastMessage.content ?? '';
}

export const GroupListItemCard = memo(function GroupListItemCard({
      group,
      onClick,
}: GroupListItemProps) {
      const preview = getLastMessagePreview(group.lastMessage);
      const timestamp = formatTimestamp(group.lastMessageAt);
      const hasUnread = (group.unreadCount ?? 0) > 0;

      const handleKeyDown = (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onClick?.(group.id);
            }
      };

      return (
            <div
                  role="button"
                  tabIndex={0}
                  aria-label={`Nhóm ${group.name ?? 'Nhóm không tên'}, ${group.memberCount} thành viên${hasUnread ? `, ${group.unreadCount} tin nhắn chưa đọc` : ''}`}
                  className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${hasUnread ? 'bg-blue-50/30' : ''}`}
                  onClick={() => onClick?.(group.id)}
                  onKeyDown={handleKeyDown}
            >
                  {/* Group Avatar */}
                  <Avatar
                        size={48}
                        src={group.avatarUrl}
                        icon={<TeamOutlined />}
                        className="flex-shrink-0"
                  />

                  {/* Name + Last message */}
                  <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                              <Text
                                    strong={hasUnread}
                                    className="block truncate text-sm max-w-[200px]"
                              >
                                    {group.name ?? 'Nhóm không tên'}
                              </Text>
                              {timestamp && (
                                    <Text
                                          type="secondary"
                                          className={`flex-shrink-0 text-xs ${hasUnread ? '!text-blue-600' : ''}`}
                                    >
                                          {timestamp}
                                    </Text>
                              )}
                        </div>

                        <div className="flex items-center justify-between mt-0.5">
                              <Text
                                    type="secondary"
                                    className="block truncate text-xs max-w-[220px]"
                              >
                                    {preview}
                              </Text>
                              {hasUnread ? (
                                    <Badge
                                          count={group.unreadCount}
                                          size="small"
                                          className="flex-shrink-0"
                                    />
                              ) : null}
                        </div>

                        {/* Member count */}
                        <Text type="secondary" className="text-xs">
                              <TeamOutlined className="mr-1" />
                              {group.memberCount} thành viên
                        </Text>
                  </div>
            </div>
      );
});
