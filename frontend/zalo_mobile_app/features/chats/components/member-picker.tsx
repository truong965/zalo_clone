import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { View, TouchableOpacity, FlatList, ActivityIndicator, TextInput as RNTextInput } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { UserAvatar } from '@/components/ui/user-avatar';
import { SearchBar } from '@/components/ui/search-bar';
import { useFriendSearch, SearchTab, MemberSearchItem } from '../hooks/use-friend-search';

interface MemberPickerProps {
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  excludeIds?: string[];
  conversationId?: string;
  memberLimit?: number;
}

const EMPTY_IDS: string[] = [];
const DEBOUNCE_MS = 300;

export function MemberPicker({ 
  selectedIds, 
  onToggleSelect, 
  excludeIds = EMPTY_IDS, 
  conversationId,
  memberLimit
}: MemberPickerProps) {
  const theme = useTheme();
  const [localKeyword, setLocalKeyword] = useState('');
  const [keyword, setKeyword] = useState('');
  const [activeTab, setActiveTab] = useState<SearchTab>('friends');
  
  const searchInputRef = useRef<RNTextInput>(null);
  const isMomentumScrolling = useRef(false);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setKeyword(localKeyword.trim());
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [localKeyword]);

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
    enabled: true,
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

  const handleEndReached = () => {
    if (!isMomentumScrolling.current) return;
    
    if (hasNextPage && !isFetchingNextPage && !isLoading) {
      fetchNextPage();
    }
  };

  const renderItem = ({ item }: { item: MemberSearchItem }) => {
    if (!item) return null;
    const isSelected = selectedIds.has(item.id);
    const isLimitReached = memberLimit !== undefined && selectedIds.size >= memberLimit && !isSelected;
    const isDisabled = item.disabled || isLimitReached;

    return (
      <TouchableOpacity
        onPress={() => !isDisabled && onToggleSelect(item.id)}
        className={`flex-row items-center px-4 py-3 ${isDisabled ? 'opacity-50' : ''}`}
        disabled={isDisabled}
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
          {isLimitReached && !item.disabledReason && <Text className="text-xs text-warning">Đã đạt giới hạn thành viên</Text>}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View className="flex-1">
      {/* Search Bar */}
      <SearchBar
        ref={searchInputRef}
        placeholder={activeTab === 'friends' ? "Tìm tên hoặc số điện thoại" : "Nhập số điện thoại"}
        value={localKeyword}
        onChangeText={setLocalKeyword}
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
    </View>
  );
}
