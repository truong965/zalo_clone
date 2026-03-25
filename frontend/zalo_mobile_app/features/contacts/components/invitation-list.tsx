import React from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Text, Button, useTheme } from 'react-native-paper';
import { FlashList } from '@shopify/flash-list';
import { UserAvatar } from '@/components/ui/user-avatar';
import { FriendRequest } from '@/types/friendship';
import { useTranslation } from 'react-i18next';
import { UserRelationshipButtons } from '../../friendship/components/user-relationship-buttons';

interface InvitationListProps {
  requests: FriendRequest[];
  search?: string;
  mode: 'RECEIVED' | 'SENT';
  onAccept?: (id: string) => void;
  onDecline?: (id: string) => void;
  onCancel?: (id: string) => void;
  isRefreshing: boolean;
  onRefresh: () => void;
  onEndReached?: () => void;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
}

export const InvitationList = React.memo(({ 
  requests, 
  search,
  mode, 
  onAccept, 
  onDecline, 
  onCancel, 
  isRefreshing, 
  onRefresh,
  onEndReached,
  hasNextPage,
  isFetchingNextPage
}: InvitationListProps) => {
  const theme = useTheme();

  const filteredRequests = React.useMemo(() => {
    if (!search?.trim()) return requests;
    const term = search.toLowerCase().trim();
    return requests.filter(item => {
      const user = mode === 'RECEIVED' ? item.requester : item.target;
      if (!user) return false;
      const name = (user.displayName || '').toLowerCase();
      return name.includes(term);
    });
  }, [requests, search, mode]);

  const renderItem = ({ item }: { item: FriendRequest }) => {
    const user = mode === 'RECEIVED' ? item.requester : item.target;
    if (!user) return null;

    const displayName = user.displayName || 'Người dùng';
    return (
      <View className="flex-row items-center p-4 bg-background border-b border-border/50">
        <UserAvatar uri={user.avatarUrl} size={48} />
        <View className="flex-1 ml-4 justify-center">
          <Text className="text-foreground font-bold text-base" numberOfLines={1}>
            {displayName}
          </Text>
          <Text className="text-muted-foreground text-xs" numberOfLines={1}>
            {mode === 'RECEIVED' ? `Lời mời kết bạn từ ${displayName}` : 'Đang chờ phản hồi'}
          </Text>
        </View>

        <UserRelationshipButtons
          userId={user.userId}
          status="REQUEST"
          direction={mode === 'RECEIVED' ? 'INCOMING' : 'OUTGOING'}
          pendingId={item.id}
          canMessage={false}
          isLoading={isRefreshing}
          onAcceptRequest={onAccept}
          onCancelRequest={onCancel}
          onDeclineRequest={onDecline}
        />
      </View>
    );
  };

  const AnyFlashList = FlashList as any;
  return (
    <AnyFlashList
      data={filteredRequests}
      renderItem={renderItem}
      estimatedItemSize={100}
      keyExtractor={(item: FriendRequest) => item.id}
      refreshing={isRefreshing}
      onRefresh={onRefresh}
      onEndReached={() => {
        if (hasNextPage && !isFetchingNextPage) {
          onEndReached?.();
        }
      }}
      onEndReachedThreshold={0.3}
      ListFooterComponent={
        isFetchingNextPage ? (
          <View className="py-4">
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : null
      }
      ListEmptyComponent={
        <View className="flex-1 items-center justify-center pt-20">
          <Text className="text-muted-foreground">{mode === 'RECEIVED' ? 'Không có lời mời đã nhận' : 'Không có lời mời đã gửi'}</Text>
        </View>
      }
    />
  );
});

InvitationList.displayName = 'InvitationList';
