import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import type { MediaSearchResult } from '../types';
import { isVisualMedia, formatFileSize, formatSearchTimestamp } from '../utils/search.util';

interface MediaResultProps {
      data: MediaSearchResult;
      onClick?: (result: MediaSearchResult) => void;
}

export function MediaResult({ data, onClick }: MediaResultProps) {
      const isVisual = isVisualMedia(data.mediaType);

      if (isVisual && data.thumbnailUrl) {
            return (
                  <TouchableOpacity
                        className="rounded-lg overflow-hidden relative"
                        style={{ width: '32%', aspectRatio: 1, margin: '0.6%' }}
                        onPress={() => onClick?.(data)}
                  >
                        <Image
                              source={{ uri: data.thumbnailUrl }}
                              style={{ width: '100%', height: '100%', backgroundColor: '#f3f4f6' }}
                              contentFit="cover"
                        />
                        {data.mediaType === 'VIDEO' && (
                              <View className="absolute inset-0 items-center justify-center bg-black/20">
                                    <Ionicons name="play-circle-outline" size={24} color="white" />
                              </View>
                        )}
                        <View className="absolute bottom-0 left-0 right-0 p-1" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
                              <Text className="text-[10px] text-white" numberOfLines={1}>
                                    {data.originalName}
                              </Text>
                        </View>
                  </TouchableOpacity>
            );
      }

      return (
            <TouchableOpacity
                  className="flex-row items-center gap-3 px-4 py-3 bg-white border-b border-gray-100"
                  onPress={() => onClick?.(data)}
            >
                  <View className="w-10 h-10 rounded-lg bg-blue-50 items-center justify-center">
                        <Ionicons name="document-text" size={20} color="#1E88E5" />
                  </View>
                  <View className="flex-1 min-w-0">
                        <Text className="text-sm font-medium text-gray-800" numberOfLines={1}>
                              {data.originalName}
                        </Text>
                        <Text className="text-xs text-gray-500 mt-0.5" numberOfLines={1}>
                              {formatSearchTimestamp(data.createdAt)} · {formatFileSize(String(data.size))}
                        </Text>
                        <Text className="text-[10px] text-gray-400 mt-0.5" numberOfLines={1}>
                              {data.uploadedByName} trong {data.conversationName}
                        </Text>
                  </View>
            </TouchableOpacity>
      );
}

interface MediaResultGridProps {
      items: MediaSearchResult[];
      onItemClick?: (result: MediaSearchResult) => void;
      limit?: number;
}

export function MediaResultGrid({ items, onItemClick, limit }: MediaResultGridProps) {
      const displayItems = limit ? items.slice(0, limit) : items;
      const visualItems = displayItems.filter((m) => isVisualMedia(m.mediaType) && m.thumbnailUrl);
      const fileItems = displayItems.filter((m) => !isVisualMedia(m.mediaType) || !m.thumbnailUrl);

      return (
            <View>
                  {visualItems.length > 0 && (
                        <View className="flex-row flex-wrap px-3 py-2">
                              {visualItems.map((item) => (
                                    <MediaResult key={item.id} data={item} onClick={onItemClick} />
                              ))}
                        </View>
                  )}
                  {fileItems.length > 0 && (
                        <View>
                              {fileItems.map((item) => (
                                    <MediaResult key={item.id} data={item} onClick={onItemClick} />
                              ))}
                        </View>
                  )}
            </View>
      );
}
