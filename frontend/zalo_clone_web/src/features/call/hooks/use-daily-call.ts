/**
 * useDailyCall — Manages Daily.co call lifecycle.
 *
 * Responsibilities:
 * - Lazy-load @daily-co/daily-js SDK (bundle-conditional: ~200KB avoided from main chunk)
 * - Create/destroy Daily call object
 * - Join/leave Daily.co rooms with meeting tokens
 * - Map Daily participant events → Zustand call store
 * - Handle audio/video toggle via Daily API
 *
 * Usage: Wired by CallManager when provider switches to DAILY_CO.
 *
 * Following vercel-react-best-practices:
 * - bundle-conditional: Lazy import of daily-js
 * - rerender-use-ref-transient-values: Refs for call object
 * - advanced-event-handler-refs: Stable callbacks via refs
 */

import { useCallback, useEffect, useRef } from 'react';
import { useCallStore } from '../stores/call.store';
import type { DailyParticipant } from '../types';

// ============================================================================
// TYPES (from @daily-co/daily-js, kept minimal to avoid import at module level)
// ============================================================================

/** Minimal Daily call object interface for our usage */
interface DailyCallObject {
      join: (options: { url: string; token: string }) => Promise<unknown>;
      leave: () => Promise<void>;
      destroy: () => Promise<void>;
      setLocalAudio: (enabled: boolean) => void;
      setLocalVideo: (enabled: boolean) => void;
      participants: () => Record<string, DailyParticipantRaw>;
      on: (event: string, handler: (...args: unknown[]) => void) => void;
      off: (event: string, handler: (...args: unknown[]) => void) => void;
}

interface DailyParticipantRaw {
      session_id: string;
      user_id: string;
      user_name: string;
      local: boolean;
      audio: boolean;
      video: boolean;
      tracks: {
            audio: { persistentTrack?: MediaStreamTrack; state: string };
            video: { persistentTrack?: MediaStreamTrack; state: string };
      };
}

// ============================================================================
// HOOK
// ============================================================================

export function useDailyCall() {
      const callObjectRef = useRef<DailyCallObject | null>(null);
      const isJoinedRef = useRef(false);

      // ── Cleanup ─────────────────────────────────────────────────────────

      const cleanup = useCallback(async () => {
            if (callObjectRef.current) {
                  try {
                        if (isJoinedRef.current) {
                              await callObjectRef.current.leave();
                        }
                        await callObjectRef.current.destroy();
                  } catch {
                        // Safe to ignore — already destroyed
                  }
                  callObjectRef.current = null;
                  isJoinedRef.current = false;
            }
      }, []);

      // Cleanup on unmount
      useEffect(() => {
            return () => {
                  void cleanup();
            };
      }, [cleanup]);

      // ── Map Daily participants → store ──────────────────────────────────

      const syncParticipants = useCallback(() => {
            const callObject = callObjectRef.current;
            if (!callObject) return;

            const rawParticipants = callObject.participants();
            const mapped: DailyParticipant[] = Object.values(rawParticipants).map(
                  (p: DailyParticipantRaw) => ({
                        sessionId: p.session_id,
                        userId: p.user_id,
                        displayName: p.user_name,
                        isLocal: p.local,
                        audioTrack: p.tracks.audio.persistentTrack ?? null,
                        videoTrack: p.tracks.video.persistentTrack ?? null,
                        audioEnabled: p.audio,
                        videoEnabled: p.video,
                  }),
            );

            useCallStore.getState().setDailyParticipants(mapped);
      }, []);

      // ── Join a Daily.co room ────────────────────────────────────────────

      const join = useCallback(
            async (roomUrl: string, token: string) => {
                  // Lazy-load Daily.co SDK (bundle-conditional pattern)
                  const DailyIframe = await import('@daily-co/daily-js');
                  const Daily = DailyIframe.default;

                  // Cleanup any existing call object
                  await cleanup();

                  // Create new call object
                  const callObject = Daily.createCallObject({
                        audioSource: true,
                        videoSource: true,
                  }) as unknown as DailyCallObject;

                  callObjectRef.current = callObject;

                  // ── Register event handlers ──────────────────────────────────

                  callObject.on('joined-meeting', () => {
                        isJoinedRef.current = true;
                        syncParticipants();
                  });

                  callObject.on('participant-joined', () => {
                        syncParticipants();
                  });

                  callObject.on('participant-updated', () => {
                        syncParticipants();
                  });

                  callObject.on('participant-left', () => {
                        syncParticipants();
                  });

                  callObject.on('left-meeting', () => {
                        isJoinedRef.current = false;
                        useCallStore.getState().setDailyParticipants([]);
                  });

                  callObject.on('error', (event: unknown) => {
                        const errorEvent = event as { errorMsg?: string } | undefined;
                        const message = errorEvent?.errorMsg ?? 'Daily.co error';
                        useCallStore.getState().setError(message);
                  });

                  // ── Phase 6: Network quality from Daily.co SFU ────────────
                  callObject.on('network-quality-change', (event: unknown) => {
                        const qualityEvent = event as {
                              threshold?: string;
                              quality?: number;
                        } | undefined;

                        // Daily.co sends threshold: 'good' | 'low' | 'very-low'
                        // or quality: 100 (good) / 60 (low) / 30 (very-low)
                        const threshold = qualityEvent?.threshold;

                        switch (threshold) {
                              case 'good':
                                    useCallStore.getState().setConnectionQuality('GOOD');
                                    break;
                              case 'low':
                                    useCallStore.getState().setConnectionQuality('MEDIUM');
                                    break;
                              case 'very-low':
                                    useCallStore.getState().setConnectionQuality('POOR');
                                    break;
                              default: {
                                    // Fallback: use numeric quality if threshold unavailable
                                    const q = qualityEvent?.quality;
                                    if (typeof q === 'number') {
                                          if (q >= 80) {
                                                useCallStore.getState().setConnectionQuality('GOOD');
                                          } else if (q >= 50) {
                                                useCallStore.getState().setConnectionQuality('MEDIUM');
                                          } else {
                                                useCallStore.getState().setConnectionQuality('POOR');
                                          }
                                    }
                                    break;
                              }
                        }
                  });

                  // ── Join the room ────────────────────────────────────────────

                  try {
                        await callObject.join({ url: roomUrl, token });
                  } catch (err) {
                        const message =
                              err instanceof Error
                                    ? err.message
                                    : 'Failed to join Daily.co room';
                        useCallStore.getState().setError(message);
                        await cleanup();
                  }
            },
            [cleanup, syncParticipants],
      );

      // ── Leave the Daily.co room ─────────────────────────────────────────

      const leave = useCallback(async () => {
            await cleanup();
      }, [cleanup]);

      // ── Toggle audio ────────────────────────────────────────────────────

      const toggleAudio = useCallback((enabled: boolean) => {
            callObjectRef.current?.setLocalAudio(enabled);
      }, []);

      // ── Toggle video ────────────────────────────────────────────────────

      const toggleVideo = useCallback((enabled: boolean) => {
            callObjectRef.current?.setLocalVideo(enabled);
      }, []);

      return {
            join,
            leave,
            toggleAudio,
            toggleVideo,
            cleanup,
      };
}
