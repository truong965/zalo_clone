import React, { useEffect } from 'react';
import { View, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { MessageMediaAttachmentItem } from '@/types/message';
import { getFullUrl } from '../message-item.utils';
import { styles } from '../message-item.styles';

import { useMediaResource } from '../../../hooks/use-media-resource';
import { MediaProcessingOverlay } from './media-processing-overlay';
import { formatAudioDuration } from '../message-item.utils';


interface Props {
  attachment: MessageMediaAttachmentItem;
}

export function MessageVideoAttachment({ attachment }: Props) {
  const theme = useTheme();
  // We prefer optimizedUrl or thumbnailUrl for the list preview. 
  // useFullRes: false to save memory.
  const { isProcessing, isError, src, checkResource } = useMediaResource(attachment, { useFullRes: false });

  // Stop aggressive HEAD checking on every mount to reduce network/OOM pressure
  // checkResource() will now only be called if explicitly needed (e.g. on Image error)
  /*
  useEffect(() => {
    if (!isError && !isProcessing) {
      checkResource();
    }
  }, [src, isError, isProcessing]);
  */

  if (isError && !isProcessing) {
    return (
      <View style={[styles.errorWrapper, { width: 224, height: 224, justifyContent: 'center' }]}>
        <Ionicons name="alert-circle-outline" size={24} color="#ef4444" />
        <Text style={styles.errorText}>File không tồn tại</Text>
      </View>
    );
  }

  // Fallback to optimizedUrl or thumbnailUrl if src from resource hook isn't ready
  const thumbSrc = src || getFullUrl(attachment.optimizedUrl || attachment.thumbnailUrl || attachment.cdnUrl);

  return (
    <View style={styles.videoWrapper}>
      {thumbSrc ? (
        <Image 
          source={{ uri: thumbSrc }} 
          style={StyleSheet.absoluteFill} 
          resizeMode="cover"
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#1a1a1a' }]} />
      )}
      
      <View style={styles.playButtonWrapper}>
        <Ionicons name="play" size={32} color="white" />
      </View>

      {attachment.duration ? (
        <View style={styles.videoDurationBadge}>
          <Text style={styles.videoDurationText}>{formatAudioDuration(attachment.duration)}</Text>
        </View>
      ) : null}

      {isProcessing && <MediaProcessingOverlay />}
    </View>
  );
}
