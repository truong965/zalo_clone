import { useRouter } from 'expo-router';
import { useState, useCallback } from 'react';
import { View, FlatList, ActivityIndicator, Alert, RefreshControl, StyleSheet } from 'react-native';
import { Appbar, List, Avatar, Button, Text, Divider, useTheme, Surface } from 'react-native-paper';
import Toast from 'react-native-toast-message';
import { useTranslation } from 'react-i18next';
import { useBlockedList, useUnblockUser } from '@/features/contacts/hooks/use-block';
import type { BlockedUser } from '@/types/block';
import { UserAvatar } from '@/components/ui/user-avatar';
import { SearchBar } from '@/components/ui/search-bar';

export default function BlockedListScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const theme = useTheme();

  const [search, setSearch] = useState('');

  const {
    data,
    isLoading,
    isRefetching,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    refetch
  } = useBlockedList({ limit: 20, search: search || undefined });

  const unblockMutation = useUnblockUser();

  const handleUnblock = (user: BlockedUser) => {
    Alert.alert(
      'Bỏ chặn người dùng',
      `Bạn có chắc chắn muốn bỏ chặn "${user.displayName}"?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Bỏ chặn',
          style: 'destructive',
          onPress: () => {
            unblockMutation.mutate(user.userId, {
              onSuccess: () => {
                Toast.show({ type: 'success', text1: 'Thành công', text2: 'Đã bỏ chặn người dùng' });
              }
            });
          }
        }
      ]
    );
  };

  const blockedUsers = data?.pages.flatMap(page => page.data) ?? [];

  const renderItem = ({ item }: { item: BlockedUser }) => (
    <Surface style={styles.itemContainer} elevation={0}>
      <View style={styles.itemLeft}>
        <UserAvatar uri={item.avatarUrl} size={50} />
        <View style={styles.itemInfo}>
          <Text style={styles.itemTitle} numberOfLines={1}>{item.displayName}</Text>
          <Text style={styles.itemDescription}>
            {t('settings.privacy.blockedListBlockedAt', {
              date: new Date(item.blockedAt).toLocaleDateString()
            })}
          </Text>
        </View>
      </View>
      <Button
        mode="outlined"
        onPress={() => handleUnblock(item)}
        compact
        loading={unblockMutation.isPending && unblockMutation.variables === item.userId}
        disabled={unblockMutation.isPending}
        style={styles.unblockButton}
        labelStyle={styles.unblockButtonLabel}
      >
        {t('settings.privacy.unblockBtn')}
      </Button>
    </Surface>
  );

  return (
    <View className="flex-1 bg-background">
      <Appbar.Header style={{ backgroundColor: '#1E88E5' }}>
        <Appbar.BackAction color="white" onPress={() => router.back()} />
        <Appbar.Content title={t('settings.privacy.blockedListTitle')} titleStyle={{ color: 'white' }} />
      </Appbar.Header>

      <View className="p-4 flex-1">
      <SearchBar
        placeholder={t('settings.privacy.blockedListSearchPlaceholder')}
        onChangeText={setSearch}
        value={search}
        containerClass="px-4 py-2"
      />

        {isLoading && !isRefetching ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#1E88E5" />
          </View>
        ) : (
          <FlatList
            data={blockedUsers}
            renderItem={renderItem}
            keyExtractor={item => item.blockId}
            ItemSeparatorComponent={() => <View style={{ height: 1 }} />}
            ListEmptyComponent={() => (
              <View className="flex-1 items-center justify-center py-20">
                <View style={styles.emptyIconContainer}>
                  <Avatar.Icon size={80} icon="account-off-outline" style={{ backgroundColor: '#F3F4F6' }} color="#9CA3AF" />
                </View>
                <Text style={styles.emptyText}>{t('settings.privacy.blockedListEmpty')}</Text>
              </View>
            )}
            onEndReached={() => {
              if (hasNextPage && !isFetchingNextPage) {
                fetchNextPage();
              }
            }}
            onEndReachedThreshold={0.5}
            ListFooterComponent={() =>
              isFetchingNextPage ? (
                <View className="py-4">
                  <ActivityIndicator color={theme.colors.primary} />
                </View>
              ) : null
            }
            refreshControl={
              <RefreshControl
                refreshing={isRefetching}
                onRefresh={refetch}
                colors={[theme.colors.primary]}
              />
            }
            contentContainerStyle={{ paddingBottom: 20 }}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  itemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: 'white',
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  itemInfo: {
    marginLeft: 12,
    flex: 1,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  itemDescription: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  unblockButton: {
    borderRadius: 8,
    borderColor: '#E5E7EB',
  },
  unblockButtonLabel: {
    fontSize: 12,
    marginHorizontal: 8,
  },
  emptyIconContainer: {
    marginBottom: 16,
    opacity: 0.5,
  },
  emptyText: {
    fontSize: 16,
    color: '#9CA3AF',
    textAlign: 'center',
  },
});
