import { useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseMutationOptions } from '@tanstack/react-query';
import { mobileApi } from '@/services/api';
import { useAuth } from '@/providers/auth-provider';
import { useSocket } from '@/providers/socket-provider';
import type { CreateReminderParams, UpdateReminderParams, ReminderItem } from '@/types/reminder';

export const REMINDERS_BASE_KEY = ['reminders'] as const;

export function useReminders(conversationId?: string | null) {
  const queryClient = useQueryClient();
  const { accessToken } = useAuth();
  const { socket } = useSocket();

  const queryKey = conversationId
    ? ([...REMINDERS_BASE_KEY, conversationId] as const)
    : REMINDERS_BASE_KEY;

  const {
    data: reminders,
    isLoading,
  } = useQuery({
    queryKey,
    queryFn: () => {
      if (!accessToken) throw new Error('Not authenticated');
      return conversationId
        ? mobileApi.getConversationReminders(conversationId, accessToken)
        : mobileApi.getReminders(accessToken, false);
    },
    staleTime: 60_000,
    enabled: !!accessToken && (conversationId !== undefined ? !!conversationId : true),
  });

  const createMutation = useMutation({
    mutationFn: (params: CreateReminderParams) => {
      if (!accessToken) throw new Error('Not authenticated');
      return mobileApi.createReminder(params, accessToken);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: REMINDERS_BASE_KEY });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, params }: { id: string; params: UpdateReminderParams }) => {
      if (!accessToken) throw new Error('Not authenticated');
      return mobileApi.updateReminder(id, params, accessToken);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: REMINDERS_BASE_KEY });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => {
      if (!accessToken) throw new Error('Not authenticated');
      return mobileApi.deleteReminder(id, accessToken);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: REMINDERS_BASE_KEY });
    },
  });

  useEffect(() => {
    if (!socket) return;

    const handleUpdated = () => {
      void queryClient.invalidateQueries({ queryKey: REMINDERS_BASE_KEY });
    };

    socket.on('reminder:updated', handleUpdated);

    return () => {
      socket.off('reminder:updated', handleUpdated);
    };
  }, [socket, queryClient]);

  const createReminder = useCallback(
    (params: CreateReminderParams, options?: UseMutationOptions<any, any, CreateReminderParams, any>) =>
      createMutation.mutateAsync(params, options),
    [createMutation],
  );

  const updateReminder = useCallback(
    (id: string, params: UpdateReminderParams, options?: UseMutationOptions<any, any, { id: string; params: UpdateReminderParams }, any>) =>
      updateMutation.mutateAsync({ id, params }, options),
    [updateMutation],
  );

  const deleteReminder = useCallback(
    (id: string, options?: UseMutationOptions<any, any, string, any>) =>
      deleteMutation.mutateAsync(id, options),
    [deleteMutation],
  );

  const completeReminder = useCallback(
    (id: string, options?: UseMutationOptions<any, any, { id: string; params: UpdateReminderParams }, any>) =>
      updateMutation.mutateAsync({ id, params: { isCompleted: true } }, options),
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
