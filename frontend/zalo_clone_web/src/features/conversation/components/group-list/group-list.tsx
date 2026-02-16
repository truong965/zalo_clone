/**
 * GroupList — Groups tab content for the Contacts page
 *
 * Features:
 * - Infinite scroll list of user's groups (useUserGroups)
 * - Inline search filter with debounce
 * - "Tạo nhóm" button → opens CreateGroupModal via Zustand store
 * - Empty state when no groups
 * - Virtualized list via @tanstack/react-virtual (replaces manual windowing)
 */

import { useRef, useCallback, useState, useEffect, type ChangeEvent } from 'react';
import { Input, Button, Spin, Empty, Typography } from 'antd';
import { SearchOutlined, PlusOutlined, TeamOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useUserGroups } from '../../hooks/use-conversation-queries';
import { useCreateGroupStore } from '../../stores/create-group.store';
import { GroupListItemCard } from './group-list-item';
import { CreateGroupModal } from '../create-group-modal';

const { Text } = Typography;

const ITEM_HEIGHT = 84;

export function GroupList() {
      const navigate = useNavigate();
      const [search, setSearch] = useState('');
      const [debouncedSearch, setDebouncedSearch] = useState('');
      const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

      const handleSearchChange = useCallback(
            (e: ChangeEvent<HTMLInputElement>) => {
                  const value = e.target.value;
                  setSearch(value);
                  if (debounceRef.current) clearTimeout(debounceRef.current);
                  debounceRef.current = setTimeout(
                        () => setDebouncedSearch(value.trim()),
                        350,
                  );
            },
            [],
      );

      const searchParam = debouncedSearch ? { search: debouncedSearch } : undefined;
      const {
            data,
            isLoading,
            isError,
            refetch,
            isFetchingNextPage,
            hasNextPage,
            fetchNextPage,
      } = useUserGroups(searchParam);

      // Flatten pages into single array
      const groups = data?.pages.flatMap((page) => page.data) ?? [];

      // Include a loader row when there are more pages to fetch
      const totalCount = hasNextPage ? groups.length + 1 : groups.length;

      // Virtualizer (replaces manual windowing — no render-time side-effects)
      const scrollParentRef = useRef<HTMLDivElement | null>(null);
      const virtualizer = useVirtualizer({
            count: totalCount,
            getScrollElement: () => scrollParentRef.current,
            estimateSize: () => ITEM_HEIGHT,
            overscan: 6,
      });

      // Fetch next page via useEffect when the last virtual item is visible
      // (avoids calling fetchNextPage during render → prevents infinite loop)
      const virtualItems = virtualizer.getVirtualItems();
      const lastVirtualItem = virtualItems.at(-1);

      useEffect(() => {
            if (lastVirtualItem == null) return;
            if (lastVirtualItem.index >= groups.length && hasNextPage && !isFetchingNextPage) {
                  void fetchNextPage();
            }
      }, [lastVirtualItem?.index, groups.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

      const openCreateGroup = useCallback(() => {
            useCreateGroupStore.getState().open();
      }, []);

      const handleGroupClick = useCallback(
            (groupId: string) => {
                  navigate(`/chat?conversationId=${groupId}`);
            },
            [navigate],
      );

      const handleGroupCreated = useCallback(
            (conversationId: string) => {
                  navigate(`/chat?conversationId=${conversationId}`);
            },
            [navigate],
      );

      return (
            <div className="h-full flex flex-col">
                  {/* Header */}
                  <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                        <Text className="text-sm text-gray-500">
                              Nhóm{groups.length > 0 ? ` (${groups.length})` : ''}
                        </Text>
                        <Button
                              type="primary"
                              size="small"
                              icon={<PlusOutlined />}
                              onClick={openCreateGroup}
                        >
                              Tạo nhóm
                        </Button>
                  </div>

                  {/* Search */}
                  <div className="px-4 py-2">
                        <Input
                              prefix={<SearchOutlined className="text-gray-400" />}
                              placeholder="Tìm nhóm..."
                              value={search}
                              onChange={handleSearchChange}
                              allowClear
                        />
                  </div>

                  {/* List */}
                  <div className="flex-1 overflow-y-auto" ref={scrollParentRef}>
                        {isError ? (
                              <div className="px-4 py-12 flex flex-col items-center gap-3">
                                    <Text type="danger">Không thể tải danh sách nhóm</Text>
                                    <Button
                                          size="small"
                                          onClick={() => void refetch()}
                                    >
                                          Thử lại
                                    </Button>
                              </div>
                        ) : isLoading ? (
                              <div className="flex items-center justify-center py-12">
                                    <Spin />
                              </div>
                        ) : groups.length === 0 ? (
                              <Empty
                                    image={
                                          <TeamOutlined className="text-5xl text-gray-300" />
                                    }
                                    description={
                                          <div className="space-y-1">
                                                <Text type="secondary">
                                                      {debouncedSearch
                                                            ? 'Không tìm thấy nhóm phù hợp'
                                                            : 'Bạn chưa tham gia nhóm nào'}
                                                </Text>
                                                {!debouncedSearch && (
                                                      <>
                                                            <br />
                                                            <Button
                                                                  type="link"
                                                                  size="small"
                                                                  onClick={openCreateGroup}
                                                            >
                                                                  Tạo nhóm mới
                                                            </Button>
                                                      </>
                                                )}
                                          </div>
                                    }
                                    className="py-12"
                              />
                        ) : (
                              <div
                                    className="relative w-full"
                                    style={{ height: virtualizer.getTotalSize() }}
                              >
                                    {virtualItems.map((virtualRow) => {
                                          const isLoaderRow = virtualRow.index >= groups.length;
                                          const group = groups[virtualRow.index];

                                          return (
                                                <div
                                                      key={virtualRow.key}
                                                      className="absolute left-0 right-0"
                                                      style={{
                                                            transform: `translateY(${virtualRow.start}px)`,
                                                            top: 0,
                                                            height: virtualRow.size,
                                                      }}
                                                >
                                                      {isLoaderRow ? (
                                                            <div className="flex items-center justify-center py-4">
                                                                  <Spin size="small" />
                                                            </div>
                                                      ) : (
                                                            <GroupListItemCard
                                                                  group={group}
                                                                  onClick={handleGroupClick}
                                                            />
                                                      )}
                                                </div>
                                          );
                                    })}
                              </div>
                        )}
                  </div>

                  {/* CreateGroupModal — rendered here to open from Groups tab */}
                  <CreateGroupModal onCreated={handleGroupCreated} />
            </div>
      );
}
