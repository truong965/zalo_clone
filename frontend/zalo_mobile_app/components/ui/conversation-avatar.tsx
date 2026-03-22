import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from 'react-native-paper';
import { Conversation } from '@/types/conversation';
import { UserAvatar } from '@/components/ui/user-avatar';
import { getFullUrl } from '@/utils/url-helpers';

interface ConversationAvatarProps {
      conversation?: Conversation | null;
      size?: number;
}

/**
 * ConversationAvatar — Renders avatar with proper fallback logic
 * * For DIRECT: Shows user avatar or user icon
 * For GROUP: Shows group avatar or group icon
 * Handles null avatarUrl gracefully with theme-aware defaults
 */
export const ConversationAvatar = React.memo(({ conversation, size = 56 }: ConversationAvatarProps) => {
      const theme = useTheme();

      // Handle null or undefined conversation - strict check
      if (!conversation || typeof conversation !== 'object') {
            return <UserAvatar size={size} />;
      }

      // Support both avatarUrl and avatar field names, then parse to full URL
      const rawAvatarUrl = conversation?.avatarUrl || conversation?.avatar;
      const fullAvatarUrl = getFullUrl(rawAvatarUrl);
      const isGroup = conversation?.type === 'GROUP';

      // Group fallback: no valid avatar URL
      if (isGroup && (!fullAvatarUrl || typeof fullAvatarUrl !== 'string' || fullAvatarUrl.trim() === '')) {
            return (
                  <View
                        style={[
                              styles.avatarContainer,
                              {
                                    width: size,
                                    height: size,
                                    borderRadius: size / 2,
                                    backgroundColor: theme.colors.surfaceVariant
                              }
                        ]}
                  >
                        <Ionicons
                              name="people"
                              size={size * 0.6}
                              color={theme.colors.onSurfaceVariant}
                        />
                  </View>
            );
      }

      // For direct or group with valid avatar, pass the processed URL to UserAvatar
      return <UserAvatar uri={fullAvatarUrl} size={size} />;
});

ConversationAvatar.displayName = 'ConversationAvatar';

const styles = StyleSheet.create({
      avatarContainer: {
            justifyContent: 'center',
            alignItems: 'center',
      },
});