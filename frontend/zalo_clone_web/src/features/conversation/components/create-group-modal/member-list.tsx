/**
 * MemberList — Scrollable list of members with infinite scroll
 *
 * Renders friends (default) or contact search results.
 * Uses useFriendSearch() for unified data source.
 * IntersectionObserver for load-more trigger (same pattern as FriendList).
 */

import { useRef, useCallback } from 'react';
import { Spin, Empty, Typography, Alert } from 'antd';
import { MemberListItem } from './member-list-item';
import { useFriendSearch } from '../../hooks/use-friend-search';
import { useCreateGroupStore } from '../../stores/create-group.store';

const { Text } = Typography;

export function MemberList() {
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
                              message="Nhập đúng số điện thoại"
                              description="Nhập số điện thoại đầy đủ (VD: 0901234567) để tìm người dùng."
                        />
                  </div>
            );
      }

      // Strangers tab with no keyword
      if (searchTab === 'strangers' && !searchKeyword) {
            return (
                  <div className="flex items-center justify-center py-12 text-gray-400">
                        <Text type="secondary">
                              Nhập số điện thoại để tìm người dùng
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
                              message="Không thể tải danh sách"
                              description="Đã xảy ra lỗi khi tải dữ liệu. Vui lòng thử lại."
                              action={
                                    <button
                                          type="button"
                                          className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                                          onClick={() => void refetch()}
                                    >
                                          Thử lại
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
                                          ? 'Không tìm thấy kết quả'
                                          : 'Chưa có bạn bè nào'}
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
