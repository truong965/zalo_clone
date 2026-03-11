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
import type { CallType, DailyParticipant } from '../types';

// ── Debug helper ──────────────────────────────────────────────────────
const DEBUG = import.meta.env.DEV;
function dbg(label: string, ...args: unknown[]) {
      if (DEBUG) console.warn(`[Daily] ${label}`, ...args);
}

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
      /** Set custom user data visible to other participants */
      setUserData: (data: Record<string, unknown>) => void;
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
      /** Custom data passed via meeting token or setUserData */
      userData?: { avatarUrl?: string };
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
                        avatarUrl: p.userData?.avatarUrl,
                  }),
            );

            // dbg('syncParticipants', {
            //       count: mapped.length,
            //       participants: mapped.map(p => ({
            //             name: p.displayName,
            //             isLocal: p.isLocal,
            //             hasVideo: !!p.videoTrack,
            //             videoEnabled: p.videoEnabled,
            //             hasAudio: !!p.audioTrack,
            //             videoState: (rawParticipants[Object.keys(rawParticipants).find(k => rawParticipants[k].session_id === p.sessionId) ?? '']?.tracks?.video as { state?: string })?.state,
            //       })),
            // });

            useCallStore.getState().setDailyParticipants(mapped);
      }, []);

      // ── Join a Daily.co room ────────────────────────────────────────────

      const join = useCallback(
            async (roomUrl: string, token: string, _callType?: CallType, avatarUrl?: string) => {
                  dbg('join called', { roomUrl, hasToken: !!token, _callType, avatarUrl });
                  // Lazy-load Daily.co SDK (bundle-conditional pattern)
                  const DailyIframe = await import('@daily-co/daily-js');
                  const Daily = DailyIframe.default;

                  // Cleanup any existing call object
                  await cleanup();

                  // Camera decision: respect store’s isCameraOff (set by user’s
                  // pre-call choice in ChatHeader). Falls back to callType when
                  // store hasn’t been explicitly set (e.g. incoming call accept).
                  const storeState = useCallStore.getState();
                  const wantCameraOff = storeState.isCameraOff;

                  // ── Detect available devices before creating call object ────
                  // When testing with 2 tabs on the same machine, the second tab
                  // may not have camera access (NotFoundError). Detect this upfront
                  // so we can create the call object with appropriate settings.
                  let hasVideoDevice = true;
                  try {
                        const devices = await navigator.mediaDevices.enumerateDevices();
                        const videoInputs = devices.filter(d => d.kind === 'videoinput');
                        hasVideoDevice = videoInputs.length > 0;
                        dbg('Device detection', { videoInputs: videoInputs.length, audioInputs: devices.filter(d => d.kind === 'audioinput').length });

                        // Extra check: try acquiring video briefly to confirm it's usable
                        if (hasVideoDevice) {
                              try {
                                    const testStream = await navigator.mediaDevices.getUserMedia({ video: true });
                                    for (const track of testStream.getTracks()) track.stop();
                              } catch {
                                    dbg('Device detection: camera listed but not accessible, treating as unavailable');
                                    hasVideoDevice = false;
                              }
                        }
                  } catch {
                        dbg('Device detection: enumerateDevices failed, assuming video available');
                  }

                  const useVideo = hasVideoDevice && !wantCameraOff;
                  dbg('Camera decision', { hasVideoDevice, wantCameraOff, useVideo });

                  // Create call object. Use videoSource: false when camera is
                  // unavailable so Daily.co doesn't fail trying to acquire it.
                  // Note: if camera becomes available later, setLocalVideo(true) may
                  // still work on some browsers as Daily re-checks device list.
                  const callObject = Daily.createCallObject({
                        audioSource: true,
                        videoSource: hasVideoDevice,
                  }) as unknown as DailyCallObject;

                  callObjectRef.current = callObject;

                  // ── Register event handlers ──────────────────────────────────

                  callObject.on('joined-meeting', () => {
                        dbg('joined-meeting event');
                        isJoinedRef.current = true;
                        syncParticipants();
                  });

                  callObject.on('participant-joined', () => {
                        dbg('participant-joined event');
                        syncParticipants();
                  });

                  callObject.on('participant-updated', () => {
                        syncParticipants();
                  });

                  // Track events: these fire when a remote track actually becomes
                  // playable (or stops). More reliable than participant-updated for
                  // knowing when video is ready to render.
                  callObject.on('track-started', (event: unknown) => {
                        const ev = event as { participant?: { session_id?: string }; track?: { kind?: string } } | undefined;
                        dbg('track-started', {
                              sessionId: ev?.participant?.session_id,
                              kind: ev?.track?.kind,
                        });
                        syncParticipants();
                  });

                  callObject.on('track-stopped', (event: unknown) => {
                        const ev = event as { participant?: { session_id?: string }; track?: { kind?: string } } | undefined;
                        dbg('track-stopped', {
                              sessionId: ev?.participant?.session_id,
                              kind: ev?.track?.kind,
                        });
                        syncParticipants();
                  });

                  callObject.on('participant-left', () => {
                        dbg('participant-left event');
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
                        dbg('Successfully joined Daily.co room');

                        // Broadcast avatar URL to other participants via userData
                        if (avatarUrl) {
                              callObject.setUserData({ avatarUrl });
                        }

                        // Turn camera off after join if user chose "tắt camera"
                        // or if the camera device wasn't available.
                        if (wantCameraOff || !hasVideoDevice) {
                              callObject.setLocalVideo(false);
                              useCallStore.getState().setCameraOff(true);
                              if (!hasVideoDevice) {
                                    dbg('Camera device not available; joined with audio only');
                              }
                        }
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
