import React from 'react';
import { View, Image, StyleSheet, ActivityIndicator } from 'react-native';
import { MessageMediaAttachmentItem } from '@/types/message';
import { getFullUrl } from '../message-item.utils';
import { styles } from '../message-item.styles';

interface Props {
  attachment: MessageMediaAttachmentItem;
  isSingle: boolean;
}

export function MessageImageAttachment({ attachment, isSingle }: Props) {
  const rawSrc = attachment.thumbnailUrl || attachment.optimizedUrl || attachment.cdnUrl || attachment._localUrl;
  const isProcessing = attachment.processingStatus !== 'READY' && attachment.processingStatus !== 'FAILED';
  const src = getFullUrl(rawSrc);

  if (!src) return null;

  return (
    <View style={[styles.imageWrapper, isSingle ? undefined : { width: '49%', aspectRatio: 1, marginBottom: 4 }]}>
      <Image
        source={{ uri: src }}
        style={[isSingle ? styles.image : { width: '100%', height: '100%' }, isProcessing && { opacity: 0.6 }]}
        resizeMode="cover"
      />
      {isProcessing && (
        <View style={[StyleSheet.absoluteFill, { justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.1)' }]}>
          <ActivityIndicator color="white" />
        </View>
      )}
    </View>
  );
}
