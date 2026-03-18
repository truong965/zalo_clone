import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Avatar, useTheme } from 'react-native-paper';
import { Conversation } from '@/types/conversation';

interface ConversationAvatarProps {
      conversation?: Conversation | null;
      size?: number;
}

/**
 * ConversationAvatar — Renders avatar with proper fallback logic
 * 
 * For DIRECT: Shows user avatar or user icon
 * For GROUP: Shows group avatar or group icon
 * Handles null avatarUrl gracefully with theme-aware defaults
 */
export const ConversationAvatar = React.memo(({ conversation, size = 56 }: ConversationAvatarProps) => {
      const theme = useTheme();

      // Handle null or undefined conversation - strict check
      if (!conversation || typeof conversation !== 'object') {
            return (
                  <View
                        style={[
                              styles.avatarContainer,
                              { width: size, height: size, borderRadius: size / 2, backgroundColor: theme.colors.surfaceVariant }
                        ]}
                  >
                        <Ionicons name="person-circle" size={size * 0.8} color={theme.colors.primary} />
                  </View>
            );
      }

      // Support both avatarUrl and avatar field names (backend may use either) - use optional chaining
      const avatarUrl = conversation?.avatarUrl || conversation?.avatar;
      const isGroup = conversation?.type === 'GROUP';

      // Has avatar URL: use it (with error handling)
      if (avatarUrl && typeof avatarUrl === 'string' && avatarUrl.trim() !== '') {
            return (
                  <Avatar.Image
                        size={size}
                        source={{ uri: avatarUrl }}
                  />
            );
      }

      // Fallback: no valid avatar URL
      if (isGroup) {
            // Group with no avatar: show group icon
            return (
                  <View
                        style={[
                              styles.avatarContainer,
                              { width: size, height: size, borderRadius: size / 2, backgroundColor: theme.colors.surfaceVariant }
                        ]}
                  >
                        <Ionicons name="people" size={size * 0.5} color={theme.colors.primary} />
                  </View>
            );
      }

      // Direct message with no avatar: show user icon
      return (
            <View
                  style={[
                        styles.avatarContainer,
                        { width: size, height: size, borderRadius: size / 2, backgroundColor: theme.colors.surfaceVariant }
                  ]}
            >
                  <Ionicons name="person-circle" size={size * 0.8} color={theme.colors.primary} />
            </View>
      );
});

ConversationAvatar.displayName = 'ConversationAvatar';

const styles = StyleSheet.create({
      avatarContainer: {
            justifyContent: 'center',
            alignItems: 'center',
      },
});
