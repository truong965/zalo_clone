import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Text, IconButton, useTheme } from 'react-native-paper';
import { Message, MessageType } from '@/types/message';
import { Ionicons } from '@expo/vector-icons';
import { getMessagePreviewText } from './message-item/message-item.utils';

interface PinnedMessagesHeaderProps {
  pinnedMessages: Message[];
  onUnpin?: (messageId: string) => void;
  onViewAllPinned?: () => void;
}

export function PinnedMessagesHeader({
  pinnedMessages,
  onViewAllPinned,
}: PinnedMessagesHeaderProps) {
  const theme = useTheme();

  if (pinnedMessages.length === 0) return null;

  const currentMessage = pinnedMessages[0];
  const totalPinned = pinnedMessages.length;

  const handlePress = () => {
    if (onViewAllPinned) {
      onViewAllPinned();
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity 
        style={styles.mainContent} 
        onPress={handlePress}
      >
        <View style={styles.iconWrapper}>
          <Ionicons name="pin" size={16} color={theme.colors.primary} />
        </View>
        
        <View style={styles.textWrapper}>
          <Text style={styles.title} numberOfLines={1}>
            {totalPinned > 1 ? `Tin nhắn ghim (${totalPinned})` : 'Tin nhắn ghim'}
          </Text>
          <Text style={styles.content} numberOfLines={3}>
            {getMessagePreviewText(currentMessage)}
          </Text>
        </View>

        <IconButton 
          icon="chevron-right" 
          size={20} 
          onPress={handlePress}
        />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'white',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
    zIndex: 40,
    minHeight: 56, // Increased minimum height
  },
  mainContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 12,
    paddingRight: 4,
    paddingVertical: 8,
  },
  iconWrapper: {
    marginRight: 10,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  textWrapper: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#0091ff',
    marginBottom: 4,
  },
  content: {
    fontSize: 14, // Increased font size
    lineHeight: 20, // Better line height for max 3 lines
    color: '#4b5563',
  },
});
