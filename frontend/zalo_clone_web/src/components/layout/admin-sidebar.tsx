/**
 * Admin Sidebar Component
 */

import { Layout, Menu } from 'antd';
import {
  DashboardOutlined,
  UserOutlined,
  MessageOutlined,
  PhoneOutlined,
  AlertOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { useState } from 'react';

const { Sider } = Layout;

export function AdminSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const currentPath = location.pathname;

  const menuItems = [
    {
      key: '/admin/dashboard',
      icon: <DashboardOutlined />,
      label: 'Dashboard',
      onClick: () => navigate('/admin/dashboard'),
    },
    {
      key: '/admin/users',
      icon: <UserOutlined />,
      label: 'Users',
      onClick: () => navigate('/admin/users'),
    },
    {
      key: '/admin/messages',
      icon: <MessageOutlined />,
      label: 'Messages',
      onClick: () => navigate('/admin/messages'),
    },
    {
      key: '/admin/calls',
      icon: <PhoneOutlined />,
      label: 'Calls',
      onClick: () => navigate('/admin/calls'),
    },
    {
      key: '/admin/activity',
      icon: <AlertOutlined />,
      label: 'Activity',
      onClick: () => navigate('/admin/activity'),
    },
    {
      key: '/admin/settings',
      icon: <SettingOutlined />,
      label: 'Settings',
      onClick: () => navigate('/admin/settings'),
    },
  ];

  return (
    <Sider
      collapsible
      collapsed={collapsed}
      onCollapse={setCollapsed}
      width={220}
      className="bg-white shadow-sm"
      theme="light"
    >
      <Menu
        mode="inline"
        selectedKeys={[currentPath]}
        items={menuItems}
        className="border-0"
      />
    </Sider>
  );
}
