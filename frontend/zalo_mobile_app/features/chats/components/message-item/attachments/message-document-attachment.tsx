import React from 'react';
import { View, TouchableOpacity, Platform } from 'react-native';
import { Text } from 'react-native-paper';
import * as Linking from 'expo-linking';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import Toast from 'react-native-toast-message';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { MessageMediaAttachmentItem } from '@/types/message';
import { getFullUrl, getFileIcon, formatFileSize } from '../message-item.utils';
import { styles } from '../message-item.styles';

interface Props {
  attachment: MessageMediaAttachmentItem;
  isMe: boolean;
  theme: any;
}

export function MessageDocumentAttachment({ attachment, isMe, theme }: Props) {
  const fileIcon = getFileIcon(attachment.originalName || '');
  const sizeDisplay = formatFileSize(attachment.size);

  const handleOpen = async () => {
    const url = getFullUrl(attachment.cdnUrl || attachment.optimizedUrl || attachment._localUrl);
    if (!url) return;

    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      Linking.openURL(url);
    } else {
      const localUri = FileSystem.documentDirectory + (attachment.originalName || `file_${Date.now()}`);
      await FileSystem.downloadAsync(url, localUri);
      await Sharing.shareAsync(localUri);
    }
  };

  const handleDownload = async () => {
    const url = getFullUrl(
      attachment.cdnUrl || attachment.optimizedUrl || attachment.thumbnailUrl || attachment._localUrl,
    );

    if (!url) {
      Toast.show({ type: 'error', text1: 'Lỗi', text2: 'Không có liên kết tải về' });
      return;
    }

    try {
      const fileName = attachment.originalName || `file_${Date.now()}`;
      const safeFileName = fileName.replace(/[/\\?%*:|"<>]/g, '-');

      Toast.show({ type: 'info', text1: 'Bắt đầu tải...', text2: safeFileName, position: 'bottom' });

      // 1. Tải về vùng nhớ an toàn của app
      const localUri = FileSystem.documentDirectory + safeFileName;
      const downloadRes = await FileSystem.downloadAsync(url, localUri);

      if (downloadRes.status !== 200) throw new Error('Lỗi từ server khi tải file');

      // 2. Lưu ra ngoài hoặc chia sẻ
      if (Platform.OS === 'android') {
        const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (permissions.granted) {
          const newFileUri = await FileSystem.StorageAccessFramework.createFileAsync(
            permissions.directoryUri,
            safeFileName,
            'application/octet-stream',
          );
          const fileData = await FileSystem.readAsStringAsync(localUri, { encoding: FileSystem.EncodingType.Base64 });
          await FileSystem.writeAsStringAsync(newFileUri, fileData, { encoding: FileSystem.EncodingType.Base64 });
          Toast.show({ type: 'success', text1: 'Thành công', text2: 'Đã lưu file vào máy', position: 'top' });
        } else {
          Toast.show({ type: 'info', text1: 'Đã hủy', text2: 'Bạn chưa cấp quyền lưu file', position: 'top' });
        }
      } else {
        const isAvailable = await Sharing.isAvailableAsync();
        if (isAvailable) {
          await Sharing.shareAsync(localUri, { UTI: 'public.item', dialogTitle: 'Lưu tệp đính kèm' });
          Toast.show({ type: 'success', text1: 'Thành công', text2: 'Đã xử lý tệp', position: 'top' });
        }
      }

      // 3. Dọn dẹp
      await FileSystem.deleteAsync(localUri, { idempotent: true });
    } catch (error) {
      console.error('Download error:', error);
      Toast.show({ type: 'error', text1: 'Lỗi tải xuống', text2: 'Không thể tải tệp vào lúc này', position: 'top' });
    }
  };

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
          {/* Chỉ render khi backend thực sự có dữ liệu size — tránh hiện số sai */}
          {sizeDisplay != null && (
            <Text style={styles.docSize}>{sizeDisplay}</Text>
          )}
        </View>
      </TouchableOpacity>

      <TouchableOpacity style={styles.docDownload} onPress={handleDownload}>
        <Ionicons name="download-outline" size={24} color={theme.colors.onSurfaceVariant} />
      </TouchableOpacity>
    </View>
  );
}
