/**
 * BlockedList — List of users blocked by the current user.
 *
 * Uses `useBlockedList()` (useInfiniteQuery + cursor pagination).
 * Each item shows avatar, name, blocked date, and an "Bỏ chặn" button.
 * Infinite scroll via intersection observer.
 */

import { useCallback } from 'react';
import { Avatar, Button, Spin, Empty, Typography, Popconfirm } from 'antd';
import { StopOutlined } from '@ant-design/icons';
import { useInView } from 'react-intersection-observer';
import { useBlockedList, useUnblockUser } from '../hooks/use-block';
import type { BlockedUserItem } from '@/types/api';

const { Text } = Typography;

function formatBlockedDate(isoDate: string): string {
      const date = new Date(isoDate);
      return date.toLocaleDateString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
      });
}

function BlockedUserCard({
      item,
      onUnblock,
      isUnblocking,
}: {
      item: BlockedUserItem;
      onUnblock: (userId: string) => void;
      isUnblocking: boolean;
}) {
      return (
            <div className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-50">
                  <Avatar
                        size={48}
                        src={item.avatarUrl ?? `https://i.pravatar.cc/150?u=${item.userId}`}
                        className="flex-shrink-0"
                  >
                        {item.displayName?.charAt(0)}
                  </Avatar>

                  <div className="flex-1 min-w-0">
                        <Text strong className="block truncate text-sm">
                              {item.displayName}
                        </Text>
                        <Text type="secondary" className="text-xs">
                              Đã chặn {formatBlockedDate(item.blockedAt)}
                        </Text>
                        {item.reason && (
                              <Text type="secondary" className="text-xs block truncate">
                                    Lý do: {item.reason}
                              </Text>
                        )}
                  </div>

                  <Popconfirm
                        title="Bỏ chặn người dùng?"
                        description={`Bỏ chặn ${item.displayName}?`}
                        onConfirm={() => onUnblock(item.userId)}
                        okText="Bỏ chặn"
                        cancelText="Hủy"
                        okButtonProps={{ danger: true }}
                  >
                        <Button
                              size="small"
                              danger
                              loading={isUnblocking}
                              icon={<StopOutlined />}
                        >
                              Bỏ chặn
                        </Button>
                  </Popconfirm>
            </div>
      );
}

export function BlockedList() {
      const {
            data,
            isLoading,
            isError,
            isFetchingNextPage,
            hasNextPage,
            fetchNextPage,
      } = useBlockedList({ limit: 20 });

      const unblockMutation = useUnblockUser();

      const { ref: loadMoreRef } = useInView({
            threshold: 0.1,
            rootMargin: '200px',
            onChange: (inView) => {
                  if (inView && hasNextPage && !isFetchingNextPage) {
                        void fetchNextPage();
                  }
            },
      });

      const handleUnblock = useCallback(
            (userId: string) => {
                  unblockMutation.mutate(userId);
            },
            [unblockMutation],
      );

      const blockedUsers = (data?.pages ?? []).flatMap((p) => p.data);
      const totalCount = data?.pages[0]?.meta?.total;

      if (isLoading) {
            return (
                  <div className="h-full flex items-center justify-center">
                        <Spin />
                  </div>
            );
      }

      if (isError) {
            return (
                  <div className="h-full flex items-center justify-center">
                        <Empty
                              description={
                                    <Text type="secondary">
                                          Không thể tải danh sách. Vui lòng thử lại.
                                    </Text>
                              }
                        />
                  </div>
            );
      }
      return (
            <div className="h-full flex flex-col">
                  {/* Header */}
                  <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                        <Text className="text-sm text-gray-500">
                              Người dùng bị chặn
                              {totalCount !== undefined && ` (${totalCount})`}
                        </Text>
                  </div>

                  {/* List */}
                  {blockedUsers.length === 0 ? (
                        <div className="flex-1 flex items-center justify-center">
                              <Empty
                                    image={<StopOutlined className="text-5xl text-gray-300" />}
                                    description={
                                          <Text type="secondary">
                                                Bạn chưa chặn người dùng nào
                                          </Text>
                                    }
                              />
                        </div>
                  ) : (
                        <div className="flex-1 overflow-y-auto">
                              {blockedUsers.map((item) => (
                                    <BlockedUserCard
                                          key={item.blockId}
                                          item={item}
                                          onUnblock={handleUnblock}
                                          isUnblocking={
                                                unblockMutation.isPending &&
                                                unblockMutation.variables === item.userId
                                          }
                                    />
                              ))}

                              {/* Infinite scroll sentinel */}
                              {hasNextPage && (
                                    <div ref={loadMoreRef} className="py-4 flex justify-center">
                                          {isFetchingNextPage && <Spin size="small" />}
                                    </div>
                              )}
                        </div>
                  )}
            </div>
      );
}
