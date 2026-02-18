/**
 * Contacts Page
 *
 * Tabs: Bạn bè | Lời mời kết bạn | Nhóm | Chặn (placeholder)
 * Uses FriendList and FriendRequestList from contacts feature module.
 * Uses GroupList from conversation feature module.
 * Block tab shows basic placeholder UI (no logic implemented).
 */

import { Badge, Typography } from 'antd';
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
import { GroupList } from '@/features/conversation/components/group-list';
import { BlockedList } from '@/features/contacts/components/blocked-list';
import { ErrorBoundary } from '@/components/shared/error-boundary';

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
        <nav className="flex-1 py-2" role="tablist" aria-label="Danh bạ">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={activeTab === tab.key}
              aria-controls={`tabpanel-${tab.key}`}
              id={`tab-${tab.key}`}
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
      <div
        className="flex-1 h-full overflow-hidden"
        role="tabpanel"
        id={`tabpanel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
      >
        {activeTab === 'friends' && <FriendList />}
        {activeTab === 'requests' && <FriendRequestList />}
        {activeTab === 'groups' && (
          <ErrorBoundary>
            <GroupList />
          </ErrorBoundary>
        )}
        {activeTab === 'blocked' && (
          <ErrorBoundary>
            <BlockedList />
          </ErrorBoundary>
        )}
      </div>
    </div>
  );
}

