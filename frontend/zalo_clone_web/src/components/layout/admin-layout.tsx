/**
 * Admin Layout Component
 */

import { Outlet } from 'react-router-dom';
import { Layout } from 'antd';
import { AdminHeader } from './admin-header';
import { AdminSidebar } from './admin-sidebar';

const { Content } = Layout;

export function AdminLayout() {
      return (
            <Layout className="h-screen flex flex-col">
                  <AdminHeader />
                  <Layout className="flex-1 flex overflow-hidden">
                        <AdminSidebar />
                        <Content className="flex-1 overflow-auto bg-gray-50">
                              <div className="p-6">
                                    <Outlet />
                              </div>
                        </Content>
                  </Layout>
            </Layout>
      );
}
