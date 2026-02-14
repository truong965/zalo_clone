/**
 * FriendCard — Reusable card component for friend/request items
 *
 * Uses composition pattern with `actions` slot instead of boolean props
 * (architecture-avoid-boolean-props). This allows FriendList and
 * FriendRequestList to pass different action buttons without the card
 * knowing about specific use cases.
 */

import { Avatar, Typography } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import type { ReactNode } from 'react';

const { Text } = Typography;

interface FriendCardUser {
      userId: string;
      displayName: string;
      avatarUrl?: string;
}

interface FriendCardProps {
      /** User info to display */
      user: FriendCardUser;
      /** Optional subtitle (e.g. "2 ngày trước", status text) */
      subtitle?: string;
      /** Action slot — buttons rendered on the right side */
      actions?: ReactNode;
      /** Optional click handler for the whole card */
      onClick?: () => void;
      /** Optional extra content below the card */
      extra?: ReactNode;
}

export function FriendCard({ user, subtitle, actions, onClick, extra }: FriendCardProps) {
      return (
            <div
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${onClick ? 'cursor-pointer hover:bg-gray-50' : ''
                        }`}
                  onClick={onClick}
            >
                  {/* Avatar */}
                  <Avatar
                        size={48}
                        src={user.avatarUrl}
                        icon={<UserOutlined />}
                        className="flex-shrink-0"
                  />

                  {/* Name + subtitle */}
                  <div className="flex-1 min-w-0">
                        <Text strong className="block truncate text-sm">
                              {user.displayName}
                        </Text>
                        {subtitle && (
                              <Text type="secondary" className="block truncate text-xs">
                                    {subtitle}
                              </Text>
                        )}
                        {extra}
                  </div>

                  {/* Actions slot */}
                  {actions && (
                        <div className="flex-shrink-0 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                              {actions}
                        </div>
                  )}
            </div>
      );
}
