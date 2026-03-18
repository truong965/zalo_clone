import React from 'react';
import { View, TouchableOpacity, Image } from 'react-native';
import { Text, useTheme, Avatar, IconButton } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { Conversation } from '@/types/conversation';

interface ProfileHeaderProps {
  conversation: Conversation;
  onEditName?: () => void;
  onTogglePin: () => void;
  onToggleMute: () => void;
  isAdmin: boolean;
}

export function ProfileHeader({ conversation, onEditName, onTogglePin, onToggleMute, isAdmin }: ProfileHeaderProps) {
  const theme = useTheme();

  const displayName = conversation.name || 
    (conversation.type === 'DIRECT' ? conversation.members?.[0]?.displayName : 'Hội thoại') || 
    'Hội thoại';

  return (
    <View className="items-center py-6 bg-card">
      <View className="relative">
        <Avatar.Image
          size={100}
          source={conversation.avatarUrl ? { uri: conversation.avatarUrl } : require('@/assets/images/icon.png')}
        />
        {isAdmin && (
            <TouchableOpacity 
                className="absolute bottom-0 right-0 bg-secondary p-1.5 rounded-full border-2 border-card"
                onPress={() => console.log('Edit avatar')}
            >
                <Ionicons name="camera" size={16} color={theme.colors.onSecondary} />
            </TouchableOpacity>
        )}
      </View>

      <View className="flex-row items-center mt-3 px-6">
        <Text className="text-2xl font-bold text-center" numberOfLines={1}>
          {displayName}
        </Text>
        {isAdmin && onEditName && (
          <TouchableOpacity onPress={onEditName} className="ml-2">
            <Ionicons name="pencil" size={20} color={theme.colors.onSurfaceVariant} />
          </TouchableOpacity>
        )}
      </View>

      <View className="flex-row mt-6 justify-center w-full px-4">
        <View className="items-center mx-4">
          <IconButton
            icon={conversation.isMuted ? 'bell-off' : 'bell'}
            mode="contained-tonal"
            size={28}
            onPress={onToggleMute}
            containerColor={theme.colors.secondaryContainer}
          />
          <Text className="text-xs text-muted-foreground mt-1 text-center">
            {conversation.isMuted ? 'Bật thông báo' : 'Tắt thông báo'}
          </Text>
        </View>

        <View className="items-center mx-4">
          <IconButton
            icon={conversation.isPinned ? 'pin-off' : 'pin'}
            mode="contained-tonal"
            size={28}
            onPress={onTogglePin}
            containerColor={theme.colors.secondaryContainer}
          />
          <Text className="text-xs text-muted-foreground mt-1 text-center">
            {conversation.isPinned ? 'Bỏ ghim' : 'Ghim hội thoại'}
          </Text>
        </View>
        
        <View className="items-center mx-4">
          <IconButton
            icon="magnify"
            mode="contained-tonal"
            size={28}
            onPress={() => console.log('Search')}
            containerColor={theme.colors.secondaryContainer}
          />
          <Text className="text-xs text-muted-foreground mt-1 text-center">
            Tìm tin nhắn
          </Text>
        </View>
      </View>
    </View>
  );
}
