/**
 * Client Layout Component
 */

import { Outlet } from 'react-router-dom';
import { Layout } from 'antd';
import { ClientSidebar } from './client-sidebar';
import { useFriendshipSocket } from '@/features/contacts/hooks/use-friendship-socket';
import { useGroupNotifications } from '@/features/conversation/hooks/use-group-notifications';

const { Content } = Layout;

export function ClientLayout() {
      // Mount friendship socket listener at top-level so realtime
      // notifications work regardless of which page the user is on
      useFriendshipSocket();

      // Mount group notification listener at top-level so group
      // events (created, dissolved, removed) notify the user on any page
      useGroupNotifications();

      return (
            <Layout className="h-screen w-screen overflow-hidden bg-white">
                  {/* Sidebar cố định bên trái */}
                  <ClientSidebar />

                  {/* Phần nội dung chính */}
                  <Layout className="flex-1 bg-white h-full relative">
                        <Content className="h-full overflow-hidden flex flex-col bg-white">
                              {/* Outlet ở đây sẽ render các trang con (Chat, Contacts...).
                                Các trang này nên tự handle việc scroll của riêng nó.
                              */}
                              <Outlet />
                        </Content>
                  </Layout>
            </Layout>
      );
}