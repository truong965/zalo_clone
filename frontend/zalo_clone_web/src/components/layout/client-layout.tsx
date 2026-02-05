/**
 * Client Layout Component
 * Main layout cho user app (chat, contacts, etc)
 */

import { Outlet } from 'react-router-dom';
import { Layout } from 'antd';
import { ClientHeader } from './client-header';
import { ClientSidebar } from './client-sidebar';
import { ClientFooter } from './client-footer';

const { Content } = Layout;

export function ClientLayout() {
      return (
            <Layout className="h-screen flex flex-col">
                  <ClientHeader />
                  <Layout className="flex-1 flex overflow-hidden">
                        <ClientSidebar />
                        <Content className="flex-1 overflow-auto bg-white">
                              <Outlet />
                        </Content>
                  </Layout>
                  <ClientFooter />
            </Layout>
      );
}
