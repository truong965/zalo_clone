/**
 * useAdaptiveBitrate — Network-aware quality adaptation for WebRTC.
 *
 * Adjusts video sender parameters based on connection quality:
 *
 * | Quality      | Max Resolution | Max Bitrate  | Framerate |
 * |--------------|----------------|--------------|-----------|
 * | GOOD         | 1280×720       | 2,500 kbps   | 30 fps    |
 * | MEDIUM       | 854×480        | 1,000 kbps   | 24 fps    |
 * | POOR         | 640×360        | 500 kbps     | 15 fps    |
 * | DISCONNECTED | audio-only     | 64 kbps      | 0 fps     |
 *
 * Uses sender.setParameters() to modify maxBitrate, scaleResolutionDownBy,
 * and maxFramerate on the video RTP sender.
 *
 * Quality ramp-up is gradual: POOR → MEDIUM waits 5s stable before upgrading.
 * Downgrade is immediate for responsiveness.
 *
 * Following vercel-react-best-practices:
 * - rerender-use-ref-transient-values: All transient state in refs
 * - js-early-exit: Return early when no sender/parameters
 * - advanced-event-handler-refs: Stable callbacks
 */

import { useRef, useCallback, useEffect } from 'react';
import { useCallStore } from '../stores/call.store';
import type { ConnectionQuality } from '../types';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Stabilization time before upgrading quality (prevent oscillation) */
const UPGRADE_STABILIZE_MS = 5_000;

/** Quality tier ordering for comparison */
const QUALITY_ORDER: Record<ConnectionQuality, number> = {
      DISCONNECTED: 0,
      POOR: 1,
      MEDIUM: 2,
      GOOD: 3,
};

// ── Bitrate profiles from Phase 6 plan ────────────────────────────────

interface BitrateProfile {
      /** Max video bitrate in bps */
      maxBitrate: number;
      /** Scale factor (1 = native, 2 = half, etc.) */
      scaleResolutionDownBy: number;
      /** Max framerate */
      maxFramerate: number;
      /** Whether to disable video track entirely */
      disableVideo: boolean;
}

const PROFILES: Record<ConnectionQuality, BitrateProfile> = {
      GOOD: {
            maxBitrate: 2_500_000,
            scaleResolutionDownBy: 1,     // 1280×720 native
            maxFramerate: 30,
            disableVideo: false,
      },
      MEDIUM: {
            maxBitrate: 1_000_000,
            scaleResolutionDownBy: 1.5,   // ~854×480
            maxFramerate: 24,
            disableVideo: false,
      },
      POOR: {
            maxBitrate: 500_000,
            scaleResolutionDownBy: 2,     // ~640×360
            maxFramerate: 15,
            disableVideo: false,
      },
      DISCONNECTED: {
            maxBitrate: 64_000,
            scaleResolutionDownBy: 4,
            maxFramerate: 0,
            disableVideo: true,           // Audio-only fallback
      },
};

// ============================================================================
// HOOK
// ============================================================================

export function useAdaptiveBitrate() {
      const currentTierRef = useRef<ConnectionQuality>('GOOD');
      const upgradeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
      const pcRef = useRef<RTCPeerConnection | null>(null);

      /**
       * Apply a bitrate profile to the video sender.
       */
      const applyProfile = useCallback(
            (pc: RTCPeerConnection, quality: ConnectionQuality) => {
                  const profile = PROFILES[quality];
                  const senders = pc.getSenders();
                  const videoSender = senders.find((s) => s.track?.kind === 'video');

                  if (!videoSender) return; // Audio-only call — nothing to adjust

                  // ── Disable/enable video track ──
                  if (profile.disableVideo) {
                        if (videoSender.track) {
                              videoSender.track.enabled = false;
                        }
                        currentTierRef.current = quality;
                        return;
                  }

                  // Re-enable video if coming back from DISCONNECTED
                  if (videoSender.track && !videoSender.track.enabled) {
                        // Only re-enable if user hasn't manually turned off camera
                        const isCameraOff = useCallStore.getState().isCameraOff;
                        if (!isCameraOff) {
                              videoSender.track.enabled = true;
                        }
                  }

                  // ── Set sender parameters ──
                  const params = videoSender.getParameters();
                  if (!params.encodings || params.encodings.length === 0) {
                        // Some browsers need initial encodings
                        params.encodings = [{}];
                  }

                  for (const encoding of params.encodings) {
                        encoding.maxBitrate = profile.maxBitrate;
                        encoding.scaleResolutionDownBy = profile.scaleResolutionDownBy;
                        encoding.maxFramerate = profile.maxFramerate;
                  }

                  videoSender.setParameters(params).catch(() => {
                        // setParameters can fail during renegotiation — safe to ignore
                  });

                  currentTierRef.current = quality;
            },
            [],
      );

      /**
       * Adapt bitrate based on new quality reading.
       *
       * Downgrade: immediate (responsive to network degradation).
       * Upgrade: delayed by UPGRADE_STABILIZE_MS (prevent oscillation).
       */
      const adaptToQuality = useCallback(
            (quality: ConnectionQuality) => {
                  const pc = pcRef.current;
                  if (!pc) return;

                  const currentOrder = QUALITY_ORDER[currentTierRef.current];
                  const newOrder = QUALITY_ORDER[quality];

                  // Same quality — nothing to do
                  if (quality === currentTierRef.current) {
                        // Clear any pending upgrade since we're stable at current level
                        if (upgradeTimerRef.current) {
                              clearTimeout(upgradeTimerRef.current);
                              upgradeTimerRef.current = null;
                        }
                        return;
                  }

                  // ── Downgrade → apply immediately ──
                  if (newOrder < currentOrder) {
                        // Cancel any pending upgrade
                        if (upgradeTimerRef.current) {
                              clearTimeout(upgradeTimerRef.current);
                              upgradeTimerRef.current = null;
                        }
                        applyProfile(pc, quality);
                        return;
                  }

                  // ── Upgrade → wait for stabilization ──
                  // Only upgrade ONE step at a time (e.g., POOR → MEDIUM, not POOR → GOOD)
                  if (upgradeTimerRef.current) return; // Already waiting for an upgrade

                  const targetOrder = Math.min(currentOrder + 1, 3);
                  const targetQuality = (
                        Object.entries(QUALITY_ORDER) as [ConnectionQuality, number][]
                  ).find(([, order]) => order === targetOrder)?.[0];

                  if (!targetQuality) return;

                  upgradeTimerRef.current = setTimeout(() => {
                        upgradeTimerRef.current = null;
                        // Re-check: quality must still be at or above target
                        const currentStoreQuality = useCallStore.getState().connectionQuality;
                        if (QUALITY_ORDER[currentStoreQuality] >= targetOrder) {
                              applyProfile(pc, targetQuality);
                        }
                  }, UPGRADE_STABILIZE_MS);
            },
            [applyProfile],
      );

      /**
       * Bind to a RTCPeerConnection instance.
       * Sets initial profile to GOOD.
       */
      const bindPeerConnection = useCallback(
            (pc: RTCPeerConnection) => {
                  pcRef.current = pc;
                  currentTierRef.current = 'GOOD';
                  // Apply initial GOOD profile once negotiation completes
                  // (setParameters can fail before first offer/answer exchange)
            },
            [],
      );

      /**
       * Unbind and cleanup.
       */
      const unbind = useCallback(() => {
            pcRef.current = null;
            if (upgradeTimerRef.current) {
                  clearTimeout(upgradeTimerRef.current);
                  upgradeTimerRef.current = null;
            }
      }, []);

      // ── Subscribe to quality changes from the store ─────────────────────
      useEffect(() => {
            let prevQuality = useCallStore.getState().connectionQuality;
            const unsubscribe = useCallStore.subscribe((state) => {
                  const quality = state.connectionQuality;
                  if (quality !== prevQuality) {
                        prevQuality = quality;
                        adaptToQuality(quality);
                  }
            });
            return unsubscribe;
      }, [adaptToQuality]);

      // Cleanup on unmount
      useEffect(() => unbind, [unbind]);

      return {
            bindPeerConnection,
            unbind,
            /** Get current applied tier (non-reactive) */
            getCurrentTier: () => currentTierRef.current,
      };
}
