import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Modal, Portal, List, Text, Divider, useTheme } from 'react-native-paper';
import { Conversation } from '@/types/conversation';

interface ConversationActionSheetProps {
  visible: boolean;
  conversation: Conversation | null;
  onDismiss: () => void;
  onPin: (id: string, isPinned: boolean) => void;
  onMute: (id: string, isMuted: boolean) => void;
}

export function ConversationActionSheet({ visible, conversation, onDismiss, onPin, onMute }: ConversationActionSheetProps) {
  const { t } = useTranslation();
  const theme = useTheme();

  if (!conversation) return null;

  return (
    <Portal>
      <Modal 
        visible={visible} 
        onDismiss={onDismiss} 
        contentContainerStyle={{ 
            backgroundColor: theme.colors.background,
            margin: 20,
            borderRadius: 12,
            overflow: 'hidden'
        }}
      >
        <View className="bg-background">
          <View className="p-4 border-b border-border">
            <Text className="text-foreground font-bold text-center text-lg">
                {conversation.name || 'Hội thoại'}
            </Text>
          </View>
          
          <List.Item
            title={conversation.isPinned ? t('chats.unpin') : t('chats.pin')}
            left={(props) => <List.Icon {...props} icon="pin" />}
            onPress={() => {
              onPin(conversation.id, !conversation.isPinned);
              onDismiss();
            }}
            titleStyle={{ color: theme.colors.onSurface }}
          />
          <Divider />
          <List.Item
            title={conversation.isMuted ? t('chats.unmute') : t('chats.mute')}
            left={(props) => <List.Icon {...props} icon={conversation.isMuted ? "bell" : "bell-off"} />}
            onPress={() => {
              onMute(conversation.id, !conversation.isMuted);
              onDismiss();
            }}
            titleStyle={{ color: theme.colors.onSurface }}
          />
        </View>
      </Modal>
    </Portal>
  );
}
