/**
 * FriendRequestList — Tabs "Đã nhận" / "Đã gửi" with accept/decline/cancel actions
 *
 * Uses TanStack Query hooks for server state and Zustand store for badge counts.
 * Each request item renders via FriendCard with action buttons passed as slots.
 */

import { Button, Tabs, Spin, Empty, Badge, Typography } from 'antd';
import {
      CheckOutlined,
      CloseOutlined,
      UndoOutlined,
} from '@ant-design/icons';
import {
      useReceivedRequests,
      useSentRequests,
      useAcceptRequest,
      useDeclineRequest,
      useCancelRequest,
} from '../api/friendship.api';
import { useFriendshipStore, type FriendRequestTab } from '../stores/friendship.store';
import { FriendCard } from './friend-card';
import type { FriendRequestWithUserDto } from '../types';
import { useTranslation } from 'react-i18next';
import { useInView } from 'react-intersection-observer';

const { Text } = Typography;

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ReceivedRequestItem({ request }: { request: FriendRequestWithUserDto }) {
      const accept = useAcceptRequest();
      const decline = useDeclineRequest();
      const { t } = useTranslation();

      const isLoading = accept.isPending || decline.isPending;

      return (
            <FriendCard
                  user={request.requester}
                  subtitle={formatTimeAgo(request.createdAt, t)}
                  actions={
                        <>
                              <Button
                                    type="primary"
                                    size="small"
                                    icon={<CheckOutlined />}
                                    loading={accept.isPending}
                                    disabled={isLoading}
                                    onClick={() => accept.mutate(request.id)}
                              >
                                    {t('contacts.friendRequest.accept')}
                              </Button>
                              <Button
                                    size="small"
                                    icon={<CloseOutlined />}
                                    loading={decline.isPending}
                                    disabled={isLoading}
                                    onClick={() => decline.mutate(request.id)}
                              >
                                    {t('contacts.friendRequest.decline')}
                              </Button>
                        </>
                  }
            />
      );
}

function SentRequestItem({ request }: { request: FriendRequestWithUserDto }) {
      const cancel = useCancelRequest();
      const { t } = useTranslation();

      return (
            <FriendCard
                  user={request.target}
                  subtitle={formatTimeAgo(request.createdAt, t)}
                  actions={
                        <Button
                               size="small"
                               icon={<UndoOutlined />}
                               loading={cancel.isPending}
                               onClick={() => cancel.mutate(request.id)}
                        >
                               {t('contacts.friendRequest.recall')}
                        </Button>
                  }
            />
      );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function FriendRequestList() {
      const activeTab = useFriendshipStore((s) => s.activeTab);
      const setActiveTab = useFriendshipStore((s) => s.setActiveTab);
      const pendingReceivedCount = useFriendshipStore((s) => s.pendingReceivedCount);
      const { t } = useTranslation();

      const received = useReceivedRequests();
      const sent = useSentRequests();

      return (
            <div className="p-3 h-full flex flex-col overflow-hidden">
                  <Tabs
                        activeKey={activeTab}
                        onChange={(key) => setActiveTab(key as FriendRequestTab)}
                        className="px-4 h-full flex flex-col"
                        items={[
                              {
                                    key: 'received',
                                    label: (
                                          <Badge count={pendingReceivedCount} size="small" offset={[8, -2]}>
                                                <span>{t('contacts.friendRequest.tabReceived')}</span>
                                          </Badge>
                                    ),
                                    children: (
                                          <RequestTabContent
                                                data={received.data}
                                                isLoading={received.isLoading}
                                                isFetchingNextPage={received.isFetchingNextPage}
                                                hasNextPage={!!received.hasNextPage}
                                                fetchNextPage={received.fetchNextPage}
                                                emptyText={t('contacts.friendRequest.emptyReceived')}
                                                renderItem={(r) => <ReceivedRequestItem key={r.id} request={r} />}
                                          />
                                    ),
                              },
                              {
                                    key: 'sent',
                                    label: t('contacts.friendRequest.tabSent'),
                                    children: (
                                          <RequestTabContent
                                                data={sent.data}
                                                isLoading={sent.isLoading}
                                                isFetchingNextPage={sent.isFetchingNextPage}
                                                hasNextPage={!!sent.hasNextPage}
                                                fetchNextPage={sent.fetchNextPage}
                                                emptyText={t('contacts.friendRequest.emptySent')}
                                                renderItem={(r) => <SentRequestItem key={r.id} request={r} />}
                                          />
                                    ),
                              },
                        ]}
                  />
            </div>
      );
}

// ---------------------------------------------------------------------------
// Shared tab content wrapper
// ---------------------------------------------------------------------------

function RequestTabContent({
      data,
      isLoading,
      isFetchingNextPage,
      hasNextPage,
      fetchNextPage,
      emptyText,
      renderItem,
}: {
      data: any;
      isLoading: boolean;
      isFetchingNextPage: boolean;
      hasNextPage: boolean;
      fetchNextPage: () => void;
      emptyText: string;
      renderItem: (request: FriendRequestWithUserDto) => React.ReactNode;
}) {
      const { ref: loadMoreRef } = useInView({
            threshold: 0.1,
            rootMargin: '200px',
            onChange: (inView) => {
                  if (inView && hasNextPage && !isFetchingNextPage) {
                        void fetchNextPage();
                  }
            },
      });

      if (isLoading) {
            return (
                  <div className="flex items-center justify-center py-12">
                        <Spin />
                  </div>
            );
      }

      const requests = data?.pages.flatMap((p: any) => p.data) ?? [];

      if (requests.length === 0) {
            return <Empty description={<Text type="secondary">{emptyText}</Text>} className="py-12" />;
      }

      return (
            <div className="h-full overflow-y-auto pb-8">
                  <div className="divide-y divide-gray-100">
                        {requests.map(renderItem)}
                  </div>
                  {hasNextPage && (
                        <div ref={loadMoreRef} className="py-4 flex justify-center">
                              {isFetchingNextPage && <Spin size="small" />}
                        </div>
                  )}
            </div>
      );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimeAgo(dateStr: string, t: any): string {
      const diff = Date.now() - new Date(dateStr).getTime();
      const minutes = Math.floor(diff / 60_000);
      if (minutes < 1) return t('contacts.friendRequest.justNow');
      if (minutes < 60) return t('contacts.friendRequest.minutesAgo', { count: minutes });
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return t('contacts.friendRequest.hoursAgo', { count: hours });
      const days = Math.floor(hours / 24);
      if (days < 30) return t('contacts.friendRequest.daysAgo', { count: days });
      return new Date(dateStr).toLocaleDateString();
}
