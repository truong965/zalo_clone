import React from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, withRepeat, withTiming, withSequence, useSharedValue } from 'react-native-reanimated';

// ─── Constants ───────────────────────────────────────────────────────────────

export const AUDIO_BAR_HEIGHTS = [1.2, 2.5, 1.8, 3.2, 2.1, 4.0, 3.5, 2.7, 1.9, 2.3, 1.5];

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
  }, [isPlaying, targetHeight]);

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

// ─── AudioWaveform ───────────────────────────────────────────────────────────

interface AudioWaveformProps {
  isPlaying: boolean;
  isMe: boolean;
  theme: any;
  barHeightMultiplier?: number;
}

export function AudioWaveform({ isPlaying, isMe, theme, barHeightMultiplier = 4 }: AudioWaveformProps) {
  return (
    <View style={styles.audioWave}>
      {AUDIO_BAR_HEIGHTS.map((h, i) => (
        <AudioBar 
          key={i} 
          targetHeight={h * barHeightMultiplier} 
          isPlaying={isPlaying} 
          isMe={isMe} 
          theme={theme} 
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  audioWave: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 24, // Fixed height to prevent layout shifts
  },
  audioBar: {
    width: 3,
    borderRadius: 2,
  },
});
