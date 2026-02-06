/**
 * Client Layout Component
 */

import { Outlet } from 'react-router-dom';
import { Layout } from 'antd';
import { ClientSidebar } from './client-sidebar';

const { Content } = Layout;

export function ClientLayout() {
      return (
            <Layout className="h-screen w-screen overflow-hidden bg-white">
                  {/* Sidebar cố định bên trái */}
                  <ClientSidebar />

                  {/* Phần nội dung chính */}
                  <Layout className="flex-1 bg-white h-full relative">
                        <Content className="h-full overflow-hidden flex flex-col">
                              {/* Outlet ở đây sẽ render các trang con (Chat, Contacts...).
                                Các trang này nên tự handle việc scroll của riêng nó.
                              */}
                              <Outlet />
                        </Content>
                  </Layout>
            </Layout>
      );
}