import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { MessageMediaAttachmentItem } from '@/types/message';
import { getFullUrl } from '../message-item.utils';
import { styles } from '../message-item.styles';

import { useMediaResource } from '../../../hooks/use-media-resource';
import { MediaProcessingOverlay } from './media-processing-overlay';

interface Props {
  attachment: MessageMediaAttachmentItem;
}

export function MessageVideoAttachment({ attachment }: Props) {
  const { isProcessing, isError, src, checkResource } = useMediaResource(attachment, { useFullRes: true });
  const player = useVideoPlayer(src || '');

  React.useEffect(() => {
    if (!isError && !isProcessing) {
      checkResource();
    }
  }, [src, isError, isProcessing]);

  if (isError && !isProcessing) {
    return (
      <View style={[styles.errorWrapper, { width: 224, height: 224, justifyContent: 'center' }]}>
        <Ionicons name="alert-circle-outline" size={24} color="#ef4444" />
        <Text style={styles.errorText}>File không tồn tại</Text>
      </View>
    );
  }

  if (!src) return null;

  return (
    <View style={styles.videoWrapper} pointerEvents="none">
      <VideoView
        style={{ width: '100%', height: '100%', borderRadius: 12 }}
        player={player}
        fullscreenOptions={{ enable: true }}
        allowsPictureInPicture
      />
      {isProcessing && <MediaProcessingOverlay />}
    </View>
  );
}
