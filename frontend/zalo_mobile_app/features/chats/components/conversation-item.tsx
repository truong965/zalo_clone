import { Ionicons } from '@expo/vector-icons';
import { formatDistanceToNowStrict } from 'date-fns';
import { vi } from 'date-fns/locale';
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Badge, useTheme } from 'react-native-paper';
import { Conversation } from '@/types/conversation';
import { ConversationAvatar } from './conversation-avatar';

interface ConversationItemProps {
  conversation: Conversation;
  onPress: (id: string) => void;
  onLongPress: (id: string) => void;
}

export const ConversationItem = React.memo(({ conversation, onPress, onLongPress }: ConversationItemProps) => {
  const theme = useTheme();

  if (!conversation || typeof conversation !== 'object' || !conversation.id) return null;
  const lastMessage = conversation?.lastMessage;
  const time = lastMessage?.createdAt
    ? formatDistanceToNowStrict(new Date(lastMessage.createdAt), { addSuffix: false, locale: vi })
    : '';

  const displayName = conversation.name ||
    (conversation.type === 'DIRECT' ? conversation.members?.[0]?.displayName : 'Hội thoại') ||
    'Hội thoại';

  return (
    <TouchableOpacity
      onPress={() => onPress(conversation.id)}
      onLongPress={() => onLongPress(conversation.id)}
      activeOpacity={0.7}
      className={`flex-row items-center p-4 bg-background ${conversation.isPinned ? 'bg-secondary/30' : ''}`}
    >
      <View className="relative">
        <ConversationAvatar conversation={conversation} size={56} />
        {conversation.isMuted && (
          <View
            className="absolute -bottom-1 -right-1 p-0.5 bg-background rounded-full"
            style={{ elevation: 2 }}
          >
            <Ionicons name="notifications-off" size={12} color={theme.colors.onSurfaceVariant} />
          </View>
        )}
      </View>

      <View className="flex-1 ml-4 border-b border-border pb-4">
        <View className="flex-row justify-between items-center mb-1">
          <View className="flex-1 flex-row items-center mr-2">
            <Text
              className={`text-foreground font-bold text-lg ${conversation.isPinned ? 'text-primary' : ''}`}
              numberOfLines={1}
            >
              {displayName}
            </Text>
            {conversation.isPinned && (
              <View className="ml-2">
                <Ionicons name="pin" size={14} color={theme.colors.primary} />
              </View>
            )}
          </View>
          <View className="flex-row items-center">
            <Text className="text-muted-foreground text-sm">{time}</Text>
            {conversation.unreadCount > 0 && (
              <Badge
                size={20}
                style={{ backgroundColor: theme.colors.error, marginLeft: 8 }}
              >
                {conversation.unreadCount > 5 ? '5+' : conversation.unreadCount}
              </Badge>
            )}
          </View>
        </View>

        <View className="flex-row justify-between items-center">
          <Text
            className={`flex-1 text-muted-foreground mr-2 ${conversation.unreadCount > 0 ? 'text-foreground font-medium' : ''}`}
            numberOfLines={1}
          >
            {lastMessage?.content || 'Chưa có tin nhắn'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
});

ConversationItem.displayName = 'ConversationItem';
