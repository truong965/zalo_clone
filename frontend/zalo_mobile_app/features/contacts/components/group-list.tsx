import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { FlashList } from '@shopify/flash-list';
import { ConversationAvatar } from '@/components/ui/conversation-avatar';
import { Conversation } from '@/types/conversation';
import { useTranslation } from 'react-i18next';

interface GroupListProps {
  groups: Conversation[];
  onPress: (id: string) => void;
  isRefreshing: boolean;
  onRefresh: () => void;
}

export const GroupList = React.memo(({ groups, onPress, isRefreshing, onRefresh }: GroupListProps) => {
  const theme = useTheme();

  const renderItem = ({ item }: { item: Conversation }) => {
    const memberCount = (item as any).memberCount || item.members?.length || 0;
    const displayName = item.name || 'Nhóm chưa đặt tên';

    return (
      <TouchableOpacity
        onPress={() => onPress(item.id)}
        activeOpacity={0.7}
        className="flex-row items-center p-4 bg-background border-b border-border/50"
      >
        <ConversationAvatar conversation={item} size={48} />
        <View className="flex-1 ml-4 justify-center">
          <Text className="text-foreground font-bold text-base" numberOfLines={1}>
            {displayName}
          </Text>
          <Text className="text-muted-foreground text-xs" numberOfLines={1}>
            {memberCount} thành viên
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const AnyFlashList = FlashList as any;
  return (
    <AnyFlashList
      data={groups}
      renderItem={renderItem}
      estimatedItemSize={80}
      keyExtractor={(item: Conversation) => item.id}
      refreshing={isRefreshing}
      onRefresh={onRefresh}
      ListEmptyComponent={
        <View className="flex-1 items-center justify-center pt-20">
          <Text className="text-muted-foreground">Không có nhóm nào</Text>
        </View>
      }
    />
  );
});

GroupList.displayName = 'GroupList';
