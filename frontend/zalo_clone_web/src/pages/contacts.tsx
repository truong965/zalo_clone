/**
 * Contacts Page
 *
 * Tabs: Bạn bè | Lời mời kết bạn | Nhóm (placeholder) | Chặn (placeholder)
 * Uses FriendList and FriendRequestList from contacts feature module.
 * Group and Block tabs show basic placeholder UI (no logic implemented).
 */

import { Badge, Empty, Typography } from 'antd';
import {
  TeamOutlined,
  UserAddOutlined,
  UsergroupAddOutlined,
  StopOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useState } from 'react';
import { FriendList } from '@/features/contacts/components/friend-list';
import { FriendRequestList } from '@/features/contacts/components/friend-request-list';
import { useFriendshipStore } from '@/features/contacts/stores/friendship.store';

const { Text } = Typography;

type ContactTab = 'friends' | 'requests' | 'groups' | 'blocked';

interface TabConfig {
  key: ContactTab;
  label: string;
  icon: React.ReactNode;
  badge?: number;
}

export function ContactsPage() {
  const [activeTab, setActiveTab] = useState<ContactTab>('friends');
  const pendingReceivedCount = useFriendshipStore((s) => s.pendingReceivedCount);

  const tabs: TabConfig[] = [
    {
      key: 'friends',
      label: 'Bạn bè',
      icon: <TeamOutlined />,
    },
    {
      key: 'requests',
      label: 'Lời mời kết bạn',
      icon: <UserAddOutlined />,
      badge: pendingReceivedCount,
    },
    {
      key: 'groups',
      label: 'Nhóm',
      icon: <UsergroupAddOutlined />,
    },
    {
      key: 'blocked',
      label: 'Chặn',
      icon: <StopOutlined />,
    },
  ];

  return (
    <div className="h-full flex">
      {/* Left sidebar — tab navigation */}
      <div className="w-[280px] border-r border-gray-200 flex flex-col h-full bg-white">
        {/* Header */}
        <div className="px-4 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <UserOutlined className="text-lg text-blue-600" />
            <Text strong className="text-base">Danh bạ</Text>
          </div>
        </div>

        {/* Tab list */}
        <nav className="flex-1 py-2">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${activeTab === tab.key
                  ? 'bg-blue-50 text-blue-600 border-r-2 border-blue-600'
                  : 'text-gray-700 hover:bg-gray-50'
                }`}
            >
              <span className="text-lg">{tab.icon}</span>
              <span className="flex-1 text-sm font-medium">{tab.label}</span>
              {tab.badge !== undefined && tab.badge > 0 && (
                <Badge count={tab.badge} size="small" />
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Right content — active tab content */}
      <div className="flex-1 h-full overflow-hidden">
        {activeTab === 'friends' && <FriendList />}
        {activeTab === 'requests' && <FriendRequestList />}
        {activeTab === 'groups' && <GroupsPlaceholder />}
        {activeTab === 'blocked' && <BlockedPlaceholder />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Placeholder tabs — basic UI only, no logic
// ---------------------------------------------------------------------------

function GroupsPlaceholder() {
  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-gray-100">
        <Text className="text-sm text-gray-500">Nhóm</Text>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <Empty
          image={<UsergroupAddOutlined className="text-5xl text-gray-300" />}
          description={
            <div className="space-y-1">
              <Text type="secondary">Tính năng nhóm đang được phát triển</Text>
              <br />
              <Text type="secondary" className="text-xs">
                Bạn sẽ sớm có thể tạo và quản lý nhóm chat tại đây.
              </Text>
            </div>
          }
        />
      </div>
    </div>
  );
}

function BlockedPlaceholder() {
  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-gray-100">
        <Text className="text-sm text-gray-500">Người dùng bị chặn</Text>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <Empty
          image={<StopOutlined className="text-5xl text-gray-300" />}
          description={
            <div className="space-y-1">
              <Text type="secondary">Tính năng chặn đang được phát triển</Text>
              <br />
              <Text type="secondary" className="text-xs">
                Bạn sẽ sớm có thể quản lý danh sách chặn tại đây.
              </Text>
            </div>
          }
        />
      </div>
    </div>
  );
}
