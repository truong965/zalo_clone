/**
 * useContactSocket — Realtime contact alias update handler
 *
 * Listens to `contact:aliasUpdated` socket events emitted by the backend
 * ContactNotificationListener when the owner changes an alias.
 *
 * Effect:
 *  - Invalidates contactKeys.check(contactUserId) → ChatHeader re-renders
 *  - Invalidates contactKeys.list()               → ContactList re-renders
 *  - Invalidates ['conversations']                → conversation names update
 *  - Invalidates ['messages']                     → sender resolvedDisplayName refreshes
 *
 * Mount this hook once in ClientLayout alongside useFriendshipSocket().
 */

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSocket } from '@/hooks/use-socket';
import { contactKeys } from './use-contact-check';

// Socket event names — must match backend SocketEvents constants
const CONTACT_SOCKET_EVENTS = {
      ALIAS_UPDATED: 'contact:aliasUpdated',
} as const;

interface AliasUpdatedPayload {
      contactUserId: string;
      resolvedDisplayName: string;
      aliasName: string | null;
}

export function useContactSocket() {
      const { socket, isConnected } = useSocket();
      const queryClient = useQueryClient();

      useEffect(() => {
            if (!socket || !isConnected) return;

            function handleAliasUpdated(payload: AliasUpdatedPayload) {
                  // Invalidate specific contact check cache → ChatHeader re-renders
                  void queryClient.invalidateQueries({
                        queryKey: contactKeys.check(payload.contactUserId),
                  });
                  // Invalidate contacts list → ContactList reflects new name
                  void queryClient.invalidateQueries({ queryKey: ['contacts', 'list'] });
                  // Invalidate conversation list → display names update
                  void queryClient.invalidateQueries({ queryKey: ['conversations'] });
                  // P1-D: Cross-invalidate friends list (resolvedDisplayName might change)
                  void queryClient.invalidateQueries({ queryKey: ['friendship', 'list'] });
                  // GAP-3: Invalidate loaded message pages → sender resolvedDisplayName refreshes
                  void queryClient.invalidateQueries({ queryKey: ['messages'] });
            }

            socket.on(CONTACT_SOCKET_EVENTS.ALIAS_UPDATED, handleAliasUpdated);
            return () => {
                  socket.off(CONTACT_SOCKET_EVENTS.ALIAS_UPDATED, handleAliasUpdated);
            };
      }, [socket, isConnected, queryClient]);
}
