/**
 * ChatSearchSidebar — In-conversation search sidebar (right side)
 *
 * Sử dụng useSearch({ conversationId, store: 'conversation' }) để scope
 * search vào conversation hiện tại với store riêng (không conflict với global search).
 *
 * Features:
 * - Keyword search
 * - Date range filter (startDate / endDate)
 * - Click result → scroll to message trong message list
 */

import { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { Avatar, Button, Divider, Input, Select, Spin, Typography, DatePicker } from 'antd';
import { CloseOutlined, SearchOutlined, LoadingOutlined, FilterOutlined, UserOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import { groupBy } from 'lodash-es';
import type { Dayjs } from 'dayjs';
import { useQuery } from '@tanstack/react-query';
import {
      useSearch,
      MessageResult,
      SearchEmpty,
      SearchLoading,
      RealtimeBanner,
} from '@/features/search';
import type { MessageSearchResult } from '@/features/search';
import { conversationService } from '@/features/conversation';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

dayjs.locale('vi');

// ── Constants ────────────────────────────────────────────────────────────

// ── Helpers ──────────────────────────────────────────────────────────────

function formatDateDivider(dateKey: string): string {
      const d = dayjs(dateKey);
      const today = dayjs().startOf('day');
      const diff = today.diff(d, 'day');
      if (diff === 0) return 'Hôm nay';
      if (diff === 1) return 'Hôm qua';
      if (diff < 7) return d.format('dddd');          // e.g. "thứ ba"
      if (d.year() === today.year()) return d.format('D [tháng] M');
      return d.format('D [tháng] M, YYYY');
}

interface ChatSearchSidebarProps {
      /** ID of the conversation to search within */
      conversationId: string;
      /** Pre-fill keyword from global search (auto-triggers search on mount) */
      initialKeyword?: string;
      /** Close sidebar */
      onClose: () => void;
      /** Navigate to a specific message */
      onNavigateToMessage?: (messageId: string) => void;
}

export function ChatSearchSidebar({ conversationId, initialKeyword, onClose, onNavigateToMessage }: ChatSearchSidebarProps) {
      const {
            keyword,
            results,
            status,
            errorMessage,
            pendingMatchCount,
            filters,
            isConnected,
            handleKeywordChange,
            handleResultClick,
            triggerSearch,
            mergeNewMatches,
            setFilters,
            closeSearch,
      } = useSearch({ conversationId, store: 'conversation' });

      // Show filter panel if there are persisted active filters
      const hasActiveFilters = !!(filters.startDate || filters.endDate || filters.fromUserId);
      const [showFilters, setShowFilters] = useState(hasActiveFilters);

      // Clear stale filters from previous session on mount
      // (singleton conversation search store retains filters across mounts)
      const initialFiltersCleared = useRef(false);
      useEffect(() => {
            if (!initialFiltersCleared.current) {
                  initialFiltersCleared.current = true;
                  setFilters({ startDate: undefined, endDate: undefined, fromUserId: undefined });
            }
      // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);

      // Auto-search when initialKeyword is provided AND socket is connected
      // (from global search → conversation search flow)
      const initialKeywordApplied = useRef(false);
      useEffect(() => {
            if (initialKeyword && !initialKeywordApplied.current && isConnected) {
                  initialKeywordApplied.current = true;
                  handleKeywordChange(initialKeyword);
                  triggerSearch(initialKeyword);
            }
      }, [initialKeyword, isConnected, handleKeywordChange, triggerSearch]);

      // Fetch conversation members for sender filter
      const { data: members = [] } = useQuery({
            queryKey: ['conversation-members', conversationId],
            queryFn: () => conversationService.getConversationMembers(conversationId),
            staleTime: 5 * 60 * 1000, // 5 min cache
            enabled: !!conversationId,
      });

      const isLoading = status === 'loading';
      const hasSearched = status === 'success' || status === 'error';
      const messages = results?.messages ?? [];
      const hasResults = messages.length > 0;
      const hasKeyword = keyword.trim().length > 0;

      // Phase I: group results by date for dividers
      const groupedMessages = useMemo(() => {
            const groups = groupBy(messages, (msg) =>
                  dayjs(msg.createdAt).format('YYYY-MM-DD'),
            );
            return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
      }, [messages]);

      const handleClose = useCallback(() => {
            closeSearch();
            onClose();
      }, [closeSearch, onClose]);

      const handleMessageClick = useCallback(
            (msg: MessageSearchResult) => {
                  handleResultClick(msg.id);
                  onNavigateToMessage?.(msg.id);
            },
            [handleResultClick, onNavigateToMessage],
      );

      /**
       * Handle date range change — just update filters.
       * Auto-search effect in use-search.ts handles re-triggering.
       */
      const handleDateRangeChange = useCallback(
            (dates: [Dayjs | null, Dayjs | null] | null) => {
                  const startDate = dates?.[0]?.startOf('day').toISOString() ?? undefined;
                  const endDate = dates?.[1]?.endOf('day').toISOString() ?? undefined;
                  setFilters({ startDate, endDate });
            },
            [setFilters],
      );

      /**
       * Handle sender filter change — just update fromUserId.
       * Auto-search effect in use-search.ts handles re-triggering.
       */
      const handleSenderChange = useCallback(
            (value: string | undefined) => {
                  setFilters({ fromUserId: value });
            },
            [setFilters],
      );

      const handleClearFilters = useCallback(() => {
            setFilters({ startDate: undefined, endDate: undefined, fromUserId: undefined });
      }, [setFilters]);

      return (
            <div className="w-[340px] h-full border-l border-gray-200 bg-white flex flex-col animate-slide-in-right">
                  {/* Header */}
                  <div className="h-16 flex items-center justify-between px-4 border-b border-gray-200">
                        <Title level={5} className="m-0 !text-gray-700">Tìm kiếm trong trò chuyện</Title>
                        <div className="flex items-center gap-1">
                              <Button
                                    type="text"
                                    icon={<FilterOutlined className={hasActiveFilters ? 'text-blue-500' : ''} />}
                                    onClick={() => setShowFilters((v) => !v)}
                                    title="Bộ lọc"
                              />
                              <Button type="text" icon={<CloseOutlined />} onClick={handleClose} />
                        </div>
                  </div>

                  {/* Search Input */}
                  <div className="p-3 border-b border-gray-100">
                        <Input
                              prefix={
                                    isLoading ? (
                                          <Spin indicator={<LoadingOutlined className="text-blue-500" style={{ fontSize: 14 }} spin />} />
                                    ) : (
                                          <SearchOutlined className="text-gray-400" />
                                    )
                              }
                              placeholder="Nhập từ khóa để tìm kiếm"
                              value={keyword}
                              onChange={(e) => handleKeywordChange(e.target.value)}
                              onPressEnter={(e) => triggerSearch((e.target as HTMLInputElement).value)}
                              allowClear
                              className="rounded-md"
                              autoFocus
                        />
                  </div>

                  {/* Filter Bar — collapsible */}
                  {showFilters && (
                        <div className="px-3 py-2.5 border-b border-gray-100 bg-gray-50 space-y-2">
                              <div className="flex items-center justify-between">
                                    <Text className="text-xs text-gray-500 font-medium">Bộ lọc nâng cao</Text>
                                    {hasActiveFilters && (
                                          <Button
                                                type="link"
                                                size="small"
                                                className="text-xs p-0 h-auto"
                                                onClick={handleClearFilters}
                                          >
                                                Xóa bộ lọc
                                          </Button>
                                    )}
                              </div>

                              {/* Date range filter */}
                              <div>
                                    <Text className="text-[11px] text-gray-400 block mb-1">Khoảng thời gian</Text>
                                    <RangePicker
                                          size="small"
                                          className="w-full"
                                          format="DD/MM/YYYY"
                                          placeholder={['Từ ngày', 'Đến ngày']}
                                          value={
                                                filters.startDate || filters.endDate
                                                      ? [
                                                            filters.startDate ? dayjs(filters.startDate) : null,
                                                            filters.endDate ? dayjs(filters.endDate) : null,
                                                      ]
                                                      : null
                                          }
                                          onChange={handleDateRangeChange}
                                          allowClear
                                    />
                              </div>

                              {/* Sender filter */}
                              <div>
                                    <Text className="text-[11px] text-gray-400 block mb-1">Người gửi</Text>
                                    <Select
                                          size="small"
                                          className="w-full"
                                          placeholder="Tất cả thành viên"
                                          value={filters.fromUserId}
                                          onChange={handleSenderChange}
                                          allowClear
                                          showSearch
                                          optionFilterProp="label"
                                          options={members.map((m) => ({
                                                value: m.id,
                                                label: m.displayName,
                                          }))}
                                          optionRender={(option) => {
                                                const member = members.find((m) => m.id === option.value);
                                                return (
                                                      <div className="flex items-center gap-2">
                                                            <Avatar
                                                                  size={20}
                                                                  src={member?.avatarUrl}
                                                                  icon={<UserOutlined />}
                                                            />
                                                            <span className="text-sm truncate">{option.label}</span>
                                                      </div>
                                                );
                                          }}
                                    />
                              </div>
                        </div>
                  )}

                  {/* Results Area */}
                  <div className="flex-1 overflow-y-auto">
                        {/* Error */}
                        {errorMessage && (
                              <div className="px-3 py-2 mx-2 mt-2 bg-red-50 border border-red-200 rounded-lg">
                                    <Text className="text-sm text-red-600">{errorMessage}</Text>
                              </div>
                        )}

                        {/* Realtime banner */}
                        <RealtimeBanner count={pendingMatchCount} onMerge={mergeNewMatches} />

                        {/* Active filters indicator */}
                        {hasActiveFilters && !showFilters && (
                              <div className="px-3 py-1.5 bg-blue-50 border-b border-blue-100">
                                    <Text className="text-[11px] text-blue-600">
                                          🔽 Đang lọc theo {[
                                                (filters.startDate || filters.endDate) && 'thời gian',
                                                filters.fromUserId && 'người gửi',
                                          ].filter(Boolean).join(' và ')}
                                    </Text>
                              </div>
                        )}

                        {/* Loading */}
                        {isLoading && !hasResults && <SearchLoading count={4} />}

                        {/* No results */}
                        {hasSearched && !hasResults && hasKeyword && !isLoading && (
                              <SearchEmpty hasSearched keyword={keyword} />
                        )}

                        {/* Initial state — no keyword and no type filter */}
                        {!hasKeyword && !hasResults && !isLoading && (
                              <div className="flex-1 flex flex-col items-center justify-center text-center mt-10">
                                    <div className="w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center mb-4">
                                          <SearchOutlined className="text-5xl text-blue-300" />
                                    </div>
                                    <Text strong className="block mb-1">Hãy nhập từ khóa để bắt đầu tìm kiếm</Text>
                                    <Text type="secondary">tin nhắn và file trong trò chuyện</Text>
                              </div>
                        )}

                        {/* Results — show when there's an active search */}
                        {hasResults && hasKeyword && (
                              <div className="pb-4">
                                    <div className="px-3 py-1.5">
                                          <Text className="text-[11px] text-gray-400">
                                                {messages.length} kết quả
                                          </Text>
                                    </div>
                                    {groupedMessages.map(([dateKey, group]) => (
                                          <div key={dateKey}>
                                                <Divider className="!my-1">
                                                      <Text className="text-[11px] text-gray-400">
                                                            {formatDateDivider(dateKey)}
                                                      </Text>
                                                </Divider>
                                                {group.map((msg) => (
                                                      <MessageResult
                                                            key={msg.id}
                                                            data={msg}
                                                            hideConversationInfo
                                                            onClick={handleMessageClick}
                                                      />
                                                ))}
                                          </div>
                                    ))}
                              </div>
                        )}
                  </div>
            </div>
      );
}