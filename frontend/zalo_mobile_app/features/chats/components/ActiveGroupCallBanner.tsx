import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useCallStore } from '../../calls/stores/call.store';
import { useCallActions } from '../../calls/hooks/use-call-actions';
import { ConversationAvatar } from '@/components/ui/conversation-avatar';

interface ActiveGroupCallBannerProps {
  conversationId: string;
  displayName: string;
  avatarUrl?: string | null;
}

/**
 * ActiveGroupCallBanner (Mobile)
 * 
 * Displays a proactive "Join Call" banner in the chat screen when 
 * an active group call is detected.
 */
export const ActiveGroupCallBanner: React.FC<ActiveGroupCallBannerProps> = ({
  conversationId,
  displayName,
  avatarUrl
}) => {
  const activeGroupCalls = useCallStore((s) => s.activeGroupCalls);
  const groupCallState = activeGroupCalls[conversationId];
  const isActive = groupCallState?.active === true;
  const callStatus = useCallStore((s) => s.callStatus);
  const currentCallConversationId = useCallStore((s) => s.conversationId);
  const { joinExistingCall } = useCallActions();

  // Hide banner if user is already IN this specific call
  if (!isActive || (callStatus === 'ACTIVE' && currentCallConversationId === conversationId)) {
    return null;
  }

  const handleJoin = () => {
    joinExistingCall(conversationId, displayName);
  };

  return (
    <View className="bg-blue-50 border-b border-blue-100 px-4 py-3 flex-row items-center justify-between shadow-sm">
      <View className="flex-row items-center flex-1">
        <View className="relative">
          <ConversationAvatar
            conversation={{ type: 'GROUP', avatarUrl, name: displayName } as any}
            size={40}
          />
          <View className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 border-2 border-white rounded-full" />
        </View>

        <View className="ml-3 flex-1">
          <Text className="text-sm font-bold text-blue-900">
            Cuộc gọi nhóm đang diễn ra
          </Text>
          <Text className="text-xs text-blue-600" numberOfLines={1}>
            Nhấn để tham gia cùng mọi người
          </Text>
        </View>
      </View>

      <TouchableOpacity
        onPress={handleJoin}
        className="bg-blue-600 px-4 py-2 rounded-full flex-row items-center"
        activeOpacity={0.7}
      >
        <Ionicons name="call" size={16} color="white" />
        <Text className="text-white text-xs font-bold ml-1">Tham gia</Text>
      </TouchableOpacity>
    </View>
  );
};
