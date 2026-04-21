import React from 'react';
import { View, TouchableOpacity, Image, Platform } from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { MessageMediaAttachmentItem } from '@/types/message';
import { getFileIcon, formatFileSize, getFullUrl } from '../message-item.utils';
import { handleOpenFile, handleDownloadFile } from '../../../utils/file-utils';
import { styles } from '../message-item.styles';

import { useMediaResource } from '../../../hooks/use-media-resource';
import { MediaProcessingOverlay } from './media-processing-overlay';

interface Props {
  attachment: MessageMediaAttachmentItem;
  isMe: boolean;
  theme: any;
}

export function MessageDocumentAttachment({ attachment, isMe, theme }: Props) {
  const { isProcessing, isError, src, checkResource } = useMediaResource(attachment);
  void isMe;
  const fileIcon = getFileIcon(attachment.originalName || '');
  const sizeDisplay = formatFileSize(attachment.size);
  const normalizedName = (attachment.originalName || '').toLowerCase();
  const normalizedMimeType = (attachment.mimeType || '').toLowerCase();
  const isPdf = normalizedMimeType.includes('pdf') || normalizedName.endsWith('.pdf');
  const isDocx =
    normalizedMimeType.includes('officedocument.wordprocessingml.document') ||
    normalizedName.endsWith('.docx');
  const shouldRenderPreview = isPdf || isDocx;
  const previewLabel = isPdf ? 'PDF' : 'DOCX';
  const previewImageSrc = getFullUrl(attachment.thumbnailUrl || null);
  const previewSourceUrl = getFullUrl(
    attachment.cdnUrl || attachment.optimizedUrl || attachment.thumbnailUrl || src || null,
  );
  const canRenderDocViewerPreview = Boolean(previewSourceUrl && /^https?:\/\//i.test(previewSourceUrl) && Platform.OS !== 'web');
  const [viewerMode, setViewerMode] = React.useState<'google' | 'drive'>('google');
  const docViewerPreviewUrl = React.useMemo(() => {
    if (!canRenderDocViewerPreview || !previewSourceUrl) return null;
    const encoded = encodeURIComponent(previewSourceUrl);
    if (isPdf && viewerMode === 'drive') {
      return `https://drive.google.com/viewerng/viewer?embedded=true&url=${encoded}`;
    }
    return `https://docs.google.com/gview?embedded=true&url=${encoded}`;
  }, [canRenderDocViewerPreview, previewSourceUrl, isPdf, viewerMode]);

  React.useEffect(() => {
    if (!isError && !isProcessing) {
      checkResource();
    }
  }, [src, isError, isProcessing]);

  const handleOpen = () => handleOpenFile(src, attachment.originalName || 'file');
  const handleDownload = () => handleDownloadFile(src, attachment.originalName || 'file', attachment.mimeType);

  if (isError && !isProcessing) {
    return (
      <View style={styles.errorWrapper}>
        <Ionicons name="alert-circle-outline" size={24} color="#ef4444" />
        <Text style={styles.errorText}>File không tồn tại</Text>
      </View>
    );
  }

  return (
    <View style={styles.docWrapper}>
      <TouchableOpacity style={styles.docBody} onPress={handleOpen} activeOpacity={0.7}>
        <View style={styles.docMain}>
          {shouldRenderPreview && (
            <View style={styles.docPreviewWrapper}>
              {previewImageSrc ? (
                <Image source={{ uri: previewImageSrc }} style={styles.docPreviewImage} resizeMode="cover" />
              ) : docViewerPreviewUrl ? (
                <WebView
                  source={{ uri: docViewerPreviewUrl }}
                  style={styles.docPreviewWebview}
                  scrollEnabled={false}
                  showsHorizontalScrollIndicator={false}
                  showsVerticalScrollIndicator={false}
                  bounces={false}
                  onError={() => {
                    if (isPdf && viewerMode === 'google') {
                      setViewerMode('drive');
                    }
                  }}
                />
              ) : (
                <View style={[styles.docPreviewFallback, { backgroundColor: `${fileIcon.color}1a` }]}>
                  <MaterialCommunityIcons name={fileIcon.name} size={24} color={fileIcon.color} />
                </View>
              )}
              <View style={[styles.docPreviewBadge, { backgroundColor: fileIcon.color }]}>
                <Text style={styles.docPreviewBadgeText}>{previewLabel}</Text>
              </View>
            </View>
          )}
          <View style={styles.docMetaRow}>
            <View style={[styles.docIconWrapper, { backgroundColor: `${fileIcon.color}1a` }]}>
              <MaterialCommunityIcons name={fileIcon.name} size={32} color={fileIcon.color} />
            </View>
            <View style={styles.docInfo}>
              <Text style={styles.docName} numberOfLines={1}>
                {attachment.originalName || 'Document'}
              </Text>
              {sizeDisplay != null && (
                <Text style={styles.docSize}>{sizeDisplay}</Text>
              )}
            </View>
          </View>
        </View>
      </TouchableOpacity>

      <TouchableOpacity style={styles.docDownload} onPress={handleDownload}>
        <Ionicons name="download-outline" size={24} color={theme.colors.onSurfaceVariant} />
      </TouchableOpacity>
      {isProcessing && <MediaProcessingOverlay style={{ borderRadius: 12 }} />}
    </View>
  );
}
