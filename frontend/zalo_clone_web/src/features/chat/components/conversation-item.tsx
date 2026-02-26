import { Avatar, Typography, Badge, Dropdown, Button, type MenuProps } from 'antd';
import {
      PushpinOutlined, MoreOutlined,
      DeleteOutlined, TeamOutlined
} from '@ant-design/icons';
import type { ConversationUI } from '../types';
import { MessageType } from '@/types/api';

const { Text } = Typography;

interface ConversationItemProps {
      data: ConversationUI;
      isSelected: boolean;
      onClick: () => void;
      onTogglePin?: (conversationId: string, isPinned: boolean) => void;
}

function getLastMessagePreview(data: ConversationUI): string {
      const msg = data.lastMessageObj;
      // Nếu lastMessageObj null thì fallback về string cũ (nếu có)
      if (!msg) return data.lastMessage || '';

      if (msg.type !== MessageType.TEXT) {
            if (msg.type === MessageType.IMAGE) return '[Hình ảnh]';
            if (msg.type === MessageType.VIDEO) return '[Video]';
            if (msg.type === MessageType.FILE) return '[Tệp]';
            if (msg.type === MessageType.STICKER) return '[Sticker]';
            if (msg.type === MessageType.AUDIO || msg.type === MessageType.VOICE) return '[Ghi âm]';
            return '[Tin nhắn]';
      }

      return msg.content ?? '';
}

export function ConversationItem({ data, isSelected, onClick, onTogglePin }: ConversationItemProps) {
      const preview = getLastMessagePreview(data);
      const unreadCount = data.unreadCount ?? data.unread ?? 0;
      const isUnread = unreadCount > 0;

      // Logic màu nền: 
      // 1. Nếu đang chọn -> Màu đậm hơn (blue-100)
      // 2. Nếu chưa đọc & không chọn -> Màu xanh nhạt (blue-50)
      // 3. Mặc định -> Trắng (hover xám)
      let bgClass = 'hover:bg-gray-100 bg-white';
      if (isSelected) {
            bgClass = 'bg-blue-100 hover:bg-blue-200';
      } else if (isUnread) {
            bgClass = 'bg-blue-50 hover:bg-blue-100';
      }

      // Menu Context
      const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
            if (key === 'pin') {
                  onTogglePin?.(data.id, !!data.isPinned);
            }
      };

      const menuItems: MenuProps['items'] = [
            {
                  key: 'pin',
                  label: data.isPinned ? 'Bỏ ghim hội thoại' : 'Ghim hội thoại',
                  icon: <PushpinOutlined />,
            },
            // {
            //       key: 'mark-unread',
            //       label: 'Đánh dấu chưa đọc',
            //       icon: <CheckCircleOutlined />,
            // },
            // {
            //       key: 'classify',
            //       label: 'Phân loại',
            //       icon: <TagsOutlined />,
            //       children: [
            //             { key: 'work', label: 'Công việc' },
            //             { key: 'family', label: 'Gia đình' },
            //       ]
            // },
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
        group relative cursor-pointer px-4 py-3 transition-colors border-b border-gray-50
        ${bgClass}
        ${data.isBlocked ? 'opacity-60' : ''}
      `}
                  onClick={onClick}
            >
                  <div className="flex w-full items-center gap-3">

                        {/* Avatar Area */}
                        <div className="relative flex-shrink-0">
                              <Avatar
                                    size={48}
                                    src={data.avatar || undefined}
                                    className={!data.avatar ? (data.type === 'GROUP' ? 'bg-orange-400' : 'bg-blue-500') : ''}
                                    icon={!data.avatar && data.type === 'GROUP' ? <TeamOutlined /> : undefined}
                              >
                                    {data.name?.[0]?.toUpperCase() ?? 'U'}
                              </Avatar>

                              {/* Online Indicator (Chỉ hiện cho Direct) */}
                              {data.type === 'DIRECT' && data.isOnline && (
                                    <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 border-2 border-white rounded-full" />
                              )}
                        </div>

                        {/* Content Area - Flex Column */}
                        {/* min-w-0 là trick quan trọng của Flexbox để text truncate hoạt động đúng */}
                        <div className="flex-1 min-w-0 flex flex-col justify-center">

                              {/* Row 1: Name + Timestamp */}
                              <div className="flex justify-between items-baseline mb-0.5">
                                    <Text
                                          strong={isUnread}
                                          className={`truncate text-[15px] mr-2 ${isUnread ? 'text-gray-900' : 'text-gray-800'}`}
                                    >
                                          {data.name || 'Người dùng ẩn danh'}
                                    </Text>

                                    {/* Timestamp: Luôn nằm cùng dòng, không xuống dòng */}
                                    <Text className={`text-xs whitespace-nowrap flex-shrink-0 ${isUnread ? 'font-medium text-blue-600' : 'text-gray-400'}`}>
                                          {data.timestamp}
                                    </Text>
                              </div>

                              {/* Row 2: Message Preview + Badge */}
                              <div className="flex justify-between items-center">
                                    <Text
                                          className={`truncate text-sm pr-2 flex-1 ${isUnread ? 'font-semibold text-gray-800' : 'text-gray-500'}`}
                                          ellipsis
                                    >
                                          {data.isPinned && <PushpinOutlined className="text-gray-400 mr-1 rotate-45" />}
                                          {/* Thêm prefix Bạn: nếu cần thiết trong hàm getPreview hoặc ở đây */}
                                          {preview}
                                    </Text>

                                    {/* Unread Badge: Luôn nằm sát phải */}
                                    {unreadCount > 0 && (
                                          <Badge count={unreadCount} size="small" className="site-badge-count-4 ml-2 flex-shrink-0" />
                                    )}
                              </div>
                        </div>

                        {/* Context Menu Button (Hiện khi hover) */}
                        <div
                              className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover:block z-10"
                              onClick={(e) => e.stopPropagation()}
                        >
                              <Dropdown menu={{ items: menuItems, onClick: handleMenuClick }} trigger={['click']} placement="bottomLeft">
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