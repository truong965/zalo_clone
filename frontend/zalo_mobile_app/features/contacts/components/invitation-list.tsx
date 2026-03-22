import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text, Button, useTheme } from 'react-native-paper';
import { FlashList } from '@shopify/flash-list';
import { UserAvatar } from '@/components/ui/user-avatar';
import { FriendRequest } from '@/types/friendship';
import { useTranslation } from 'react-i18next';

interface InvitationListProps {
  requests: FriendRequest[];
  mode: 'RECEIVED' | 'SENT';
  onAccept?: (id: string) => void;
  onDecline?: (id: string) => void;
  onCancel?: (id: string) => void;
  isRefreshing: boolean;
  onRefresh: () => void;
}

export const InvitationList = React.memo(({ requests, mode, onAccept, onDecline, onCancel, isRefreshing, onRefresh }: InvitationListProps) => {
  const theme = useTheme();

  const renderItem = ({ item }: { item: FriendRequest }) => {
    const user = mode === 'RECEIVED' ? item.sender : item.target;
    if (!user) return null;

    const displayName = user.displayName || 'Người dùng';
    return (
      <View className="flex-row items-center p-4 bg-background border-b border-border/50">
        <UserAvatar uri={user.avatarUrl} size={48} />
        <View className="flex-1 ml-4 justify-center">
          <Text className="text-foreground font-bold text-base" numberOfLines={1}>
            {displayName}
          </Text>
          <Text className="text-muted-foreground text-xs mb-2" numberOfLines={1}>
            {mode === 'RECEIVED' ? `Lời mời kết bạn từ ${displayName}` : 'Đang chờ phản hồi'}
          </Text>

          <View className="flex-row gap-2">
            {mode === 'RECEIVED' ? (
              <>
                <Button
                  mode="contained"
                  onPress={() => onAccept?.(item.id)}
                  compact
                  className="rounded-md"
                >
                  Chấp nhận
                </Button>
                <Button
                  mode="outlined"
                  onPress={() => onDecline?.(item.id)}
                  compact
                  className="rounded-md"
                >
                  Từ chối
                </Button>
              </>
            ) : (
              <Button
                mode="outlined"
                onPress={() => onCancel?.(item.id)}
                compact
                className="rounded-md"
                textColor={theme.colors.error}
                style={{ borderColor: theme.colors.error }}
              >
                Hủy
              </Button>
            )}
          </View>
        </View>
      </View>
    );
  };

  const AnyFlashList = FlashList as any;
  return (
    <AnyFlashList
      data={requests}
      renderItem={renderItem}
      estimatedItemSize={100}
      keyExtractor={(item: FriendRequest) => item.id}
      refreshing={isRefreshing}
      onRefresh={onRefresh}
      ListEmptyComponent={
        <View className="flex-1 items-center justify-center pt-20">
          <Text className="text-muted-foreground">{mode === 'RECEIVED' ? 'Không có lời mời đã nhận' : 'Không có lời mời đã gửi'}</Text>
        </View>
      }
    />
  );
});

InvitationList.displayName = 'InvitationList';
