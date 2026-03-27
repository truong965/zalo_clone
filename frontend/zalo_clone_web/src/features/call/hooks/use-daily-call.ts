/**
 * useDailyCall — Manages Daily.co call lifecycle.
 *
 * Responsibilities:
 * - Lazy-load @daily-co/daily-js SDK
 * - Create/destroy Daily call frame (Prebuilt)
 * - Join/leave Daily.co rooms with meeting tokens
 * - Map Daily participant events -> Zustand call store
 */

import { useCallback, useEffect, useRef } from 'react';
import { useCallStore } from '../stores/call.store';
import type { CallType, DailyParticipant } from '../types';

const DEBUG = import.meta.env.DEV;
function dbg(label: string, ...args: unknown[]) {
      if (DEBUG) console.warn(`[Daily] ${label}`, ...args);
}

export function useDailyCall() {
      const callFrameRef = useRef<any>(null);
      const isJoinedRef = useRef(false);

      // ── Cleanup ─────────────────────────────────────────────────────────

      const cleanup = useCallback(async () => {
            if (callFrameRef.current) {
                  try {
                        if (isJoinedRef.current) {
                              await callFrameRef.current.leave();
                        }
                        await callFrameRef.current.destroy();
                  } catch {
                        // Safe to ignore — already destroyed
                  }
                  callFrameRef.current = null;
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
            const callFrame = callFrameRef.current;
            if (!callFrame) return;

            const rawParticipants = callFrame.participants();
            const mapped: DailyParticipant[] = Object.values(rawParticipants).map(
                  (p: any) => ({
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

            useCallStore.getState().setDailyParticipants(mapped);
      }, []);

      // ── Join a Daily.co room ────────────────────────────────────────────

      const join = useCallback(
            async (container: HTMLDivElement, roomUrl: string, token: string, _callType?: CallType, avatarUrl?: string) => {
                  const joinTimeCallId = useCallStore.getState().callId;
                  dbg('join called (Prebuilt)', { roomUrl, hasToken: !!token, _callType, avatarUrl, callId: joinTimeCallId });
                  
                  // Lazy-load Daily.co SDK
                  const DailyIframe = await import('@daily-co/daily-js');
                  const Daily = DailyIframe.default;

                  // Force cleanup of any lingering global instance before creating a new one.
                  // This is CRITICAL because Daily throws an error if createFrame is called
                  // while a previous unmounted frame is still globally registered.
                  const existing = Daily.getCallInstance();
                  if (existing) {
                        try {
                              dbg('Cleaning up leaked global Daily instance before createFrame');
                              await existing.destroy();
                        } catch (e) {
                              // Safe to ignore
                        }
                  }

                  // Cleanup any local existing call object
                  await cleanup();

                  try {
                        // Create Prebuilt Frame in target container
                        const callFrame = Daily.createFrame(container, {
                              url: roomUrl,
                              iframeStyle: {
                                    width: '100%',
                                    height: '100%',
                                    border: '0',
                                    borderRadius: '8px',
                                    backgroundColor: '#111827',
                              },
                              showLeaveButton: true,
                              showFullscreenButton: true,
                        });

                        callFrameRef.current = callFrame;

                        // ── Register event handlers ──────────────────────────────────

                        callFrame.on('joined-meeting', () => {
                              dbg('joined-meeting event');
                              isJoinedRef.current = true;
                              syncParticipants();
                        });

                        callFrame.on('participant-joined', () => {
                              syncParticipants();
                        });

                        callFrame.on('participant-updated', () => {
                              syncParticipants();
                        });

                        callFrame.on('participant-left', () => {
                              syncParticipants();
                        });

                        callFrame.on('left-meeting', () => {
                              dbg('left-meeting event (Prebuilt)', { callId: joinTimeCallId });
                              isJoinedRef.current = false;
                              
                              const store = useCallStore.getState();
                              // Guard: only reset if this event belongs to the call we joined
                              if (joinTimeCallId && store.callId !== joinTimeCallId) {
                                    dbg('left-meeting IGNORED (stale)', { eventId: joinTimeCallId, currentId: store.callId });
                                    return;
                              }

                              store.setDailyParticipants([]);
                              store.resetCallState();
                              
                              // Notify server so it can save call history
                              if (joinTimeCallId) {
                                    window.dispatchEvent(new CustomEvent('call:hangup', { detail: { callId: joinTimeCallId } }));
                              }
                        });

                        callFrame.on('error', (event: any) => {
                              const message = event?.errorMsg ?? 'Daily.co error';
                              useCallStore.getState().setError(message);
                        });

                        // Network quality
                        callFrame.on('network-quality-change', (event: any) => {
                              const threshold = event?.threshold;
                              switch (threshold) {
                                    case 'good': useCallStore.getState().setConnectionQuality('GOOD'); break;
                                    case 'low': useCallStore.getState().setConnectionQuality('MEDIUM'); break;
                                    case 'very-low': useCallStore.getState().setConnectionQuality('POOR'); break;
                              }
                        });

                        // ── Join the room ────────────────────────────────────────────
                        await callFrame.join({ url: roomUrl, token });
                        
                        if (avatarUrl) {
                              callFrame.setUserData({ avatarUrl });
                        }
                  } catch (err) {
                        const message = err instanceof Error ? err.message : 'Failed to join Daily.co room';
                        useCallStore.getState().setError(message);
                        useCallStore.getState().resetCallState();
                        await cleanup();
                  }
            },
            [cleanup, syncParticipants],
      );

      const leave = useCallback(async () => {
            await cleanup();
      }, [cleanup]);

      const toggleAudio = useCallback((enabled: boolean) => {
            callFrameRef.current?.setLocalAudio(enabled);
      }, []);

      const toggleVideo = useCallback((enabled: boolean) => {
            callFrameRef.current?.setLocalVideo(enabled);
      }, []);

      return {
            join,
            leave,
            toggleAudio,
            toggleVideo,
            cleanup,
      };
}
