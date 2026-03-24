import React from 'react';
import { View, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { mobileApi } from '@/services/api';
import { useAuth } from '@/providers/auth-provider';
import { getFullUrl } from '@/utils/url-helpers';

interface MediaExpandableSectionProps {
  conversationId: string;
  onExpand: () => void;
}

import { useMediaResource } from '../../hooks/use-media-resource';
import { MediaProcessingOverlay } from '../message-item/attachments/media-processing-overlay';

function MediaPreviewItem({ item, theme }: { item: any, theme: any }) {
  const { isProcessing, isError, src, setResourceError } = useMediaResource(item);

  return (
    <View className="mr-2 relative">
      {item.mediaType === 'IMAGE' || item.mediaType === 'VIDEO' ? (
        <View>
          <Image
            source={{ uri: src || '' }}
            className={`w-24 h-24 rounded-lg bg-secondary ${isError ? 'opacity-30 border-2 border-red-500' : ''}`}
            onError={() => setResourceError(true)}
          />
          {isError && (
            <View className="absolute inset-0 items-center justify-center">
              <Ionicons name="alert-circle" size={24} color="#ef4444" />
            </View>
          )}
        </View>
      ) : (
        <View className={`w-24 h-24 rounded-lg bg-secondary items-center justify-center ${isError ? 'border-2 border-red-500' : ''}`}>
          {isError ? (
            <Ionicons name="alert-circle" size={32} color="#ef4444" />
          ) : (
            <Ionicons
              name="document-text"
              size={40}
              color={theme.colors.primary}
            />
          )}
        </View>
      )}
      {isProcessing && <MediaProcessingOverlay style={{ borderRadius: 8 }} showText={false} />}
      {!isError && item.mediaType === 'VIDEO' && (
        <View className="absolute inset-0 items-center justify-center bg-black/10 rounded-lg">
          <Ionicons name="play-circle" size={32} color="white" />
        </View>
      )}
    </View>
  );
}

export function MediaExpandableSection({ conversationId, onExpand }: MediaExpandableSectionProps) {
  const theme = useTheme();
  const { accessToken } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['conversation-media-recent', conversationId],
    queryFn: () => mobileApi.getRecentMedia(conversationId, accessToken!, { limit: 5, types: 'IMAGE,VIDEO,FILE' }),
    enabled: !!conversationId && !!accessToken,
  });

  const mediaItems = data?.items || [];

  if (isLoading) {
    return (
      <View className="bg-card p-4 items-center">
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <TouchableOpacity
      className="bg-card mt-2 p-5"
      onPress={onExpand}
      activeOpacity={0.7} // Thêm độ mờ khi nhấn để tăng trải nghiệm UX
    >
      {/* Chuyển TouchableOpacity cũ thành View */}
      <View className="flex-row justify-between items-center mb-4">
        <Text className="text-lg font-bold px-3">Ảnh, file, link đã gửi</Text>
        <Ionicons name="chevron-forward" size={20} color={theme.colors.onSurfaceVariant} />
      </View>

      <View className="flex-row items-center">
        {mediaItems.length > 0 ? (
          <View className="flex-row flex-1">
            {mediaItems.map((item) => (
              // Lưu ý: Nếu MediaPreviewItem có sự kiện onPress riêng, nó có thể chặn (intercept) sự kiện của thẻ cha tùy thuộc vào cách bạn triển khai bên trong component đó.
              <MediaPreviewItem key={item.mediaId} item={item} theme={theme} />
            ))}
          </View>
        ) : (
          <Text className="text-muted-foreground italic px-3">Chưa có phương tiện nào</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}
