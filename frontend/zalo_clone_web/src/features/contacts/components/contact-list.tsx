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

import { useTranslation } from 'react-i18next';
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
      EditOutlined,
      DeleteOutlined,
      UserAddOutlined,
} from '@ant-design/icons';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useContactsList, useRemoveContact } from '../hooks/use-contacts-list';
import { useSendFriendRequest } from '../api/friendship.api';
import { FriendCard } from './friend-card';
import { AliasEditModal } from './alias-edit-modal';
import type { ContactResponseDto } from '../types/contact.types';
import { conversationApi } from '@/features/conversation';
import { handleInteractionError } from '@/utils/interaction-error';
import { useQueryClient } from '@tanstack/react-query';
import { MAX_SEARCH_LENGTH } from '@/features/search';

const { Text } = Typography;

const ITEM_HEIGHT = 92;
const HEADER_HEIGHT = 42;

// ============================================================================
// Types for Flattened List
// ============================================================================

type ListRow =
      | { type: 'header'; label: string; id: string }
      | { type: 'contact'; data: ContactResponseDto }
      | { type: 'loader'; id: string };

// ============================================================================
// ContactList
// ============================================================================

export function ContactList({
      onNavigateToConversation
}: {
      onNavigateToConversation?: (conversationId: string) => void;
}) {
      const { t } = useTranslation();
      const queryClient = useQueryClient();

      // ── Search ─────────────────────────────────────────────────────────────────
      const [search, setSearch] = useState('');
      const [debouncedSearch, setDebouncedSearch] = useState('');
      const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

      const handleSearchChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
            const value = e.target.value.slice(0, MAX_SEARCH_LENGTH);
            setSearch(value);
            if (debounceRef.current) clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => setDebouncedSearch(value.trim()), 350);
      }, []);

      // ── Data ───────────────────────────────────────────────────────────────────
      const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } =
            useContactsList({ search: debouncedSearch || undefined, excludeFriends: true });

      const rawContacts = useMemo(() => data?.pages.flatMap((p) => p.data) ?? [], [data]);

      // Flatten logic with grouping
      const listData = useMemo(() => {
            const suggestions = rawContacts.filter((c) => c.isMutual);
            const others = rawContacts.filter((c) => !c.isMutual);

            const result: ListRow[] = [];

            if (suggestions.length > 0) {
                  result.push({ type: 'header', label: 'Gợi ý kết bạn từ danh bạ', id: 'header-suggestions' });
                  suggestions.forEach((c) => result.push({ type: 'contact', data: c }));
            }

            if (others.length > 0) {
                  result.push({ type: 'header', label: 'Danh sách liên lạc', id: 'header-others' });
                  others.forEach((c) => result.push({ type: 'contact', data: c }));
            }

            if (hasNextPage) {
                  result.push({ type: 'loader', id: 'loader-bottom' });
            }

            return result;
      }, [rawContacts, hasNextPage]);

      // ── Virtualizer ────────────────────────────────────────────────────────────
      const scrollParentRef = useRef<HTMLDivElement | null>(null);
      const virtualizer = useVirtualizer({
            count: listData.length,
            getScrollElement: () => scrollParentRef.current,
            estimateSize: (index) => {
                  const item = listData[index];
                  return item?.type === 'header' ? HEADER_HEIGHT : ITEM_HEIGHT;
            },
            overscan: 6,
      });

      const virtualItems = virtualizer.getVirtualItems();
      const lastVirtualItem = virtualItems.at(-1);

      useEffect(() => {
            if (lastVirtualItem == null) return;
            // Trigger fetch when we are near the bottom of the list
            if (
                  lastVirtualItem.index >= listData.length - 3 &&
                  hasNextPage &&
                  !isFetchingNextPage
            ) {
                  void fetchNextPage();
            }
      }, [lastVirtualItem?.index, listData.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

      // ── Shared alias modal (single instance for the whole virtual list) ────────
      const [selectedForAlias, setSelectedForAlias] =
            useState<ContactResponseDto | null>(null);

      const handleCloseAlias = useCallback(() => setSelectedForAlias(null), []);

      // ── Message navigation ─────────────────────────────────────────────────────
      const [navigatingId, setNavigatingId] = useState<string | null>(null);

      const handleMessage = useCallback(async (contact: ContactResponseDto) => {
            if (navigatingId) return;
            setNavigatingId(contact.contactUserId);
            try {
                  const conv = await conversationApi.getOrCreateDirectConversation(contact.contactUserId);
                  await queryClient.invalidateQueries({ queryKey: ['conversations'] });
                  if (onNavigateToConversation) {
                        onNavigateToConversation(conv.id);
                  }
            } catch (error) {
                  handleInteractionError(error, {
                        target: {
                              userId: contact.contactUserId,
                              displayName: contact.displayName,
                              avatarUrl: contact.avatarUrl ?? undefined,
                        },
                  });

            } finally {
                  setNavigatingId(null);
            }
      }, [navigatingId, onNavigateToConversation, queryClient]);

      // ── Render ─────────────────────────────────────────────────────────────────
      return (
            <div className="h-full flex flex-col">
                  {/* Header */}
                  <div className="px-4 py-3 border-b border-gray-100">
                        <Text className="text-sm text-gray-500">{t('contacts.contactList.header')}</Text>
                  </div>

                  {/* Search */}
                  <div className="px-4 py-2">
                        <Input
                              prefix={<SearchOutlined className="text-gray-400" />}
                              placeholder={t('contacts.contactList.searchPlaceholder')}
                              value={search}
                              onChange={handleSearchChange}
                              allowClear
                              maxLength={MAX_SEARCH_LENGTH}
                        />
                  </div>

                  {/* List */}
                  <div className="flex-1 overflow-y-auto" ref={scrollParentRef}>
                        {isLoading ? (
                              <div className="flex items-center justify-center py-12">
                                    <Spin />
                              </div>
                        ) : listData.length === 0 ? (
                              <Empty
                                    description={
                                          <Text type="secondary">
                                                {debouncedSearch
                                                      ? t('contacts.contactList.noSearchResults')
                                                      : t('contacts.contactList.noContacts')}
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
                                          const row = listData[virtualRow.index];
                                          if (!row) return null;

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
                                                      {row.type === 'header' && (
                                                            <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 sticky top-0 z-10 h-full flex items-center">
                                                                  <Text type="secondary" className="text-[11px] font-bold uppercase tracking-wider">
                                                                        {row.label}
                                                                  </Text>
                                                            </div>
                                                      )}
                                                      {row.type === 'contact' && (
                                                            <ContactItem
                                                                  contact={row.data}
                                                                  loading={navigatingId === row.data.contactUserId}
                                                                  onMessage={() => void handleMessage(row.data)}
                                                                  onSetAlias={() => setSelectedForAlias(row.data)}
                                                            />
                                                      )}
                                                      {row.type === 'loader' && (
                                                            <div className="flex items-center justify-center py-4 h-full">
                                                                  <Spin size="small" />
                                                            </div>
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
      loading,
      onMessage,
      onSetAlias,
}: {
      contact: ContactResponseDto;
      loading?: boolean;
      onMessage: () => void;
      onSetAlias: () => void;
}) {
      const { t } = useTranslation();
      const removeContact = useRemoveContact();
      const sendFriendRequest = useSendFriendRequest();
      const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);

      const menuItems = useMemo(() => [
            {
                  key: 'set-alias',
                  label: contact.aliasName ? t('contacts.contactList.menu.changeAlias') : t('contacts.contactList.menu.setAlias'),
                  icon: <EditOutlined />,
            },
            { type: 'divider' as const },
            {
                  key: 'remove',
                  label: <span className="text-red-500">{t('contacts.contactList.menu.remove')}</span>,
                  icon: <DeleteOutlined className="text-red-500" />,
            },
      ], [contact.aliasName, loading, t]);

      const handleMenuClick = useCallback(({ key }: { key: string }) => {
            if (key === 'set-alias') onSetAlias();
            if (key === 'remove') setRemoveConfirmOpen(true);
      }, [onSetAlias]);

      // Subtitle: show alias hint or phone book source
      const subtitle = useMemo(() => {
            if (contact.aliasName && contact.aliasName !== contact.phoneBookName) {
                  return t('contacts.contactList.aliasHint', { alias: contact.aliasName });
            }
            return undefined;
      }, [contact.aliasName, contact.phoneBookName, t]);

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
                        <div className="flex items-center gap-2 mt-0.5">
                              {contact.isMutual && (
                                    <Tag color="success" className="text-[10px] py-0 px-1.5 font-bold">
                                          GỢI Ý
                                    </Tag>
                              )}
                              {contact.source === 'PHONE_SYNC' && (
                                    <Tag color="blue" className="text-[10px] py-0 px-1.5 opacity-70">
                                          {t('contacts.contactList.fromContacts')}
                                    </Tag>
                              )}
                        </div>
                  }
                  actions={
                        <div className="flex items-center gap-1">
                              <Button
                                    type="primary"
                                    size="small"
                                    ghost
                                    icon={<UserAddOutlined />}
                                    onClick={() => sendFriendRequest.mutate(contact.contactUserId)}
                                    loading={sendFriendRequest.isPending}
                                    className="text-xs font-semibold"
                                    style={{ borderRadius: '12px' }}
                              >
                                    Kết bạn
                              </Button>
                              <Popconfirm
                                    title={t('contacts.contactList.removeConfirm.title')}
                                    description={t('contacts.contactList.removeConfirm.description', { name: contact.displayName })}
                                    open={removeConfirmOpen}
                                    okText={t('contacts.contactList.removeConfirm.ok')}
                                    cancelText={t('contacts.contactList.removeConfirm.cancel')}
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
                                                className="text-gray-400 hover:bg-gray-100"
                                          />
                                    </Dropdown>
                              </Popconfirm>
                        </div>
                  }
            />
      );
}
