/**
 * Client Sidebar Component
 */

import { Layout, Menu, Button, Input } from 'antd';
import {
  MessageOutlined,
  TeamOutlined,
  PhoneOutlined,
  SearchOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { useState } from 'react';

const { Sider } = Layout;

export function ClientSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchValue, setSearchValue] = useState('');
  const [collapsed, setCollapsed] = useState(false);

  const currentPath = location.pathname;

  const menuItems = [
    {
      key: '/chat',
      icon: <MessageOutlined />,
      label: 'Messages',
      onClick: () => navigate('/chat'),
    },
    {
      key: '/contacts',
      icon: <TeamOutlined />,
      label: 'Contacts',
      onClick: () => navigate('/contacts'),
    },
    {
      key: '/calls',
      icon: <PhoneOutlined />,
      label: 'Calls',
      onClick: () => navigate('/calls'),
    },
  ];

  return (
    <Sider
      collapsible
      collapsed={collapsed}
      onCollapse={setCollapsed}
      width={280}
      className="bg-white shadow-sm"
    >
      <div className="p-4 space-y-4">
        <Input
          placeholder="Search..."
          prefix={<SearchOutlined />}
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          className="w-full"
        />

        <Button
          type="primary"
          block
          icon={<PlusOutlined />}
          onClick={() => navigate('/chat/new')}
        >
          {!collapsed && 'New Chat'}
        </Button>
      </div>

      <Menu
        mode="inline"
        selectedKeys={[currentPath]}
        items={menuItems}
        className="border-0"
      />
    </Sider>
  );
}
