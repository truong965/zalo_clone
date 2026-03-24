import React from 'react';
import { View, Image, StyleSheet, ActivityIndicator } from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { MessageMediaAttachmentItem } from '@/types/message';
import { getFullUrl } from '../message-item.utils';
import { styles } from '../message-item.styles';

import { useMediaResource } from '../../../hooks/use-media-resource';
import { MediaProcessingOverlay } from './media-processing-overlay';

interface Props {
  attachment: MessageMediaAttachmentItem;
  isSingle: boolean;
}

export function MessageImageAttachment({ attachment, isSingle }: Props) {
  const { isProcessing, isError, src, setResourceError } = useMediaResource(attachment);

  if (isError) {
    return (
      <View style={[styles.errorWrapper, isSingle ? { width: 220 } : { width: '49%', aspectRatio: 1 }]}>
        <Ionicons name="alert-circle-outline" size={24} color="#ef4444" />
        <Text style={styles.errorText}>File không tồn tại</Text>
      </View>
    );
  }

  if (!src) return null;

  return (
    <View 
      style={[styles.imageWrapper, isSingle ? undefined : { width: '49%', aspectRatio: 1, marginBottom: 4 }]}
      pointerEvents="none"
    >
      <Image
        source={{ uri: src }}
        style={[isSingle ? styles.image : { width: '100%', height: '100%' }]}
        resizeMode="cover"
        onError={() => setResourceError(true)}
      />
      {isProcessing && <MediaProcessingOverlay />}
    </View>
  );
}
