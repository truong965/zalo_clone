import { useMutation, useQueryClient, InfiniteData } from '@tanstack/react-query';
import { mobileApi } from '@/services/api';
import { useAuth } from '@/providers/auth-provider';
import Toast from 'react-native-toast-message';
import { Conversation, ConversationListResponse } from '@/types/conversation';

export function useConversationActions() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  const conversationsQueryKey = ['conversations', accessToken];

  const pinMutation = useMutation({
    mutationFn: ({ id, isPinned }: { id: string; isPinned: boolean }) => 
      mobileApi.togglePin(id, accessToken!, isPinned),
    onMutate: async ({ id, isPinned }) => {
      await queryClient.cancelQueries({ queryKey: conversationsQueryKey });
      await queryClient.cancelQueries({ queryKey: ['conversation', id] });

      const previousConversations = queryClient.getQueryData<InfiniteData<ConversationListResponse>>(conversationsQueryKey);
      const previousConversation = queryClient.getQueryData<Conversation>(['conversation', id]);

      if (previousConversations) {
        queryClient.setQueryData<InfiniteData<ConversationListResponse>>(conversationsQueryKey, (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              data: page.data.map((c) => (c.id === id ? { ...c, isPinned } : c)),
            })),
          };
        });
      }

      if (previousConversation) {
        queryClient.setQueryData<Conversation>(['conversation', id], {
          ...previousConversation,
          isPinned,
        });
      }

      return { previousConversations, previousConversation };
    },
    onError: (err, variables, context) => {
      if (context?.previousConversations) {
        queryClient.setQueryData(conversationsQueryKey, context.previousConversations);
      }
      if (context?.previousConversation) {
        queryClient.setQueryData(['conversation', variables.id], context.previousConversation);
      }

      Toast.show({
        type: 'error',
        text1: 'Lỗi',
        text2: variables.isPinned ? 'Không thể ghim hội thoại' : 'Không thể bỏ ghim hội thoại',
      });
    },
    onSuccess: (_, variables) => {
      Toast.show({
        type: 'success',
        text1: 'Thành công',
        text2: variables.isPinned ? 'Đã ghim hội thoại' : 'Đã bỏ ghim hội thoại',
      });
    },
    onSettled: (data, error, variables) => {
      queryClient.invalidateQueries({ queryKey: conversationsQueryKey });
      queryClient.invalidateQueries({ queryKey: ['conversation', variables.id] });
    },
  });

  const muteMutation = useMutation({
    mutationFn: ({ id, isMuted }: { id: string; isMuted: boolean }) => 
      mobileApi.toggleMute(id, accessToken!, isMuted),
    onMutate: async ({ id, isMuted }) => {
      await queryClient.cancelQueries({ queryKey: conversationsQueryKey });
      await queryClient.cancelQueries({ queryKey: ['conversation', id] });

      const previousConversations = queryClient.getQueryData<InfiniteData<ConversationListResponse>>(conversationsQueryKey);
      const previousConversation = queryClient.getQueryData<Conversation>(['conversation', id]);

      if (previousConversations) {
        queryClient.setQueryData<InfiniteData<ConversationListResponse>>(conversationsQueryKey, (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              data: page.data.map((c) => (c.id === id ? { ...c, isMuted } : c)),
            })),
          };
        });
      }

      if (previousConversation) {
        queryClient.setQueryData<Conversation>(['conversation', id], {
          ...previousConversation,
          isMuted,
        });
      }

      return { previousConversations, previousConversation };
    },
    onError: (err, variables, context) => {
      if (context?.previousConversations) {
        queryClient.setQueryData(conversationsQueryKey, context.previousConversations);
      }
      if (context?.previousConversation) {
        queryClient.setQueryData(['conversation', variables.id], context.previousConversation);
      }

      Toast.show({
        type: 'error',
        text1: 'Lỗi',
        text2: variables.isMuted ? 'Không thể tắt thông báo' : 'Không thể bật thông báo',
      });
    },
    onSuccess: (_, variables) => {
      Toast.show({
        type: 'success',
        text1: 'Thành công',
        text2: variables.isMuted ? 'Đã tắt thông báo' : 'Đã bật thông báo',
      });
    },
    onSettled: (data, error, variables) => {
      queryClient.invalidateQueries({ queryKey: conversationsQueryKey });
      queryClient.invalidateQueries({ queryKey: ['conversation', variables.id] });
    },
  });

  return {
    pinConversation: (id: string, isPinned: boolean) => pinMutation.mutate({ id, isPinned }),
    muteConversation: (id: string, isMuted: boolean) => muteMutation.mutate({ id, isMuted }),
    isPinning: pinMutation.isPending,
    isMuting: muteMutation.isPending,
  };
}
