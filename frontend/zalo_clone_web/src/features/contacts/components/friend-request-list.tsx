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

const { Text } = Typography;

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ReceivedRequestItem({ request }: { request: FriendRequestWithUserDto }) {
      const accept = useAcceptRequest();
      const decline = useDeclineRequest();

      const isLoading = accept.isPending || decline.isPending;

      return (
            <FriendCard
                  user={request.requester}
                  subtitle={formatTimeAgo(request.createdAt)}
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
                                    Chấp nhận
                              </Button>
                              <Button
                                    size="small"
                                    icon={<CloseOutlined />}
                                    loading={decline.isPending}
                                    disabled={isLoading}
                                    onClick={() => decline.mutate(request.id)}
                              >
                                    Từ chối
                              </Button>
                        </>
                  }
            />
      );
}

function SentRequestItem({ request }: { request: FriendRequestWithUserDto }) {
      const cancel = useCancelRequest();

      return (
            <FriendCard
                  user={request.target}
                  subtitle={formatTimeAgo(request.createdAt)}
                  actions={
                        <Button
                              size="small"
                              icon={<UndoOutlined />}
                              loading={cancel.isPending}
                              onClick={() => cancel.mutate(request.id)}
                        >
                              Thu hồi
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

      const received = useReceivedRequests();
      const sent = useSentRequests();

      return (
            <div className="p-3 h-full flex flex-col">
                  <Tabs
                        activeKey={activeTab}
                        onChange={(key) => setActiveTab(key as FriendRequestTab)}
                        className="px-4"
                        items={[
                              {
                                    key: 'received',
                                    label: (
                                          <Badge count={pendingReceivedCount} size="small" offset={[8, -2]}>
                                                <span>Đã nhận</span>
                                          </Badge>
                                    ),
                                    children: (
                                          <RequestTabContent
                                                data={received.data}
                                                isLoading={received.isLoading}
                                                emptyText="Không có lời mời nào"
                                                renderItem={(r) => <ReceivedRequestItem key={r.id} request={r} />}
                                          />
                                    ),
                              },
                              {
                                    key: 'sent',
                                    label: 'Đã gửi',
                                    children: (
                                          <RequestTabContent
                                                data={sent.data}
                                                isLoading={sent.isLoading}
                                                emptyText="Bạn chưa gửi lời mời nào"
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
      emptyText,
      renderItem,
}: {
      data: FriendRequestWithUserDto[] | undefined;
      isLoading: boolean;
      emptyText: string;
      renderItem: (request: FriendRequestWithUserDto) => React.ReactNode;
}) {
      if (isLoading) {
            return (
                  <div className="flex items-center justify-center py-12">
                        <Spin />
                  </div>
            );
      }

      if (!data || data.length === 0) {
            return <Empty description={<Text type="secondary">{emptyText}</Text>} className="py-12" />;
      }

      return <div className="divide-y divide-gray-100">{data.map(renderItem)}</div>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimeAgo(dateStr: string): string {
      const diff = Date.now() - new Date(dateStr).getTime();
      const minutes = Math.floor(diff / 60_000);
      if (minutes < 1) return 'Vừa xong';
      if (minutes < 60) return `${minutes} phút trước`;
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return `${hours} giờ trước`;
      const days = Math.floor(hours / 24);
      if (days < 30) return `${days} ngày trước`;
      return new Date(dateStr).toLocaleDateString('vi-VN');
}
