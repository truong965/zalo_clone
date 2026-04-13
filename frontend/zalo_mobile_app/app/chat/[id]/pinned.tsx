import React from 'react';
import { View, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
import { Text, IconButton, useTheme } from 'react-native-paper';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import { usePinMessage } from '@/features/chats/hooks/use-pin-message';
import { Message, MessageType } from '@/types/message';
import { useChatStore } from '@/features/chats/stores/chat.store';
import { Ionicons } from '@expo/vector-icons';

import { getMessagePreviewText } from '@/features/chats/components/message-item/message-item.utils';

export default function PinnedMessagesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const { pinnedMessages, unpinMessage } = usePinMessage(id);
  const { setJumpToMessageId } = useChatStore();

  const handleJump = (messageId: string) => {
    setJumpToMessageId(messageId);
    router.back();
  };

  const renderItem = ({ item }: { item: Message }) => (
    <TouchableOpacity
      style={styles.pinnedItem}
      activeOpacity={0.7}
      onPress={() => handleJump(item.id)}
    >
      <View style={styles.itemContent}>
        <View style={styles.headerRow}>
          <Text style={styles.senderName} numberOfLines={1}>
            {item.sender?.displayName || 'Người dùng'}
          </Text>
          <View style={styles.timeContainer}>
            <Ionicons name="time-outline" size={12} color="#9ca3af" style={styles.timeIcon} />
            <Text style={styles.timeText}>
              {new Date(item.createdAt).toLocaleString('vi-VN', {
                hour: '2-digit', minute: '2-digit',
                day: '2-digit', month: '2-digit', year: 'numeric'
              })}
            </Text>
          </View>
        </View>
        <Text style={styles.messageText} numberOfLines={3}>
          {getMessagePreviewText(item)}
        </Text>
      </View>
      <View style={styles.actions}>
        <IconButton
          icon="close"
          size={20}
          iconColor={theme.colors.error}
          onPress={() => unpinMessage(item.id)}
        />
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerTitle: 'Tin nhắn ghim',
          headerBackTitle: 'Quay lại',
          headerShown: true,
          headerStyle: { backgroundColor: 'hsl(217.2, 91.2%, 59.8%)' },
          headerTintColor: '#fff',
        }}
      />
      {pinnedMessages.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="pin-outline" size={48} color="#9ca3af" />
          <Text style={styles.emptyText}>Không có tin nhắn ghim nào.</Text>
        </View>
      ) : (
        <FlatList
          data={pinnedMessages}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  listContent: {
    paddingVertical: 16,
  },
  pinnedItem: {
    flexDirection: 'row',
    backgroundColor: 'white',
    padding: 16,
    marginHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  itemContent: {
    flex: 1,
    marginRight: 8,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  senderName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
    marginRight: 8,
  },
  timeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeIcon: {
    marginRight: 4,
  },
  messageText: {
    fontSize: 15,
    color: '#374151',
    lineHeight: 22,
  },
  timeText: {
    fontSize: 12,
    color: '#9ca3af',
  },
  actions: {
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
  },
  separator: {
    height: 12,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyText: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 16,
  },
});
