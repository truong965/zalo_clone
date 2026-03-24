import React, { useState, useMemo } from 'react';
import { View, FlatList, Image, TouchableOpacity, ActivityIndicator, Dimensions } from 'react-native';
import { Text, useTheme, IconButton, Searchbar } from 'react-native-paper';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { useMediaBrowser } from '@/features/chats/hooks/use-media-browser';
import { getFullUrl } from '@/utils/url-helpers';

const { width } = Dimensions.get('window');
const COLUMN_COUNT = 3;
const GRID_ITEM_SIZE = (width - 32) / COLUMN_COUNT;

type MediaTab = 'photos' | 'files';

import { useMediaResource } from '@/features/chats/hooks/use-media-resource';
import { MediaProcessingOverlay } from '@/features/chats/components/message-item/attachments/media-processing-overlay';
import { MediaViewerModal } from '@/features/chats/components/media-viewer-modal';
import { formatAudioDuration } from '@/features/chats/components/message-item/message-item.utils';
import { FileDocumentItem } from '@/features/chats/components/settings/file-document-item';

function PhotoGridItem({ item }: { item: any }) {
  const { isProcessing, isError, src, setResourceError } = useMediaResource(item);

  const isAudio = item.messageType === 'VOICE' || item.messageType === 'AUDIO';

  return (
    <TouchableOpacity
      className="m-0.5 relative"
      style={{ width: GRID_ITEM_SIZE, height: GRID_ITEM_SIZE }}
      onPress={() => {
        if (!isError && !isProcessing) {
          item.onPress?.();
        }
      }}
      disabled={isError || isProcessing}
    >
      {isAudio ? (
        <View
          style={{ width: '100%', height: '100%', borderRadius: 4 }}
          className="bg-blue-50 items-center justify-center"
        >
          <Ionicons name="mic-outline" size={32} color="#0091ff" />
        </View>
      ) : (
        <Image
          source={{ uri: src || '' }}
          style={{ width: '100%', height: '100%', borderRadius: 4 }}
          className={`bg-secondary ${isError ? 'opacity-30 border-2 border-red-500' : ''}`}
          onError={() => setResourceError(true)}
        />
      )}
      {isError && (
        <View className="absolute inset-0 items-center justify-center">
          <Ionicons name="alert-circle" size={32} color="#ef4444" />
        </View>
      )}
      {!isError && item.messageType === 'VIDEO' && (
        <View className="absolute inset-0 items-center justify-center bg-black/10">
          <Ionicons name="play-circle" size={40} color="white" />
        </View>
      ) || (isAudio && (
        <View className="absolute bottom-1 right-1 bg-black/40 rounded-full px-1.5 py-0.5">
          <Text className="text-[8px] text-white font-bold">{item.duration ? formatAudioDuration(item.duration) : ''}</Text>
        </View>
      ))}
      {isProcessing && <MediaProcessingOverlay style={{ borderRadius: 4 }} showText={false} />}
    </TouchableOpacity>
  );
}

export default function MediaBrowserScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id: conversationId } = useLocalSearchParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<MediaTab>('photos');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [viewerState, setViewerState] = useState({ isVisible: false, initialIndex: 0 });

  // ── Debounce search logic ───────────────────────────────────────────────────
  React.useEffect(() => {
    const timer = setTimeout(() => {
      // Chỉ gọi query khi có 3 ký tự trở lên HOẶC khi xóa trắng
      if (searchQuery.length >= 3 || searchQuery.length === 0) {
        setDebouncedSearchQuery(searchQuery);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const types = activeTab === 'photos' ? ['IMAGE', 'VIDEO', 'VOICE', 'AUDIO'] : ['FILE'];

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useMediaBrowser(conversationId, types, activeTab === 'files' ? debouncedSearchQuery : undefined);

  const allItems = useMemo(() => data?.pages.flatMap((p) => p.items) ?? [], [data]);

  const groupedItems = useMemo(() => {
    const groups: { title: string; data: any[] }[] = [];
    const dateGroups: Record<string, any[]> = {};

    allItems.forEach((item) => {
      const date = dayjs(item.createdAt).format('YYYY-MM-DD');
      if (!dateGroups[date]) {
        dateGroups[date] = [];
      }
      dateGroups[date].push(item);
    });

    Object.keys(dateGroups)
      .sort((a, b) => b.localeCompare(a))
      .forEach((date) => {
        const d = dayjs(date);
        const today = dayjs().startOf('day');
        let title = '';
        const diff = today.diff(d, 'day');

        if (diff === 0) title = 'Hôm nay';
        else if (diff === 1) title = 'Hôm qua';
        else if (d.year() === today.year()) title = d.format('DD [tháng] MM');
        else title = d.format('DD/MM/YYYY');

        groups.push({ title, data: dateGroups[date] });
      });

    return groups;
  }, [allItems]);

  const renderPhotoItem = ({ item, index }: { item: any; index: number }) => (
    <PhotoGridItem
      item={{
        ...item,
        onPress: () => setViewerState({ isVisible: true, initialIndex: index })
      }}
    />
  );

  const renderFileItem = ({ item }: { item: any }) => (
    <FileDocumentItem
      originalName={item.originalName}
      sizeBytes={item.size}
      createdAt={item.createdAt}
      cdnUrl={item.cdnUrl}
      mimeType={item.mimeType}
    />
  );

  const renderSectionHeader = (title: string) => (
    <View className="px-4 py-2 bg-background">
      <Text variant="labelMedium" className="text-muted-foreground font-bold uppercase">
        {title}
      </Text>
    </View>
  );

  // Flattening for FlatList since we want infinite scroll
  // We'll insert custom "header" items for sections
  const flatData = useMemo(() => {
    const result: any[] = [];
    groupedItems.forEach((group) => {
      result.push({ type: 'header', title: group.title });
      if (activeTab === 'photos') {
        // For photos, we group them into rows of 3
        let globalPhotoIndex = 0;
        for (let i = 0; i < group.data.length; i += COLUMN_COUNT) {
          const rowData = group.data.slice(i, i + COLUMN_COUNT).map((item, idx) => ({
            ...item,
            globalIndex: globalPhotoIndex + idx
          }));
          result.push({ type: 'row', data: rowData });
          globalPhotoIndex += rowData.length;
        }
      } else {
        group.data.forEach((item) => {
          result.push({ type: 'item', ...item });
        });
      }
    });
    return result;
  }, [groupedItems, activeTab]);

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          headerTitle: 'Ảnh, file, link đã gửi',
          headerTitleStyle: { fontSize: 16 },
        }}
      />

      {/* Tabs */}
      <View className="flex-row border-b border-gray-100 bg-card">
        <TouchableOpacity
          className={`flex-1 py-3 items-center border-b-2 ${activeTab === 'photos' ? 'border-primary' : 'border-transparent'}`}
          onPress={() => setActiveTab('photos')}
        >
          <Text className={activeTab === 'photos' ? 'text-primary font-bold' : 'text-muted-foreground'}>Ảnh/Video</Text>
        </TouchableOpacity>
        <TouchableOpacity
          className={`flex-1 py-3 items-center border-b-2 ${activeTab === 'files' ? 'border-primary' : 'border-transparent'}`}
          onPress={() => setActiveTab('files')}
        >
          <Text className={activeTab === 'files' ? 'text-primary font-bold' : 'text-muted-foreground'}>File</Text>
        </TouchableOpacity>
      </View>

      {/* Search for files */}
      {activeTab === 'files' && (
        <View className="px-4 py-2">
          <Searchbar
            placeholder="Tìm kiếm file..."
            onChangeText={setSearchQuery}
            value={searchQuery}
            style={{ height: 40, backgroundColor: '#f4f5f7', borderRadius: 8 }}
            inputStyle={{ fontSize: 14, minHeight: 0 }}
          />
        </View>
      )}

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : (
        <FlatList
          data={flatData}
          keyExtractor={(item) => {
            if (item.type === 'header') return `header-${item.title}`;
            if (item.type === 'row') return `row-${item.data[0].mediaId}`;
            return `item-${item.mediaId}`;
          }}
          renderItem={({ item }) => {
            if (item.type === 'header') return renderSectionHeader(item.title);
            if (item.type === 'row') {
              return (
                <View className="flex-row px-3">
                  {item.data.map((photo: any) => (
                    <PhotoGridItem
                      key={photo.mediaId}
                      item={{
                        ...photo,
                        onPress: () => setViewerState({ isVisible: true, initialIndex: photo.globalIndex })
                      }}
                    />
                  ))}
                </View>
              );
            }
            return renderFileItem({ item });
          }}
          onEndReached={() => hasNextPage && fetchNextPage()}
          onEndReachedThreshold={0.5}
          ListFooterComponent={() => isFetchingNextPage ? (
            <View className="py-4">
              <ActivityIndicator size="small" />
            </View>
          ) : null}
          ListEmptyComponent={() => (
            <View className="flex-1 items-center justify-center pt-20">
              <Ionicons name="documents-outline" size={64} color="#e5e7eb" />
              <Text className="text-muted-foreground italic mt-4">Chưa có phương tiện nào</Text>
            </View>
          )}
        />
      )}

      <MediaViewerModal
        isVisible={viewerState.isVisible}
        onClose={() => setViewerState({ ...viewerState, isVisible: false })}
        items={allItems}
        initialIndex={viewerState.initialIndex}
      />
    </View>
  );
}
