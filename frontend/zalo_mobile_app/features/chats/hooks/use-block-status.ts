import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { mobileApi } from '@/services/api';
import { useAuth } from '@/providers/auth-provider';
import Toast from 'react-native-toast-message';

export function useBlockStatus(targetUserId?: string | null) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  const { data: blockStatus, isLoading } = useQuery({
    queryKey: ['block-status', targetUserId],
    queryFn: () => mobileApi.checkBlockStatus(targetUserId!, accessToken!),
    enabled: !!accessToken && !!targetUserId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false,
  });
 
  const isBlocked = blockStatus?.isBlocked || false;

  const blockMutation = useMutation({
    mutationFn: () => mobileApi.blockUser(targetUserId!, accessToken!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['block-status', targetUserId] });
      queryClient.invalidateQueries({ queryKey: ['blocked-list'] });
      Toast.show({ type: 'success', text1: 'Đã chặn người dùng' });
    },
    onError: (error: any) => {
      Toast.show({ type: 'error', text1: 'Lỗi', text2: error?.message || 'Không thể chặn người dùng' });
    }
  });

  const unblockMutation = useMutation({
    mutationFn: () => mobileApi.unblockUser(targetUserId!, accessToken!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['block-status', targetUserId] });
      queryClient.invalidateQueries({ queryKey: ['blocked-list'] });
      Toast.show({ type: 'success', text1: 'Đã bỏ chặn người dùng' });
    },
    onError: (error: any) => {
      Toast.show({ type: 'error', text1: 'Lỗi', text2: error?.message || 'Không thể bỏ chặn người dùng' });
    }
  });

  const toggleBlock = async () => {
    if (!targetUserId) return;
    try {
      if (isBlocked) {
        await unblockMutation.mutateAsync();
      } else {
        await blockMutation.mutateAsync();
      }
    } catch (e) {
      // Error handled in mutation
    }
  };

  return {
    isBlocked,
    isLoading,
    toggleBlock,
    isProcessing: blockMutation.isPending || unblockMutation.isPending,
  };
}
