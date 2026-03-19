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
import { useTranslation } from 'react-i18next';

const { Sider } = Layout;

export function AdminSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const { t } = useTranslation();

  const currentPath = location.pathname;

  const menuItems = [
    {
      key: '/admin/dashboard',
      icon: <DashboardOutlined />,
      label: t('layout.admin.dashboard'),
      onClick: () => navigate('/admin/dashboard'),
    },
    {
      key: '/admin/users',
      icon: <UserOutlined />,
      label: t('layout.admin.users'),
      onClick: () => navigate('/admin/users'),
    },
    {
      key: '/admin/messages',
      icon: <MessageOutlined />,
      label: t('layout.admin.messages'),
      onClick: () => navigate('/admin/messages'),
    },
    {
      key: '/admin/calls',
      icon: <PhoneOutlined />,
      label: t('layout.admin.calls'),
      onClick: () => navigate('/admin/calls'),
    },
    {
      key: '/admin/activity',
      icon: <AlertOutlined />,
      label: t('layout.admin.activity'),
      onClick: () => navigate('/admin/activity'),
    },
    {
      key: '/admin/settings',
      icon: <SettingOutlined />,
      label: t('layout.admin.settings'),
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
