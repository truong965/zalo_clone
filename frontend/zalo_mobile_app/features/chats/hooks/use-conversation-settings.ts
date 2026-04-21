import { useMutation, useQueryClient } from '@tanstack/react-query';
import { mobileApi } from '@/services/api';
import { useAuth } from '@/providers/auth-provider';
import { useSocket } from '@/providers/socket-provider';
import Toast from 'react-native-toast-message';
import { SocketEvents } from '@/constants/socket-events';

export function useConversationSettings(id: string) {
  const { accessToken } = useAuth();
  const { socket } = useSocket();
  const queryClient = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: (data: { name?: string; avatarUrl?: string; requireApproval?: boolean }) => {
      return new Promise((resolve, reject) => {
        if (!socket) return reject(new Error('Socket not connected'));
        socket.emit(SocketEvents.GROUP_UPDATE, { conversationId: id, updates: data }, (response: any) => {
          if (response?.success || !response?.error) {
            resolve(response);
          } else {
            reject(new Error(response.message || 'Cập nhật thất bại'));
          }
        });
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation', id] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      Toast.show({ type: 'success', text1: 'Cập nhật thành công' });
    },
  });

  const transferAdminMutation = useMutation({
    mutationFn: (newAdminId: string) => {
      return new Promise((resolve, reject) => {
        if (!socket) return reject(new Error('Socket not connected'));
        socket.emit(SocketEvents.GROUP_TRANSFER_ADMIN, { conversationId: id, newAdminId }, (response: any) => {
          if (response?.success || !response?.error) {
            resolve(response);
          } else {
            reject(new Error(response.message || 'Chuyển quyền thất bại'));
          }
        });
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation', id] });
      Toast.show({ type: 'success', text1: 'Đã chuyển quyền trưởng nhóm' });
    },
  });

  const addMembersMutation = useMutation({
    mutationFn: (memberIds: string[]) => {
      return new Promise((resolve, reject) => {
        if (!socket) return reject(new Error('Socket not connected'));
        // FIX: The backend expects `userIds`, not `memberIds`
        socket.emit(SocketEvents.GROUP_ADD_MEMBERS, { conversationId: id, userIds: memberIds }, (response: any) => {
          if (response?.success || !response?.error) {
            resolve(response);
          } else {
            reject(new Error(response.message || 'Thêm thành viên thất bại'));
          }
        });
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation', id] });
      Toast.show({ type: 'success', text1: 'Đã thêm thành viên' });
    },
  });

  const inviteMembersMutation = useMutation({
    mutationFn: (userIds: string[]) => {
      return new Promise((resolve, reject) => {
        if (!socket) return reject(new Error('Socket not connected'));
        socket.emit(SocketEvents.GROUP_INVITE_MEMBERS, { conversationId: id, userIds }, (response: any) => {
          if (response?.success || !response?.error) {
            resolve(response);
          } else {
            reject(new Error(response.message || 'Gửi lời mời thất bại'));
          }
        });
      });
    },
    onSuccess: (data: any) => {
      // Backend returns { result: { invitedCount, skippedCount } }
      const count = data?.result?.invitedCount || 0;
      queryClient.invalidateQueries({ queryKey: ['conversation', id] });
      Toast.show({ 
        type: 'success', 
        text1: 'Đã gửi lời mời', 
        text2: count > 0 ? `Yêu cầu tham gia đã được gửi cho ${count} người dùng.` : 'Yêu cầu tham gia đã được gửi.'
      });
    },
  });

  const leaveMutation = useMutation({
    mutationFn: () => {
      return new Promise((resolve, reject) => {
        if (!socket) return reject(new Error('Socket not connected'));
        socket.emit(SocketEvents.GROUP_LEAVE, { conversationId: id }, (response: any) => {
          if (response?.success || !response?.error) {
            resolve(response);
          } else {
            reject(new Error(response.message || 'Rời nhóm thất bại'));
          }
        });
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      Toast.show({ type: 'success', text1: 'Đã rời nhóm' });
    },
  });

  const dissolveMutation = useMutation({
    mutationFn: () => {
      return new Promise((resolve, reject) => {
        if (!socket) return reject(new Error('Socket not connected'));
        socket.emit(SocketEvents.GROUP_DISSOLVE, { conversationId: id }, (response: any) => {
          if (response?.success || !response?.error) {
            resolve(response);
          } else {
            reject(new Error(response.message || 'Giải tán nhóm thất bại'));
          }
        });
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      Toast.show({ type: 'success', text1: 'Đã giải tán nhóm' });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) => {
      return new Promise((resolve, reject) => {
        if (!socket) return reject(new Error('Socket not connected'));
        socket.emit(SocketEvents.GROUP_REMOVE_MEMBER, { conversationId: id, userId }, (response: any) => {
          if (response?.success || !response?.error) {
            resolve(response);
          } else {
            reject(new Error(response.message || 'Xóa thành viên thất bại'));
          }
        });
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation', id] });
      Toast.show({ type: 'success', text1: 'Đã xóa khỏi nhóm' });
    },
  });

  return {
    updateMutation,
    transferAdminMutation,
    addMembersMutation,
    inviteMembersMutation,
    leaveMutation,
    dissolveMutation,
    removeMemberMutation,
  };
}
