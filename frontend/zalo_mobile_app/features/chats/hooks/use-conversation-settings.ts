import { useMutation, useQueryClient } from '@tanstack/react-query';
import { mobileApi } from '@/services/api';
import { useAuth } from '@/providers/auth-provider';
import Toast from 'react-native-toast-message';

export function useConversationSettings(id: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: (data: { name?: string; avatarUrl?: string }) =>
      mobileApi.updateConversation(id, accessToken!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation', id] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      Toast.show({ type: 'success', text1: 'Cập nhật thành công' });
    },
  });

  const addMembersMutation = useMutation({
    mutationFn: (memberIds: string[]) =>
      mobileApi.addMembers(id, accessToken!, memberIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation', id] });
      Toast.show({ type: 'success', text1: 'Đã thêm thành viên' });
    },
  });

  const leaveMutation = useMutation({
    mutationFn: () => mobileApi.leaveGroup(id, accessToken!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      Toast.show({ type: 'success', text1: 'Đã rời nhóm' });
    },
  });

  const dissolveMutation = useMutation({
    mutationFn: () => mobileApi.dissolveGroup(id, accessToken!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      Toast.show({ type: 'success', text1: 'Đã giải tán nhóm' });
    },
  });

  return {
    updateMutation,
    addMembersMutation,
    leaveMutation,
    dissolveMutation,
  };
}
