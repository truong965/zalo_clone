import React, { useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { View, ScrollView, Alert, TouchableOpacity } from 'react-native';
import { Text, useTheme, IconButton } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { Conversation } from '@/types/conversation';
import { ProfileHeader } from './profile-header';
import { SettingsListItem } from './settings-list-item';
import { MediaExpandableSection } from './media-expandable-section';
import { useRouter } from 'expo-router';
import { useConversationActions } from '@/features/chats/hooks/use-conversation-actions';
import Toast from 'react-native-toast-message';
import { useReminders } from '@/features/chats/hooks/use-reminders';
import { ReminderItem } from './reminder-item';
import { useAuth } from '@/providers/auth-provider';
import { useBlockStatus } from '@/features/chats/hooks/use-block-status';
import { useConversationMembers } from '@/features/chats/hooks/use-members';

interface DirectSettingsProps {
  conversation: Conversation;
  members: any[];
  onEditName: () => void;
}

export function DirectSettings({ conversation, members: propMembers, onEditName }: DirectSettingsProps) {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const { pinConversation, muteConversation, isPinning, isMuting } = useConversationActions();
  const { reminders, deleteReminder, completeReminder } = useReminders(conversation.id);

  const targetUserId = React.useMemo(() => {
    const otherUser = conversation.members?.find(m => m.userId !== user?.id)?.user || (conversation.members?.find(m => m.userId !== user?.id) as any)?.user;
    return otherUser?.id || conversation.otherUserId;
  }, [conversation.members, conversation.otherUserId, user?.id]);

  const members = useMemo(() => {
    return propMembers.length > 0 ? propMembers : (conversation.members || []);
  }, [propMembers, conversation.members]);

  const { isBlocked, toggleBlock, isProcessing } = useBlockStatus(targetUserId);
  const queryClient = useQueryClient();
  const [isNavigating, setIsNavigating] = useState(false);
  const [remindersExpanded, setRemindersExpanded] = useState(false);

  const handleToggleBlock = async () => {
    if (!targetUserId || isNavigating || isProcessing || isBlocked) return;

    Alert.alert(
      'Chặn người dùng',
      'Bạn có chắc chắn muốn chặn người này không? Bạn sẽ không nhận được tin nhắn từ họ nữa.',
      [
        { text: 'Hủy', style: 'cancel' },
        { 
          text: 'Chặn', 
          style: 'destructive', 
          onPress: async () => {
            try {
              await toggleBlock();
              
              // After blocking, navigate back to chat list
              setIsNavigating(true);
              // Invalidate conversations list to remove this chat
              await queryClient.invalidateQueries({ queryKey: ['conversations'] });
              
              // Navigate back to the chats screen
              router.replace('/');
            } catch (error) {
              console.error('Error blocking user:', error);
            }
          }
        },
      ]
    );
  };

  return (
    <ScrollView className="flex-1 bg-background">
      <ProfileHeader
        conversation={{
          ...conversation,
          members: members.length > 0 ? members : (conversation.members || [])
        } as any}
        isAdmin={true} // In direct chat, we can always edit the name (alias)
        onEditName={onEditName}
        onTogglePin={() => pinConversation(conversation.id, !conversation.isPinned)}
        onToggleMute={() => muteConversation(conversation.id, !conversation.isMuted)}
        isPinning={isPinning}
        isMuting={isMuting}
      />

      <View className="mt-2" />
      <SettingsListItem
        icon="time-outline"
        label={`Danh sách nhắc hẹn (${reminders.length})`}
        onPress={() => setRemindersExpanded(!remindersExpanded)}
        right={remindersExpanded ? "chevron-up" : "chevron-down"}
      />
      {remindersExpanded && (
        <View className="bg-card shadow-sm">
          {reminders.length > 0 ? (
            reminders.map(reminder => (
              <ReminderItem
                key={reminder.id}
                reminder={reminder}
                currentUserId={user?.id || ''}
                onDelete={deleteReminder}
                onComplete={completeReminder}
              />
            ))
          ) : (
            <Text className="p-4 text-muted-foreground italic text-center text-sm">Chưa có nhắc hẹn nào</Text>
          )}
        </View>
      )}

      <MediaExpandableSection 
        conversationId={conversation.id} 
        onExpand={() => router.push(`/chat/${conversation.id}/media`)} 
      />

      <View className="mt-2" />
      {!isBlocked && (
        <SettingsListItem
          icon="ban-outline"
          label={isProcessing ? "Đang chặn..." : "Chặn người này"}
          onPress={handleToggleBlock}
          destructive
          hideChevron
          disabled={isProcessing}
        />
      )}
      <SettingsListItem
        icon="trash-outline"
        label="Xóa lịch sử trò chuyện"
        onPress={() => console.log('Delete history - skipped per request')}
        destructive
        hideChevron
      />
    </ScrollView>
  );
}
