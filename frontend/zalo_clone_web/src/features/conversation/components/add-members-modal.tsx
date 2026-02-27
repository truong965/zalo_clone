/**
 * AddMembersModal — Modal to search and add new members to a group.
 *
 * Uses useFriendSearch with params for tab-aware searching (friends/strangers).
 * Filters existing members via excludeIds parameter.
 */
import { useState, useRef, useCallback } from 'react';
import { Modal, Avatar, Button, Spin, Empty, Alert, Typography, Input, Segmented } from 'antd';
import { UserAddOutlined, SearchOutlined } from '@ant-design/icons';
import { useFriendSearch, type SearchTab } from '../hooks/use-friend-search';

const { Text } = Typography;
const DEBOUNCE_MS = 300;
const PHONE_REGEX = /^(0\d{2,9}|\+84\d{2,9})$/;

interface AddMembersModalProps {
      open: boolean;
      conversationId: string;
      existingMemberIds: string[];
      onClose: () => void;
      onAdd: (userIds: string[]) => Promise<void>;
}

export function AddMembersModal({
      open,
      conversationId: _conversationId,
      existingMemberIds,
      onClose,
      onAdd,
}: AddMembersModalProps) {
      const [localValue, setLocalValue] = useState('');
      const [keyword, setKeyword] = useState('');
      const [searchTab, setSearchTab] = useState<SearchTab>('friends');
      const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
      const [isAdding, setIsAdding] = useState(false);
      const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

      // Use useFriendSearch with params for tab-aware searching
      const { items, isLoading, isFetchingNextPage, fetchNextPage, hasNextPage, showPhoneHint } =
            useFriendSearch({ keyword, tab: searchTab, excludeIds: existingMemberIds });

      const handleSearchChange = useCallback((value: string) => {
            setLocalValue(value);
            if (debounceRef.current) clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => {
                  setKeyword(value.trim());
            }, DEBOUNCE_MS);
      }, []);

      const handleTabChange = useCallback((newTab: SearchTab) => {
            setSearchTab(newTab);
            setLocalValue('');
            setKeyword('');
            if (debounceRef.current) clearTimeout(debounceRef.current);
      }, []);

      const toggleSelect = (id: string) => {
            setSelectedIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(id)) {
                        next.delete(id);
                  } else {
                        next.add(id);
                  }
                  return next;
            });
      };

      const handleAdd = async () => {
            if (selectedIds.size === 0) return;
            setIsAdding(true);
            try {
                  await onAdd(Array.from(selectedIds));
                  handleClose();
            } catch {
                  // Error notification handled by use-group-notifications
            } finally {
                  setIsAdding(false);
            }
      };

      const handleClose = () => {
            setLocalValue('');
            setKeyword('');
            setSearchTab('friends');
            setSelectedIds(new Set());
            if (debounceRef.current) clearTimeout(debounceRef.current);
            onClose();
      };

      // Determine placeholder based on tab
      const inputPlaceholder = searchTab === 'strangers'
            ? 'Nhập số điện thoại để tìm (VD: 0901234567)'
            : 'Tìm bạn bè...';

      // Check if we should show phone hint
      const isValidPhone = searchTab === 'strangers' && PHONE_REGEX.test(keyword);

      return (
            <Modal
                  title="Thêm thành viên"
                  open={open}
                  onCancel={handleClose}
                  width={420}
                  destroyOnHidden
                  footer={
                        <div className="flex justify-end gap-2">
                              <Button onClick={handleClose} disabled={isAdding}>
                                    Hủy
                              </Button>
                              <Button
                                    type="primary"
                                    icon={<UserAddOutlined />}
                                    disabled={selectedIds.size === 0}
                                    loading={isAdding}
                                    onClick={handleAdd}
                              >
                                    Thêm ({selectedIds.size})
                              </Button>
                        </div>
                  }
            >
                  {/* Search bar with tabs */}
                  <div className="mb-3 space-y-2">
                        <Input
                              prefix={<SearchOutlined className="text-gray-400" />}
                              placeholder={inputPlaceholder}
                              value={localValue}
                              onChange={(e) => handleSearchChange(e.target.value)}
                              allowClear
                              onClear={() => {
                                    setLocalValue('');
                                    setKeyword('');
                              }}
                        />
                        <Segmented
                              block
                              value={searchTab}
                              onChange={(val) => handleTabChange(val as SearchTab)}
                              options={[
                                    { label: 'Bạn bè', value: 'friends' },
                                    { label: 'Tìm người lạ', value: 'strangers' },
                              ]}
                              size="small"
                        />
                  </div>

                  <div className="max-h-[300px] overflow-y-auto">
                        {/* Phone hint for strangers tab */}
                        {showPhoneHint && (
                              <Alert
                                    type="info"
                                    showIcon
                                    message="Nhập đúng số điện thoại"
                                    description="Nhập số điện thoại đầy đủ (VD: 0901234567) để tìm người dùng."
                                    className="mb-3"
                              />
                        )}

                        {/* Strangers tab with no keyword */}
                        {searchTab === 'strangers' && !keyword && (
                              <div className="flex items-center justify-center py-12 text-gray-400">
                                    <Text type="secondary">
                                          Nhập số điện thoại để tìm người dùng
                                    </Text>
                              </div>
                        )}

                        {/* Loading state */}
                        {isLoading && (searchTab === 'friends' || isValidPhone) && (
                              <div className="flex justify-center py-8">
                                    <Spin />
                              </div>
                        )}

                        {/* Empty state */}
                        {!isLoading && items.length === 0 && (searchTab === 'friends' || isValidPhone) && (
                              <Empty
                                    description="Không tìm thấy"
                                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                              />
                        )}

                        {/* Results list */}
                        {!isLoading && items.length > 0 && (
                              <>
                                    {items.map((item) => {
                                          const isSelected = selectedIds.has(item.id);
                                          const isClickable = !item.disabled;
                                          return (
                                                <div
                                                      key={item.id}
                                                      className={`flex items-center gap-3 px-3 py-2 rounded transition-colors ${item.disabled
                                                                  ? 'opacity-50 cursor-not-allowed'
                                                                  : isSelected
                                                                        ? 'bg-blue-50 border border-blue-200 cursor-pointer'
                                                                        : 'hover:bg-gray-50 cursor-pointer'
                                                            }`}
                                                      onClick={() => isClickable && toggleSelect(item.id)}
                                                >
                                                      <Avatar size={36} src={item.avatarUrl}>
                                                            {item.displayName?.charAt(0)}
                                                      </Avatar>
                                                      <div className="flex-1 min-w-0">
                                                            <div className="text-sm truncate">
                                                                  {item.displayName}
                                                            </div>
                                                            {item.subtitle && (
                                                                  <div className="text-xs text-gray-400 truncate">
                                                                        {item.subtitle}
                                                                  </div>
                                                            )}
                                                            {item.disabledReason && (
                                                                  <div className="text-xs text-orange-500">
                                                                        {item.disabledReason}
                                                                  </div>
                                                            )}
                                                      </div>
                                                      {!item.disabled && (
                                                            <input
                                                                  type="checkbox"
                                                                  checked={isSelected}
                                                                  readOnly
                                                                  className="accent-blue-500"
                                                            />
                                                      )}
                                                </div>
                                          );
                                    })}
                                    {hasNextPage && (
                                          <div className="flex justify-center py-2">
                                                <Button
                                                      type="link"
                                                      size="small"
                                                      loading={isFetchingNextPage}
                                                      onClick={() => fetchNextPage()}
                                                >
                                                      Tải thêm
                                                </Button>
                                          </div>
                                    )}
                              </>
                        )}
                  </div>
            </Modal>
      );
}
