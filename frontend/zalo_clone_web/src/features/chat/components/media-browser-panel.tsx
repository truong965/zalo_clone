/**
 * MediaBrowserPanel — Browse all media in a conversation.
 *
 * Opened from info sidebar "Xem tất cả" button.
 * Two tabs: Ảnh/Video (thumbnail grid) and File (list with search input).
 * Uses cursor-based infinite scroll pagination via useMediaBrowser hook.
 *
 * Rules applied:
 * - architecture-avoid-boolean-props: uses activeTab string to branch display
 * - rendering-conditional-render: ternary for conditional JSX
 */

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Button, Input, Spin, Typography, Empty } from 'antd';
import { ArrowLeftOutlined, SearchOutlined, LoadingOutlined, FileOutlined, PlayCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { groupBy } from 'lodash-es';
import { useMediaBrowser } from '@/features/chat/hooks/use-media-browser';
import type { RecentMediaItem, MessageType } from '@/types/api';

const { Text } = Typography;

// ── Types ────────────────────────────────────────────────────────────────

type MediaTab = 'photos' | 'files';

interface MediaBrowserPanelProps {
      conversationId: string;
      /** Which tab to open initially */
      initialTab?: MediaTab;
      onClose: () => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────

const PHOTO_TYPES: MessageType[] = ['IMAGE', 'VIDEO'];
const FILE_TYPES: MessageType[] = ['FILE'];

function formatFileSize(bytes: number): string {
      if (bytes === 0) return '0 B';
      const units = ['B', 'KB', 'MB', 'GB'];
      const k = 1024;
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      const value = bytes / Math.pow(k, i);
      return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDate(isoDate: string): string {
      const d = dayjs(isoDate);
      const today = dayjs().startOf('day');
      const diff = today.diff(d, 'day');
      if (diff === 0) return 'Hôm nay';
      if (diff === 1) return 'Hôm qua';
      if (diff < 7) return d.format('dddd');
      if (d.year() === today.year()) return d.format('D [tháng] M');
      return d.format('D [tháng] M, YYYY');
}

// ── Sub-components ───────────────────────────────────────────────────────

function PhotoGrid({ items }: { items: RecentMediaItem[] }) {
      return (
            <div className="grid grid-cols-3 gap-1 px-3">
                  {items.map((item) => (
                        <div
                              key={item.mediaId}
                              className="aspect-square bg-gray-100 rounded overflow-hidden cursor-pointer hover:opacity-80 transition-opacity relative"
                        >
                              {item.thumbnailUrl ? (
                                    <>
                                          <img
                                                src={item.thumbnailUrl}
                                                alt={item.originalName}
                                                className="w-full h-full object-cover"
                                                loading="lazy"
                                          />
                                          {item.messageType === 'VIDEO' ? (
                                                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                                      <PlayCircleOutlined className="text-white text-2xl drop-shadow" />
                                                </div>
                                          ) : null}
                                    </>
                              ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                          <div className="w-12 h-12 bg-gray-200 rounded" />
                                    </div>
                              )}
                        </div>
                  ))}
            </div>
      );
}

function FileList({ items }: { items: RecentMediaItem[] }) {
      return (
            <div className="flex flex-col">
                  {items.map((item) => (
                        <div
                              key={item.mediaId}
                              className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer transition-colors"
                        >
                              <div className="w-10 h-10 bg-blue-50 rounded flex items-center justify-center flex-shrink-0">
                                    <FileOutlined className="text-blue-500 text-lg" />
                              </div>
                              <div className="flex-1 min-w-0">
                                    <div className="text-sm text-gray-800 truncate">
                                          {item.originalName}
                                    </div>
                                    <div className="text-[11px] text-gray-400">
                                          {formatFileSize(item.size)} · {dayjs(item.createdAt).format('DD/MM/YYYY')}
                                    </div>
                              </div>
                        </div>
                  ))}
            </div>
      );
}

// ── Main Component ───────────────────────────────────────────────────────

export function MediaBrowserPanel({
      conversationId,
      initialTab = 'photos',
      onClose,
}: MediaBrowserPanelProps) {
      const [activeTab, setActiveTab] = useState<MediaTab>(initialTab);
      const [fileKeyword, setFileKeyword] = useState('');
      const scrollContainerRef = useRef<HTMLDivElement>(null);

      // Queries — only run for the active tab
      const photoQuery = useMediaBrowser(
            activeTab === 'photos' ? conversationId : undefined,
            PHOTO_TYPES,
      );
      const fileQuery = useMediaBrowser(
            activeTab === 'files' ? conversationId : undefined,
            FILE_TYPES,
            fileKeyword.trim() || undefined,
      );

      const activeQuery = activeTab === 'photos' ? photoQuery : fileQuery;

      // Flatten pages into a single array
      const allItems = useMemo(
            () => activeQuery.data?.pages.flatMap((p) => p.items) ?? [],
            [activeQuery.data],
      );

      // Group by date for dividers
      const groupedItems = useMemo(() => {
            const groups = groupBy(allItems, (item) =>
                  dayjs(item.createdAt).format('YYYY-MM-DD'),
            );
            return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
      }, [allItems]);

      // Infinite scroll — load more when near bottom
      const handleScroll = useCallback(() => {
            const el = scrollContainerRef.current;
            if (!el) return;

            const { scrollTop, scrollHeight, clientHeight } = el;
            const nearBottom = scrollHeight - scrollTop - clientHeight < 200;

            if (nearBottom && activeQuery.hasNextPage && !activeQuery.isFetchingNextPage) {
                  activeQuery.fetchNextPage();
            }
      }, [activeQuery]);

      // Reset scroll position when switching tabs
      useEffect(() => {
            scrollContainerRef.current?.scrollTo({ top: 0 });
      }, [activeTab]);

      const isLoading = activeQuery.isLoading;
      const isEmpty = !isLoading && allItems.length === 0;

      return (
            <div className="w-[340px] h-full border-l border-gray-200 bg-white flex flex-col animate-slide-in-right">
                  {/* Header */}
                  <div className="h-16 flex items-center gap-3 px-4 border-b border-gray-200">
                        <Button
                              type="text"
                              size="small"
                              icon={<ArrowLeftOutlined />}
                              onClick={onClose}
                        />
                        <Text strong className="text-base">Kho lưu trữ</Text>
                  </div>

                  {/* Tab bar */}
                  <div className="flex border-b border-gray-200">
                        <button
                              type="button"
                              onClick={() => setActiveTab('photos')}
                              className={`flex-1 py-2.5 text-sm font-medium text-center transition-colors cursor-pointer ${
                                    activeTab === 'photos'
                                          ? 'text-blue-600 border-b-2 border-blue-600'
                                          : 'text-gray-500 hover:text-gray-700'
                              }`}
                        >
                              Ảnh/Video
                        </button>
                        <button
                              type="button"
                              onClick={() => setActiveTab('files')}
                              className={`flex-1 py-2.5 text-sm font-medium text-center transition-colors cursor-pointer ${
                                    activeTab === 'files'
                                          ? 'text-blue-600 border-b-2 border-blue-600'
                                          : 'text-gray-500 hover:text-gray-700'
                              }`}
                        >
                              File
                        </button>
                  </div>

                  {/* File search input — only for files tab */}
                  {activeTab === 'files' ? (
                        <div className="px-3 py-2 border-b border-gray-100">
                              <Input
                                    prefix={<SearchOutlined className="text-gray-400" />}
                                    placeholder="Tìm theo tên file"
                                    value={fileKeyword}
                                    onChange={(e) => setFileKeyword(e.target.value)}
                                    allowClear
                                    size="small"
                                    className="rounded-md"
                              />
                        </div>
                  ) : null}

                  {/* Content area */}
                  <div
                        ref={scrollContainerRef}
                        className="flex-1 overflow-y-auto"
                        onScroll={handleScroll}
                  >
                        {/* Loading */}
                        {isLoading ? (
                              <div className="flex items-center justify-center py-12">
                                    <Spin indicator={<LoadingOutlined spin />} />
                              </div>
                        ) : null}

                        {/* Empty state */}
                        {isEmpty ? (
                              <Empty
                                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                                    description={
                                          activeTab === 'photos'
                                                ? 'Chưa có ảnh/video được chia sẻ'
                                                : fileKeyword.trim()
                                                      ? `Không tìm thấy file "${fileKeyword.trim()}"`
                                                      : 'Chưa có file được chia sẻ'
                                    }
                                    className="mt-12"
                              />
                        ) : null}

                        {/* Results grouped by date */}
                        {!isLoading && allItems.length > 0 ? (
                              <div className="py-2">
                                    {groupedMessages(groupedItems, activeTab)}
                              </div>
                        ) : null}

                        {/* Load more spinner */}
                        {activeQuery.isFetchingNextPage ? (
                              <div className="flex items-center justify-center py-4">
                                    <Spin size="small" />
                              </div>
                        ) : null}
                  </div>
            </div>
      );
}

// ── Render helper ────────────────────────────────────────────────────────

function groupedMessages(
      groups: [string, RecentMediaItem[]][],
      tab: MediaTab,
) {
      return groups.map(([dateKey, items]) => (
            <div key={dateKey}>
                  <div className="px-3 py-1.5">
                        <Text className="text-[11px] text-gray-400 font-medium">
                              {formatDate(dateKey)}
                        </Text>
                  </div>
                  {tab === 'photos' ? (
                        <PhotoGrid items={items} />
                  ) : (
                        <FileList items={items} />
                  )}
            </div>
      ));
}
