/**
 * Client Layout Component
 */

import { Outlet } from 'react-router-dom';
import { Layout } from 'antd';
import { ClientSidebar } from './client-sidebar';
import { useFriendshipSocket } from '@/features/contacts/hooks/use-friendship-socket';
import { useContactSocket } from '@/features/contacts/hooks/use-contact-socket';
import { useGroupNotifications } from '@/features/conversation/hooks/use-group-notifications';
import { CallManager } from '@/features/call/components/CallManager';
import { IncomingCallOverlay } from '@/features/call/components/IncomingCallOverlay';
import { OutgoingCallOverlay } from '@/features/call/components/OutgoingCallOverlay';
import { ActiveCallFloating } from '@/features/call/components/ActiveCallFloating';
import { useNotificationPermission } from '@/features/notification';
import { useReminderNotifications } from '@/features/reminder';

const { Content } = Layout;

export function ClientLayout() {
      // Mount friendship socket listener at top-level so realtime
      // notifications work regardless of which page the user is on
      useFriendshipSocket();

      // Mount contact socket listener for realtime alias update invalidation
      useContactSocket();

      // Mount group notification listener at top-level so group
      // events (created, dissolved, removed) notify the user on any page
      useGroupNotifications();

      // Mount push notification handler — requests FCM permission + registers token
      useNotificationPermission();

      // Mount global reminder notification listener (singleton — all routes)
      useReminderNotifications();

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

                  {/* ── Call infrastructure (invisible hook host + overlays) ── */}
                  <CallManager />
                  <IncomingCallOverlay />
                  <OutgoingCallOverlay />
                  <ActiveCallFloating />
            </Layout>
      );
}