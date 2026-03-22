import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Modal, Portal, List, Text, Divider, useTheme } from 'react-native-paper';
import { Message, MessageType } from '@/types/message';
import { Ionicons } from '@expo/vector-icons';

interface MessageActionSheetProps {
  visible: boolean;
  message: Message | null;
  isPinned: boolean;
  onDismiss: () => void;
  onReply: (message: Message) => void;
  onPin: (message: Message) => void;
  onUnpin: (message: Message) => void;
}

export function MessageActionSheet({
  visible,
  message,
  isPinned,
  onDismiss,
  onReply,
  onPin,
  onUnpin,
}: MessageActionSheetProps) {
  const theme = useTheme();

  if (!message) return null;

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={[
          styles.modalContent,
          { backgroundColor: theme.colors.elevation.level2 },
        ]}
      >
        <View style={styles.container}>
          <List.Item
            title="Trả lời"
            left={(props) => <List.Icon {...props} icon="reply" />}
            onPress={() => {
              onReply(message);
              onDismiss();
            }}
          />

          <Divider />

          <List.Item
            title={isPinned ? "Bỏ ghim" : "Ghim tin nhắn"}
            left={(props) => <List.Icon {...props} icon="pin" />}
            onPress={() => {
              if (isPinned) {
                onUnpin(message);
              } else {
                onPin(message);
              }
              onDismiss();
            }}
          />

          <Divider />
          <List.Item
            title="Thu hồi"
            left={(props) => <List.Icon {...props} icon="delete-outline" color={theme.colors.error} />}
            titleStyle={{ color: theme.colors.error }}
            onPress={onDismiss}
            disabled
          />
        </View>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  modalContent: {
    margin: 20,
    borderRadius: 16,
    overflow: 'hidden',
  },
  container: {
    paddingVertical: 8,
  },
  header: {
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  headerText: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
  },
});
