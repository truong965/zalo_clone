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
import { ArrowLeftOutlined, SearchOutlined, LoadingOutlined, PlayCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { groupBy } from 'lodash-es';
import { useMediaBrowser } from '@/features/chat/hooks/use-media-browser';
import { MediaPreviewModal } from '@/features/chat/components/media-preview-modal';
import { FileDocumentItem } from './file-document-item';
import type { RecentMediaItem, MessageType } from '@/types/api';
import { useTranslation } from 'react-i18next';
import { MAX_SEARCH_LENGTH } from '@/features/search';

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

function formatDate(isoDate: string, t: any): string {
      const d = dayjs(isoDate);
      const today = dayjs().startOf('day');
      const diff = today.diff(d, 'day');
      if (diff === 0) return t('chat.mediaBrowser.today');
      if (diff === 1) return t('chat.mediaBrowser.yesterday');
      if (diff < 7) return d.format('dddd');
      if (d.year() === today.year()) return d.format('D [tháng] M');
      return d.format('D [tháng] M, YYYY');
}

// ── Sub-components ───────────────────────────────────────────────────────

function PhotoGrid({ items, onItemClick }: { items: RecentMediaItem[]; onItemClick: (item: RecentMediaItem) => void }) {
      return (
            <div className="grid grid-cols-3 gap-1 px-3">
                  {items.map((item) => (
                        <div
                              key={item.mediaId}
                              className="aspect-square bg-gray-100 rounded overflow-hidden cursor-pointer hover:opacity-80 transition-opacity relative"
                              onClick={() => onItemClick(item)}
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
                        <FileDocumentItem
                              key={item.mediaId}
                              originalName={item.originalName}
                              sizeBytes={item.size}
                              createdAt={item.createdAt}
                              cdnUrl={item.cdnUrl}
                              mimeType={item.mimeType}
                        />
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
      const { t } = useTranslation();
      const [activeTab, setActiveTab] = useState<MediaTab>(initialTab);
      const [fileKeyword, setFileKeyword] = useState('');
      const [debouncedFileKeyword, setDebouncedFileKeyword] = useState('');

      // ── Debounce search logic ───────────────────────────────────────────────────
      useEffect(() => {
            const timer = setTimeout(() => {
                  const trimmed = fileKeyword.trim().slice(0, MAX_SEARCH_LENGTH);
                  // Chỉ gọi query khi có 3 ký tự trở lên HOẶC khi xóa trắng
                  if (trimmed.length >= 3 || trimmed.length === 0) {
                        setDebouncedFileKeyword(trimmed);
                  }
            }, 300);

            return () => clearTimeout(timer);
      }, [fileKeyword]);

      const scrollContainerRef = useRef<HTMLDivElement>(null);

      // Media Preview State
      const [previewIndex, setPreviewIndex] = useState(-1);

      // Queries — only run for the active tab
      const photoQuery = useMediaBrowser(
            activeTab === 'photos' ? conversationId : undefined,
            PHOTO_TYPES,
      );
      const fileQuery = useMediaBrowser(
            activeTab === 'files' ? conversationId : undefined,
            FILE_TYPES,
            debouncedFileKeyword || undefined,
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
                        <Text strong className="text-base">{t('chat.mediaBrowser.title')}</Text>
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
                              {t('chat.mediaBrowser.photos')}
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
                              {t('chat.mediaBrowser.files')}
                        </button>
                  </div>

                  {/* File search input — only for files tab */}
                  {activeTab === 'files' ? (
                        <div className="px-3 py-2 border-b border-gray-100">
                              <Input
                                    prefix={<SearchOutlined className="text-gray-400" />}
                                    placeholder={t('chat.mediaBrowser.searchPlaceholder')}
                                    value={fileKeyword}
                                    onChange={(e) => setFileKeyword(e.target.value)}
                                    allowClear
                                    maxLength={MAX_SEARCH_LENGTH}
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
                                                ? t('chat.mediaBrowser.emptyPhotos')
                                                : fileKeyword.trim()
                                                      ? t('chat.mediaBrowser.emptyFilesSearch', { keyword: fileKeyword.trim() })
                                                      : t('chat.mediaBrowser.emptyFiles')
                                    }
                                    className="mt-12"
                              />
                        ) : null}

                        {/* Results grouped by date */}
                        {!isLoading && allItems.length > 0 ? (
                              <div className="py-2">
                                    {groupedMessages(
                                          groupedItems,
                                          activeTab,
                                          (item) => {
                                                const idx = allItems.findIndex((x) => x.mediaId === item.mediaId);
                                                if (idx !== -1) setPreviewIndex(idx);
                                          },
                                          t
                                    )}
                              </div>
                        ) : null}

                        {/* Load more spinner */}
                        {activeQuery.isFetchingNextPage ? (
                              <div className="flex items-center justify-center py-4">
                                    <Spin size="small" />
                              </div>
                        ) : null}
                  </div>

                  <MediaPreviewModal
                        isOpen={previewIndex !== -1}
                        items={allItems}
                        initialIndex={previewIndex}
                        onClose={() => setPreviewIndex(-1)}
                  />
            </div>
      );
}

// ── Render helper ────────────────────────────────────────────────────────

function groupedMessages(
      groups: [string, RecentMediaItem[]][],
      tab: MediaTab,
      onPhotoClick: (item: RecentMediaItem) => void,
      t: any
) {
      return groups.map(([dateKey, items]) => (
            <div key={dateKey}>
                  <div className="px-3 py-1.5">
                        <Text className="text-[11px] text-gray-400 font-medium">
                              {formatDate(dateKey, t)}
                        </Text>
                  </div>
                  {tab === 'photos' ? (
                        <PhotoGrid items={items} onItemClick={onPhotoClick} />
                  ) : (
                        <FileList items={items} />
                  )}
            </div>
      ));
}
