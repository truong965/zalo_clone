import { Conversation } from '@/types/conversation';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { View, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import { ConversationAvatar } from './conversation-avatar';

interface ChatHeaderProps {
  conversation: Conversation | null;
}

export function ChatHeader({ conversation }: ChatHeaderProps) {
  const router = useRouter();

  // Strict null/undefined and id check
  if (!conversation || typeof conversation !== 'object' || !conversation?.id) return null;

  const isGroup = conversation?.type === 'GROUP';
  const memberCount = conversation?.members?.length || 0;

  // Safely get display name with fallback
  const displayName = conversation?.name?.trim() || 'Người dùng';

  // Safely construct status text
  const status = isGroup
    ? `${memberCount > 0 ? memberCount : 0} thành viên`
    : 'Vừa mới truy cập';

  const handleGoToSettings = () => {
    if (!conversation?.id) return;
    router.push({
      pathname: `/chat/${conversation.id}/settings` as any,
    });
  };

  return (
    <View className="flex-row items-center px-2 py-1 bg-primary h-14 z-50">
      <TouchableOpacity onPress={() => router.back()} className="p-2">
        <Ionicons name="arrow-back" size={24} color="white" />
      </TouchableOpacity>

      <View className="flex-1 flex-row items-center">
        <ConversationAvatar conversation={conversation} size={40} />
        <View className="ml-3 flex-1">
          <Text className="text-white font-bold text-base" numberOfLines={1}>
            {displayName}
          </Text>
          <Text className="text-white/80 text-xs" numberOfLines={1}>
            {status}
          </Text>
        </View>
      </View>

      <View className="flex-row items-center">
        <TouchableOpacity className="p-2">
          <Ionicons name="call-outline" size={22} color="white" />
        </TouchableOpacity>
        <TouchableOpacity className="p-2">
          <Ionicons name="videocam-outline" size={24} color="white" />
        </TouchableOpacity>
        <TouchableOpacity onPress={handleGoToSettings} className="p-2">
          <Ionicons name="list-outline" size={24} color="white" />
        </TouchableOpacity>
      </View>
    </View>
  );
}
