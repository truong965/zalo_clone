/**
 * BlockedList — List of users blocked by the current user.
 *
 * Uses `useBlockedList()` (useInfiniteQuery + cursor pagination).
 * Each item shows avatar, name, blocked date, and an "Bỏ chặn" button.
 * Infinite scroll via intersection observer.
 */

import { useCallback, useState } from 'react';
import { Avatar, Button, Spin, Empty, Typography, Popconfirm, Input } from 'antd';
import { StopOutlined, SearchOutlined, UserOutlined } from '@ant-design/icons';
import { useInView } from 'react-intersection-observer';
import { useBlockedList, useUnblockUser } from '../hooks/use-block';
import { useDebounce } from '@/hooks';
import type { BlockedUserItem } from '@/types/api';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;

function formatBlockedDate(isoDate: string): string {
      const date = new Date(isoDate);
      return date.toLocaleDateString(undefined, {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
      });
}

function BlockedUserCard({
      item,
      onUnblock,
      isUnblocking,
      t,
}: {
      item: BlockedUserItem;
      onUnblock: (userId: string) => void;
      isUnblocking: boolean;
      t: any;
}) {
      return (
            <div className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-50">
                  <Avatar
                        size={48}
                        src={item.avatarUrl || undefined}
                        className="flex-shrink-0"
                        icon={<UserOutlined />}
                  />

                  <div className="flex-1 min-w-0">
                        <Text strong className="block truncate text-sm">
                              {item.displayName}
                        </Text>
                        <Text type="secondary" className="text-xs">
                              {t('contacts.blocked.blockedAt', { date: formatBlockedDate(item.blockedAt) })}
                        </Text>
                        {item.reason && (
                              <Text type="secondary" className="text-xs block truncate">
                                    {t('contacts.blocked.reason', { reason: item.reason })}
                              </Text>
                        )}
                  </div>

                  <Popconfirm
                        title={t('contacts.blocked.unblockDesc', { name: item.displayName })}
                        onConfirm={() => onUnblock(item.userId)}
                        okText={t('contacts.blocked.unblockOk')}
                        cancelText={t('contacts.blocked.unblockCancel')}
                        okButtonProps={{ danger: true }}
                  >
                        <Button
                              size="small"
                              danger
                              loading={isUnblocking}
                              icon={<StopOutlined />}
                        >
                              {t('contacts.blocked.unblockBtn')}
                        </Button>
                  </Popconfirm>
            </div>
      );
}

export function BlockedList() {
      const [search, setSearch] = useState('');
      const debouncedSearch = useDebounce(search, 350);
      const { t } = useTranslation();

      const {
            data,
            isLoading,
            isError,
            isFetchingNextPage,
            hasNextPage,
            fetchNextPage,
      } = useBlockedList({ limit: 20, search: debouncedSearch || undefined });

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
                                          {t('contacts.blocked.errorLoad')}
                                    </Text>
                              }
                        />
                  </div>
            );
      }
      return (
            <div className="h-full flex flex-col">
                  {/* Header */}
                  <div className="px-4 py-3 border-b border-gray-100 flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                              <Text className="text-sm text-gray-500">
                                    {t('contacts.blocked.title')}
                                    {totalCount !== undefined && ` (${totalCount})`}
                              </Text>
                        </div>
                        <Input
                              prefix={<SearchOutlined className="text-gray-400" />}
                              placeholder={t('contacts.blocked.searchPlaceholder')}
                              value={search}
                              onChange={(e) => setSearch(e.target.value)}
                              allowClear
                              size="small"
                        />
                  </div>

                  {/* List */}
                  {blockedUsers.length === 0 ? (
                        <div className="flex-1 flex items-center justify-center">
                              <Empty
                                    image={<StopOutlined className="text-5xl text-gray-300" />}
                                    description={
                                          <Text type="secondary">
                                                {t('contacts.blocked.empty')}
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
                                          t={t}
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
