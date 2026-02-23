/**
 * ContactList — Virtualized infinite-scroll list of phone-book contacts.
 *
 * Reuses the same virtualizer pattern as FriendList.
 * Each row shows FriendCard (reused) with a Context Menu:
 *   - Nhắn tin     → navigate to chat
 *   - Đổi tên gợi nhớ → AliasEditModal
 *   - Xoá khỏi danh bạ → Popconfirm + removeContact mutation
 *
 * A single shared AliasEditModal instance is used (controlled by
 * `selectedForAlias` state) to avoid mounting N modals in the virtual list.
 */

import {
      useRef,
      useCallback,
      useState,
      useEffect,
      useMemo,
      type ChangeEvent,
} from 'react';
import {
      Input,
      Button,
      Spin,
      Empty,
      Typography,
      Dropdown,
      Popconfirm,
      Tag,
} from 'antd';
import {
      SearchOutlined,
      MoreOutlined,
      MessageOutlined,
      EditOutlined,
      DeleteOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useContactsList, useRemoveContact } from '../hooks/use-contacts-list';
import { FriendCard } from './friend-card';
import { AliasEditModal } from './alias-edit-modal';
import type { ContactResponseDto } from '../types/contact.types';

const { Text } = Typography;

const ITEM_HEIGHT = 92;

// ============================================================================
// ContactList
// ============================================================================

export function ContactList() {
      const navigate = useNavigate();

      // ── Search ─────────────────────────────────────────────────────────────────
      const [search, setSearch] = useState('');
      const [debouncedSearch, setDebouncedSearch] = useState('');
      const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

      const handleSearchChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
            const value = e.target.value;
            setSearch(value);
            if (debounceRef.current) clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => setDebouncedSearch(value.trim()), 350);
      }, []);

      // ── Data ───────────────────────────────────────────────────────────────────
      const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } =
            useContactsList({ search: debouncedSearch || undefined, excludeFriends: true });

      const contacts = data?.pages.flatMap((p) => p.data) ?? [];
      const totalCount = hasNextPage ? contacts.length + 1 : contacts.length;

      // ── Virtualizer ────────────────────────────────────────────────────────────
      const scrollParentRef = useRef<HTMLDivElement | null>(null);
      const virtualizer = useVirtualizer({
            count: totalCount,
            getScrollElement: () => scrollParentRef.current,
            estimateSize: () => ITEM_HEIGHT,
            overscan: 6,
      });

      const virtualItems = virtualizer.getVirtualItems();
      const lastVirtualItem = virtualItems.at(-1);

      useEffect(() => {
            if (lastVirtualItem == null) return;
            if (
                  lastVirtualItem.index >= contacts.length &&
                  hasNextPage &&
                  !isFetchingNextPage
            ) {
                  void fetchNextPage();
            }
      }, [lastVirtualItem?.index, contacts.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

      // ── Shared alias modal (single instance for the whole virtual list) ────────
      const [selectedForAlias, setSelectedForAlias] =
            useState<ContactResponseDto | null>(null);

      const handleCloseAlias = useCallback(() => setSelectedForAlias(null), []);

      // ── Render ─────────────────────────────────────────────────────────────────
      return (
            <div className="h-full flex flex-col">
                  {/* Header */}
                  <div className="px-4 py-3 border-b border-gray-100">
                        <Text className="text-sm text-gray-500">Gợi ý kết bạn từ danh bạ</Text>
                  </div>

                  {/* Search */}
                  <div className="px-4 py-2">
                        <Input
                              prefix={<SearchOutlined className="text-gray-400" />}
                              placeholder="Tìm trong danh bạ..."
                              value={search}
                              onChange={handleSearchChange}
                              allowClear
                        />
                  </div>

                  {/* List */}
                  <div className="flex-1 overflow-y-auto" ref={scrollParentRef}>
                        {isLoading ? (
                              <div className="flex items-center justify-center py-12">
                                    <Spin />
                              </div>
                        ) : contacts.length === 0 ? (
                              <Empty
                                    description={
                                          <Text type="secondary">
                                                {debouncedSearch
                                                      ? 'Không tìm thấy liên hệ phù hợp'
                                                      : 'Chưa có liên hệ nào trong danh bạ'}
                                          </Text>
                                    }
                                    className="py-12"
                              />
                        ) : (
                              <div
                                    className="relative w-full"
                                    style={{ height: virtualizer.getTotalSize() }}
                              >
                                    {virtualItems.map((virtualRow) => {
                                          const isLoaderRow = virtualRow.index >= contacts.length;
                                          const contact = contacts[virtualRow.index];

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
                                                            <ContactItem
                                                                  contact={contact}
                                                                  onMessage={() =>
                                                                        navigate(`/chat/new?userId=${contact.contactUserId}`)
                                                                  }
                                                                  onSetAlias={() => setSelectedForAlias(contact)}
                                                            />
                                                      )}
                                                </div>
                                          );
                                    })}
                              </div>
                        )}
                  </div>

                  {/* Shared AliasEditModal — mounted once outside the virtual list */}
                  <AliasEditModal
                        open={selectedForAlias !== null}
                        contactUserId={selectedForAlias?.contactUserId ?? ''}
                        contactDisplayName={selectedForAlias?.displayName ?? ''}
                        currentAlias={selectedForAlias?.aliasName ?? null}
                        onClose={handleCloseAlias}
                  />
            </div>
      );
}

// ============================================================================
// ContactItem — individual row
// ============================================================================

function ContactItem({
      contact,
      onMessage,
      onSetAlias,
}: {
      contact: ContactResponseDto;
      onMessage: () => void;
      onSetAlias: () => void;
}) {
      const removeContact = useRemoveContact();
      const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);

      const menuItems = useMemo(() => [
            {
                  key: 'message',
                  label: 'Nhắn tin',
                  icon: <MessageOutlined />,
            },
            {
                  key: 'set-alias',
                  label: contact.aliasName ? 'Đổi tên gợi nhớ' : 'Đặt tên gợi nhớ',
                  icon: <EditOutlined />,
            },
            { type: 'divider' as const },
            {
                  key: 'remove',
                  label: <span className="text-red-500">Xoá khỏi danh bạ</span>,
                  icon: <DeleteOutlined className="text-red-500" />,
            },
      ], [contact.aliasName]);

      const handleMenuClick = useCallback(({ key }: { key: string }) => {
            if (key === 'message') onMessage();
            if (key === 'set-alias') onSetAlias();
            if (key === 'remove') setRemoveConfirmOpen(true);
      }, [onMessage, onSetAlias]);

      // Subtitle: show alias hint or phone book source
      const subtitle = useMemo(() => {
            if (contact.aliasName && contact.aliasName !== contact.phoneBookName) {
                  return `Tên gợi nhớ: ${contact.aliasName}`;
            }
            return undefined;
      }, [contact.aliasName, contact.phoneBookName]);

      return (
            <FriendCard
                  user={{
                        userId: contact.contactUserId,
                        displayName: contact.displayName,
                        avatarUrl: contact.avatarUrl ?? undefined,
                  }}
                  subtitle={subtitle}
                  onClick={onMessage}
                  extra={
                        contact.source === 'PHONE_SYNC' ? (
                              <Tag color="blue" className="mt-0.5 text-xs">Từ danh bạ</Tag>
                        ) : undefined
                  }
                  actions={
                        <Popconfirm
                              title="Xoá khỏi danh bạ"
                              description={`Xoá ${contact.displayName} khỏi danh bạ?`}
                              open={removeConfirmOpen}
                              okText="Xoá"
                              cancelText="Huỷ"
                              okButtonProps={{ danger: true }}
                              onConfirm={() => {
                                    removeContact.mutate(contact.contactUserId, {
                                          onSuccess: () => setRemoveConfirmOpen(false),
                                    });
                              }}
                              onCancel={() => setRemoveConfirmOpen(false)}
                        >
                              <Dropdown
                                    menu={{ items: menuItems, onClick: handleMenuClick }}
                                    trigger={['click']}
                                    placement="bottomRight"
                              >
                                    <Button
                                          icon={<MoreOutlined />}
                                          size="small"
                                          type="text"
                                          className="text-gray-500 hover:bg-gray-100"
                                    />
                              </Dropdown>
                        </Popconfirm>
                  }
            />
      );
}
