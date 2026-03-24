import { Alert } from 'react-native';
import { useConversationSettings } from './use-conversation-settings';
import { useAuth } from '@/providers/auth-provider';
import Toast from 'react-native-toast-message';
import { useRouter } from 'expo-router';

interface MemberObject {
  id?: string;
  userId?: string;
  displayName?: string;
  user?: {
    id: string;
    displayName?: string;
  };
}

export function useMemberActions(conversationId: string) {
  const router = useRouter();
  const { user: currentUser } = useAuth();
  const {
    transferAdminMutation,
    removeMemberMutation,
    leaveMutation,
    dissolveMutation,
  } = useConversationSettings(conversationId);

  const getMemberId = (member: MemberObject) => member.userId || member.id || member.user?.id;
  const getMemberName = (member: MemberObject) => 
    member.displayName || member.user?.displayName || 'Thành viên';

  const handleTransferAdmin = (targetMember: MemberObject, onSuccess?: () => void) => {
    const targetId = getMemberId(targetMember);
    const targetName = getMemberName(targetMember);

    if (!targetId) return;

    Alert.alert(
      'Chuyển quyền trưởng nhóm',
      `Bạn có chắc chắn muốn chuyển quyền trưởng nhóm cho ${targetName} không? Bạn sẽ trở thành thành viên bình thường.`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Chuyển quyền',
          onPress: async () => {
            try {
              await transferAdminMutation.mutateAsync(targetId);
              onSuccess?.();
            } catch (error: any) {
              Toast.show({ type: 'error', text1: 'Lỗi', text2: error?.message || 'Không thể chuyển quyền' });
            }
          }
        }
      ]
    );
  };

  const handleRemoveMember = (member: MemberObject | string, onSuccess?: () => void) => {
    const targetId = typeof member === 'string' ? member : getMemberId(member);
    const targetName = typeof member === 'string' ? 'thành viên này' : getMemberName(member);

    if (!targetId) return;

    Alert.alert(
      'Xóa khỏi nhóm',
      `Bạn có chắc chắn muốn xóa ${targetName} khỏi nhóm?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeMemberMutation.mutateAsync(targetId);
              onSuccess?.();
            } catch (error: any) {
              Toast.show({ type: 'error', text1: 'Lỗi', text2: error?.message || 'Không thể xóa thành viên' });
            }
          }
        }
      ]
    );
  };

  const handleLeaveGroup = (isAdmin: boolean, memberCount: number, onTransferAdminNeeded: () => void) => {
    if (isAdmin && memberCount > 1) {
      Alert.alert(
        'Rời nhóm',
        'Bạn là admin. Bạn cần chuyển quyền trưởng nhóm cho người khác trước khi rời nhóm (nếu nhóm còn thành viên).',
        [
          { text: 'Chuyển quyền', onPress: onTransferAdminNeeded },
          { text: 'Đóng', style: 'cancel' }
        ]
      );
      return;
    }

    Alert.alert(
      'Rời nhóm',
      'Bạn có chắc chắn muốn rời nhóm này không?',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Rời nhóm',
          style: 'destructive',
          onPress: () => leaveMutation.mutate(undefined, {
            onSuccess: () => {
              router.dismissAll();
              router.replace('/(tabs)');
            },
            onError: (error: any) => {
              Toast.show({ type: 'error', text1: 'Lỗi', text2: error?.message || 'Không thể rời nhóm' });
            }
          })
        },
      ]
    );
  };

  const handleDissolveGroup = () => {
    Alert.alert(
      'Giải tán nhóm',
      'Tất cả tin nhắn và thành viên sẽ bị xóa. Hành động này không thể hoàn tác.',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Giải tán',
          style: 'destructive',
          onPress: () => dissolveMutation.mutate(undefined, {
            onSuccess: () => {
              router.dismissAll();
              router.replace('/(tabs)');
            },
            onError: (error: any) => {
              Toast.show({ type: 'error', text1: 'Lỗi', text2: error?.message || 'Không thể giải tán nhóm' });
            }
          })
        },
      ]
    );
  };

  return {
    handleTransferAdmin,
    handleRemoveMember,
    handleLeaveGroup,
    handleDissolveGroup,
    isTransferring: transferAdminMutation.isPending,
    isRemoving: removeMemberMutation.isPending,
    isLeaving: leaveMutation.isPending,
    isDissolving: dissolveMutation.isPending,
  };
}
