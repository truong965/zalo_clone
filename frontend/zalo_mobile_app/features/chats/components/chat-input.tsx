import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { useTheme } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';

interface ChatInputProps {
  onSend: (content: string) => void;
}

export function ChatInput({ onSend }: ChatInputProps) {
  const [content, setContent] = useState('');
  const theme = useTheme();

  const handleSend = () => {
    if (content.trim()) {
      onSend(content.trim());
      setContent('');
    }
  };

  return (
    <View className="flex-row items-center p-2 bg-card border-t border-border min-h-[56px]">
        <TouchableOpacity className="p-2">
            <Ionicons name="happy-outline" size={24} color={theme.colors.onSurfaceVariant} />
        </TouchableOpacity>

        <View className="flex-1 mx-1 bg-muted rounded-2xl px-3 py-1 justify-center min-h-[40px]">
            <TextInput
                className="text-foreground text-base leading-5"
                placeholder="Tin nhắn"
                placeholderTextColor={theme.colors.onSurfaceVariant}
                multiline
                value={content}
                onChangeText={setContent}
                style={{ maxHeight: 100 }}
            />
        </View>

        {content.trim().length > 0 ? (
            <TouchableOpacity onPress={handleSend} className="p-2 ml-1">
                <Ionicons name="send" size={24} color={theme.colors.primary} />
            </TouchableOpacity>
        ) : (
            <View className="flex-row items-center">
                <TouchableOpacity className="p-2">
                    <Ionicons name="ellipsis-horizontal" size={24} color={theme.colors.onSurfaceVariant} />
                </TouchableOpacity>
                <TouchableOpacity className="p-2">
                    <Ionicons name="mic-outline" size={24} color={theme.colors.onSurfaceVariant} />
                </TouchableOpacity>
                <TouchableOpacity className="p-2">
                    <Ionicons name="image-outline" size={24} color={theme.colors.onSurfaceVariant} />
                </TouchableOpacity>
            </View>
        )}
    </View>
  );
}
