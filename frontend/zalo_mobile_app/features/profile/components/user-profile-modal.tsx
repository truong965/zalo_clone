import { View, StyleSheet, ActivityIndicator, TouchableOpacity, Alert, ImageBackground } from 'react-native';
import { Modal, Portal, Text, Button, useTheme, Surface } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '@/providers/auth-provider';

import { UserAvatar } from '@/components/ui/user-avatar';
import { useContactProfile } from '../api/profile.api';
import { 
  useSendFriendRequest, 
  useAcceptRequest, 
  useCancelRequest, 
  useDeclineRequest,
  useGetOrCreateDirectConversation
} from '@/features/friendship/api/friendship.api';
import { useFriendRequestStatus } from '@/features/friendship/hooks/use-friend-request-status';

interface UserProfileModalProps {
  visible: boolean;
  onDismiss: () => void;
  userId: string | null;
}

export const UserProfileModal = ({ visible, onDismiss, userId }: UserProfileModalProps) => {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  
  const { user: currentUser } = useAuth();
  const { data: profile, isLoading: isProfileLoading, error } = useContactProfile(userId);
  
  const isSelf = currentUser?.id === userId;
  
  // Friendship hooks
  const { 
    isFriend, 
    isPending, 
    pendingRequestDirection, 
    sentRequest, 
    receivedRequest,
    isLoading: isStatusLoading 
  } = useFriendRequestStatus(isSelf ? null : userId);

  const { mutate: addFriend, isPending: isAdding } = useSendFriendRequest();
  const { mutate: acceptRequest, isPending: isAccepting } = useAcceptRequest();
  const { mutate: cancelRequest, isPending: isCanceling } = useCancelRequest();
  const { mutate: declineRequest, isPending: isDeclining } = useDeclineRequest();
  const { mutate: getDirectChat, isPending: isCreatingChat } = useGetOrCreateDirectConversation();

  const isLoading = isProfileLoading || (!!userId && isStatusLoading);
  const isActionPending = isAdding || isAccepting || isCanceling || isDeclining || isCreatingChat;

  if (!userId) return null;

  const renderContent = () => {
    if (isLoading) {
      return (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      );
    }

    if (error || !profile) {
      return (
        <View style={styles.centerContainer}>
          <MaterialCommunityIcons name="alert-circle-outline" size={48} color={theme.colors.error} />
          <Text style={{ marginTop: 8, textAlign: 'center', color: theme.colors.onSurfaceVariant }}>
            {t('common.error')}
          </Text>
          <Button onPress={onDismiss} className="mt-4">
            {t('common.cancel')}
          </Button>
        </View>
      );
    }

    const {
      displayNameFinal,
      avatarUrl,
      isBlocked: serverIsBlocked,
      isPrivacyLimited: serverIsPrivacyLimited,
      phoneNumber,
      relationshipStatus: serverStatus,
    } = profile;

    // Derived values with sync logic
    const effectiveStatus = isFriend ? 'FRIEND' : isPending ? 'REQUEST' : serverStatus;
    const isBlocked = serverIsBlocked || effectiveStatus === 'BLOCKED';
    const isPrivacyLimited = serverIsPrivacyLimited && !isFriend;

    const handleSendMessage = () => {
      if (!userId) return;
      getDirectChat(userId, {
        onSuccess: (conversation) => {
          onDismiss();
          router.push(`/chat/${conversation.id}`);
        }
      });
    };

    const handleAddFriend = () => {
      if (!userId) return;
      addFriend(userId);
    };

    const handleAcceptRequest = () => {
      const requestId = receivedRequest?.id;
      if (requestId) acceptRequest(requestId);
    };

    const handleCancelRequest = () => {
      const requestId = sentRequest?.id;
      if (!requestId) return;
      Alert.alert(
        'Hủy lời mời',
        'Bạn có chắc chắn muốn hủy lời mời kết bạn này không?',
        [
          { text: 'Bỏ qua', style: 'cancel' },
          { text: 'Đồng ý', onPress: () => cancelRequest(requestId), style: 'destructive' },
        ]
      );
    };

    const handleDeclineRequest = () => {
      const requestId = receivedRequest?.id;
      if (!requestId) return;
      Alert.alert(
        'Từ chối lời mời',
        'Bạn có chắc chắn muốn từ chối lời mời kết bạn này không?',
        [
          { text: 'Bỏ qua', style: 'cancel' },
          { text: 'Đồng ý', onPress: () => declineRequest(requestId), style: 'destructive' },
        ]
      );
    };

    const isFriendshipRequest = effectiveStatus === 'REQUEST';

    // If blocked or privacy limited, show restricted UI
    if (!isSelf && (isBlocked || isPrivacyLimited)) {
      return (
        <View style={styles.container}>
          <View style={styles.header}>
            <View style={[styles.coverImage, { backgroundColor: '#1E88E5' }]} />
            <View style={styles.avatarWrapper}>
              <UserAvatar uri={avatarUrl} size={110} />
            </View>
            <Text style={styles.name}>{displayNameFinal}</Text>
            <Surface style={[styles.badge, { backgroundColor: '#FFF7ED' }]} elevation={0}>
              <Text style={{ color: '#C2410C', fontSize: 12, fontWeight: '700' }}>
                {isBlocked ? 'ĐÃ CHẶN' : 'RIÊNG TƯ'}
              </Text>
            </Surface>
          </View>
          
          <View style={styles.restrictedBody}>
             <MaterialCommunityIcons name="lock-outline" size={32} color={theme.colors.onSurfaceVariant} />
             <Text style={styles.restrictedText}>
                {isBlocked 
                  ? "Bạn không thể xem thông tin của người dùng này do đã bị chặn." 
                  : "Thông tin cá nhân của người dùng này đang được đặt ở chế độ riêng tư."}
             </Text>
          </View>

          <View style={styles.footer}>
            <Button 
              mode="contained" 
              onPress={onDismiss} 
              style={styles.primaryAction}
              buttonColor={theme.colors.primary}
            >
              Đóng
            </Button>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={[styles.coverImage, { backgroundColor: '#1E88E5' }]} />
          <View style={styles.avatarWrapper}>
            <UserAvatar uri={avatarUrl} size={110} />
          </View>
          <Text style={styles.name}>{displayNameFinal}</Text>
          
          {!isSelf && (
            <Surface style={[styles.badge, { backgroundColor: '#EFF6FF' }]} elevation={0}>
                <Text style={{ color: '#2563EB', fontSize: 12, fontWeight: '700' }}>
                  {effectiveStatus === 'FRIEND' ? 'BẠN BÈ' : effectiveStatus === 'REQUEST' ? 'ĐANG CHỜ' : 'NGƯỜI LẠ'}
                </Text>
            </Surface>
          )}
          {isSelf && (
            <Surface style={[styles.badge, { backgroundColor: '#F0FDF4' }]} elevation={0}>
                <Text style={{ color: '#166534', fontSize: 12, fontWeight: '700' }}>
                  TÔI
                </Text>
            </Surface>
          )}
        </View>

        {!isSelf && (
          <View style={styles.actionGrid}>
            <TouchableOpacity 
              style={styles.actionItem} 
              activeOpacity={0.7}
              onPress={handleSendMessage}
              disabled={isActionPending}
            >
              <View style={[styles.iconCircle, { backgroundColor: '#E3F2FD' }]}>
                <MaterialCommunityIcons name="message-outline" size={26} color="#1E88E5" />
              </View>
              <Text style={styles.actionLabel}>Nhắn tin</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.footer}>
          {!isSelf && (
            <>
              {effectiveStatus === 'NONE' && (
                <Button 
                  mode="contained" 
                  icon="account-plus"
                  style={styles.primaryAction}
                  onPress={handleAddFriend}
                  loading={isAdding}
                  disabled={isActionPending}
                >
                  Kết bạn
                </Button>
              )}

              {effectiveStatus === 'REQUEST' && pendingRequestDirection === 'OUTGOING' && (
                <Button 
                  mode="contained" 
                  icon="account-cancel"
                  style={[styles.primaryAction, { backgroundColor: '#FFA000' }]}
                  onPress={handleCancelRequest}
                  loading={isCanceling}
                  disabled={isActionPending}
                >
                  Hủy lời mời
                </Button>
              )}

              {effectiveStatus === 'REQUEST' && pendingRequestDirection === 'INCOMING' && (
                <View style={{ gap: 8 }}>
                  <Button 
                    mode="contained" 
                    icon="account-check"
                    style={styles.primaryAction}
                    onPress={handleAcceptRequest}
                    loading={isAccepting}
                    disabled={isActionPending}
                  >
                    Chấp nhận kết bạn
                  </Button>
                  <Button 
                    mode="outlined" 
                    icon="account-remove"
                    onPress={handleDeclineRequest}
                    loading={isDeclining}
                    disabled={isActionPending}
                    style={{ borderRadius: 12 }}
                  >
                    Từ chối
                  </Button>
                </View>
              )}
            </>
          )}

          <Button 
            mode="outlined" 
            onPress={onDismiss}
            style={styles.closeButton}
            labelStyle={{ color: '#666' }}
            disabled={isActionPending}
          >
            Trở về
          </Button>
        </View>
      </View>
    );
  };

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={styles.modalContent}
      >
        {renderContent()}
      </Modal>
    </Portal>
  );
};

const styles = StyleSheet.create({
  modalContent: {
    backgroundColor: 'white',
    margin: 20,
    borderRadius: 32,
    overflow: 'hidden',
    minHeight: 300,
  },
  centerContainer: {
    padding: 40,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 300,
  },
  container: {
    paddingBottom: 24,
  },
  header: {
    alignItems: 'center',
    paddingBottom: 20,
  },
  coverImage: {
    width: '100%',
    height: 120,
    marginBottom: -55,
  },
  avatarWrapper: {
    borderWidth: 4,
    borderColor: 'white',
    borderRadius: 60,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    backgroundColor: 'white',
  },
  name: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1a1a1a',
    marginTop: 12,
  },
  badge: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
  },
  restrictedBody: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 28,
  },
  restrictedText: {
    textAlign: 'center',
    color: '#666',
    marginTop: 16,
    lineHeight: 22,
    fontSize: 15,
  },
  actionGrid: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 24,
    marginVertical: 20,
  },
  actionItem: {
    alignItems: 'center',
    width: 80,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
    elevation: 2,
    shadowColor: '#1E88E5',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#444',
  },
  footer: {
    paddingHorizontal: 24,
    gap: 12,
    marginTop: 8,
  },
  primaryAction: {
    borderRadius: 16,
    paddingVertical: 4,
  },
  closeButton: {
    borderRadius: 16,
    borderColor: '#E0E0E0',
    paddingVertical: 4,
  },
});
