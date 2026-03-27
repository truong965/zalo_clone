import React, { useMemo } from 'react';
import { Conversation } from '@/types/conversation';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Text, Portal, Modal, Button } from 'react-native-paper';
import { ConversationAvatar } from '@/components/ui/conversation-avatar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/providers/auth-provider';
import { useCallActions } from '../../calls/hooks/use-call-actions';
import { CallType } from '../../calls/stores/call.store';
import { Alert } from 'react-native';
import { mobileApi } from '@/services/api';

interface ChatHeaderProps {
  conversation: Conversation | null;
}

export function ChatHeader({ conversation }: ChatHeaderProps) {
  const { user, accessToken } = useAuth();
  const router = useRouter();
  const { initiateCall, joinExistingCall } = useCallActions();
  const [showCallMenu, setShowCallMenu] = React.useState(false);

  const hasData =
    conversation &&
    typeof conversation === 'object' &&
    !!conversation?.id;

  const isGroup = conversation?.type === 'GROUP';
  
  const displayName = useMemo(() => {
    if (!hasData) return '...';
    if (conversation.name) return conversation.name;
    if (conversation.type === 'DIRECT') {
      const otherMember = conversation.members?.find(m => m.userId !== user?.id);
      return otherMember?.displayName || 'Người dùng';
    }
    return 'Hội thoại';
  }, [conversation, hasData, user?.id]);

  const getPresenceInfo = (isOnline?: boolean, lastSeenAt?: string | null) => {
    if (isGroup) return null;
    if (isOnline) return 'Đang hoạt động';
    if (!lastSeenAt) return null;

    const date = new Date(lastSeenAt);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Vừa mới truy cập';
    if (diffMins < 60) return `${diffMins} phút trước`;

    return null; // Chỉ track trong 1 hour như yêu cầu
  };

  const status = getPresenceInfo(conversation?.isOnline, conversation?.lastSeenAt);

  const handleGoToSettings = () => {
    if (!conversation?.id) return;
    router.push({
      pathname: `/chat/${conversation.id}/settings` as any,
    });
  };

  const handleCall = async (callType: CallType) => {
    setShowCallMenu(false);
    if (!conversation?.id || !hasData) return;
    
    // Determine peer details
    if (isGroup) {
      // Check for existing active call before initiating
      if (accessToken) {
        try {
          const activeCall = await mobileApi.getActiveCall(conversation.id, accessToken);
          if (activeCall.active) {
            Alert.alert(
              'Cuộc gọi nhóm đang diễn ra',
              `Nhóm đang có cuộc gọi với ${activeCall.participantCount ?? 0} người tham gia. Bạn có muốn tham gia không?`,
              [
                { text: 'Hủy', style: 'cancel' },
                {
                  text: 'Tham gia',
                  onPress: () => joinExistingCall(conversation.id, displayName),
                },
              ],
            );
            return;
          }
        } catch (err) {
          console.warn('[ChatHeader] Failed to check active call:', err);
          // Fall through to normal initiation
        }
      }

      initiateCall({
        callType,
        peerId: conversation.id,
        peerInfo: { displayName: displayName, avatarUrl: null },
        conversationId: conversation.id,
        isGroupCall: true,
      });
    } else {
      const peerId = conversation.otherUserId || conversation.members?.find(m => (m.userId || m.user?.id) !== user?.id)?.userId || conversation.members?.find(m => (m.userId || m.user?.id) !== user?.id)?.user?.id;
      const otherMember = conversation.members?.find(m => (m.userId || m.user?.id) === peerId);

      if (!peerId) {
        Alert.alert('Lỗi', 'Không thể gọi cho người dùng này');
        return;
      }
      initiateCall({
        callType,
        peerId,
        peerInfo: { 
          displayName: otherMember?.displayName || otherMember?.user?.displayName || displayName, 
          avatarUrl: otherMember?.avatarUrl || otherMember?.user?.avatarUrl || null 
        },
        conversationId: conversation.id,
        isGroupCall: false,
      });
    }
  };

  const handleGoToSearch = () => {
    if (!conversation?.id) return;
    router.navigate({
      pathname: `/chat/[id]/search`,
      params: { id: conversation.id, fromDetail: 'true' }
    } as any);
  };

  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top, height: 56 + insets.top }]}>
      {/* Back button — luôn hiển thị */}
      <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
        <Ionicons name="arrow-back" size={24} color="white" />
      </TouchableOpacity>

      {/* Avatar + tên — chỉ hiện khi đã có data */}
      <View style={styles.infoWrapper}>
        {hasData ? (
          <>
            <ConversationAvatar conversation={conversation} size={40} />
            <View style={styles.textWrapper}>
              <Text style={styles.displayName} numberOfLines={1}>
                {displayName}
              </Text>
              {status ? (
                <Text style={styles.status} numberOfLines={1}>
                  {status}
                </Text>
              ) : null}
            </View>
          </>
        ) : (
          // Placeholder skeleton — giữ chỗ, không thay đổi layout
          <View style={styles.skeletonWrapper}>
            <View style={styles.skeletonAvatar} />
            <View style={styles.skeletonTextWrapper}>
              <View style={styles.skeletonName} />
              <View style={styles.skeletonStatus} />
            </View>
          </View>
        )}
      </View>

      {/* Action buttons — luôn hiển thị */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionBtn} onPress={() => setShowCallMenu(true)}>
          <Ionicons name="call-outline" size={22} color="white" />
        </TouchableOpacity>
        <TouchableOpacity onPress={handleGoToSearch} style={styles.actionBtn}>
          <Ionicons name="search-outline" size={22} color="white" />
        </TouchableOpacity>
        <TouchableOpacity onPress={handleGoToSettings} style={styles.actionBtn}>
          <Ionicons name="list-outline" size={24} color="white" />
        </TouchableOpacity>
      </View>

      <Portal>
        <Modal
          visible={showCallMenu}
          onDismiss={() => setShowCallMenu(false)}
          contentContainerStyle={styles.modalContent}
        >
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Bắt đầu cuộc gọi</Text>
            <Text style={styles.modalSubtitle}>Sử dụng camera hay không?</Text>
          </View>
          
          <View style={styles.modalActions}>
            <TouchableOpacity 
              style={styles.modalOption} 
              onPress={() => handleCall('VOICE')}
            >
              <View style={[styles.modalIconBg, { backgroundColor: '#f3f4f6' }]}>
                <Ionicons name="call" size={24} color="#4b5563" />
              </View>
              <Text style={styles.modalOptionText}>Tắt Camera</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.modalOption} 
              onPress={() => handleCall('VIDEO')}
            >
              <View style={[styles.modalIconBg, { backgroundColor: '#eff6ff' }]}>
                <Ionicons name="videocam" size={24} color="#3b82f6" />
              </View>
              <Text style={styles.modalOptionText}>Bật Camera</Text>
            </TouchableOpacity>
          </View>

          <Button 
            mode="text" 
            onPress={() => setShowCallMenu(false)} 
            textColor="#ef4444"
            style={styles.cancelBtn}
          >
            Hủy
          </Button>
        </Modal>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    height: 56,
    // bg-primary — match màu từ theme. Dùng StyleSheet thay className
    // để tránh nativewind inject layout khi conversation thay đổi.
    backgroundColor: 'hsl(217.2, 91.2%, 59.8%)',
    zIndex: 50,
  },
  backBtn: {
    padding: 8,
  },
  infoWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  textWrapper: {
    marginLeft: 12,
    flex: 1,
  },
  displayName: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  status: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionBtn: {
    padding: 8,
  },
  // Skeleton placeholders
  skeletonWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  skeletonAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  skeletonTextWrapper: {
    marginLeft: 12,
    flex: 1,
    gap: 6,
  },
  skeletonName: {
    height: 14,
    width: 120,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  skeletonStatus: {
    height: 10,
    width: 80,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  modalContent: {
    backgroundColor: 'white',
    padding: 24,
    margin: 20,
    borderRadius: 16,
    alignItems: 'center',
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#6b7280',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginBottom: 16,
  },
  modalOption: {
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  modalIconBg: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOptionText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  cancelBtn: {
    marginTop: 8,
  },
});
