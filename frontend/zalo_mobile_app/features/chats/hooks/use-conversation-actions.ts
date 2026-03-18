import { useMutation, useQueryClient } from '@tanstack/react-query';
import { mobileApi } from '@/services/api';
import { useAuth } from '@/providers/auth-provider';
import Toast from 'react-native-toast-message';

export function useConversationActions() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  const pinMutation = useMutation({
    mutationFn: ({ id, isPinned }: { id: string; isPinned: boolean }) => 
      mobileApi.togglePin(id, accessToken!, isPinned),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      Toast.show({
        type: 'success',
        text1: 'Thành công',
        text2: 'Đã cập nhật trạng thái ghim',
      });
    },
    onError: () => {
      Toast.show({
        type: 'error',
        text1: 'Lỗi',
        text2: 'Không thể ghim hội thoại',
      });
    }
  });

  const muteMutation = useMutation({
    mutationFn: (id: string) => mobileApi.toggleMute(id, accessToken!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      Toast.show({
        type: 'success',
        text1: 'Thành công',
        text2: 'Đã cập nhật trạng thái thông báo',
      });
    },
    onError: () => {
      Toast.show({
        type: 'error',
        text1: 'Lỗi',
        text2: 'Không thể tắt thông báo',
      });
    }
  });

  return {
    pinConversation: pinMutation.mutate,
    muteConversation: muteMutation.mutate,
    isPinning: pinMutation.isPending,
    isMuting: muteMutation.isPending,
  };
}
