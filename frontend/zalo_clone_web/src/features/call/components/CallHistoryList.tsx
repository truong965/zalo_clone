/**
 * CallHistoryList — Call history with infinite scroll and tab-based filters.
 *
 * Tabs: Tất cả | Nhỡ
 * Uses TanStack Query infinite scroll (not the standalone use-infinite-scroll hook).
 *
 * Replaces the mock data in pages/calls.tsx.
 */

import { useRef, useCallback, useEffect, useState } from 'react';
import { Tabs, Spin, Empty, Typography } from 'antd';
import { useCallHistory, useMissedCallCount, useMarkMissedAsViewed } from '../hooks/use-call-history';
import { useCallStore } from '../stores/call.store';
import { CallHistoryItem } from './CallHistoryItem';
import type { CallHistoryStatus, CallType } from '../types';

const { Title } = Typography;

// ============================================================================
// TAB DEFINITIONS
// ============================================================================

interface TabDef {
      key: string;
      label: string;
      status?: CallHistoryStatus;
}

const TABS: TabDef[] = [
      { key: 'all', label: 'Tất cả' },
      { key: 'missed', label: 'Nhỡ', status: 'MISSED' },
];

// ============================================================================
// COMPONENT
// ============================================================================

export function CallHistoryList() {
      const [activeTab, setActiveTab] = useState('all');
      const currentTabDef = TABS.find((t) => t.key === activeTab);
      const statusFilter = currentTabDef?.status;

      const {
            data,
            fetchNextPage,
            hasNextPage,
            isFetchingNextPage,
            isLoading,
            isError,
      } = useCallHistory(statusFilter);

      const { data: missedCount } = useMissedCallCount();
      const { mutate: markViewed } = useMarkMissedAsViewed();

      // ── Mark missed as viewed when switching to missed tab ──────────────
      useEffect(() => {
            if (activeTab === 'missed' && missedCount && missedCount.count > 0) {
                  markViewed();
            }
      }, [activeTab, missedCount, markViewed]);

      // ── Infinite scroll via IntersectionObserver ────────────────────────
      const observerRef = useRef<IntersectionObserver | null>(null);

      const lastItemRef = useCallback(
            (node: HTMLDivElement | null) => {
                  if (isFetchingNextPage) return;

                  if (observerRef.current) {
                        observerRef.current.disconnect();
                  }

                  observerRef.current = new IntersectionObserver(
                        (entries) => {
                              if (entries[0]?.isIntersecting && hasNextPage) {
                                    void fetchNextPage();
                              }
                        },
                        { threshold: 0.1 },
                  );

                  if (node) {
                        observerRef.current.observe(node);
                  }
            },
            [isFetchingNextPage, hasNextPage, fetchNextPage],
      );

      // ── Callback handler ────────────────────────────────────────────────
      const handleCallback = useCallback((_userId: string, _callType: CallType, _conversationId: string | null) => {
            const currentStatus = useCallStore.getState().callStatus;
            if (currentStatus !== 'IDLE') return;

            window.dispatchEvent(
                  new CustomEvent('call:initiate', {
                        detail: {
                              calleeId: _userId,
                              callType: _callType,
                              peerInfo: { displayName: _userId, avatarUrl: null },
                              conversationId: _conversationId,
                        },
                  }),
            );
      }, []);

      // ── Flatten pages ───────────────────────────────────────────────────
      const records = data?.pages.flatMap((page) => page.data) ?? [];

      // ── Tab items with badge ────────────────────────────────────────────
      const tabItems = TABS.map((tab) => ({
            key: tab.key,
            label:
                  tab.key === 'missed' && missedCount && missedCount.count > 0
                        ? `${tab.label} (${missedCount.count})`
                        : tab.label,
      }));

      return (
            <div className="flex h-full flex-col px-4">
                  <div className="flex items-center justify-between px-4 pt-4 pb-2">
                        <Title level={4} className="!mb-0">
                              Cuộc gọi
                        </Title>
                  </div>

                  <Tabs
                        activeKey={activeTab}
                        onChange={setActiveTab}
                        items={tabItems}
                        className="px-4"
                        size="small"
                  />

                  <div className="flex-1 overflow-y-auto">
                        {isLoading && (
                              <div className="flex items-center justify-center py-12">
                                    <Spin />
                              </div>
                        )}

                        {isError && (
                              <div className="px-4 py-8 text-center text-red-500">
                                    Không thể tải lịch sử cuộc gọi
                              </div>
                        )}

                        {!isLoading && !isError && records.length === 0 && (
                              <Empty
                                    description={activeTab === 'missed' ? 'Không có cuộc gọi nhỡ' : 'Chưa có cuộc gọi nào'}
                                    className="py-12"
                              />
                        )}

                        {records.map((record, index) => {
                              const isLast = index === records.length - 1;
                              return (
                                    <div className='px-4'
                                          key={record.id}
                                          ref={isLast ? lastItemRef : undefined}
                                    >
                                          <CallHistoryItem record={record} onCallback={handleCallback} />
                                    </div>
                              );
                        })}

                        {isFetchingNextPage && (
                              <div className="flex items-center justify-center py-4">
                                    <Spin size="small" />
                              </div>
                        )}
                  </div>
            </div>
      );
}
