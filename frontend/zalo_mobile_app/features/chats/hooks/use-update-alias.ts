import { useMutation, useQueryClient } from '@tanstack/react-query';
import { mobileApi } from '@/services/api';
import { useAuth } from '@/providers/auth-provider';
import Toast from 'react-native-toast-message';

export function useUpdateAlias() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      contactUserId,
      aliasName,
      conversationId,
    }: {
      contactUserId: string;
      aliasName: string | null;
      conversationId?: string;
    }) => mobileApi.updateAlias(accessToken!, contactUserId, { aliasName }),

    onSuccess: (_data, variables) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['friends'] });
      
      if (variables.conversationId) {
        queryClient.invalidateQueries({ queryKey: ['conversation', variables.conversationId] });
      }
      
      Toast.show({
        type: 'success',
        text1: 'Thành công',
        text2: variables.aliasName ? 'Đã cập nhật biệt danh' : 'Đã xoá biệt danh',
      });
    },
    onError: (error: any) => {
      Toast.show({
        type: 'error',
        text1: 'Lỗi',
        text2: error?.message || 'Không thể cập nhật biệt danh',
      });
    },
  });
}
