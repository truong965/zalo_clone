/**
 * Admin Header Component
 */

import { Layout, Space, Button, Dropdown, Avatar } from 'antd';
import {
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
                  {/* Cập nhật 1: Ép flex center và triệt tiêu line-height thừa */}
                  <div
                        className="text-2xl font-bold text-white cursor-pointer flex items-center leading-none"
                        onClick={() => navigate(ROUTES.ADMIN)}
                  >
                        Admin Dashboard
                  </div>

                  <Space className="text-white">
                        <Dropdown menu={{ items: userMenuItems }} trigger={['click']}>
                              {/* Cập nhật 2: Ép Button của Antd hoạt động như một flex container */}
                              <Button type="text" className="flex items-center !h-auto py-1 px-2 hover:bg-white/10">
                                    <Avatar
                                          icon={<UserOutlined />}
                                          src={user?.avatarUrl}
                                          style={{ backgroundColor: '#f56a00' }}
                                          size="small" // Đồng bộ kích thước chuẩn
                                    />
                                    {/* Cập nhật 3: Căn chỉnh baseline của display name */}
                                    <span className="ml-2 text-white leading-none font-medium">
                                          {user?.displayName}
                                    </span>
                              </Button>
                        </Dropdown>
                  </Space>
            </Header>
      );
}