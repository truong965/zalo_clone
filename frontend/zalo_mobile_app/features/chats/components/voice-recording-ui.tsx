import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, TouchableOpacity, Text, ActivityIndicator, StyleSheet, PanResponder } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from 'react-native-paper';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
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
const SWIPE_DELETE_THRESHOLD = -72;
const SWIPE_LOCK_THRESHOLD = 72;
const SWIPE_DELETE_RELEASE_THRESHOLD = -48;

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
  isRecording: boolean;
  isUploadingAudio: boolean;
  recordingDuration: string;
  recordingUri?: string | null;
  metering?: number;  // dB -160..0, from expo-audio isMeteringEnabled
  onStartRecording: () => void | Promise<void>;
  onCancel: () => void;
  onSend: () => void;
  onPreview: () => Promise<string | null>;
  bottomInset: number;
}

export function VoiceRecordingUI({
  isRecording,
  isUploadingAudio,
  recordingDuration,
  recordingUri,
  metering = -160,
  onStartRecording,
  onCancel,
  onSend,
  onPreview,
  bottomInset,
}: VoiceRecordingUIProps) {
  const theme = useTheme();
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [shouldAutoPlay, setShouldAutoPlay] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [isHolding, setIsHolding] = useState(false);
  const [isTapRecording, setIsTapRecording] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const isHoldingRef = useRef(false);
  const isLockedRef = useRef(false);
  const deleteArmedRef = useRef(false);
  const lastHoldDxRef = useRef(0);
  const holdStartedAtRef = useRef(0);
  const movedDuringHoldRef = useRef(false);
  const [minutesStr, secondsStr] = recordingDuration.split(':');
  const canSend = Number(minutesStr) * 60 + Number(secondsStr) >= 3;
  const playbackSource = recordingUri || previewUri || '';
  const player = useAudioPlayer(playbackSource);
  const playerStatus = useAudioPlayerStatus(player);
  const isPreviewPlaying = playerStatus.playing ?? false;
  const isClipReady = !!playbackSource;
  const hasRecordDraft = isTapRecording || isLocked || isClipReady;
  const canPreview = isLocked || isClipReady;
  const shouldShowTimeline = isUploadingAudio || isRecording || isClipReady;

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

  useEffect(() => {
    isHoldingRef.current = isHolding;
  }, [isHolding]);

  useEffect(() => {
    isLockedRef.current = isLocked;
  }, [isLocked]);

  useEffect(() => {
    deleteArmedRef.current = deleteArmed;
  }, [deleteArmed]);

  // ── Interval-driven animation ──────────────────────────────────────────────
  useEffect(() => {
    if (isUploadingAudio) {
      // Drain all bars to MIN on upload
      barValues.current.forEach(sv => { sv.value = withTiming(MIN_BAR_HEIGHT, { duration: 200 }); });
      return;
    }

    const id = setInterval(() => {
      const now = Date.now();
      let targetHeight = MIN_BAR_HEIGHT;

      if (!isRecording && isPreviewPlaying) {
        // Replay mode: animate a pleasant moving envelope even without live metering.
        const phase = (now % 1200) / 1200;
        const wave = Math.sin(phase * Math.PI * 2);
        const pulse = Math.abs(wave);
        targetHeight = MIN_BAR_HEIGHT + pulse * (MAX_BAR_HEIGHT * 0.85);
      } else {
        const db = meteringRef.current;
        // Live record mode: map speech dB to waveform height.
        targetHeight = interpolate(
          db,
          [-60, -40, -25, -10, 0],
          [MIN_BAR_HEIGHT, MIN_BAR_HEIGHT * 3, MAX_BAR_HEIGHT * 0.45, MAX_BAR_HEIGHT * 0.85, MAX_BAR_HEIGHT],
          Extrapolation.CLAMP,
        );
      }

      const bars = barValues.current;

      // Shift: each bar takes the previous bar's current value (scroll right)
      for (let i = NUM_BARS - 1; i > 0; i--) {
        bars[i].value = withTiming(bars[i - 1].value, { duration: TICK_MS });
      }
      // Newest bar (index 0) gets the fresh sample
      bars[0].value = withTiming(targetHeight, { duration: TICK_MS });

    }, TICK_MS);

    return () => clearInterval(id);
  }, [isUploadingAudio, isRecording, isPreviewPlaying]);

  const handlePreview = async () => {
    const uri = recordingUri || previewUri || (await onPreview());
    if (!uri) return;

    if (!recordingUri && !previewUri) {
      setPreviewUri(uri);
      setShouldAutoPlay(true);
      return;
    }

    if (isPreviewPlaying) {
      player.pause();
      return;
    }
    player.play();
  };

  const resetHoldStates = () => {
    isHoldingRef.current = false;
    isLockedRef.current = false;
    deleteArmedRef.current = false;
    setIsHolding(false);
    setIsLocked(false);
    setIsTapRecording(false);
    setDeleteArmed(false);
    movedDuringHoldRef.current = false;
    holdStartedAtRef.current = 0;
  };

  const handleDelete = async () => {
    if (isPreviewPlaying) player.pause();
    setPreviewUri(null);
    await onCancel();
    resetHoldStates();
  };

  const handleSendPress = async () => {
    if (isUploadingAudio) return;
    await onSend();
    setPreviewUri(null);
    resetHoldStates();
  };

  const handleHoldStart = async () => {
    if (isUploadingAudio || isLocked || isClipReady) return;
    holdStartedAtRef.current = Date.now();
    movedDuringHoldRef.current = false;
    lastHoldDxRef.current = 0;
    isHoldingRef.current = true;
    deleteArmedRef.current = false;
    setIsTapRecording(false);
    setIsHolding(true);
    setDeleteArmed(false);
    await onStartRecording();
  };

  const handleHoldRelease = async (releasedDx?: number) => {
    if (!isHoldingRef.current && holdStartedAtRef.current === 0) return;
    const dx = releasedDx ?? lastHoldDxRef.current;
    const shouldDeleteBySwipe =
      deleteArmedRef.current || (!isLockedRef.current && dx <= SWIPE_DELETE_RELEASE_THRESHOLD);
    if (shouldDeleteBySwipe) {
      await handleDelete();
      return;
    }
    if (isLockedRef.current) {
      isHoldingRef.current = false;
      setIsHolding(false);
      setIsTapRecording(false);
      return;
    }
    const holdDuration = Date.now() - holdStartedAtRef.current;
    const isTapIntent = holdDuration < 220 && !movedDuringHoldRef.current;
    if (isTapIntent) {
      // Tap: treat as locked mode (same outcome as swipe-right to lock).
      isLockedRef.current = true;
      setIsHolding(false);
      setIsLocked(true);
      setIsTapRecording(true);
      return;
    }
    isHoldingRef.current = false;
    setIsHolding(false);
    setIsTapRecording(false);
    await onSend();
  };

  const holdPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          void handleHoldStart();
        },
        onPanResponderMove: (_evt, gestureState) => {
          if (!isHoldingRef.current && !isRecording) return;

          const dx = gestureState.dx;
          lastHoldDxRef.current = dx;
          if (Math.abs(dx) > 10) movedDuringHoldRef.current = true;
          if (!isLockedRef.current && dx <= SWIPE_DELETE_THRESHOLD) {
            if (!deleteArmedRef.current) {
              deleteArmedRef.current = true;
              setDeleteArmed(true);
            }
            return;
          }

          if (!isLockedRef.current && dx >= SWIPE_LOCK_THRESHOLD) {
            isLockedRef.current = true;
            deleteArmedRef.current = false;
            setIsLocked(true);
            setDeleteArmed(false);
            return;
          }

          // Keep delete armed until release once user has crossed delete threshold.
          // This avoids accidental "send" when finger slightly bounces back on lift.
        },
        onPanResponderRelease: (_evt, gestureState) => {
          void handleHoldRelease(gestureState.dx);
        },
        onPanResponderTerminate: (_evt, gestureState) => {
          void handleHoldRelease(gestureState.dx);
        },
      }),
    [isHolding, isRecording, isLocked, deleteArmed, isUploadingAudio, isClipReady, onSend, onStartRecording],
  );

  useEffect(() => {
    if (!isRecording && !recordingUri && !isUploadingAudio && !isLocked && !isHolding) {
      setDeleteArmed(false);
      setIsTapRecording(false);
      setPreviewUri(null);
    }
  }, [isRecording, recordingUri, isUploadingAudio, isLocked, isHolding]);

  useEffect(() => {
    if (shouldAutoPlay && playbackSource) {
      player.play();
      setShouldAutoPlay(false);
    }
  }, [shouldAutoPlay, playbackSource, player]);

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.background,
          paddingBottom: Math.max(bottomInset, 16),
          paddingTop: 12,
        },
      ]}
    >
      <>
      {shouldShowTimeline && (
        <View style={[styles.waveBubble, { backgroundColor: theme.colors.elevation.level2 }]}>
          {isUploadingAudio ? (
            <View style={styles.uploadingContainer}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
              <Text style={[styles.statusText, { color: theme.colors.primary }]}>Đang gửi…</Text>
            </View>
          ) : (
            <>
              <View style={[styles.liveDot, { backgroundColor: isRecording ? '#ef4444' : theme.colors.outline }]} />
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
              <Text style={[styles.timeText, { color: theme.colors.onSurfaceVariant }]}>
                {recordingDuration}
              </Text>
            </>
          )}
        </View>
      )}

      <View style={styles.actionsRow}>
        <TouchableOpacity
          onPress={handleDelete}
          style={[
            styles.sideButton,
            { backgroundColor: theme.colors.elevation.level1, opacity: hasRecordDraft || isHolding ? 1 : 0.45 },
          ]}
          disabled={isUploadingAudio || (!hasRecordDraft && !isHolding)}
          accessibilityLabel="Huỷ ghi âm"
        >
          <Ionicons name="trash" size={22} color={theme.colors.onSurfaceVariant} />
        </TouchableOpacity>

        {hasRecordDraft ? (
          <TouchableOpacity
            onPress={handleSendPress}
            style={styles.primaryAction}
            disabled={isUploadingAudio}
            accessibilityLabel="Gửi tin nhắn thoại"
          >
            <View
              style={[
                styles.sendCircle,
                { backgroundColor: theme.colors.primary },
              ]}
            >
              <Ionicons name="send" size={24} color="#fff" />
            </View>
            <Text style={[styles.primaryLabel, { color: theme.colors.onSurface }]}>Gửi ngay</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.primaryAction} {...holdPanResponder.panHandlers}>
            <View
              style={[
                styles.holdCircle,
                { backgroundColor: theme.colors.primary },
              ]}
            >
              <Ionicons name="mic" size={36} color="#fff" />
            </View>
            <Text style={[styles.primaryLabel, { color: theme.colors.onSurface }]}>Giữ để ghi</Text>
          </View>
        )}

        <TouchableOpacity
          onPress={canPreview ? handlePreview : undefined}
          style={[
            styles.sideButton,
            { backgroundColor: theme.colors.elevation.level1, opacity: canPreview ? 1 : 0.45 },
          ]}
          disabled={isUploadingAudio || !canPreview}
          accessibilityLabel="Nghe lại"
        >
          <Ionicons
            name={canPreview ? (isPreviewPlaying ? 'pause' : 'play') : 'lock-closed'}
            size={22}
            color={theme.colors.onSurfaceVariant}
          />
        </TouchableOpacity>
      </View>
      </>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.12)',
    paddingHorizontal: 12,
  },
  initialWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 280,
    gap: 28,
  },
  initialTitle: {
    fontSize: 20,
    fontWeight: '500',
  },
  initialMicButton: {
    width: 142,
    height: 142,
    borderRadius: 71,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
  },
  holdButtonSmall: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
  },
  holdGestureRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  holdSideAction: {
    width: 84,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  holdSideLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  holdCenterButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  waveBubble: {
    minHeight: 50,
    borderRadius: 25,
    paddingHorizontal: 14,
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    marginBottom: 12,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 10,
  },
  sendCircle: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  holdCircle: {
    width: 93,
    height: 93,
    borderRadius: 46.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  primaryAction: {
    width: 120,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 96,
  },
  sideButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 28,
    overflow: 'hidden',
    flex: 1,
    gap: BAR_GAP,
  },
  uploadingContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  bar: {
    borderRadius: BAR_WIDTH / 2,
  },
  timeText: {
    minWidth: 44,
    textAlign: 'right',
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  primaryLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
