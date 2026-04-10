import React, { useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Text, IconButton, useTheme, Button } from 'react-native-paper';
import { FlashList } from '@shopify/flash-list';
import { UserAvatar } from '@/components/ui/user-avatar';
import { Friend } from '@/types/friendship';
import { ContactResponseDto } from '@/types/contact';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';

interface FriendListProps {
  friends: Friend[];
  suggestions: ContactResponseDto[];
  onCall: (friend: Friend) => void;
  onPress: (friend: any) => void;
  onAddFriend: (userId: string) => void;
  isRefreshing: boolean;
  onRefresh: () => void;
  onEndReached?: () => void;
  onEndReachedSuggestions?: () => void;
  hasNextPage?: boolean;
  hasNextPageSuggestions?: boolean;
  isFetchingNextPage?: boolean;
  isFetchingNextPageSuggestions?: boolean;
}

type ListItem = 
  | { type: 'header'; title: string }
  | { type: 'friend'; data: Friend }
  | { type: 'suggestion'; data: ContactResponseDto };

export const FriendList = React.memo(({ 
  friends, 
  suggestions,
  onCall, 
  onPress, 
  onAddFriend,
  isRefreshing, 
  onRefresh,
  onEndReached,
  onEndReachedSuggestions,
  hasNextPage,
  hasNextPageSuggestions,
  isFetchingNextPage,
  isFetchingNextPageSuggestions
}: FriendListProps) => {
  const theme = useTheme();

  const listData = useMemo(() => {
    const data: ListItem[] = [];
    
    if (suggestions.length > 0) {
      if (friends.length > 0) {
        data.push({ type: 'header', title: 'Gợi ý kết bạn từ danh bạ' });
      }
      suggestions.forEach(s => data.push({ type: 'suggestion', data: s }));
    }
    
    if (friends.length > 0) {
      if (suggestions.length > 0) {
        data.push({ type: 'header', title: 'Danh sách bạn bè' });
      }
      friends.forEach(f => data.push({ type: 'friend', data: f }));
    }
    
    return data;
  }, [friends, suggestions]);

  const renderItem = ({ item }: { item: ListItem }) => {
    if (item.type === 'header') {
      return (
        <View className="px-4 py-2 bg-gray-100">
          <Text className="text-gray-500 font-bold text-xs uppercase tracking-wider">
            {item.title}
          </Text>
        </View>
      );
    }

    if (item.type === 'suggestion') {
      const { data } = item;
      return (
        <TouchableOpacity
          onPress={() => onPress(data)}
          activeOpacity={0.7}
          className="flex-row items-center p-4 bg-background border-b border-border/50"
        >
          <UserAvatar uri={data.avatarUrl} size={48} />
          <View className="flex-1 ml-4 justify-center">
            <View className="flex-row items-center">
              <Text className="text-foreground font-bold text-base mr-2" numberOfLines={1}>
                {data.displayName}
              </Text>
              {data.isMutual && (
                <View className="bg-blue-100 px-1.5 py-0.5 rounded">
                  <Text className="text-primary font-bold" style={{ fontSize: 9 }}>MUTUAL</Text>
                </View>
              )}
            </View>
            <Text className="text-muted-foreground text-xs" numberOfLines={1}>
              {data.phoneBookName ? `Từ danh bạ: ${data.phoneBookName}` : 'Người quen từ danh bạ'}
            </Text>
          </View>
          <Button 
            mode="contained" 
            onPress={() => onAddFriend(data.contactUserId)}
            compact
            style={{ borderRadius: 20 }}
            labelStyle={{ fontSize: 12, fontWeight: 'bold' }}
            buttonColor={theme.colors.primary}
            textColor="white"
          >
            Kết bạn
          </Button>
        </TouchableOpacity>
      );
    }

    const { data } = item;
    const displayName = data.resolvedDisplayName || data.displayName || 'Người dùng';
    return (
      <TouchableOpacity
        onPress={() => onPress(data)}
        activeOpacity={0.7}
        className="flex-row items-center p-4 bg-background border-b border-border/50"
      >
        <UserAvatar uri={data.avatarUrl} size={48} />
        <View className="flex-1 ml-4 justify-center">
          <Text className="text-foreground font-bold text-base" numberOfLines={1}>
            {displayName}
          </Text>
        </View>
        <IconButton
          icon="phone-outline"
          size={24}
          onPress={() => onCall(data)}
          iconColor={theme.colors.primary}
        />
      </TouchableOpacity>
    );
  };

  const AnyFlashList = FlashList as any;
  return (
    <AnyFlashList
      data={listData}
      renderItem={renderItem}
      estimatedItemSize={80}
      keyExtractor={(item: ListItem, index: number) => 
        item.type === 'header' ? `header-${item.title}` : 
        item.type === 'friend' ? `friend-${item.data.friendshipId}` : 
        `suggestion-${item.data.contactUserId}`
      }
      refreshing={isRefreshing}
      onRefresh={onRefresh}
      onEndReached={() => {
        // Simple logic: if we reached the end, fetch more of whatever is currently relevant
        // In a more complex scenario, we'd handle pagination for both lists separately or merge them
        if (hasNextPage && !isFetchingNextPage) {
          onEndReached?.();
        }
        if (hasNextPageSuggestions && !isFetchingNextPageSuggestions) {
          onEndReachedSuggestions?.();
        }
      }}
      onEndReachedThreshold={0.3}
      ListFooterComponent={
        (isFetchingNextPage || isFetchingNextPageSuggestions) ? (
          <View className="py-4">
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : null
      }
      ListEmptyComponent={
        !isRefreshing ? (
          <View className="flex-1 items-center justify-center pt-20">
            <Text className="text-muted-foreground">Danh sách trống</Text>
          </View>
        ) : null
      }
    />
  );
});

FriendList.displayName = 'FriendList';
