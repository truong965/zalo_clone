import React, { useMemo } from 'react';
import { View, TouchableOpacity, Image } from 'react-native';
import { Text, useTheme, Avatar, IconButton, ActivityIndicator } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/providers/auth-provider';
import { Conversation } from '@/types/conversation';
import { ConversationAvatar } from '@/components/ui/conversation-avatar';

interface ProfileHeaderProps {
  conversation: Conversation;
  onEditName?: () => void;
  onEditAvatar?: () => void;
  onTogglePin: () => void;
  onToggleMute: () => void;
  onAddMember?: () => void;
  isAdmin: boolean;
  isPinning?: boolean;
  isMuting?: boolean;
}

export function ProfileHeader({
  conversation,
  onEditName,
  onEditAvatar,
  onTogglePin,
  onToggleMute,
  onAddMember,
  isAdmin,
  isPinning,
  isMuting
}: ProfileHeaderProps) {
  const { user } = useAuth();
  const theme = useTheme();

  const displayName = useMemo(() => {
    if (conversation.name) return conversation.name;
    if (conversation.type === 'DIRECT') {
      const otherMember = conversation.members?.find(m => m.userId !== user?.id);
      return otherMember?.displayName || 'Người dùng';
    }
    return 'Hội thoại';
  }, [conversation, user?.id]);

  const canEditAvatar = conversation.type === 'GROUP' && isAdmin;
  const canEditName = conversation.type === 'GROUP' ? isAdmin : true; // Direct name edit is for alias

  return (
    <View className="items-center py-6 bg-card">
      <View className="relative">
        <ConversationAvatar conversation={conversation} size={100} />
        {canEditAvatar && onEditAvatar && (
          <TouchableOpacity
            className="absolute bottom-0 right-0 bg-secondary p-1.5 rounded-full border-2 border-card"
            onPress={onEditAvatar}
          >
            <Ionicons name="camera" size={16} color={theme.colors.backdrop} />
          </TouchableOpacity>
        )}
      </View>

      <View className="flex-row items-center mt-3 px-6">
        <Text className="text-2xl font-bold text-center" numberOfLines={1}>
          {conversation.name || displayName}
        </Text>
        {canEditName && onEditName && (
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
            onPress={() => onToggleMute()}
            containerColor={theme.colors.secondaryContainer}
            disabled={isMuting}
          />
          <Text className="text-xs text-muted-foreground mt-1 text-center">
            {isMuting ? 'Đang xử lý...' : (conversation.isMuted ? 'Bật thông báo' : 'Tắt thông báo')}
          </Text>
        </View>

        <View className="items-center mx-4">
          <IconButton
            icon={conversation.isPinned ? 'pin-off' : 'pin'}
            mode="contained-tonal"
            size={28}
            onPress={() => onTogglePin()}
            containerColor={theme.colors.secondaryContainer}
            disabled={isPinning}
          />
          <Text className="text-xs text-muted-foreground mt-1 text-center">
            {isPinning ? 'Đang xử lý...' : (conversation.isPinned ? 'Bỏ ghim' : 'Ghim hội thoại')}
          </Text>
        </View>

        {conversation.type === 'GROUP' && onAddMember && (
          <View className="items-center mx-4">
            <IconButton
              icon="account-plus"
              mode="contained-tonal"
              size={28}
              onPress={() => onAddMember()}
              containerColor={theme.colors.secondaryContainer}
            />
            <Text className="text-xs text-muted-foreground mt-1 text-center">
              Thêm thành viên
            </Text>
          </View>
        )}


      </View>
    </View>
  );
}
