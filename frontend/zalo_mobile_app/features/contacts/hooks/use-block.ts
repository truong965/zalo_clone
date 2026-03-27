import { useMutation, useQueryClient } from '@tanstack/react-query';
import { mobileApi } from '@/services/api';
import { useAuth } from '@/providers/auth-provider';
import { useCursorPagination } from '@/hooks/use-cursor-pagination';
import type { BlockedUser } from '@/types/block';
import { Alert } from 'react-native';
import Toast from 'react-native-toast-message';

export const blockKeys = {
  all: ['blocks'] as const,
  blockedList: (params?: { limit?: number; search?: string }) =>
    [...blockKeys.all, 'list', params] as const,
};

export function useBlockedList(params?: { limit?: number; search?: string }) {
  const { accessToken } = useAuth();
  const limit = params?.limit ?? 20;
  const search = params?.search;

  return useCursorPagination<BlockedUser>(
    blockKeys.blockedList({ limit, search }),
    (cursor) => mobileApi.getBlockedList(accessToken!, { cursor, limit, search }),
    {
      enabled: !!accessToken,
      staleTime: 30_000,
    }
  );
}

export function useUnblockUser() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (targetUserId: string) => mobileApi.unblockUser(targetUserId, accessToken!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: blockKeys.all });
    },
    onError: (...args) => {
      const error = args[0] as any;
      console.error('Unblock failed:', error);
      Toast.show({
        type: 'error',
        text1: 'Lỗi',
        text2: error?.message || 'Không thể bỏ chặn người dùng. Vui lòng thử lại sau.',
      });
    },
  });
}
