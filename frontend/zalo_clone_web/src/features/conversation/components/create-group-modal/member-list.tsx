/**
 * MemberList — Scrollable list of members with infinite scroll
 *
 * Renders friends (default) or contact search results.
 * Uses useFriendSearch() for unified data source.
 * IntersectionObserver for load-more trigger (same pattern as FriendList).
 */

import { useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Spin, Empty, Typography, Alert } from 'antd';
import { MemberListItem } from './member-list-item';
import { useFriendSearch } from '../../hooks/use-friend-search';
import { useCreateGroupStore } from '../../stores/create-group.store';

const { Text } = Typography;

export function MemberList() {
      const { t } = useTranslation();
      const searchTab = useCreateGroupStore((s) => s.searchTab);
      const searchKeyword = useCreateGroupStore((s) => s.searchKeyword);

      const {
            items,
            isLoading,
            isError,
            refetch,
            isFetchingNextPage,
            hasNextPage,
            fetchNextPage,
            showPhoneHint,
      } = useFriendSearch();

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

      // Phone format hint for strangers tab
      if (showPhoneHint) {
            return (
                  <div className="px-4 py-6">
                        <Alert
                              type="info"
                              showIcon
                              message={t('conversation.createGroupModal.memberList.phoneInputPrompt')}
                              description={t('conversation.createGroupModal.memberList.phoneFormatHint')}
                        />
                  </div>
            );
      }

      // Strangers tab with no keyword
      if (searchTab === 'strangers' && !searchKeyword) {
            return (
                  <div className="flex items-center justify-center py-12 text-gray-400">
                        <Text type="secondary">
                              {t('conversation.createGroupModal.memberList.phoneInputPrompt')}
                        </Text>
                  </div>
            );
      }

      // Loading state
      if (isLoading) {
            return (
                  <div className="flex items-center justify-center py-12">
                        <Spin />
                  </div>
            );
      }

      // Error state
      if (isError) {
            return (
                  <div className="px-4 py-6">
                        <Alert
                              type="error"
                              showIcon
                              message={t('conversation.createGroupModal.memberList.loadError')}
                              description={t('conversation.createGroupModal.memberList.loadErrorDesc')}
                              action={
                                    <button
                                          type="button"
                                          className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                                          onClick={() => void refetch()}
                                    >
                                          {t('conversation.createGroupModal.memberList.retryButton')}
                                    </button>
                              }
                        />
                  </div>
            );
      }

      // Empty state
      if (items.length === 0) {
            return (
                  <Empty
                        description={
                              <Text type="secondary">
                                    {searchKeyword
                                          ? t('conversation.createGroupModal.memberList.noSearchResults')
                                          : t('conversation.createGroupModal.memberList.noFriends')}
                              </Text>
                        }
                        className="py-8"
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                  />
            );
      }

      return (
            <div className="flex-1 overflow-y-auto">
                  {items.map((item, index) => {
                        const isLast = index === items.length - 1;
                        return (
                              <div
                                    key={item.id}
                                    ref={isLast ? lastItemRef : undefined}
                              >
                                    <MemberListItem
                                          id={item.id}
                                          displayName={item.displayName}
                                          avatarUrl={item.avatarUrl}
                                          subtitle={item.subtitle}
                                          disabled={item.disabled}
                                          disabledReason={item.disabledReason}
                                    />
                              </div>
                        );
                  })}

                  {/* Loading more indicator */}
                  {isFetchingNextPage ? (
                        <div className="flex items-center justify-center py-3">
                              <Spin size="small" />
                        </div>
                  ) : null}
            </div>
      );
}
