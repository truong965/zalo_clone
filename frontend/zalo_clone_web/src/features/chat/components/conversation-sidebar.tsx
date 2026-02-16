// conversation-sidebar.tsx
import { useState } from 'react';
import { Input, Button, Dropdown, Spin, type MenuProps } from 'antd';
import {
      SearchOutlined, UserAddOutlined, UsergroupAddOutlined,
      MoreOutlined, CheckCircleOutlined, DownOutlined
} from '@ant-design/icons';
import { ConversationItem } from './conversation-item';
import type { ChatConversation, ConversationFilterTab } from '../types';

interface ConversationSidebarProps {
      conversations: ChatConversation[];
      selectedId: string | null;
      onSelect: (id: string) => void;
      loadMoreRef: (node?: Element | null) => void; // ✅ NEW
      hasMore?: boolean;
      isLoading?: boolean;
      /** Open global search panel (Option A) */
      onSearchClick?: () => void;
      /** Open friendship search modal */
      onFriendSearchClick?: () => void;
      /** Open create group modal */
      onCreateGroupClick?: () => void;
}

export function ConversationSidebar({
      conversations,
      selectedId,
      onSelect,
      loadMoreRef, // ✅ NEW
      hasMore = false,
      isLoading = false,
      onSearchClick,
      onFriendSearchClick,
      onCreateGroupClick,
}: ConversationSidebarProps) {
      const [activeTab, setActiveTab] = useState<ConversationFilterTab>('all');

      const filteredConversations = conversations.filter(c => {
            const unreadCount = c.unreadCount ?? c.unread ?? 0;
            if (activeTab === 'unread') return unreadCount > 0;
            return true;
      });

      const globalMenuItems: MenuProps['items'] = [
            {
                  key: 'mark-all-read',
                  label: 'Đánh dấu đã đọc tất cả',
                  icon: <CheckCircleOutlined />,
            },
      ];

      return (
            <div className="w-[340px] h-full flex flex-col border-r border-gray-200 bg-white overflow-hidden">

                  {/* Header Search */}
                  <div className="flex-none px-4 py-3 flex items-center gap-2 border-b border-gray-100">
                        <Input
                              prefix={<SearchOutlined className="text-gray-400" />}
                              placeholder="Tìm kiếm"
                              className="bg-gray-100 border-none rounded-lg"
                              readOnly={!!onSearchClick}
                              onClick={onSearchClick}
                              onFocus={(e) => {
                                    if (onSearchClick) {
                                          e.target.blur();
                                          onSearchClick();
                                    }
                              }}
                        />
                        <Button
                              type="text"
                              icon={<UserAddOutlined />}
                              className="text-gray-500"
                              onClick={onFriendSearchClick}
                        />
                        <Button type="text" icon={<UsergroupAddOutlined />} className="text-gray-500" onClick={onCreateGroupClick} />
                  </div>

                  {/* Filter Bar */}
                  <div className="flex-none px-4 pb-2 pt-2 flex justify-between items-center text-sm border-b border-gray-100">
                        <div className="flex gap-4 font-medium">
                              <span
                                    className={`cursor-pointer transition-colors pb-1 ${activeTab === 'all'
                                          ? 'text-blue-600 border-b-2 border-blue-600'
                                          : 'text-gray-500 hover:text-blue-600'
                                          }`}
                                    onClick={() => setActiveTab('all')}
                              >
                                    Tất cả
                              </span>
                              <span
                                    className={`cursor-pointer transition-colors pb-1 ${activeTab === 'unread'
                                          ? 'text-blue-600 border-b-2 border-blue-600'
                                          : 'text-gray-500 hover:text-blue-600'
                                          }`}
                                    onClick={() => setActiveTab('unread')}
                              >
                                    Chưa đọc
                              </span>
                        </div>
                        <div className="flex items-center gap-1 text-gray-500">
                              <Dropdown menu={{ items: globalMenuItems }} placement="bottomLeft" trigger={['click']}>
                                    <div className="flex items-center gap-1 cursor-pointer hover:text-blue-600">
                                          <span className="text-xs">Phân loại</span>
                                          <DownOutlined className="text-[10px]" />
                                    </div>
                              </Dropdown>
                              <Dropdown menu={{ items: globalMenuItems }} placement="bottomLeft" trigger={['click']}>
                                    <Button
                                          type="text"
                                          size="small"
                                          icon={<MoreOutlined className="rotate-90" />}
                                          className="text-gray-500"
                                    />
                              </Dropdown>
                        </div>
                  </div>

                  {/* Conversations List - SCROLLABLE */}
                  <div className="flex-1 overflow-y-auto">
                        {filteredConversations.length > 0 ? (
                              <>
                                    {filteredConversations.map(item => (
                                          <ConversationItem
                                                key={item.id}
                                                data={item}
                                                isSelected={selectedId === item.id}
                                                onClick={() => onSelect(item.id)}
                                          />
                                    ))}

                                    {/* ✅ Load More Trigger (Bottom) */}
                                    {hasMore && (
                                          <div ref={loadMoreRef} className="py-3 flex justify-center">
                                                {isLoading ? (
                                                      <Spin size="small" />
                                                ) : (
                                                      <div className="h-1" />
                                                )}
                                          </div>
                                    )}
                              </>
                        ) : (
                              <div className="flex items-center justify-center py-8 text-gray-400">
                                    Không có cuộc trò chuyện
                              </div>
                        )}
                  </div>
            </div>
      );
}