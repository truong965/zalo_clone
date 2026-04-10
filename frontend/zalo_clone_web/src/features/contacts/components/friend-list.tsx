/**
 * FriendList — Infinite-scroll friends list with inline search
 *
 * Uses `useFriendsList()` (useInfiniteQuery + cursor pagination) for data.
 * Each friend renders via FriendCard + Context Menu Dropdown (Nhắn tin /
 * Đặt tên gợi nhớ / Hủy kết bạn). Virtualized via @tanstack/react-virtual.
 */

import { useRef, useCallback, useState, useEffect, useMemo, type ChangeEvent } from 'react';
import { Input, Button, Spin, Empty, Typography, Dropdown, Popconfirm } from 'antd';
import {
      SearchOutlined,
      MessageOutlined,
      UserDeleteOutlined,
      MoreOutlined,
      EditOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useFriendsList, useUnfriend, useFriendCount, friendshipKeys } from '../api/friendship.api';
import { FriendCard } from './friend-card';
import { AliasEditModal } from './alias-edit-modal';
import type { FriendWithUserDto } from '../types';
import { useQueryClient } from '@tanstack/react-query';
import { conversationService } from '@/features/conversation';
import { useTranslation } from 'react-i18next';
import { handleInteractionError } from '@/utils/interaction-error';
import { MAX_SEARCH_LENGTH } from '@/features/search';

const { Text } = Typography;

const ITEM_HEIGHT = 92;

export function FriendList({
      onNavigateToConversation
}: {
      onNavigateToConversation?: (conversationId: string) => void;
}) {
      const navigate = useNavigate();
      const queryClient = useQueryClient();
      const { t } = useTranslation();
      const [search, setSearch] = useState('');
      const [debouncedSearch, setDebouncedSearch] = useState('');
      const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

      const handleSearchChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
            const value = e.target.value.slice(0, MAX_SEARCH_LENGTH);
            setSearch(value);
            if (debounceRef.current) clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => setDebouncedSearch(value.trim()), 350);
      }, []);

      const friendCount = useFriendCount();
      const searchParams = debouncedSearch ? { search: debouncedSearch } : undefined;

      const {
            data,
            isLoading,
            isFetchingNextPage,
            hasNextPage,
            fetchNextPage,
      } = useFriendsList(searchParams);

      // Flatten pages into single array
      const friends = data?.pages.flatMap((page) => page.data) ?? [];

      // Include a loader row when there are more pages
      const totalCount = hasNextPage ? friends.length + 1 : friends.length;

      // Virtualizer (replaces manual windowing — no render-time side-effects)
      const scrollParentRef = useRef<HTMLDivElement | null>(null);
      const virtualizer = useVirtualizer({
            count: totalCount,
            getScrollElement: () => scrollParentRef.current,
            estimateSize: () => ITEM_HEIGHT,
            overscan: 6,
      });

      // Fetch next page via useEffect when the last virtual item is visible
      const virtualItems = virtualizer.getVirtualItems();
      const lastVirtualItem = virtualItems.at(-1);

      // ── Message navigation ─────────────────────────────────────────────────────
      const [navigatingId, setNavigatingId] = useState<string | null>(null);

      const handleMessage = useCallback(async (userId: string) => {
            if (navigatingId) return;
            setNavigatingId(userId);
            try {
                  const conv = await conversationService.getOrCreateDirectConversation(userId);
                  await queryClient.invalidateQueries({ queryKey: ['conversations'] });
                  if (onNavigateToConversation) {
                        onNavigateToConversation(conv.id);
                  }
            } catch (error) {
                  handleInteractionError(error);
            } finally {
                  setNavigatingId(null);
            }
      }, [navigate, navigatingId, onNavigateToConversation, queryClient]);

      useEffect(() => {
            if (lastVirtualItem == null) return;
            // Trigger fetch when we are 5 items away from the end of loaded list
            if (lastVirtualItem.index >= friends.length - 5 && hasNextPage && !isFetchingNextPage) {
                  void fetchNextPage();
            }
      }, [lastVirtualItem?.index, friends.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

      return (
            <div className="h-full flex flex-col">
                  {/* Header */}
                  <div className="px-4 py-3 border-b border-gray-100">
                        <Text className="text-sm text-gray-500">
                              {t('contacts.friendList.title')} {friendCount.data !== undefined ? `(${friendCount.data})` : ''}
                        </Text>
                  </div>

                  {/* Search */}
                  <div className="px-4 py-2">
                        <Input
                              prefix={<SearchOutlined className="text-gray-400" />}
                              placeholder={t('contacts.friendList.searchPlaceholder')}
                              value={search}
                              onChange={handleSearchChange}
                              allowClear
                              maxLength={MAX_SEARCH_LENGTH}
                        />
                  </div>

                  {/* List */}
                  <div className="flex-1 overflow-y-auto" ref={scrollParentRef}>
                        {isLoading ? (
                              <div className="flex items-center justify-center py-12">
                                    <Spin />
                              </div>
                        ) : friends.length === 0 ? (
                              <Empty
                                    description={
                                          <Text type="secondary">
                                                {debouncedSearch ? t('contacts.friendList.emptySearch') : t('contacts.friendList.empty')}
                                          </Text>
                                    }
                                    className="py-12"
                              />
                        ) : (
                              <div
                                    className="relative w-full"
                                    style={{ height: virtualizer.getTotalSize() }}
                              >
                                    {virtualItems.map((virtualRow) => {
                                          const isLoaderRow = virtualRow.index >= friends.length;
                                          const friend = friends[virtualRow.index];

                                          return (
                                                <div
                                                      key={virtualRow.key}
                                                      className="absolute left-0 right-0"
                                                      style={{
                                                            transform: `translateY(${virtualRow.start}px)`,
                                                            top: 0,
                                                            height: virtualRow.size,
                                                      }}
                                                >
                                                      {isLoaderRow ? (
                                                            <div className="flex items-center justify-center py-4">
                                                                  <Spin size="small" />
                                                            </div>
                                                      ) : (
                                                            <FriendItem
                                                                  friend={friend}
                                                                  loading={navigatingId === friend.userId}
                                                                  onMessage={() => void handleMessage(friend.userId)}
                                                            />
                                                      )}
                                                </div>
                                          );
                                    })}
                              </div>
                        )}
                  </div>
            </div>
      );
}

// ---------------------------------------------------------------------------
// FriendItem — individual friend row: avatar + name + context menu
// ---------------------------------------------------------------------------

function FriendItem({
      friend,
      loading,
      onMessage,
}: {
      friend: FriendWithUserDto;
      loading?: boolean;
      onMessage: () => void;
}) {
      const queryClient = useQueryClient();
      const unfriend = useUnfriend();
      const { t } = useTranslation();
      const [aliasModalOpen, setAliasModalOpen] = useState(false);
      const [unfriendPending, setUnfriendPending] = useState(false);

      const optimisticallyRemoveFriend = useCallback(() => {
            void queryClient.invalidateQueries({ queryKey: friendshipKeys.all, exact: false });
            void queryClient.invalidateQueries({ queryKey: friendshipKeys.count() });
      }, [queryClient]);

      const menuItems = useMemo(() => [
            {
                  key: 'message',
                  label: loading ? t('contacts.friendList.menuOpening') : t('contacts.friendList.menuMessage'),
                  icon: <MessageOutlined />,
                  disabled: loading,
            },
            {
                  key: 'set-alias',
                  label: t('contacts.friendList.menuSetAlias'),
                  icon: <EditOutlined />,
            },
            { type: 'divider' as const },
            {
                  key: 'unfriend',
                  label: <span className="text-red-500">{t('contacts.friendList.menuUnfriend')}</span>,
                  icon: <UserDeleteOutlined className="text-red-500" />,
            },
      ], [loading, t]);

      const handleMenuClick = useCallback(({ key }: { key: string }) => {
            if (key === 'message') onMessage();
            if (key === 'set-alias') setAliasModalOpen(true);
            if (key === 'unfriend') setUnfriendPending(true);
      }, [onMessage]);

      return (
            <>
                  <FriendCard
                        user={{
                              userId: friend.userId,
                              displayName: friend.resolvedDisplayName ?? friend.displayName,
                              avatarUrl: friend.avatarUrl,
                        }}
                        onClick={onMessage}
                        actions={
                              <Popconfirm
                                    title={t('contacts.friendList.unfriendTitle')}
                                    description={t('contacts.friendList.unfriendDesc', { name: friend.resolvedDisplayName ?? friend.displayName })}
                                    open={unfriendPending}
                                    okText={t('contacts.friendList.unfriendOk')}
                                    cancelText={t('contacts.friendList.unfriendCancel')}
                                    okButtonProps={{ danger: true }}
                                    onConfirm={() => {
                                          unfriend.mutate(friend.userId, {
                                                onSuccess: () => {
                                                      optimisticallyRemoveFriend();
                                                      setUnfriendPending(false);
                                                },
                                          });
                                    }}
                                    onCancel={() => setUnfriendPending(false)}
                              >
                                    <Dropdown
                                          menu={{ items: menuItems, onClick: handleMenuClick }}
                                          trigger={['click']}
                                          placement="bottomRight"
                                    >
                                          <Button
                                                icon={<MoreOutlined />}
                                                size="small"
                                                type="text"
                                                className="text-gray-500 hover:bg-gray-100"
                                          />
                                    </Dropdown>
                              </Popconfirm>
                        }
                  />
                  <AliasEditModal
                        open={aliasModalOpen}
                        contactUserId={friend.userId}
                        contactDisplayName={friend.resolvedDisplayName ?? friend.displayName}
                        currentAlias={friend.aliasName ?? null}
                        onClose={() => setAliasModalOpen(false)}
                  />
            </>
      );
}
