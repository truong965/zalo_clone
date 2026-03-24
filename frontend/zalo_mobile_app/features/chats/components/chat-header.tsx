import React, { useMemo } from 'react';
import { Conversation } from '@/types/conversation';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { ConversationAvatar } from '@/components/ui/conversation-avatar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/providers/auth-provider';

interface ChatHeaderProps {
  conversation: Conversation | null;
}

export function ChatHeader({ conversation }: ChatHeaderProps) {
  const { user } = useAuth();
  const router = useRouter();

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

  const handleGoToSearch = () => {
    if (!conversation?.id) return;
    router.push({
      pathname: `/chat/${conversation.id}/search` as any,
    });
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
        <TouchableOpacity style={styles.actionBtn}>
          <Ionicons name="call-outline" size={22} color="white" />
        </TouchableOpacity>
        <TouchableOpacity onPress={handleGoToSearch} style={styles.actionBtn}>
          <Ionicons name="search-outline" size={22} color="white" />
        </TouchableOpacity>
        <TouchableOpacity onPress={handleGoToSettings} style={styles.actionBtn}>
          <Ionicons name="list-outline" size={24} color="white" />
        </TouchableOpacity>
      </View>
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
});
