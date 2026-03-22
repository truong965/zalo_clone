import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text, IconButton, useTheme } from 'react-native-paper';
import { FlashList } from '@shopify/flash-list';
import { UserAvatar } from '@/components/ui/user-avatar';
import { Friend } from '@/types/friendship';
import { useTranslation } from 'react-i18next';

interface FriendListProps {
  friends: Friend[];
  onCall: (friend: Friend) => void;
  onPress: (friend: Friend) => void;
  isRefreshing: boolean;
  onRefresh: () => void;
}

export const FriendList = React.memo(({ friends, onCall, onPress, isRefreshing, onRefresh }: FriendListProps) => {
  const theme = useTheme();

  const renderItem = ({ item }: { item: Friend }) => {
    const displayName = item.displayName || item.user?.displayName || 'Người dùng';
    return (
      <TouchableOpacity
        onPress={() => onPress(item)}
        activeOpacity={0.7}
        className="flex-row items-center p-4 bg-background border-b border-border/50"
      >
        <UserAvatar uri={item.avatarUrl || item.user?.avatarUrl} size={48} />
        <View className="flex-1 ml-4 justify-center">
          <Text className="text-foreground font-bold text-base" numberOfLines={1}>
            {displayName}
          </Text>
        </View>
        <IconButton
          icon="phone-outline"
          size={24}
          onPress={() => onCall(item)}
          iconColor={theme.colors.primary}
        />
      </TouchableOpacity>
    );
  };

  const AnyFlashList = FlashList as any;
  return (
    <AnyFlashList
      data={friends}
      renderItem={renderItem}
      estimatedItemSize={80}
      keyExtractor={(item: Friend) => item.id}
      refreshing={isRefreshing}
      onRefresh={onRefresh}
      ListEmptyComponent={
        <View className="flex-1 items-center justify-center pt-20">
          <Text className="text-muted-foreground">Danh sách bạn bè trống</Text>
        </View>
      }
    />
  );
});

FriendList.displayName = 'FriendList';
