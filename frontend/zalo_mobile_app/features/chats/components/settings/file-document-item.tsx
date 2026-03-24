import React from 'react';
import { View, TouchableOpacity, Linking, Platform } from 'react-native';
import { Text, useTheme, IconButton, Menu, Divider } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import Toast from 'react-native-toast-message';
import { getFullUrl } from '@/utils/url-helpers';
import { handleOpenFile, handleDownloadFile, handleShareFile } from '../../utils/file-utils';

import { useMediaResource } from '../../hooks/use-media-resource';
import { MediaProcessingOverlay } from '../message-item/attachments/media-processing-overlay';

interface FileDocumentItemProps {
  originalName: string;
  sizeBytes: number;
  createdAt: string | Date;
  cdnUrl: string | null;
  mimeType: string;
  processingStatus?: string;
  mediaId?: string;
}

export function FileDocumentItem({
  originalName,
  sizeBytes,
  createdAt,
  cdnUrl,
  mimeType,
  processingStatus,
}: FileDocumentItemProps) {
  const theme = useTheme();
  const { isProcessing, isError, src, checkResource } = useMediaResource({
    cdnUrl,
    processingStatus: processingStatus || 'READY',
  });

  React.useEffect(() => {
    if (!isError && !isProcessing) {
      checkResource();
    }
  }, [src, isError, isProcessing]);

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const [menuVisible, setMenuVisible] = React.useState(false);

  const onOpen = () => handleOpenFile(src, originalName);
  const onDownload = () => {
    setMenuVisible(false);
    handleDownloadFile(src, originalName, mimeType);
  };
  const onShare = () => {
    setMenuVisible(false);
    handleShareFile(src, originalName);
  };

  const getFileIcon = (mime: string) => {
    if (mime.includes('pdf')) return 'document-text';
    if (mime.includes('word') || mime.includes('officedocument.word')) return 'document-text';
    if (mime.includes('excel') || mime.includes('officedocument.spreadsheet')) return 'stats-chart';
    if (mime.includes('zip') || mime.includes('rar')) return 'archive';
    return 'document';
  };

  return (
    <TouchableOpacity
      className="flex-row items-center p-3 border-b border-gray-100 relative"
      onPress={onOpen}
      disabled={isError || isProcessing}
    >
      <View className="w-12 h-12 bg-blue-50 rounded-lg items-center justify-center mr-3">
        {isError ? (
          <Ionicons name="alert-circle" size={24} color="#ef4444" />
        ) : (
          <Ionicons name={getFileIcon(mimeType)} size={24} color={theme.colors.primary} />
        )}
      </View>
      <View className="flex-1">
        <Text variant="bodyMedium" numberOfLines={1} className={`font-medium ${isError ? 'text-muted-foreground line-through' : ''}`}>
          {originalName}
        </Text>
        <Text variant="labelSmall" className="text-muted-foreground mt-1">
          {isError ? 'File không tồn tại' : `${formatSize(sizeBytes)} • ${dayjs(createdAt).format('DD/MM/YYYY')}`}
        </Text>
      </View>
      {!isError && (
        <Menu
          visible={menuVisible}
          onDismiss={() => setMenuVisible(false)}
          anchor={
            <IconButton
              icon="dots-vertical"
              size={20}
              onPress={() => setMenuVisible(true)}
            />
          }
        >
          <Menu.Item onPress={onDownload} title="Tải xuống" leadingIcon="download" />
          <Divider />
          <Menu.Item onPress={onShare} title="Chia sẻ" leadingIcon="share-variant" />
        </Menu>
      )}
      {isProcessing && <MediaProcessingOverlay style={{ borderRadius: 8 }} showText={false} />}
    </TouchableOpacity>
  );
}
