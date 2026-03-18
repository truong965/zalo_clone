import React from 'react';
import { View, Image } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { Message, MessageType } from '@/types/message';
import { format } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';

interface MessageItemProps {
  message: Message;
  isMe: boolean;
  showAvatar?: boolean;
  showSenderName?: boolean;
  /** Whether to show time for this message (typically only last message) */
  showTime?: boolean;
}

export function MessageItem({ message, isMe, showAvatar, showSenderName, showTime = false }: MessageItemProps) {
  const theme = useTheme();

  // Strict null/undefined check for message
  if (!message || typeof message !== 'object') return null;

  const time = format(new Date(message.createdAt), 'HH:mm');

  // Safely access sender with optional chaining
  const sender = message?.sender;
  const senderAvatarUrl = sender?.avatarUrl;
  const senderName = sender?.displayName || 'Người dùng';

  const renderContent = () => {
    switch (message.type) {
      case MessageType.IMAGE:
        return (
          <View className="rounded-lg overflow-hidden">
            <Image
              source={{ uri: message.attachments?.[0]?.url }}
              className="w-48 h-48 bg-muted"
              resizeMode="cover"
            />
          </View>
        );
      case MessageType.VIDEO:
        return (
          <View className="w-48 h-48 bg-black rounded-lg items-center justify-center">
            <Ionicons name="play-circle" size={48} color="white" />
          </View>
        );
      case MessageType.AUDIO:
      case MessageType.VOICE:
        return (
          <View className="flex-row items-center p-2 min-w-[150px]">
            <Ionicons name="play" size={24} color={isMe ? "white" : theme.colors.primary} />
            <View className="flex-1 h-1 bg-muted mx-2 rounded-full overflow-hidden">
              <View className="h-full bg-primary w-1/3" />
            </View>
            <Text className={`text-xs ${isMe ? 'text-white/80' : 'text-muted-foreground'}`}>0:30</Text>
          </View>
        );
      case MessageType.DOCUMENT:
        return (
          <View className="flex-row items-center p-3 bg-opacity-10 min-w-[200px]">
            <Ionicons name="document-text" size={32} color={isMe ? "white" : theme.colors.primary} />
            <View className="ml-2 flex-1">
              <Text className={`font-medium ${isMe ? 'text-white' : ''}`} numberOfLines={1}>
                {message.attachments?.[0]?.name || 'Document'}
              </Text>
              <Text className={`text-xs ${isMe ? 'text-white/80' : 'text-muted-foreground'}`}>
                12 MB
              </Text>
            </View>
          </View>
        );
      default:
        return (
          <Text className={`text-base ${isMe ? 'text-white' : 'text-foreground'}`}>
            {message.content}
          </Text>
        );
    }
  };

  return (
    <View className={`flex-row mb-2 px-3 ${isMe ? 'justify-end' : 'justify-start'}`}>
      {!isMe && showAvatar && sender && (
        <Image
          source={{ uri: senderAvatarUrl || 'https://via.placeholder.com/32' }}
          className="w-8 h-8 rounded-full self-end mr-2"
        />
      )}
      {!isMe && !showAvatar && <View className="w-8 mr-2" />}

      <View className="max-w-[75%]">
        {!isMe && showSenderName && sender && (
          <Text className="text-muted-foreground text-xs mb-1 ml-1">
            {senderName}
          </Text>
        )}

        <View
          className={`px-3 py-2 rounded-2xl border-1 ${isMe
            ? 'bg-blue-500 border-blue-600 rounded-tr-none'
            : 'bg-gray-300 border-gray-400 rounded-tl-none text-black'
            }`}
        >
          {renderContent()}
          {showTime && (
            <View className="flex-row justify-end mt-1">
              <Text
                className={`text-[10px] ${isMe ? 'text-white/70' : 'text-black/60'
                  }`}
              >
                {time}
              </Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}
