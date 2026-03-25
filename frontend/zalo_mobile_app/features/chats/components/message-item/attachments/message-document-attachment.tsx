import React from 'react';
import { View, TouchableOpacity, Platform } from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { MessageMediaAttachmentItem } from '@/types/message';
import { getFileIcon, formatFileSize } from '../message-item.utils';
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
  const fileIcon = getFileIcon(attachment.originalName || '');
  const sizeDisplay = formatFileSize(attachment.size);

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
      </TouchableOpacity>

      <TouchableOpacity style={styles.docDownload} onPress={handleDownload}>
        <Ionicons name="download-outline" size={24} color={theme.colors.onSurfaceVariant} />
      </TouchableOpacity>
      {isProcessing && <MediaProcessingOverlay style={{ borderRadius: 12 }} />}
    </View>
  );
}
