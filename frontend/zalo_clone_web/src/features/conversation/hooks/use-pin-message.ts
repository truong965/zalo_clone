/**
 * usePinMessage — Query + mutations for pinning/unpinning messages in a conversation.
 *
 * Provides:
 * - `pinnedMessages` query (GET /conversations/:id/pinned-messages)
 * - `pinMessage` / `unpinMessage` mutations with cache invalidation
 * - Socket listener for real-time pin/unpin events from other members
 */

import { useCallback, useEffect } from 'react';
import {
      useQuery,
      useMutation,
      useQueryClient,
} from '@tanstack/react-query';
import { conversationApi } from '../api/conversation.api';
import { useSocket } from '@/hooks/use-socket';
import { SocketEvents } from '@/constants/socket-events';

// ── Query Key ────────────────────────────────────────────────────────────

export const pinnedMessagesKey = (conversationId: string | null) =>
      ['conversations', 'pinned-messages', conversationId] as const;

// ── Hook ─────────────────────────────────────────────────────────────────

export function usePinMessage(conversationId: string | null) {
      const queryClient = useQueryClient();
      const { socket } = useSocket();

      // ── Query: pinned messages ───────────────────────────────────────────
      const query = useQuery({
            queryKey: pinnedMessagesKey(conversationId),
            queryFn: () => conversationApi.getPinnedMessages(conversationId!),
            enabled: !!conversationId,
            staleTime: 60_000,
      });

      // ── Mutation: pin ────────────────────────────────────────────────────
      const pinMutation = useMutation({
            mutationFn: (messageId: string) =>
                  conversationApi.pinMessage(conversationId!, messageId),
            onSuccess: () => {
                  void queryClient.invalidateQueries({
                        queryKey: pinnedMessagesKey(conversationId),
                  });
            },
      });

      // ── Mutation: unpin ──────────────────────────────────────────────────
      const unpinMutation = useMutation({
            mutationFn: (messageId: string) =>
                  conversationApi.unpinMessage(conversationId!, messageId),
            onSuccess: () => {
                  void queryClient.invalidateQueries({
                        queryKey: pinnedMessagesKey(conversationId),
                  });
            },
      });

      // ── Socket: real-time updates from other members ─────────────────────
      useEffect(() => {
            if (!socket || !conversationId) return;

            const handlePinned = (data: { conversationId: string }) => {
                  if (data.conversationId === conversationId) {
                        void queryClient.invalidateQueries({
                              queryKey: pinnedMessagesKey(conversationId),
                        });
                  }
            };

            const handleUnpinned = (data: { conversationId: string }) => {
                  if (data.conversationId === conversationId) {
                        void queryClient.invalidateQueries({
                              queryKey: pinnedMessagesKey(conversationId),
                        });
                  }
            };

            socket.on(SocketEvents.CONVERSATION_MESSAGE_PINNED, handlePinned);
            socket.on(SocketEvents.CONVERSATION_MESSAGE_UNPINNED, handleUnpinned);

            return () => {
                  socket.off(SocketEvents.CONVERSATION_MESSAGE_PINNED, handlePinned);
                  socket.off(SocketEvents.CONVERSATION_MESSAGE_UNPINNED, handleUnpinned);
            };
      }, [socket, conversationId, queryClient]);

      // ── Stable callbacks ─────────────────────────────────────────────────
      const pinMessage = useCallback(
            (messageId: string) => pinMutation.mutate(messageId),
            [pinMutation],
      );

      const unpinMessage = useCallback(
            (messageId: string) => unpinMutation.mutate(messageId),
            [unpinMutation],
      );

      return {
            pinnedMessages: query.data ?? [],
            isLoading: query.isLoading,
            pinMessage,
            unpinMessage,
            isPinning: pinMutation.isPending,
            isUnpinning: unpinMutation.isPending,
      };
}
