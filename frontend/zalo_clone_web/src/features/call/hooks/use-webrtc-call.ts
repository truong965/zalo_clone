/**
 * useWebRTCCall — Manages RTCPeerConnection lifecycle for P2P calls.
 *
 * Responsibilities:
 * - Creates/destroys RTCPeerConnection with ICE config from server
 * - Gets local media via getUserMedia
 * - Creates SDP offer/answer and emits via socket
 * - Handles ICE candidate gathering & relays
 * - Handles remote stream (ontrack)
 * - ICE restart on disconnection (3s grace → restart → 30s fail)
 * - Integrates with Zustand call store for UI state
 *
 * Does NOT use PeerJS — native RTCPeerConnection for Daily.co hybrid compat.
 *
 * PRODUCTION NOTES:
 * ─────────────────
 * 1. ICE restart uses 3s grace + 30s timeout before giving up
 * 2. Phase 4 will add Daily.co fallback on ICE failure
 * 3. Stats monitoring can be added via pc.getStats() for adaptive quality
 */

import { useEffect, useRef, useCallback } from 'react';
import { useCallStore } from '../stores/call.store';
import type { useCallSocket } from './use-call-socket';
import type {
      CallType,
      SdpRelayPayload,
      IceCandidateRelayPayload,
      CallAcceptedPayload,
      IceServerConfig,
} from '../types';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Grace period before triggering ICE restart after disconnection */
const ICE_DISCONNECT_GRACE_MS = 3_000;
/** Second retry after initial ICE restart */
const ICE_RETRY_2_MS = 6_000;
/** Max time to wait for ICE restart to succeed before Daily.co fallback */
const ICE_RESTART_TIMEOUT_MS = 30_000;
/** Interval for call duration timer */
const DURATION_TICK_MS = 1_000;

// ============================================================================
// TYPES
// ============================================================================

type SocketEmitters = ReturnType<typeof useCallSocket>;

interface UseWebRTCCallParams {
      /** Socket emit functions from useCallSocket */
      socketEmitters: SocketEmitters;
}

// ============================================================================
// HOOK
// ============================================================================

export function useWebRTCCall({ socketEmitters }: UseWebRTCCallParams) {
      const pcRef = useRef<RTCPeerConnection | null>(null);
      const localStreamRef = useRef<MediaStream | null>(null);
      const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
      const iceDisconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
      const iceRestartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
      const iceRetry2TimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
      const isNegotiatingRef = useRef(false);
      /** Whether this peer is the caller (creates the offer) */
      const isCallerRef = useRef(false);

      // Keep socket emitters fresh
      const emittersRef = useRef(socketEmitters);
      useEffect(() => {
            emittersRef.current = socketEmitters;
      }, [socketEmitters]);

      // ── Cleanup helpers ─────────────────────────────────────────────────

      const clearTimers = useCallback(() => {
            if (durationTimerRef.current) {
                  clearInterval(durationTimerRef.current);
                  durationTimerRef.current = null;
            }
            if (iceDisconnectTimerRef.current) {
                  clearTimeout(iceDisconnectTimerRef.current);
                  iceDisconnectTimerRef.current = null;
            }
            if (iceRestartTimerRef.current) {
                  clearTimeout(iceRestartTimerRef.current);
                  iceRestartTimerRef.current = null;
            }
            if (iceRetry2TimerRef.current) {
                  clearTimeout(iceRetry2TimerRef.current);
                  iceRetry2TimerRef.current = null;
            }
      }, []);

      const closePeerConnection = useCallback(() => {
            clearTimers();
            if (pcRef.current) {
                  pcRef.current.onicecandidate = null;
                  pcRef.current.ontrack = null;
                  pcRef.current.oniceconnectionstatechange = null;
                  pcRef.current.onnegotiationneeded = null;
                  pcRef.current.close();
                  pcRef.current = null;
            }
            isNegotiatingRef.current = false;
      }, [clearTimers]);

      const stopLocalStream = useCallback(() => {
            if (localStreamRef.current) {
                  for (const track of localStreamRef.current.getTracks()) {
                        track.stop();
                  }
                  localStreamRef.current = null;
            }
      }, []);

      const cleanup = useCallback(() => {
            closePeerConnection();
            stopLocalStream();
      }, [closePeerConnection, stopLocalStream]);

      // Cleanup on unmount
      useEffect(() => cleanup, [cleanup]);

      // ── Build RTCPeerConnection ─────────────────────────────────────────

      const createPeerConnection = useCallback(
            (iceServers: IceServerConfig[], iceTransportPolicy: RTCIceTransportPolicy) => {
                  if (pcRef.current) {
                        closePeerConnection();
                  }

                  const callId = useCallStore.getState().callId;
                  if (!callId) return null;

                  const pc = new RTCPeerConnection({
                        iceServers: iceServers as RTCIceServer[],
                        iceTransportPolicy,
                  });

                  // ── ICE candidate gathering → emit to server ─────────────────
                  pc.onicecandidate = (event) => {
                        if (event.candidate && callId) {
                              emittersRef.current.emitIceCandidate({
                                    callId,
                                    candidates: JSON.stringify(event.candidate.toJSON()),
                              });
                        }
                  };

                  // ── Remote track received → set remote stream ────────────────
                  pc.ontrack = (event) => {
                        const [remoteStream] = event.streams;
                        if (remoteStream) {
                              useCallStore.getState().setRemoteStream(remoteStream);
                        }
                  };

                  // ── ICE connection state monitoring ──────────────────────────
                  pc.oniceconnectionstatechange = () => {
                        const state = pc.iceConnectionState;

                        switch (state) {
                              case 'connected':
                              case 'completed':
                                    // Clear any pending disconnect/restart timers
                                    if (iceDisconnectTimerRef.current) {
                                          clearTimeout(iceDisconnectTimerRef.current);
                                          iceDisconnectTimerRef.current = null;
                                    }
                                    if (iceRestartTimerRef.current) {
                                          clearTimeout(iceRestartTimerRef.current);
                                          iceRestartTimerRef.current = null;
                                    }
                                    if (iceRetry2TimerRef.current) {
                                          clearTimeout(iceRetry2TimerRef.current);
                                          iceRetry2TimerRef.current = null;
                                    }
                                    useCallStore.getState().setConnectionQuality('GOOD');
                                    if (useCallStore.getState().callStatus === 'RECONNECTING') {
                                          useCallStore.getState().setCallStatus('ACTIVE');
                                          useCallStore.getState().setReconnectStartedAt(null);
                                    }
                                    break;

                              case 'disconnected':
                                    useCallStore.getState().setConnectionQuality('DISCONNECTED');
                                    // Phase 6: Progressive reconnection
                                    // 3s silent grace → show overlay → 6s retry #2 → 12s show end btn → 30s failover
                                    if (!iceDisconnectTimerRef.current) {
                                          iceDisconnectTimerRef.current = setTimeout(() => {
                                                iceDisconnectTimerRef.current = null;
                                                if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
                                                      // 3s elapsed — show overlay + first ICE restart
                                                      useCallStore.getState().setCallStatus('RECONNECTING');
                                                      useCallStore.getState().setReconnectStartedAt(Date.now());
                                                      triggerIceRestart(pc, callId);

                                                      // 6s mark — second ICE restart attempt
                                                      iceRetry2TimerRef.current = setTimeout(() => {
                                                            iceRetry2TimerRef.current = null;
                                                            if (
                                                                  pc.iceConnectionState !== 'connected' &&
                                                                  pc.iceConnectionState !== 'completed'
                                                            ) {
                                                                  triggerIceRestart(pc, callId);
                                                            }
                                                      }, ICE_RETRY_2_MS - ICE_DISCONNECT_GRACE_MS);
                                                }
                                          }, ICE_DISCONNECT_GRACE_MS);
                                    }
                                    break;

                              case 'failed':
                                    useCallStore.getState().setCallStatus('RECONNECTING');
                                    triggerIceRestart(pc, callId);
                                    break;

                              case 'closed':
                                    // PeerConnection was closed — nothing to do
                                    break;
                        }
                  };

                  pcRef.current = pc;
                  return pc;
            },
            [closePeerConnection],
      );

      // ── ICE restart ─────────────────────────────────────────────────────

      const triggerIceRestart = useCallback(
            (pc: RTCPeerConnection, callId: string) => {
                  // Request ICE restart from server (server generates fresh TURN creds)
                  emittersRef.current.emitIceRestart({ callId });

                  // Also restart locally
                  pc.restartIce();

                  // Create a new offer with iceRestart flag
                  void (async () => {
                        try {
                              const offer = await pc.createOffer({ iceRestart: true });
                              await pc.setLocalDescription(offer);
                              if (pc.localDescription) {
                                    emittersRef.current.emitOffer({
                                          callId,
                                          sdp: pc.localDescription.sdp,
                                    });
                              }
                        } catch {
                              // ICE restart offer failed — will timeout
                        }
                  })();

                  // Timeout: if restart doesn't succeed within 30s → switch to Daily.co fallback
                  if (!iceRestartTimerRef.current) {
                        iceRestartTimerRef.current = setTimeout(() => {
                              iceRestartTimerRef.current = null;
                              const currentCallId = useCallStore.getState().callId;
                              if (
                                    currentCallId &&
                                    pcRef.current?.iceConnectionState !== 'connected' &&
                                    pcRef.current?.iceConnectionState !== 'completed'
                              ) {
                                    // Phase 4: Switch to Daily.co instead of ending the call
                                    emittersRef.current.emitSwitchToDaily({ callId: currentCallId });
                              }
                        }, ICE_RESTART_TIMEOUT_MS);
                  }
            },
            [cleanup],
      );

      // ── Duration timer ──────────────────────────────────────────────────

      const startDurationTimer = useCallback(() => {
            if (durationTimerRef.current) return;
            durationTimerRef.current = setInterval(() => {
                  useCallStore.getState().tick();
            }, DURATION_TICK_MS);
      }, []);

      // ── Get local media ─────────────────────────────────────────────────

      const acquireLocalMedia = useCallback(async (callType: CallType) => {
            try {
                  const stream = await navigator.mediaDevices.getUserMedia({
                        audio: true,
                        video: callType === 'VIDEO',
                  });
                  localStreamRef.current = stream;
                  useCallStore.getState().setLocalStream(stream);
                  return stream;
            } catch (err) {
                  const message = err instanceof DOMException
                        ? err.name === 'NotAllowedError'
                              ? 'Quyền truy cập camera/microphone bị từ chối'
                              : 'Không thể truy cập thiết bị media'
                        : 'Lỗi khi lấy media stream';
                  useCallStore.getState().setError(message);
                  return null;
            }
      }, []);

      // ── Start call as CALLER ────────────────────────────────────────────

      const startCallAsCaller = useCallback(
            async (iceServers: IceServerConfig[], iceTransportPolicy: RTCIceTransportPolicy) => {
                  isCallerRef.current = true;
                  const callType = useCallStore.getState().callType;
                  if (!callType) return;

                  const stream = await acquireLocalMedia(callType);
                  if (!stream) return;

                  const pc = createPeerConnection(iceServers, iceTransportPolicy);
                  if (!pc) return;

                  // Add local tracks to peer connection
                  for (const track of stream.getTracks()) {
                        pc.addTrack(track, stream);
                  }

                  // Create and send offer
                  try {
                        const offer = await pc.createOffer();
                        await pc.setLocalDescription(offer);

                        const callId = useCallStore.getState().callId;
                        if (callId && pc.localDescription) {
                              emittersRef.current.emitOffer({
                                    callId,
                                    sdp: pc.localDescription.sdp,
                              });
                        }
                  } catch {
                        useCallStore.getState().setError('Không thể tạo kết nối');
                  }

                  startDurationTimer();
            },
            [acquireLocalMedia, createPeerConnection, startDurationTimer],
      );

      // ── Handle incoming offer (CALLEE side) ─────────────────────────────

      const handleOffer = useCallback(
            async (payload: SdpRelayPayload) => {
                  isCallerRef.current = false;
                  const { iceServers, iceTransportPolicy, callType } = useCallStore.getState();
                  if (!callType) return;

                  // Acquire media if not yet done
                  let stream = localStreamRef.current;
                  if (!stream) {
                        stream = await acquireLocalMedia(callType);
                        if (!stream) return;
                  }

                  let pc = pcRef.current;
                  if (!pc) {
                        pc = createPeerConnection(iceServers, iceTransportPolicy);
                        if (!pc) return;

                        for (const track of stream.getTracks()) {
                              pc.addTrack(track, stream);
                        }
                  }

                  try {
                        await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: payload.sdp }));

                        const answer = await pc.createAnswer();
                        await pc.setLocalDescription(answer);

                        const callId = useCallStore.getState().callId;
                        if (callId && pc.localDescription) {
                              emittersRef.current.emitAnswer({
                                    callId,
                                    sdp: pc.localDescription.sdp,
                              });
                        }
                  } catch {
                        useCallStore.getState().setError('Không thể thiết lập kết nối');
                  }

                  startDurationTimer();
            },
            [acquireLocalMedia, createPeerConnection, startDurationTimer],
      );

      // ── Handle incoming answer (CALLER side) ────────────────────────────

      const handleAnswer = useCallback(async (payload: SdpRelayPayload) => {
            const pc = pcRef.current;
            if (!pc) return;

            try {
                  await pc.setRemoteDescription(
                        new RTCSessionDescription({ type: 'answer', sdp: payload.sdp }),
                  );
            } catch {
                  // May fail if PC state changed — safe to ignore
            }
      }, []);

      // ── Handle incoming ICE candidates ──────────────────────────────────

      const handleIceCandidate = useCallback(async (payload: IceCandidateRelayPayload) => {
            const pc = pcRef.current;
            if (!pc) return;

            try {
                  // Backend sends candidates as JSON string (possibly batched array)
                  const raw = payload.candidates;
                  let candidates: RTCIceCandidateInit[];

                  // Handle batched format: "[{...},{...}]" or single: "{...}"
                  const parsed: unknown = JSON.parse(raw);
                  if (Array.isArray(parsed)) {
                        candidates = parsed as RTCIceCandidateInit[];
                  } else {
                        candidates = [parsed as RTCIceCandidateInit];
                  }

                  for (const candidate of candidates) {
                        await pc.addIceCandidate(new RTCIceCandidate(candidate));
                  }
            } catch {
                  // ICE candidate add can fail mid-negotiation — safe to ignore
            }
      }, []);

      // ── Handle call:accepted (caller side) ──────────────────────────────

      const handleCallAccepted = useCallback(
            (payload: CallAcceptedPayload) => {
                  // Store already updated by useCallSocket.onAccepted
                  // Now create PeerConnection and start WebRTC flow
                  void startCallAsCaller(payload.iceServers, payload.iceTransportPolicy);
            },
            [startCallAsCaller],
      );

      // ── Accept incoming call (callee initiates WebRTC) ──────────────────

      const acceptCall = useCallback(async () => {
            const { incomingCall, callId } = useCallStore.getState();
            if (!incomingCall || !callId) return;

            // Read callType BEFORE clearing incomingCall
            const callType = incomingCall.callType;

            // Emit accept to server
            emittersRef.current.emitAcceptCall({ callId });

            // Hide IncomingCallOverlay immediately (set incomingCall → null)
            useCallStore.getState().setCallActive();

            // Acquire media early (while waiting for offer)
            await acquireLocalMedia(callType);
      }, [acquireLocalMedia]);

      // ── Hangup ──────────────────────────────────────────────────────────

      const hangup = useCallback(() => {
            const callId = useCallStore.getState().callId;
            if (callId) {
                  emittersRef.current.emitHangup({ callId });
            }
            cleanup();
            useCallStore.getState().setReconnectStartedAt(null);
            useCallStore.getState().resetCallState();
      }, [cleanup]);

      // ── Reject incoming call ────────────────────────────────────────────

      const rejectCall = useCallback(() => {
            const callId = useCallStore.getState().callId;
            if (callId) {
                  emittersRef.current.emitRejectCall({ callId });
            }
            cleanup();
            useCallStore.getState().resetCallState();
      }, [cleanup]);

      return {
            // WebRTC handlers (to be wired in useCallSocket callbacks)
            handleCallAccepted,
            handleOffer,
            handleAnswer,
            handleIceCandidate,
            // Call control actions
            acceptCall,
            hangup,
            rejectCall,
            // Internal references (for advanced usage)
            peerConnectionRef: pcRef,
            cleanup,
      };
}
