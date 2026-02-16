/**
 * GroupMemberItem — Individual member row in the members list.
 *
 * Shows avatar, name, role badge, and action dropdown for admin.
 */
import { Avatar, Dropdown, Tag } from 'antd';
import {
      CrownOutlined,
      MoreOutlined,
      DeleteOutlined,
      SwapOutlined,
} from '@ant-design/icons';
import type { ConversationMemberInfo } from '@/features/conversation/api/conversation.api';
import type { MenuProps } from 'antd';

interface GroupMemberItemProps {
      member: ConversationMemberInfo;
      isCurrentUser: boolean;
      viewerIsAdmin: boolean;
      onRemove: (userId: string) => void;
      onTransferAdmin: (userId: string) => void;
}

export function GroupMemberItem({
      member,
      isCurrentUser,
      viewerIsAdmin,
      onRemove,
      onTransferAdmin,
}: GroupMemberItemProps) {
      const isAdmin = member.role === 'ADMIN';

      // Admin can act on non-admin members (not self)
      const showActions = viewerIsAdmin && !isCurrentUser && !isAdmin;

      const menuItems: MenuProps['items'] = [
            {
                  key: 'transfer',
                  label: 'Chuyển quyền trưởng nhóm',
                  icon: <SwapOutlined />,
                  onClick: () => onTransferAdmin(member.id),
            },
            { type: 'divider' },
            {
                  key: 'remove',
                  label: 'Xóa khỏi nhóm',
                  icon: <DeleteOutlined />,
                  danger: true,
                  onClick: () => onRemove(member.id),
            },
      ];

      return (
            <div className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50 rounded transition-colors">
                  <Avatar
                        size={36}
                        src={member.avatarUrl}
                        className="flex-none"
                  >
                        {member.displayName?.charAt(0)}
                  </Avatar>
                  <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                              <span className="text-sm font-medium truncate">
                                    {member.displayName}
                                    {isCurrentUser && (
                                          <span className="text-gray-400 font-normal ml-1">(Bạn)</span>
                                    )}
                              </span>
                              {isAdmin && (
                                    <Tag
                                          color="gold"
                                          className="flex items-center gap-1 text-xs leading-none px-1.5 py-0"
                                    >
                                          <CrownOutlined className="text-[10px]" />
                                          Trưởng nhóm
                                    </Tag>
                              )}
                        </div>
                  </div>
                  {showActions && (
                        <Dropdown menu={{ items: menuItems }} trigger={['click']} placement="bottomRight">
                              <button className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-200 transition-colors">
                                    <MoreOutlined className="text-gray-500" />
                              </button>
                        </Dropdown>
                  )}
            </div>
      );
}
