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
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['conversation', variables.id] });
      Toast.show({
        type: 'success',
        text1: 'Thành công',
        text2: variables.isPinned ? 'Đã ghim hội thoại' : 'Đã bỏ ghim hội thoại',
      });
    },
    onError: (_, variables) => {
      Toast.show({
        type: 'error',
        text1: 'Lỗi',
        text2: variables.isPinned ? 'Không thể ghim hội thoại' : 'Không thể bỏ ghim hội thoại',
      });
    }
  });

  const muteMutation = useMutation({
    mutationFn: ({ id, isMuted }: { id: string; isMuted: boolean }) => 
      mobileApi.toggleMute(id, accessToken!, !isMuted),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['conversation', variables.id] });
      Toast.show({
        type: 'success',
        text1: 'Thành công',
        text2: !variables.isMuted ? 'Đã tắt thông báo' : 'Đã bật thông báo',
      });
    },
    onError: (_, variables) => {
      Toast.show({
        type: 'error',
        text1: 'Lỗi',
        text2: !variables.isMuted ? 'Không thể tắt thông báo' : 'Không thể bật thông báo',
      });
    }
  });

  return {
    pinConversation: (id: string, isPinned: boolean) => pinMutation.mutate({ id, isPinned }),
    muteConversation: (id: string, isMuted: boolean) => muteMutation.mutate({ id, isMuted }),
    isPinning: pinMutation.isPending,
    isMuting: muteMutation.isPending,
  };
}
