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
  isSingle?: boolean;
}

export function MessageImageAttachment({ attachment }: Props) {
  const { isProcessing, isError, src, setResourceError } = useMediaResource(attachment);

  if (isError && !isProcessing) {
    return (
      <View style={[styles.errorWrapper, { width: '100%', height: '100%', justifyContent: 'center' }]}>
        <Ionicons name="alert-circle-outline" size={24} color="#ef4444" />
      </View>
    );
  }

  if (!src) return null;

  return (
    <View 
      style={[styles.imageWrapper, { width: '100%', height: '100%' }]}
      pointerEvents="none"
    >
      <Image
        source={{ uri: src }}
        style={{ width: '100%', height: '100%' }}
        resizeMode="cover"
        onError={() => setResourceError(true)}
      />
      {isProcessing && <MediaProcessingOverlay />}
    </View>
  );
}
