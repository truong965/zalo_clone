/**
 * usePushNotificationNavigation — Handle navigation from push notification clicks.
 *
 * Listens for Service Worker postMessage events (sent when user clicks a push notification)
 * and navigates to the appropriate route.
 *
 * Supported message types:
 * - NAVIGATE_TO_CONVERSATION → navigate to /chat/:conversationId
 * - NAVIGATE_TO_CONTACTS    → navigate to /contacts (with optional tab param)
 *
 * Usage: Mount once at root level (ClientLayout).
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/** Map of SW message types to navigation handlers */
const NAVIGATION_HANDLERS: Record<string, (data: Record<string, string>, navigate: ReturnType<typeof useNavigate>) => void> = {
      NAVIGATE_TO_CONVERSATION: (data, navigate) => {
            if (data.conversationId) {
                  navigate(`/chat/${data.conversationId}`);
            }
      },
      NAVIGATE_TO_CONTACTS: (data, navigate) => {
            const path = data.tab ? `/contacts?tab=${data.tab}` : '/contacts';
            navigate(path);
      },
};

export function usePushNotificationNavigation(): void {
      const navigate = useNavigate();

      useEffect(() => {
            if (!('serviceWorker' in navigator)) return;

            const handler = (event: MessageEvent) => {
                  const data = event.data;
                  if (!data?.type) return;

                  const handle = NAVIGATION_HANDLERS[data.type];
                  if (handle) {
                        handle(data, navigate);
                  }
            };

            navigator.serviceWorker.addEventListener('message', handler);
            return () => {
                  navigator.serviceWorker.removeEventListener('message', handler);
            };
      }, [navigate]);
}
