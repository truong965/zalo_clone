import { Avatar, Typography, Badge, Dropdown, Button, type MenuProps } from 'antd';
import {
      PushpinOutlined, MoreOutlined, CheckCircleOutlined,
      DeleteOutlined, TagsOutlined
} from '@ant-design/icons';
import type { ChatConversation } from '../types';

const { Text } = Typography;

interface ConversationItemProps {
      data: ChatConversation;
      isSelected: boolean;
      onClick: () => void;
}

export function ConversationItem({ data, isSelected, onClick }: ConversationItemProps) {
      // Menu Context cho từng Item
      const menuItems: MenuProps['items'] = [
            {
                  key: 'pin',
                  label: data.isPinned ? 'Bỏ ghim hội thoại' : 'Ghim hội thoại',
                  icon: <PushpinOutlined />,
            },
            {
                  key: 'mark-unread',
                  label: 'Đánh dấu chưa đọc',
                  icon: <CheckCircleOutlined />,
            },
            {
                  key: 'classify',
                  label: 'Phân loại',
                  icon: <TagsOutlined />,
                  children: [
                        { key: 'work', label: 'Công việc' },
                        { key: 'family', label: 'Gia đình' },
                  ]
            },
            { type: 'divider' },
            {
                  key: 'delete',
                  label: <span className="text-red-500">Xóa hội thoại</span>,
                  icon: <DeleteOutlined className="text-red-500" />,
            },
      ];

      return (
            <div
                  className={`
        group relative cursor-pointer px-4 py-3 hover:bg-gray-100 transition-colors border-b-0
        ${isSelected ? 'bg-blue-50 hover:bg-blue-100' : ''}
      `}
                  onClick={onClick}
            >
                  <div className="flex w-full items-start gap-3">
                        {/* Avatar */}
                        <div className="relative">
                              <Avatar
                                    size={48}
                                    src={data.avatar || undefined}
                                    className={!data.avatar ? 'bg-blue-500' : ''}
                              >
                                    {data.name?.[0] ?? 'U'}
                              </Avatar>
                              {data.isOnline && (
                                    <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full" />
                              )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                              <div className="flex justify-between items-start">
                                    <Text strong className="truncate text-gray-800 text-[15px]">
                                          {data.name || 'Unknown'}
                                    </Text>
                                    <Text type="secondary" className="text-xs ml-2 mt-1 me-3">
                                          {data.timestamp}
                                    </Text>
                              </div>

                              <div className="flex justify-between items-center mt-0.5">
                                    <Text type="secondary" className="truncate text-sm pr-2 max-w-[180px]" ellipsis>
                                          {data.isPinned && <PushpinOutlined className="text-gray-400 mr-1 rotate-45" />}
                                          {data.lastMessage}
                                    </Text>
                                    {(data.unread ?? 0) > 0 && (
                                          <Badge count={data.unread} size="small" className="site-badge-count-4" />
                                    )}
                              </div>
                        </div>

                        {/* Context Menu Button (Hiện khi hover) */}
                        <div
                              className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover:block z-10"
                              onClick={(e) => e.stopPropagation()} // Chặn click lan ra item cha
                        >
                              <Dropdown
                                    menu={{ items: menuItems }}
                                    trigger={['click']}
                                    placement="bottomLeft"
                              >
                                    <Button
                                          icon={<MoreOutlined />}
                                          size="small"
                                          className="bg-white text-gray-500 shadow-sm hover:text-blue-600 border-gray-200"
                                    />
                              </Dropdown>
                        </div>
                  </div>
            </div>
      );
}