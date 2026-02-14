/**
 * FriendList — Infinite-scroll friends list with inline search
 *
 * Uses `useFriendsList()` (useInfiniteQuery + cursor pagination) for data.
 * Each friend renders via FriendCard with "Nhắn tin" / "Hủy kết bạn" actions.
 */

import { useRef, useCallback, useState, type ChangeEvent } from 'react';
import { Input, Button, Spin, Empty, Typography, Popconfirm } from 'antd';
import {
      SearchOutlined,
      MessageOutlined,
      UserDeleteOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useFriendsList, useUnfriend, useFriendCount, friendshipKeys } from '../api/friendship.api';
import { FriendCard } from './friend-card';
import type { FriendWithUserDto } from '../types';
import { useQueryClient } from '@tanstack/react-query';

const { Text } = Typography;

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

      // Infinite scroll via IntersectionObserver
      const observerRef = useRef<IntersectionObserver | null>(null);
      const lastItemRef = useCallback(
            (node: HTMLDivElement | null) => {
                  if (isFetchingNextPage) return;
                  if (observerRef.current) observerRef.current.disconnect();
                  observerRef.current = new IntersectionObserver((entries) => {
                        if (entries[0]?.isIntersecting && hasNextPage) {
                              void fetchNextPage();
                        }
                  });
                  if (node) observerRef.current.observe(node);
            },
            [isFetchingNextPage, hasNextPage, fetchNextPage],
      );

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
                  <div className="flex-1 overflow-y-auto">
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
                              <div className="divide-y divide-gray-100">
                                    {friends.map((friend, index) => {
                                          const isLast = index === friends.length - 1;
                                          return (
                                                <div key={friend.friendshipId} ref={isLast ? lastItemRef : undefined}>
                                                      <FriendItem friend={friend} onMessage={() => navigate(`/chat/new?userId=${friend.userId}`)} />
                                                </div>
                                          );
                                    })}
                              </div>
                        )}

                        {/* Loading more indicator */}
                        {isFetchingNextPage && (
                              <div className="flex items-center justify-center py-4">
                                    <Spin size="small" />
                              </div>
                        )}
                  </div>
            </div>
      );
}

// ---------------------------------------------------------------------------
// FriendItem — individual friend card with actions
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

      const optimisticallyRemoveFriend = useCallback(() => {
            // Invalidate all friends list variants (any search) and count
            void queryClient.invalidateQueries({ queryKey: friendshipKeys.all, exact: false });
            void queryClient.invalidateQueries({ queryKey: friendshipKeys.count() });
      }, [queryClient]);

      return (
            <FriendCard
                  user={{
                        userId: friend.userId,
                        displayName: friend.displayName,
                        avatarUrl: friend.avatarUrl,
                  }}
                  onClick={onMessage}
                  actions={
                        <>
                              <Button
                                    type="primary"
                                    size="small"
                                    icon={<MessageOutlined />}
                                    onClick={onMessage}
                              >
                                    Nhắn tin
                              </Button>
                              <Popconfirm
                                    title="Hủy kết bạn"
                                    description={`Bạn có chắc muốn hủy kết bạn với ${friend.displayName}?`}
                                    okText="Xác nhận"
                                    cancelText="Hủy"
                                    okButtonProps={{ danger: true }}
                                    onConfirm={() =>
                                          unfriend.mutate(friend.userId, {
                                                onSuccess: () => {
                                                      optimisticallyRemoveFriend();
                                                },
                                          })
                                    }
                              >
                                    <Button
                                          size="small"
                                          danger
                                          icon={<UserDeleteOutlined />}
                                          loading={unfriend.isPending}
                                    />
                              </Popconfirm>
                        </>
                  }
            />
      );
}
