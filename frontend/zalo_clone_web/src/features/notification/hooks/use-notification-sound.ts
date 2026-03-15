import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { notificationSoundManager } from '../services/notification-sound-manager';

interface ServiceWorkerPushBridgeMessage {
      type: 'PUSH_EVENT_RECEIVED';
      notificationType?:
      | 'INCOMING_CALL'
      | 'MISSED_CALL'
      | 'NEW_MESSAGE'
      | 'FRIEND_REQUEST'
      | 'FRIEND_ACCEPTED'
      | 'GROUP_EVENT'
      | 'GENERIC';
      data?: Record<string, string>;
      receivedAt?: number;
}

function getActiveConversationId(pathname: string): string | null {
      const match = pathname.match(/^\/chat\/([^/?#]+)/);
      return match?.[1] ?? null;
}

export function useNotificationSound(): void {
      const location = useLocation();
      const pathnameRef = useRef(location.pathname);
      pathnameRef.current = location.pathname;

      useEffect(() => {
            if (!('serviceWorker' in navigator)) return;

            const handleSwMessage = (event: MessageEvent<ServiceWorkerPushBridgeMessage>) => {
                  const payload = event.data;
                  if (!payload || payload.type !== 'PUSH_EVENT_RECEIVED') return;

                  const activeConversationId = getActiveConversationId(pathnameRef.current);

                  notificationSoundManager.handlePushEvent({
                        notificationType: payload.notificationType ?? 'GENERIC',
                        data: payload.data ?? {},
                        activeConversationId,
                        documentVisibility: document.visibilityState,
                        hasFocus: document.hasFocus(),
                  });
            };

            const stopRingtone = () => notificationSoundManager.stopIncomingCallRingtone();

            navigator.serviceWorker.addEventListener('message', handleSwMessage);
            window.addEventListener('call:accept-incoming', stopRingtone);
            window.addEventListener('call:reject-incoming', stopRingtone);
            window.addEventListener('call:hangup', stopRingtone);

            return () => {
                  navigator.serviceWorker.removeEventListener('message', handleSwMessage);
                  window.removeEventListener('call:accept-incoming', stopRingtone);
                  window.removeEventListener('call:reject-incoming', stopRingtone);
                  window.removeEventListener('call:hangup', stopRingtone);
            };
      // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
}
