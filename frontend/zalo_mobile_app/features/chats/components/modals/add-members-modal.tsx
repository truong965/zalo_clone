import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { View, TouchableOpacity, FlatList, ActivityIndicator, TextInput as RNTextInput, Pressable } from 'react-native';
import { Text, Modal, Portal, TextInput, IconButton, useTheme, Button } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { UserAvatar } from '@/components/ui/user-avatar';
import { SearchBar } from '@/components/ui/search-bar';
import { useFriendSearch, SearchTab, MemberSearchItem } from '../../hooks/use-friend-search';

interface AddMembersModalProps {
  visible: boolean;
  onDismiss: () => void;
  onAdd: (userIds: string[]) => void;
  excludeIds?: string[];
  conversationId?: string;
  isLoading?: boolean;
}

const EMPTY_IDS: string[] = [];
const DEBOUNCE_MS = 300;

/**
 * AddMembersModal - Refactored for scalability and maintainability.
 * 
 * COMPREHENSIVE FIXES:
 * 1. Lazy Mounting: Component unmounts when 'visible' is false (handled by parent).
 * 2. Search Bar: Single source of touch with focus delegation.
 * 3. Pagination: Enhanced guard to prevent infinite auto-paging on short lists.
 */
export function AddMembersModal({ visible, onDismiss, onAdd, excludeIds = EMPTY_IDS, conversationId, isLoading: isSubmitting }: AddMembersModalProps) {
  const theme = useTheme();
  const [localKeyword, setLocalKeyword] = useState('');
  const [keyword, setKeyword] = useState('');
  const [activeTab, setActiveTab] = useState<SearchTab>('friends');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isFocused, setIsFocused] = useState(false);
  
  const searchInputRef = useRef<RNTextInput>(null);
  const isMomentumScrolling = useRef(false);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setKeyword(localKeyword.trim());
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [localKeyword]);

  // Lazy mounting ensures hooks only run when modal is active.
  const { 
    items, 
    isLoading, 
    hasNextPage, 
    fetchNextPage, 
    isFetchingNextPage, 
    showPhoneHint 
  } = useFriendSearch({
    keyword,
    tab: activeTab,
    excludeIds,
    conversationId,
    enabled: true, // Always true since we are lazy mounted
  });

  const handleTabChange = (tab: SearchTab) => {
    setActiveTab(tab);
    setLocalKeyword('');
    setKeyword('');
    // Explicit focus after tab switch
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 150);
  };

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

  const handleApply = () => {
    if (selectedIds.size > 0) {
      onAdd(Array.from(selectedIds));
    }
  };

  const handleEndReached = () => {
    // COMPREHENSIVE FIX: Prevent looping pagination.
    // FlatList calls onEndReached on mount if content is short.
    // We only trigger next page if user has actually started scrolling.
    if (!isMomentumScrolling.current) return;
    
    if (hasNextPage && !isFetchingNextPage && !isLoading) {
      fetchNextPage();
    }
  };

  const renderItem = ({ item }: { item: MemberSearchItem }) => {
    if (!item) return null;
    const isSelected = selectedIds.has(item.id);
    return (
      <TouchableOpacity
        onPress={() => !item.disabled && toggleSelect(item.id)}
        className={`flex-row items-center px-4 py-3 ${item.disabled ? 'opacity-50' : ''}`}
        disabled={item.disabled}
      >
        <View className="mr-3">
          <Ionicons
            name={isSelected ? "checkmark-circle" : "ellipse-outline"}
            size={24}
            color={isSelected ? theme.colors.primary : "#ccc"}
          />
        </View>
        <UserAvatar
          size={45}
          uri={item.avatarUrl}
        />
        <View className="flex-1 ml-3">
          <Text className="text-base font-medium">{item.displayName}</Text>
          {item.subtitle && <Text className="text-xs text-muted-foreground">{item.subtitle}</Text>}
          {item.disabledReason && <Text className="text-xs text-error">{item.disabledReason}</Text>}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={{
          backgroundColor: 'white',
          flex: 1,
          margin: 0,
          marginTop: 50,
          borderTopLeftRadius: 15,
          borderTopRightRadius: 15,
          overflow: 'hidden'
        }}
      >
        <View className="flex-1">
          {/* Header */}
          <View className="flex-row items-center justify-between px-2 py-2 border-b border-gray-100">
            <IconButton icon="close" size={24} onPress={onDismiss} />
            <Text className="text-lg font-bold">Thêm vào nhóm</Text>
            <Button
              mode="text"
              onPress={handleApply}
              disabled={selectedIds.size === 0 || isSubmitting}
              textColor={selectedIds.size > 0 ? theme.colors.primary : "#ccc"}
            >
              {isSubmitting ? <ActivityIndicator size="small" /> : 'Xong'}
            </Button>
          </View>

          {/* Search Bar - Refactored to use shared SearchBar */}
          <SearchBar
            ref={searchInputRef}
            placeholder={activeTab === 'friends' ? "Tìm tên hoặc số điện thoại" : "Nhập số điện thoại"}
            value={localKeyword}
            onChangeText={setLocalKeyword}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            keyboardType={activeTab === 'strangers' ? 'phone-pad' : 'default'}
            containerClass="p-3"
          />

          {/* Tabs */}
          <View className="flex-row border-b border-gray-100">
            {(['friends', 'strangers'] as SearchTab[]).map((tab) => {
              const isActive = activeTab === tab;
              return (
                <TouchableOpacity
                  key={tab}
                  onPress={() => handleTabChange(tab)}
                  className={`flex-1 items-center py-3 border-b-2 ${isActive ? 'border-primary' : 'border-transparent'}`}
                >
                  <Text className={`font-bold ${isActive ? 'text-primary' : 'text-gray-500'}`}>
                    {tab === 'friends' ? 'BẠN BÈ' : 'NGƯỜI LẠ'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Content */}
          <View className="flex-1">
            {showPhoneHint && (
              <View className="p-4 bg-blue-50 m-4 rounded-lg">
                <Text className="text-blue-600 text-sm italic">
                  Vui lòng nhập số điện thoại chính xác để tìm người lạ.
                </Text>
              </View>
            )}

            {isLoading && !isFetchingNextPage ? (
              <View className="flex-1 items-center justify-center">
                <ActivityIndicator color={theme.colors.primary} />
              </View>
            ) : (
              <FlatList
                data={items}
                keyExtractor={(item) => item?.id || Math.random().toString()}
                renderItem={renderItem}
                onEndReached={handleEndReached}
                onEndReachedThreshold={0.5}
                onMomentumScrollBegin={() => { isMomentumScrolling.current = true; }}
                ListFooterComponent={() => isFetchingNextPage ? <ActivityIndicator className="py-4" /> : null}
                ListEmptyComponent={() => (
                  <View className="flex-1 items-center justify-center p-10">
                    <Text className="text-muted-foreground text-center">
                      {keyword ? 'Không tìm thấy kết quả' : activeTab === 'friends' ? 'Danh sách bạn bè trống' : 'Nhập số điện thoại để tìm người lạ'}
                    </Text>
                  </View>
                )}
                keyboardShouldPersistTaps="handled"
              />
            )}
          </View>

          {/* Selected Count Footer */}
          {selectedIds.size > 0 && (
            <View className="p-4 border-t border-gray-100 bg-gray-50 flex-row items-center justify-between">
              <Text className="font-medium">Đã chọn: {selectedIds.size}</Text>
              <Button mode="contained" onPress={handleApply} loading={isSubmitting} disabled={isSubmitting}>
                Thêm vào nhóm
              </Button>
            </View>
          )}
        </View>
      </Modal>
    </Portal>
  );
}
