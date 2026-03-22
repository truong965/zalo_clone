import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useAnimatedStyle, withRepeat, withTiming, withSequence, useSharedValue } from 'react-native-reanimated';
import { MessageMediaAttachmentItem } from '@/types/message';
import { getFullUrl, formatAudioDuration } from '../message-item.utils';
import { styles } from '../message-item.styles';

// ─── AudioBar ────────────────────────────────────────────────────────────────

interface AudioBarProps {
  targetHeight: number;
  isPlaying: boolean;
  isMe: boolean;
  theme: any;
}

function AudioBar({ targetHeight, isPlaying, isMe, theme }: AudioBarProps) {
  const height = useSharedValue(isPlaying ? targetHeight : 4);

  React.useEffect(() => {
    if (isPlaying) {
      height.value = withRepeat(
        withSequence(
          withTiming(targetHeight * 0.4, { duration: 300 + Math.random() * 200 }),
          withTiming(targetHeight,       { duration: 300 + Math.random() * 200 }),
        ),
        -1,
        true,
      );
    } else {
      height.value = withTiming(4);
    }
  }, [isPlaying]);

  const animatedStyle = useAnimatedStyle(() => ({ height: height.value }));

  return (
    <Animated.View
      style={[
        styles.audioBar,
        { backgroundColor: isMe ? '#0091ff' : theme.colors.primary, opacity: isPlaying ? 1 : 0.6 },
        animatedStyle,
      ]}
    />
  );
}

// ─── MessageAudioAttachment ──────────────────────────────────────────────────

const AUDIO_BAR_HEIGHTS = [1.2, 2.5, 1.8, 3.2, 2.1, 4.0, 3.5, 2.7, 1.9, 2.3, 1.5];

interface Props {
  attachment: MessageMediaAttachmentItem;
  isMe: boolean;
  theme: any;
}

export function MessageAudioAttachment({ attachment, isMe, theme }: Props) {
  const src = getFullUrl(attachment.cdnUrl || attachment._localUrl);
  const player = useAudioPlayer(src || '');

  // useAudioPlayerStatus là hook reactive thực sự — subscribe vào event stream của player.
  // Dùng player.duration trực tiếp trong useEffect/useState KHÔNG work vì nó là plain JS
  // property, React không theo dõi được → duration mãi là 0 sau khi player load xong.
  const status = useAudioPlayerStatus(player);

  const backendDuration = attachment.duration != null && attachment.duration > 0 ? attachment.duration : null;
  const playerDuration  = status.duration != null  && status.duration  > 0 ? Math.round(status.duration) : null;
  const actualDuration  = backendDuration ?? playerDuration ?? 0;

  // Lấy isPlaying từ status thực tế — tránh bug icon không reset khi audio phát xong tự động.
  const isPlaying = status.playing ?? false;

  const handlePlayPause = () => {
    isPlaying ? player.pause() : player.play();
  };

  const accentColor = isMe ? '#0091ff' : theme.colors.primary;

  return (
    <View style={styles.audioWrapper}>
      <TouchableOpacity style={[styles.audioPlayBtn, { backgroundColor: accentColor }]} onPress={handlePlayPause}>
        <Ionicons name={isPlaying ? 'pause' : 'play'} size={22} color="white" />
      </TouchableOpacity>

      <View style={styles.audioWaveWrapper}>
        <View style={styles.audioWave}>
          {AUDIO_BAR_HEIGHTS.map((h, i) => (
            <AudioBar key={i} targetHeight={h * 4} isPlaying={isPlaying} isMe={isMe} theme={theme} />
          ))}
        </View>
      </View>

      <Text style={[styles.audioDuration, { color: accentColor }]}>
        {actualDuration > 0 ? formatAudioDuration(actualDuration) : '0:00'}
      </Text>
    </View>
  );
}
