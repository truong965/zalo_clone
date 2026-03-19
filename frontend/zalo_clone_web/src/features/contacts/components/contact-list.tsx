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
import { conversationService } from '@/features/conversation';

const { Text } = Typography;

const ITEM_HEIGHT = 92;

// ============================================================================
// ContactList
// ============================================================================

export function ContactList() {
      const { t } = useTranslation();
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

      // ── Message navigation ─────────────────────────────────────────────────────
      const [navigatingId, setNavigatingId] = useState<string | null>(null);

      const handleMessage = useCallback(async (contactUserId: string) => {
            if (navigatingId) return;
            setNavigatingId(contactUserId);
            try {
                  const conv = await conversationService.getOrCreateDirectConversation(contactUserId);
                  navigate(`/chat/${conv.id}`);
            } catch {
                  // Error handled by axios interceptor (network/auth errors)
            } finally {
                  setNavigatingId(null);
            }
      }, [navigate, navigatingId]);

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
                                                                  loading={navigatingId === contact.contactUserId}
                                                                  onMessage={() => void handleMessage(contact.contactUserId)}
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
      const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);

      const menuItems = useMemo(() => [
            {
                  key: 'message',
                  label: loading ? t('contacts.contactList.menu.opening') : t('contacts.contactList.menu.message'),
                  icon: <MessageOutlined />,
                  disabled: loading,
            },
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
            if (key === 'message') onMessage();
            if (key === 'set-alias') onSetAlias();
            if (key === 'remove') setRemoveConfirmOpen(true);
      }, [onMessage, onSetAlias]);

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
                        contact.source === 'PHONE_SYNC' ? (
                              <Tag color="blue" className="mt-0.5 text-xs">{t('contacts.contactList.fromContacts')}</Tag>
                        ) : undefined
                  }
                  actions={
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
                                          className="text-gray-500 hover:bg-gray-100"
                                    />
                              </Dropdown>
                        </Popconfirm>
                  }
            />
      );
}
