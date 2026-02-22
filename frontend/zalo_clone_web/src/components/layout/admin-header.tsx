/**
 * Admin Header Component
 */

import { Layout, Space, Button, Dropdown, Avatar, Badge } from 'antd';
import {
      BellOutlined,
      UserOutlined,
      LogoutOutlined,
      SettingOutlined,
} from '@ant-design/icons';
import { useAuth } from '@/hooks';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '@/config/routes';

const { Header } = Layout;

export function AdminHeader() {
      const { user, logout } = useAuth();
      const navigate = useNavigate();

      const handleLogout = () => {
            logout();
            navigate(ROUTES.LOGIN);
      };

      const userMenuItems = [
            {
                  key: 'settings',
                  icon: <SettingOutlined />,
                  label: 'Admin Settings',
                  onClick: () => navigate(ROUTES.ADMIN_SETTINGS),
            },

            {
                  type: 'divider' as const,
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
            <Header className="bg-gradient-to-r from-blue-600 to-blue-800 shadow-md flex items-center justify-between px-6">
                  <div className="text-2xl font-bold text-white cursor-pointer" onClick={() => navigate(ROUTES.ADMIN)}>
                        ⚙️ Admin Dashboard
                  </div>

                  <Space className="text-white">
                        <Badge count={5}>
                              <Button
                                    type="text"
                                    icon={<BellOutlined className="text-lg text-white" />}
                              />
                        </Badge>

                        <Dropdown menu={{ items: userMenuItems }} trigger={['click']}>
                              <Button type="text">
                                    <Avatar
                                          icon={<UserOutlined />}
                                          src={user?.avatarUrl}
                                          style={{ backgroundColor: '#f56a00' }}
                                    />
                                    <span className="ml-2 text-white">{user?.displayName}</span>
                              </Button>
                        </Dropdown>
                  </Space>
            </Header>
      );
}
