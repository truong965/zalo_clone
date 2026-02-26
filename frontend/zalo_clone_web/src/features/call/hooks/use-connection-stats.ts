/**
 * useConnectionStats — RTCPeerConnection stats monitor.
 *
 * Polls `pc.getStats()` every 2s to extract network quality metrics:
 * - Round-trip time (RTT)
 * - Packet loss ratio
 * - Jitter
 * - Frames per second (video calls)
 * - Bytes received delta (throughput proxy)
 *
 * Computes a quality score based on Phase 6 thresholds:
 *   GOOD:         RTT < 150ms, loss < 2%, jitter < 30ms
 *   MEDIUM:       RTT < 300ms, loss < 5%, jitter < 50ms
 *   POOR:         anything worse
 *   DISCONNECTED: no stats for >= 3s
 *
 * Updates the call store's `connectionQuality` field.
 *
 * Following vercel-react-best-practices:
 * - rerender-use-ref-transient-values: All transient stats in refs (no re-renders)
 * - js-early-exit: Return early when PC not connected
 * - advanced-event-handler-refs: Stable callback via ref
 */

import { useRef, useCallback, useEffect } from 'react';
import { useCallStore } from '../stores/call.store';
import type { ConnectionQuality } from '../types';

// ============================================================================
// CONSTANTS
// ============================================================================

/** How often to poll getStats() */
const STATS_POLL_INTERVAL_MS = 2_000;

/** If no valid stats for this long → DISCONNECTED */
const NO_STATS_DISCONNECT_MS = 3_000;

// ── Quality thresholds (from Phase 6 plan) ────────────────────────────

const THRESHOLD_GOOD = { rtt: 0.15, lossRate: 0.02, jitter: 0.03 } as const;
const THRESHOLD_MEDIUM = { rtt: 0.3, lossRate: 0.05, jitter: 0.05 } as const;

// ============================================================================
// TYPES
// ============================================================================

/** Raw stats snapshot extracted from getStats() */
export interface ConnectionStatsSnapshot {
      /** Average round-trip time in seconds */
      rtt: number;
      /** Packet loss ratio (0–1) */
      lossRate: number;
      /** Jitter in seconds */
      jitter: number;
      /** Video frames per second (0 for audio-only) */
      fps: number;
      /** Bytes received since last snapshot (throughput proxy) */
      bytesReceivedDelta: number;
      /** Computed quality from thresholds */
      quality: ConnectionQuality;
      /** Timestamp of this snapshot */
      timestamp: number;
}

// ============================================================================
// HOOK
// ============================================================================

export function useConnectionStats() {
      const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
      const lastStatsTimeRef = useRef<number>(0);
      const prevBytesReceivedRef = useRef<number>(0);
      const latestSnapshotRef = useRef<ConnectionStatsSnapshot | null>(null);

      /**
       * Compute quality score from raw metrics.
       * Follows Phase 6 thresholds exactly.
       */
      const computeQuality = useCallback(
            (rtt: number, lossRate: number, jitter: number): ConnectionQuality => {
                  if (
                        rtt <= THRESHOLD_GOOD.rtt &&
                        lossRate <= THRESHOLD_GOOD.lossRate &&
                        jitter <= THRESHOLD_GOOD.jitter
                  ) {
                        return 'GOOD';
                  }
                  if (
                        rtt <= THRESHOLD_MEDIUM.rtt &&
                        lossRate <= THRESHOLD_MEDIUM.lossRate &&
                        jitter <= THRESHOLD_MEDIUM.jitter
                  ) {
                        return 'MEDIUM';
                  }
                  return 'POOR';
            },
            [],
      );

      /**
       * Single poll cycle: extract metrics from getStats(), compute quality, update store.
       */
      const pollStats = useCallback(
            async (pc: RTCPeerConnection) => {
                  // Early exit if PC is not in a connected state
                  if (pc.connectionState !== 'connected' && pc.iceConnectionState !== 'connected') {
                        // Check no-stats timeout
                        if (lastStatsTimeRef.current > 0) {
                              const elapsed = Date.now() - lastStatsTimeRef.current;
                              if (elapsed >= NO_STATS_DISCONNECT_MS) {
                                    useCallStore.getState().setConnectionQuality('DISCONNECTED');
                              }
                        }
                        return;
                  }

                  try {
                        const stats = await pc.getStats();

                        let totalRtt = 0;
                        let rttCount = 0;
                        let totalPacketsLost = 0;
                        let totalPacketsReceived = 0;
                        let totalJitter = 0;
                        let jitterCount = 0;
                        let totalBytesReceived = 0;
                        let fps = 0;

                        stats.forEach((report) => {
                              // ── RTT from active candidate pair ──
                              if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                                    if (typeof report.currentRoundTripTime === 'number') {
                                          totalRtt += report.currentRoundTripTime;
                                          rttCount++;
                                    }
                              }

                              // ── Inbound RTP for audio → loss + jitter ──
                              if (report.type === 'inbound-rtp' && report.kind === 'audio') {
                                    totalPacketsLost += report.packetsLost ?? 0;
                                    totalPacketsReceived += report.packetsReceived ?? 0;
                                    if (typeof report.jitter === 'number') {
                                          totalJitter += report.jitter;
                                          jitterCount++;
                                    }
                                    totalBytesReceived += report.bytesReceived ?? 0;
                              }

                              // ── Inbound RTP for video → fps + bytes ──
                              if (report.type === 'inbound-rtp' && report.kind === 'video') {
                                    if (typeof report.framesPerSecond === 'number') {
                                          fps = report.framesPerSecond;
                                    }
                                    totalBytesReceived += report.bytesReceived ?? 0;
                              }
                        });

                        // No valid candidate-pair data → skip
                        if (rttCount === 0) return;

                        const avgRtt = totalRtt / rttCount;
                        const lossRate =
                              totalPacketsReceived > 0
                                    ? totalPacketsLost / (totalPacketsLost + totalPacketsReceived)
                                    : 0;
                        const avgJitter = jitterCount > 0 ? totalJitter / jitterCount : 0;
                        const bytesDelta = totalBytesReceived - prevBytesReceivedRef.current;
                        prevBytesReceivedRef.current = totalBytesReceived;

                        const quality = computeQuality(avgRtt, lossRate, avgJitter);

                        const snapshot: ConnectionStatsSnapshot = {
                              rtt: avgRtt,
                              lossRate,
                              jitter: avgJitter,
                              fps,
                              bytesReceivedDelta: bytesDelta,
                              quality,
                              timestamp: Date.now(),
                        };

                        latestSnapshotRef.current = snapshot;
                        lastStatsTimeRef.current = Date.now();

                        // Update store (only if quality changed — avoid unnecessary re-renders)
                        const currentQuality = useCallStore.getState().connectionQuality;
                        if (currentQuality !== quality) {
                              useCallStore.getState().setConnectionQuality(quality);
                        }
                  } catch {
                        // Stats retrieval can fail if PC is closing — safe to ignore
                  }
            },
            [computeQuality],
      );

      /**
       * Start polling stats for a given RTCPeerConnection.
       * Automatically stops any existing polling session.
       */
      const startMonitoring = useCallback(
            (pc: RTCPeerConnection) => {
                  stopMonitoring();
                  lastStatsTimeRef.current = Date.now();
                  prevBytesReceivedRef.current = 0;

                  timerRef.current = setInterval(() => {
                        void pollStats(pc);
                  }, STATS_POLL_INTERVAL_MS);
            },
            [pollStats],
      );

      /**
       * Stop polling stats.
       */
      const stopMonitoring = useCallback(() => {
            if (timerRef.current) {
                  clearInterval(timerRef.current);
                  timerRef.current = null;
            }
            latestSnapshotRef.current = null;
      }, []);

      /**
       * Get the latest stats snapshot (non-reactive, use for imperative reads).
       */
      const getLatestSnapshot = useCallback((): ConnectionStatsSnapshot | null => {
            return latestSnapshotRef.current;
      }, []);

      // Cleanup on unmount
      useEffect(() => stopMonitoring, [stopMonitoring]);

      return {
            startMonitoring,
            stopMonitoring,
            getLatestSnapshot,
      };
}
