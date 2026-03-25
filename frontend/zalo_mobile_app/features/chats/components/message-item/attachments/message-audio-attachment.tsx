import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useAnimatedStyle, withRepeat, withTiming, withSequence, useSharedValue } from 'react-native-reanimated';
import { MessageMediaAttachmentItem } from '@/types/message';
import { getFullUrl, formatAudioDuration } from '../message-item.utils';
import { styles } from '../message-item.styles';

import { AudioWaveform } from './audio-waveform';

import { useMediaResource } from '../../../hooks/use-media-resource';
import { MediaProcessingOverlay } from './media-processing-overlay';

interface Props {
  attachment: MessageMediaAttachmentItem;
  isMe: boolean;
  theme: any;
}

export function MessageAudioAttachment({ attachment, isMe, theme }: Props) {
  const { isProcessing, isError, src, checkResource } = useMediaResource(attachment, { useFullRes: true });
  const player = useAudioPlayer(src || '');

  React.useEffect(() => {
    if (!isError && !isProcessing) {
      checkResource();
    }
  }, [src, isError, isProcessing]);

  const status = useAudioPlayerStatus(player);
  const backendDuration = attachment.duration != null && attachment.duration > 0 ? attachment.duration : null;
  const playerDuration  = status.duration != null  && status.duration  > 0 ? Math.round(status.duration) : null;
  const actualDuration  = backendDuration ?? playerDuration ?? 0;
  const isPlaying = status.playing ?? false;

  const handlePlayPause = () => {
    isPlaying ? player.pause() : player.play();
  };

  const accentColor = isMe ? '#0091ff' : theme.colors.primary;

  if (isError && !isProcessing) {
    return (
      <View style={styles.errorWrapper}>
        <Ionicons name="alert-circle-outline" size={24} color="#ef4444" />
        <Text style={styles.errorText}>File không tồn tại</Text>
      </View>
    );
  }

  return (
    <View style={styles.audioWrapper}>
      <TouchableOpacity style={[styles.audioPlayBtn, { backgroundColor: accentColor }]} onPress={handlePlayPause}>
        <Ionicons name={isPlaying ? 'pause' : 'play'} size={22} color="white" />
      </TouchableOpacity>

      <View style={styles.audioWaveWrapper}>
        <AudioWaveform isPlaying={isPlaying} isMe={isMe} theme={theme} />
      </View>

      <Text style={[styles.audioDuration, { color: accentColor }]}>
        {actualDuration > 0 ? formatAudioDuration(actualDuration) : '0:00'}
      </Text>
      {isProcessing && <MediaProcessingOverlay style={{ borderRadius: 12 }} />}
    </View>
  );
}
