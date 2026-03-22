import React, { useEffect, useRef } from 'react';
import { View, TouchableOpacity, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from 'react-native-paper';
import Animated, {
  useAnimatedStyle,
  withTiming,
  interpolate,
  Extrapolation,
  makeMutable,
  type SharedValue,
} from 'react-native-reanimated';

// ─── Constants ────────────────────────────────────────────────────────────────
const NUM_BARS = 40;
const MAX_BAR_HEIGHT = 44;  // px
const MIN_BAR_HEIGHT = 3;   // px
const BAR_WIDTH = 3;   // px
const BAR_GAP = 2.5; // px
const TICK_MS = 100; // ms — animation tick rate

// ─── WaveBar ──────────────────────────────────────────────────────────────────
// Each bar owns a dedicated SharedValue<number> → Reanimated always detects changes.

interface WaveBarProps {
  heightSV: SharedValue<number>;
  opacity: number;
  color: string;
}

const WaveBar = ({ heightSV, opacity, color }: WaveBarProps) => {
  const animatedStyle = useAnimatedStyle(() => ({
    height: heightSV.value,
    opacity,
  }));

  return (
    <Animated.View
      style={[styles.bar, { backgroundColor: color, width: BAR_WIDTH }, animatedStyle]}
    />
  );
};

// ─── VoiceRecordingUI ─────────────────────────────────────────────────────────

interface VoiceRecordingUIProps {
  isUploadingAudio: boolean;
  recordingDuration: string;
  metering?: number;  // dB -160..0, from expo-audio isMeteringEnabled
  onCancel: () => void;
  onSend: () => void;
  bottomInset: number;
}

export function VoiceRecordingUI({
  isUploadingAudio,
  recordingDuration,
  metering = -160,
  onCancel,
  onSend,
  bottomInset,
}: VoiceRecordingUIProps) {
  const theme = useTheme();

  // ── Per-bar shared values (created once, never recreated) ──────────────────
  // makeMutable creates a SharedValue imperatively — safe to store in a ref.
  // This is the key fix: each bar tracks its OWN value, so Reanimated
  // re-runs useAnimatedStyle whenever that specific value changes.
  const barValues = useRef<SharedValue<number>[]>(
    Array.from({ length: NUM_BARS }, () => makeMutable(MIN_BAR_HEIGHT))
  );

  // Pre-compute static opacity per bar (newest = full, oldest = faded)
  const barOpacities = useRef<number[]>(
    Array.from({ length: NUM_BARS }, (_, i) =>
      interpolate(i, [0, NUM_BARS * 0.35, NUM_BARS], [1.0, 0.5, 0.12], Extrapolation.CLAMP)
    )
  );

  // Keep latest metering in a ref — interval closure reads it without recreating
  const meteringRef = useRef<number>(metering);
  useEffect(() => {
    meteringRef.current = metering;
  }, [metering]);

  // ── Interval-driven animation ──────────────────────────────────────────────
  useEffect(() => {
    if (isUploadingAudio) {
      // Drain all bars to MIN on upload
      barValues.current.forEach(sv => { sv.value = withTiming(MIN_BAR_HEIGHT, { duration: 200 }); });
      return;
    }

    const id = setInterval(() => {
      const db = meteringRef.current;

      // Map real speech dB to pixel height directly
      // expo-audio on device: silence ≈ -50..-40 dB, loud speech ≈ -10..-5 dB
      const targetHeight = interpolate(
        db,
        [-60, -40, -25, -10, 0],
        [MIN_BAR_HEIGHT, MIN_BAR_HEIGHT * 3, MAX_BAR_HEIGHT * 0.45, MAX_BAR_HEIGHT * 0.85, MAX_BAR_HEIGHT],
        Extrapolation.CLAMP,
      );

      const bars = barValues.current;

      // Shift: each bar takes the previous bar's current value (scroll right)
      for (let i = NUM_BARS - 1; i > 0; i--) {
        bars[i].value = withTiming(bars[i - 1].value, { duration: TICK_MS });
      }
      // Newest bar (index 0) gets the fresh sample
      bars[0].value = withTiming(targetHeight, { duration: TICK_MS });

    }, TICK_MS);

    return () => clearInterval(id);
  }, [isUploadingAudio]);

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.elevation.level1,
          paddingBottom: Math.max(bottomInset, 16),
          paddingTop: 16,
        },
      ]}
    >
      {/* Cancel */}
      <TouchableOpacity
        onPress={onCancel}
        style={styles.actionButton}
        disabled={isUploadingAudio}
        accessibilityLabel="Huỷ ghi âm"
      >
        <Ionicons name="trash-outline" size={28} color={theme.colors.error} />
      </TouchableOpacity>

      {/* Centre */}
      <View style={styles.centerSection}>
        {isUploadingAudio ? (
          <View style={styles.uploadingContainer}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
            <Text style={[styles.statusText, { color: theme.colors.primary }]}>
              Đang gửi…
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.barsContainer}>
              {barValues.current.map((sv, i) => (
                <WaveBar
                  key={i}
                  heightSV={sv}
                  opacity={barOpacities.current[i]}
                  color={theme.colors.primary}
                />
              ))}
            </View>

            <Text style={[styles.durationText, { color: theme.colors.onSurface }]}>
              {recordingDuration}
            </Text>
          </>
        )}
      </View>

      {/* Send */}
      <TouchableOpacity
        onPress={onSend}
        style={styles.actionButton}
        disabled={isUploadingAudio}
        accessibilityLabel="Gửi tin nhắn thoại"
      >
        <View style={[styles.sendCircle, { backgroundColor: theme.colors.primary }]}>
          <Ionicons name="send" size={22} color="#fff" />
        </View>
      </TouchableOpacity>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.1)',
    minHeight: 110,
    paddingHorizontal: 12,
    gap: 8,
  },
  actionButton: {
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  centerSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  barsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: MAX_BAR_HEIGHT,
    gap: BAR_GAP,
    overflow: 'hidden',
  },
  uploadingContainer: {
    alignItems: 'center',
    gap: 6,
  },
  bar: {
    borderRadius: BAR_WIDTH / 2,
  },
  durationText: {
    fontSize: 20,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
