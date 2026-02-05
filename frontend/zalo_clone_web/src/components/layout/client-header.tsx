/**
 * Client Header Component
 */

import { Layout, Avatar, Badge, Dropdown, Button, Space } from 'antd';
import {
  BellOutlined,
  UserOutlined,
  LogoutOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useAuth } from '@/hooks';
import { useNavigate } from 'react-router-dom';

const { Header } = Layout;

export function ClientHeader() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const userMenuItems = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: 'Profile',
      onClick: () => navigate('/profile'),
    },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: 'Settings',
      onClick: () => navigate('/settings'),
    },
    {
      type: 'divider',
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Logout',
      onClick: handleLogout,
      danger: true,
    },
  ];

  return (
    <Header className="bg-white shadow-sm flex items-center justify-between px-6">
      <div className="text-2xl font-bold text-blue-600 cursor-pointer" onClick={() => navigate('/')}>
        💬 Zalo Clone
      </div>

      <Space>
        <Badge count={3}>
          <Button
            type="text"
            icon={<BellOutlined className="text-lg" />}
            onClick={() => navigate('/notifications')}
          />
        </Badge>

        <Dropdown menu={{ items: userMenuItems as Record<string, any>[] }} trigger={['click']}>
          <Button type="text">
            <Avatar
              icon={<UserOutlined />}
              src={user?.avatar}
              alt={user?.firstName}
            />
            <span className="ml-2">{user?.firstName}</span>
          </Button>
        </Dropdown>
      </Space>
    </Header>
  );
}
