/**
 * useReminders — TanStack Query hook for reminder CRUD + cache invalidation.
 *
 * Provides:
 * - Query: active reminders list
 *   - If conversationId is provided → fetches ALL members' reminders for that conversation
 *   - Otherwise → fetches the current user's own reminders
 * - Mutations: create, update (reschedule/complete), delete
 * - Socket: listens for `reminder:updated` (cache invalidation only)
 *
 * Note: `REMINDER_TRIGGERED` is handled by `useReminderNotifications` (singleton).
 */

import { useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { reminderApi } from '../api/reminder.api';
import { useSocket } from '@/hooks/use-socket';
import { SocketEvents } from '@/constants/socket-events';
import type { CreateReminderParams, UpdateReminderParams } from '@/types/api';

export const REMINDERS_BASE_KEY = ['reminders'] as const;

/**
 * @param conversationId - When provided, fetches all reminders for the conversation
 *   (visible to all members, not just the creator). Used in the info sidebar.
 */
export function useReminders(conversationId?: string | null) {
      const queryClient = useQueryClient();
      const { socket } = useSocket();

      // Scoped key: ['reminders'] for personal, ['reminders', id] for conversation
      const queryKey = conversationId
            ? ([...REMINDERS_BASE_KEY, conversationId] as const)
            : REMINDERS_BASE_KEY;

      // ── Query ────────────────────────────────────────────────────────────
      const {
            data: reminders,
            isLoading,
      } = useQuery({
            queryKey,
            queryFn: () =>
                  conversationId
                        ? reminderApi.getConversationReminders(conversationId)
                        : reminderApi.getReminders(false),
            staleTime: 60_000,
            enabled: conversationId !== undefined ? !!conversationId : true,
      });

      // ── Mutations ────────────────────────────────────────────────────────

      const createMutation = useMutation({
            mutationFn: (params: CreateReminderParams) => reminderApi.createReminder(params),
            onSuccess: () => {
                  // Invalidate all reminder queries (personal + all conversation-scoped)
                  void queryClient.invalidateQueries({ queryKey: REMINDERS_BASE_KEY });
            },
      });

      const updateMutation = useMutation({
            mutationFn: ({ id, params }: { id: string; params: UpdateReminderParams }) =>
                  reminderApi.updateReminder(id, params),
            onSuccess: () => {
                  void queryClient.invalidateQueries({ queryKey: REMINDERS_BASE_KEY });
            },
      });

      const deleteMutation = useMutation({
            mutationFn: (id: string) => reminderApi.deleteReminder(id),
            onSuccess: () => {
                  void queryClient.invalidateQueries({ queryKey: REMINDERS_BASE_KEY });
            },
      });

      // ── Socket listeners (cache invalidation only) ──────────────────────
      useEffect(() => {
            if (!socket) return;

            const handleUpdated = () => {
                  void queryClient.invalidateQueries({ queryKey: REMINDERS_BASE_KEY });
            };

            socket.on(SocketEvents.REMINDER_UPDATED, handleUpdated);

            return () => {
                  socket.off(SocketEvents.REMINDER_UPDATED, handleUpdated);
            };
      }, [socket, queryClient]);

      // ── Stable callbacks ─────────────────────────────────────────────────
      const createReminder = useCallback(
            (params: CreateReminderParams) => createMutation.mutateAsync(params),
            [createMutation],
      );

      const updateReminder = useCallback(
            (id: string, params: UpdateReminderParams) =>
                  updateMutation.mutateAsync({ id, params }),
            [updateMutation],
      );

      const deleteReminder = useCallback(
            (id: string) => deleteMutation.mutateAsync(id),
            [deleteMutation],
      );

      const completeReminder = useCallback(
            (id: string) => updateMutation.mutateAsync({ id, params: { isCompleted: true } }),
            [updateMutation],
      );

      return {
            reminders: reminders ?? [],
            isLoading,
            createReminder,
            updateReminder,
            deleteReminder,
            completeReminder,
            isCreating: createMutation.isPending,
            isUpdating: updateMutation.isPending,
            isDeleting: deleteMutation.isPending,
      };
}
