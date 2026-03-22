import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { MessageMediaAttachmentItem } from '@/types/message';
import { getFullUrl } from '../message-item.utils';
import { styles } from '../message-item.styles';

interface Props {
  attachment: MessageMediaAttachmentItem;
}

export function MessageVideoAttachment({ attachment }: Props) {
  const isProcessing = attachment.processingStatus !== 'READY' && attachment.processingStatus !== 'FAILED';
  const rawSrc = attachment.optimizedUrl || attachment.cdnUrl || attachment._localUrl;
  const src = getFullUrl(rawSrc);
  const player = useVideoPlayer(src || '');

  if (!src) return null;

  return (
    <View style={styles.videoWrapper}>
      {isProcessing ? (
        <View style={styles.playButtonWrapper}>
          <ActivityIndicator size="large" color="white" />
        </View>
      ) : (
        <VideoView
          style={{ width: '100%', height: '100%', borderRadius: 12 }}
          player={player}
          fullscreenOptions={{ enable: true }}
          allowsPictureInPicture
        />
      )}
    </View>
  );
}
