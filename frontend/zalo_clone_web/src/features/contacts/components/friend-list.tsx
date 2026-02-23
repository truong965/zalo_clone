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

const { Text } = Typography;

const ITEM_HEIGHT = 92;

export function FriendList() {
      const navigate = useNavigate();
      const [search, setSearch] = useState('');
      const [debouncedSearch, setDebouncedSearch] = useState('');
      const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

      const handleSearchChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
            const value = e.target.value;
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

      useEffect(() => {
            if (lastVirtualItem == null) return;
            if (lastVirtualItem.index >= friends.length && hasNextPage && !isFetchingNextPage) {
                  void fetchNextPage();
            }
      }, [lastVirtualItem?.index, friends.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

      return (
            <div className="h-full flex flex-col">
                  {/* Header */}
                  <div className="px-4 py-3 border-b border-gray-100">
                        <Text className="text-sm text-gray-500">
                              Bạn bè {friendCount.data !== undefined ? `(${friendCount.data})` : ''}
                        </Text>
                  </div>

                  {/* Search */}
                  <div className="px-4 py-2">
                        <Input
                              prefix={<SearchOutlined className="text-gray-400" />}
                              placeholder="Tìm bạn bè..."
                              value={search}
                              onChange={handleSearchChange}
                              allowClear
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
                                                {debouncedSearch ? 'Không tìm thấy bạn bè phù hợp' : 'Chưa có bạn bè nào'}
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
                                                                  onMessage={() =>
                                                                        navigate(`/chat/new?userId=${friend.userId}`)
                                                                  }
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
      onMessage,
}: {
      friend: FriendWithUserDto;
      onMessage: () => void;
}) {
      const queryClient = useQueryClient();
      const unfriend = useUnfriend();
      const [aliasModalOpen, setAliasModalOpen] = useState(false);
      const [unfriendPending, setUnfriendPending] = useState(false);

      const optimisticallyRemoveFriend = useCallback(() => {
            void queryClient.invalidateQueries({ queryKey: friendshipKeys.all, exact: false });
            void queryClient.invalidateQueries({ queryKey: friendshipKeys.count() });
      }, [queryClient]);

      const menuItems = useMemo(() => [
            {
                  key: 'message',
                  label: 'Nhắn tin',
                  icon: <MessageOutlined />,
            },
            {
                  key: 'set-alias',
                  label: 'Đặt tên gợi nhớ',
                  icon: <EditOutlined />,
            },
            { type: 'divider' as const },
            {
                  key: 'unfriend',
                  label: <span className="text-red-500">Hủy kết bạn</span>,
                  icon: <UserDeleteOutlined className="text-red-500" />,
            },
      ], []);

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
                                    title="Hủy kết bạn"
                                    description={`Xác nhận hủy kết bạn với ${friend.resolvedDisplayName ?? friend.displayName}?`}
                                    open={unfriendPending}
                                    okText="Xác nhận"
                                    cancelText="Hủy"
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
