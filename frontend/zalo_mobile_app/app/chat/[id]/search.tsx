/**
 * Chat Message Search Screen
 * Route: /chat/[id]/search
 *
 * Full-screen tìm kiếm tin nhắn trong một conversation.
 * - Keyword search (debounced 300ms)
 * - Filter: khoảng ngày + người gửi
 * - Kết quả nhóm theo ngày, nhấn để jump đến tin nhắn
 * - State kept khi vẫn trong cùng conversation, reset khi đổi
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  ScrollView,
  Platform,
  StyleSheet,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, useTheme, Avatar, Divider } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import DateTimePicker from '@react-native-community/datetimepicker';
import { mobileApi } from '@/services/api';
import { useAuth } from '@/providers/auth-provider';
import { useConversationSearch } from '@/features/chats/hooks/use-conversation-search';
import { useChatStore } from '@/features/chats/stores/chat.store';
import type { MessageSearchResult } from '@/features/chats/search.types';

// ─── helpers ──────────────────────────────────────────────────────────────────

function formatDateDivider(dateKey: string): string {
  const d = new Date(dateKey);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((today.getTime() - d.setHours(0, 0, 0, 0)) / 86400000);
  if (diffDays === 0) return 'Hôm nay';
  if (diffDays === 1) return 'Hôm qua';
  if (diffDays < 7) return d.toLocaleDateString('vi-VN', { weekday: 'long' });
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function groupByDate(messages: MessageSearchResult[]): Array<{ dateKey: string; data: MessageSearchResult[] }> {
  const map = new Map<string, MessageSearchResult[]>();
  for (const msg of messages) {
    const key = msg.createdAt.split('T')[0];
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(msg);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dateKey, data]) => ({ dateKey, data }));
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function formatDateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ─── sub-components ───────────────────────────────────────────────────────────

function HighlightedText({ text, highlights }: { text: string; highlights: MessageSearchResult['highlights'] }) {
  if (!highlights || highlights.length === 0) {
    return <Text style={styles.previewText} numberOfLines={2}>{text}</Text>;
  }

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  const sorted = [...highlights].sort((a, b) => a.start - b.start);

  for (const hl of sorted) {
    if (hl.start > cursor) {
      parts.push(<Text key={`plain-${cursor}`}>{text.slice(cursor, hl.start)}</Text>);
    }
    parts.push(
      <Text key={`hl-${hl.start}`} style={styles.highlight}>
        {text.slice(hl.start, hl.end)}
      </Text>,
    );
    cursor = hl.end;
  }
  if (cursor < text.length) {
    parts.push(<Text key="tail">{text.slice(cursor)}</Text>);
  }

  return (
    <Text style={styles.previewText} numberOfLines={2}>
      {parts}
    </Text>
  );
}

function ResultItem({
  msg,
  onPress,
}: {
  msg: MessageSearchResult;
  onPress: (msg: MessageSearchResult) => void;
}) {
  const theme = useTheme();
  const initials = msg.senderName
    ? msg.senderName
      .split(' ')
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase()
    : '?';

  return (
    <TouchableOpacity style={styles.resultItem} onPress={() => onPress(msg)} activeOpacity={0.7}>
      <View style={styles.resultAvatarWrap}>
        {msg.senderAvatarUrl ? (
          <Avatar.Image size={40} source={{ uri: msg.senderAvatarUrl }} />
        ) : (
          <Avatar.Text size={40} label={initials} style={{ backgroundColor: theme.colors.primary }} />
        )}
      </View>
      <View style={styles.resultContent}>
        <View style={styles.resultHeader}>
          <Text style={styles.senderName} numberOfLines={1}>
            {msg.senderName}
          </Text>
          <Text style={styles.resultTime}>{formatTime(msg.createdAt)}</Text>
        </View>
        <HighlightedText text={msg.preview || msg.content || ''} highlights={msg.highlights} />
      </View>
    </TouchableOpacity>
  );
}

// ─── Date Picker Row ─────────────────────────────────────────────────────────

function DatePickerRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Date | null;
  onChange: (date: Date | null) => void;
}) {
  const [show, setShow] = useState(false);
  const theme = useTheme();

  return (
    <View style={styles.dateRow}>
      <Text style={styles.dateLabel}>{label}</Text>
      <TouchableOpacity
        style={[styles.dateButton, { borderColor: theme.colors.outline }]}
        onPress={() => setShow(true)}
      >
        <Text style={{ color: value ? theme.colors.onSurface : theme.colors.onSurfaceVariant }}>
          {value ? formatDateLabel(value.toISOString()) : 'Chọn ngày'}
        </Text>
        {value && (
          <TouchableOpacity onPress={() => onChange(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={16} color={theme.colors.onSurfaceVariant} />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
      {show && (
        <DateTimePicker
          value={value ?? new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(_, selected) => {
            setShow(Platform.OS === 'ios');
            if (selected) onChange(selected);
            else setShow(false);
          }}
          maximumDate={new Date()}
        />
      )}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ChatSearchScreen() {
  const { id, keyword: initialKeyword, fromDetail } = useLocalSearchParams<{ id: string; keyword: string; fromDetail?: string }>();
  const router = useRouter();
  const theme = useTheme();
  const { accessToken } = useAuth();
  const { setJumpToMessageId } = useChatStore();

  const {
    keyword,
    results,
    status,
    errorMessage,
    filters,
    handleKeywordChange,
    updateFilters,
    closeSearch,
  } = useConversationSearch(id);

  const inputRef = useRef<TextInput>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Focus input on mount & Handle initial keyword
  useEffect(() => {
    const t = setTimeout(() => {
      inputRef.current?.focus();
      if (initialKeyword && !keyword) {
        handleKeywordChange(initialKeyword);
      }
    }, 150);
    return () => clearTimeout(t);
  }, [initialKeyword, handleKeywordChange, keyword]);

  // ── Fetch members for sender filter ─────────────────────────────────────
  const { data: members = [] } = useQuery({
    queryKey: ['conversation-members', id],
    queryFn: () => mobileApi.getConversationMembers(id, accessToken!),
    staleTime: 5 * 60 * 1000,
    enabled: !!id && !!accessToken,
  });

  // ── Derived state ────────────────────────────────────────────────────────
  const isLoading = status === 'loading';
  const hasSearched = status === 'success' || status === 'error';
  const hasResults = results.length > 0;
  const hasKeyword = keyword.trim().length > 0;
  const hasActiveFilters = !!(filters.startDate || filters.endDate || filters.fromUserId);

  const grouped = groupByDate(results);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleClose = useCallback(() => {
    closeSearch();
    router.back();
  }, [closeSearch, router]);

  const handleResultPress = useCallback(
    (msg: MessageSearchResult) => {
      setJumpToMessageId(msg.id);
      if (fromDetail === 'true') {
        // If opened from chat detail, just pop back to avoid stack growth
        router.back();
      } else {
        // If opened from global search, navigate to the chat detail screen
        router.navigate({ pathname: '/chat/[id]', params: { id } } as any);
      }
    },
    [setJumpToMessageId, router, id, fromDetail],
  );

  const handleStartDateChange = useCallback(
    (date: Date | null) => {
      updateFilters({ startDate: date ? date.toISOString() : undefined });
    },
    [updateFilters],
  );

  const handleEndDateChange = useCallback(
    (date: Date | null) => {
      updateFilters({ endDate: date ? date.toISOString() : undefined });
    },
    [updateFilters],
  );

  const handleSenderSelect = useCallback(
    (userId: string | undefined) => {
      updateFilters({ fromUserId: userId });
    },
    [updateFilters],
  );

  const handleClearFilters = useCallback(() => {
    updateFilters({ fromUserId: undefined, startDate: undefined, endDate: undefined });
  }, [updateFilters]);

  // ── Render helpers ────────────────────────────────────────────────────────

  const renderEmptyState = () => {
    if (isLoading && !hasResults) {
      return (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      );
    }
    if (hasSearched && !hasResults && hasKeyword && !isLoading) {
      return (
        <View style={styles.centerContainer}>
          <Ionicons name="search" size={56} color={theme.colors.outlineVariant} />
          <Text style={[styles.emptyTitle, { color: theme.colors.onSurfaceVariant }]}>
            Không tìm thấy tin nhắn
          </Text>
          <Text style={[styles.emptySubtitle, { color: theme.colors.onSurfaceVariant }]}>
            Thử từ khóa khác hoặc thay đổi bộ lọc
          </Text>
        </View>
      );
    }
    if (!hasKeyword && !hasResults) {
      return (
        <View style={styles.centerContainer}>
          <View style={[styles.searchIconWrap, { backgroundColor: theme.colors.primaryContainer }]}>
            <Ionicons name="search" size={40} color={theme.colors.primary} />
          </View>
          <Text style={[styles.emptyTitle, { color: theme.colors.onSurface }]}>
            Tìm tin nhắn
          </Text>
          <Text style={[styles.emptySubtitle, { color: theme.colors.onSurfaceVariant }]}>
            Nhập từ khóa để tìm trong hội thoại này
          </Text>
        </View>
      );
    }
    return null;
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Safe area top */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: theme.colors.primary }}>
        {/* Header */}
        <View style={[styles.header, { backgroundColor: theme.colors.primary }]}>
          <TouchableOpacity onPress={handleClose} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Tìm tin nhắn</Text>
          <TouchableOpacity
            onPress={() => setShowFilters((v) => !v)}
            style={styles.filterButton}
          >
            <Ionicons
              name="options-outline"
              size={22}
              color={hasActiveFilters ? theme.colors.inversePrimary : '#fff'}
            />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* Search input */}
      <View style={[styles.searchBar, { backgroundColor: theme.colors.surface }]}>
        {isLoading ? (
          <ActivityIndicator size="small" color={theme.colors.primary} style={styles.searchIcon} />
        ) : (
          <Ionicons name="search-outline" size={20} color={theme.colors.onSurfaceVariant} style={styles.searchIcon} />
        )}
        <TextInput
          ref={inputRef}
          style={[styles.searchInput, { color: theme.colors.onSurface }]}
          value={keyword}
          onChangeText={handleKeywordChange}
          placeholder="Tìm kiếm..."
          placeholderTextColor={theme.colors.onSurfaceVariant}
          returnKeyType="search"
          onSubmitEditing={() => { }}
          autoCorrect={false}
        />
        {keyword.length > 0 && (
          <TouchableOpacity onPress={() => handleKeywordChange('')}>
            <Ionicons name="close-circle" size={18} color={theme.colors.onSurfaceVariant} />
          </TouchableOpacity>
        )}
      </View>

      {/* Filter Panel */}
      {showFilters && (
        <View style={[styles.filterPanel, { backgroundColor: theme.colors.surface }]}>
          <View style={styles.filterPanelHeader}>
            <Text style={[styles.filterPanelTitle, { color: theme.colors.onSurfaceVariant }]}>
              Bộ lọc nâng cao
            </Text>
            {hasActiveFilters && (
              <TouchableOpacity onPress={handleClearFilters}>
                <Text style={{ color: theme.colors.primary, fontSize: 12 }}>Xóa bộ lọc</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Date range */}
          <DatePickerRow
            label="Từ ngày"
            value={filters.startDate ? new Date(filters.startDate) : null}
            onChange={handleStartDateChange}
          />
          <DatePickerRow
            label="Đến ngày"
            value={filters.endDate ? new Date(filters.endDate) : null}
            onChange={handleEndDateChange}
          />

          {/* Sender filter */}
          <Text style={[styles.dateLabel, { marginTop: 8 }]}>Người gửi</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
            <TouchableOpacity
              key="sender-all"
              style={[
                styles.senderChip,
                !filters.fromUserId && { backgroundColor: theme.colors.primaryContainer },
              ]}
              onPress={() => handleSenderSelect(undefined)}
            >
              <Text style={{ fontSize: 12, color: !filters.fromUserId ? theme.colors.primary : theme.colors.onSurface }}>
                Tất cả
              </Text>
            </TouchableOpacity>
            {members.map((m) => {
              const isSelected = filters.fromUserId === m.id;
              return (
                <TouchableOpacity
                  key={m.id}
                  style={[
                    styles.senderChip,
                    isSelected && { backgroundColor: theme.colors.primaryContainer },
                  ]}
                  onPress={() => handleSenderSelect(isSelected ? undefined : m.id)}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      color: isSelected ? theme.colors.primary : theme.colors.onSurface,
                    }}
                    numberOfLines={1}
                  >
                    {m.displayName || 'System'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Error */}
      {errorMessage && (
        <View style={[styles.errorBar, { backgroundColor: '#fef2f2' }]}>
          <Text style={{ color: '#dc2626', fontSize: 13 }}>{errorMessage}</Text>
        </View>
      )}

      {/* Results count */}
      {hasResults && hasKeyword && (
        <View style={styles.resultCountBar}>
          <Text style={{ fontSize: 12, color: theme.colors.onSurfaceVariant }}>
            {results.length} kết quả
          </Text>
        </View>
      )}

      {/* Results list */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {!hasResults ? (
          renderEmptyState()
        ) : (
          <FlatList
            data={grouped}
            keyExtractor={(item) => item.dateKey}
            renderItem={({ item }) => (
              <View>
                {/* Date divider */}
                <View style={[styles.dateDivider, { borderBottomColor: theme.colors.outlineVariant }]}>
                  <Text style={{ fontSize: 11, color: theme.colors.onSurfaceVariant }}>
                    {formatDateDivider(item.dateKey)}
                  </Text>
                </View>
                {item.data.map((msg) => (
                  <ResultItem key={msg.id} msg={msg} onPress={handleResultPress} />
                ))}
              </View>
            )}
            ItemSeparatorComponent={() => (
              <Divider style={{ marginLeft: 60 }} />
            )}
            contentContainerStyle={{ paddingBottom: 24 }}
            keyboardShouldPersistTaps="handled"
          />
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
  backButton: {
    padding: 8,
    marginRight: 4,
  },
  headerTitle: {
    flex: 1,
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  filterButton: {
    padding: 8,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 4,
  },
  filterPanel: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
  },
  filterPanelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  filterPanelTitle: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  dateLabel: {
    fontSize: 12,
    color: '#666',
    minWidth: 65,
  },
  dateButton: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  senderChip: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginRight: 8,
    backgroundColor: '#f0f0f0',
  },
  errorBar: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  resultCountBar: {
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  dateDivider: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  resultItem: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  resultAvatarWrap: {
    marginRight: 12,
  },
  resultContent: {
    flex: 1,
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  senderName: {
    fontWeight: '600',
    fontSize: 14,
    flex: 1,
    marginRight: 8,
  },
  resultTime: {
    fontSize: 11,
    color: '#888',
  },
  previewText: {
    fontSize: 13,
    color: '#555',
    lineHeight: 18,
  },
  highlight: {
    backgroundColor: '#fff3cd',
    color: '#854d0e',
    fontWeight: '600',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  searchIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    marginTop: 6,
    textAlign: 'center',
    lineHeight: 18,
  },
});
