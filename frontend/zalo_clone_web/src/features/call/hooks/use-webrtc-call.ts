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
      SdpRelayPayload,
      IceCandidateRelayPayload,
      CallAcceptedPayload,
      IceServerConfig,
      CallIceRestartPayload,
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

// ── Debug helper ──────────────────────────────────────────────────────
const DEBUG = import.meta.env.DEV;
function dbg(label: string, ...args: unknown[]) {
      if (DEBUG) console.warn(`[WebRTC] ${label}`, ...args);
}

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
                        dbg('createPeerConnection: closing existing PC first');
                        closePeerConnection();
                  }

                  const callId = useCallStore.getState().callId;
                  if (!callId) {
                        dbg('ABORT createPeerConnection: callId is null — store state:', {
                              callStatus: useCallStore.getState().callStatus,
                              callType: useCallStore.getState().callType,
                              callId: useCallStore.getState().callId,
                        });
                        return null;
                  }

                  dbg('createPeerConnection', { callId, serverCount: iceServers.length, policy: iceTransportPolicy });
                  const pc = new RTCPeerConnection({
                        iceServers: iceServers as RTCIceServer[],
                        iceTransportPolicy,
                  });

                  // ── ICE candidate gathering → emit to server ─────────────────
                  pc.onicecandidate = (event) => {
                        if (event.candidate && callId) {
                              dbg('ICE candidate gathered', event.candidate.type, event.candidate.protocol);
                              emittersRef.current.emitIceCandidate({
                                    callId,
                                    candidates: JSON.stringify(event.candidate.toJSON()),
                              });
                        } else if (!event.candidate) {
                              dbg('ICE gathering complete');
                        }
                  };

                  // ── Remote track received → set remote stream ────────────────
                  pc.ontrack = (event) => {
                        dbg('ontrack fired', { kind: event.track.kind, streamCount: event.streams.length });
                        const [remoteStream] = event.streams;
                        if (remoteStream) {
                              dbg('Setting remoteStream in store', { tracks: remoteStream.getTracks().length });
                              useCallStore.getState().setRemoteStream(remoteStream);
                        } else {
                              dbg('WARNING: ontrack fired but event.streams is empty!');
                        }
                  };

                  // ── ICE connection state monitoring ──────────────────────────
                  pc.oniceconnectionstatechange = () => {
                        const state = pc.iceConnectionState;
                        dbg('ICE connection state →', state);

                        const store = useCallStore.getState();
                        if (store.callStatus === 'IDLE' || store.callStatus === 'ENDED') {
                              dbg('Ignoring ICE state change because call is inactive');
                              return;
                        }

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
      const acquireLocalMedia = useCallback(async () => {
            // Unified model: always try to get video to allow later toggling
            const tryVideo = true;

            try {
                  dbg('acquireLocalMedia: requesting getUserMedia', { audio: true, video: tryVideo });
                  const stream = await navigator.mediaDevices.getUserMedia({
                        audio: true,
                        video: tryVideo,
                  });
                  dbg('acquireLocalMedia: SUCCESS', { tracks: stream.getTracks().map(t => `${t.kind}:${t.readyState}`) });

                  // If user chose "camera off" before the call, disable video
                  // tracks immediately while keeping the stream available for
                  // later toggling.
                  const { isCameraOff } = useCallStore.getState();
                  if (isCameraOff) {
                        for (const track of stream.getVideoTracks()) {
                              track.enabled = false;
                        }
                  }

                  localStreamRef.current = stream;
                  useCallStore.getState().setLocalStream(stream);
                  return stream;
            } catch (err) {
                  dbg('acquireLocalMedia FAILED', {
                        name: err instanceof DOMException ? err.name : 'Unknown',
                        message: err instanceof Error ? err.message : String(err),
                        err,
                  });

                  // ── Fallback: video device unavailable → continue with audio-only ──
                  // Common when testing with 2 tabs on the same machine: one tab
                  // grabs exclusive camera access, the other gets NotFoundError /
                  // NotReadableError. The call should still work (audio-only) rather
                  // than aborting entirely.
                  if (
                        tryVideo &&
                        err instanceof DOMException &&
                        (err.name === 'NotFoundError' ||
                              err.name === 'NotReadableError' ||
                              err.name === 'OverconstrainedError' ||
                              err.name === 'AbortError')
                  ) {
                        dbg('acquireLocalMedia: video device unavailable, retrying audio-only');
                        try {
                              const audioStream = await navigator.mediaDevices.getUserMedia({
                                    audio: true,
                              });
                              dbg('acquireLocalMedia: audio-only SUCCESS', {
                                    tracks: audioStream.getTracks().map(t => `${t.kind}:${t.readyState}`),
                              });

                              // Mark camera as off since we have no video track
                              useCallStore.getState().setCameraOff(true);

                              localStreamRef.current = audioStream;
                              useCallStore.getState().setLocalStream(audioStream);
                              return audioStream;
                        } catch (audioErr) {
                              dbg('acquireLocalMedia: audio-only also FAILED', audioErr);
                        }
                  }

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
                  dbg('startCallAsCaller', { iceServers: iceServers.length, iceTransportPolicy });
                  isCallerRef.current = true;
                  const callType = useCallStore.getState().callType;
                  if (!callType) { dbg('ABORT startCallAsCaller: callType is null'); return; }

                  const stream = await acquireLocalMedia();
                  if (!stream) {
                        dbg('ABORT startCallAsCaller: acquireLocalMedia failed — ending call');
                        const cid = useCallStore.getState().callId;
                        if (cid) emittersRef.current.emitHangup({ callId: cid });
                        cleanup();
                        useCallStore.getState().resetCallState();
                        return;
                  }
                  dbg('Local media acquired', { tracks: stream.getTracks().map(t => t.kind) });

                  const pc = createPeerConnection(iceServers, iceTransportPolicy);
                  if (!pc) { dbg('ABORT startCallAsCaller: createPeerConnection returned null (callId missing?)'); return; }
                  dbg('PeerConnection created (caller)');

                  // Add local tracks to peer connection
                  for (const track of stream.getTracks()) {
                        pc.addTrack(track, stream);
                  }
                  dbg('Local tracks added to PC', { count: stream.getTracks().length });

                  // Create and send offer
                  try {
                        const offer = await pc.createOffer();
                        await pc.setLocalDescription(offer);
                        dbg('Offer created and set as local description');

                        const callId = useCallStore.getState().callId;
                        if (callId && pc.localDescription) {
                              dbg('Emitting offer', { callId, sdpLength: pc.localDescription.sdp.length });
                              emittersRef.current.emitOffer({
                                    callId,
                                    sdp: pc.localDescription.sdp,
                              });
                        } else {
                              dbg('WARNING: Offer NOT emitted', { callId, hasLocalDesc: !!pc.localDescription });
                        }
                  } catch (err) {
                        dbg('ERROR creating offer', err);
                        useCallStore.getState().setError('Không thể tạo kết nối');
                  }

                  startDurationTimer();
            },
            [acquireLocalMedia, createPeerConnection, startDurationTimer],
      );

      // ── Handle incoming offer (CALLEE side) ─────────────────────────────

      const handleOffer = useCallback(
            async (payload: SdpRelayPayload) => {
                  dbg('handleOffer received', { callId: payload.callId, sdpLength: payload.sdp.length });
                  isCallerRef.current = false;
                  const { iceServers, iceTransportPolicy, callType } = useCallStore.getState();
                  if (!callType) { dbg('ABORT handleOffer: callType is null'); return; }

                  // Acquire media if not yet done
                  let stream = localStreamRef.current;
                  if (!stream) {
                        dbg('handleOffer: localStream not ready, acquiring media...');
                        stream = await acquireLocalMedia();
                        if (!stream) {
                              dbg('ABORT handleOffer: acquireLocalMedia failed — ending call');
                              const cid = useCallStore.getState().callId;
                              if (cid) emittersRef.current.emitHangup({ callId: cid });
                              cleanup();
                              useCallStore.getState().resetCallState();
                              return;
                        }
                  } else {
                        dbg('handleOffer: localStream already available');
                  }

                  let pc = pcRef.current;
                  if (!pc) {
                        dbg('handleOffer: creating PeerConnection (callee)', { iceServers: iceServers.length, iceTransportPolicy });
                        pc = createPeerConnection(iceServers, iceTransportPolicy);
                        if (!pc) { dbg('ABORT handleOffer: createPeerConnection returned null'); return; }

                        for (const track of stream.getTracks()) {
                              pc.addTrack(track, stream);
                        }
                        dbg('handleOffer: local tracks added to PC', { count: stream.getTracks().length });
                  } else {
                        dbg('handleOffer: reusing existing PeerConnection');
                  }

                  try {
                        await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: payload.sdp }));
                        dbg('handleOffer: remote description set');

                        const answer = await pc.createAnswer();
                        await pc.setLocalDescription(answer);
                        dbg('handleOffer: answer created and set as local description');

                        const callId = useCallStore.getState().callId;
                        if (callId && pc.localDescription) {
                              dbg('handleOffer: emitting answer', { callId, sdpLength: pc.localDescription.sdp.length });
                              emittersRef.current.emitAnswer({
                                    callId,
                                    sdp: pc.localDescription.sdp,
                              });
                        } else {
                              dbg('WARNING handleOffer: answer NOT emitted', { callId, hasLocalDesc: !!pc.localDescription });
                        }
                  } catch (err) {
                        dbg('ERROR handleOffer', err);
                        useCallStore.getState().setError('Không thể thiết lập kết nối');
                  }

                  startDurationTimer();
            },
            [acquireLocalMedia, createPeerConnection, startDurationTimer],
      );

      // ── Handle incoming answer (CALLER side) ────────────────────────────

      const handleAnswer = useCallback(async (payload: SdpRelayPayload) => {
            dbg('handleAnswer received', { callId: payload.callId, sdpLength: payload.sdp.length });
            const pc = pcRef.current;
            if (!pc) { dbg('ABORT handleAnswer: pcRef is null'); return; }

            try {
                  await pc.setRemoteDescription(
                        new RTCSessionDescription({ type: 'answer', sdp: payload.sdp }),
                  );
            } catch {
                  // May fail if PC state changed — safe to ignore
            }
      }, []);

      // ── Handle incoming ICE restart payload (fresh credentials) ───────────

      const handleIceRestart = useCallback(async (payload: CallIceRestartPayload) => {
            const pc = pcRef.current;
            if (!pc || !payload.iceServers) {
                  dbg('SKIP handleIceRestart: pcRef is null or no iceServers provided');
                  return;
            }

            try {
                  dbg('handleIceRestart received fresh credentials', {
                        iceServersLen: payload.iceServers.length,
                        policy: payload.iceTransportPolicy,
                  });
                  // Natively inject the replenished coturn credentials into the active tunnel
                  pc.setConfiguration({
                        iceServers: payload.iceServers as RTCIceServer[],
                        iceTransportPolicy: payload.iceTransportPolicy || 'all',
                  });
            } catch (err) {
                  dbg('Failed to apply fresh ICE credentials mid-call', err);
            }
      }, []);

      // ── Handle incoming ICE candidates ──────────────────────────────────

      const handleIceCandidate = useCallback(async (payload: IceCandidateRelayPayload) => {
            const pc = pcRef.current;
            if (!pc) { dbg('SKIP handleIceCandidate: pcRef is null'); return; }

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
                  dbg('handleCallAccepted', { callId: payload.callId, servers: payload.iceServers.length, policy: payload.iceTransportPolicy });
                  // Store already updated by useCallSocket.onAccepted
                  // Now create PeerConnection and start WebRTC flow
                  void startCallAsCaller(payload.iceServers, payload.iceTransportPolicy);
            },
            [startCallAsCaller],
      );

      // ── Accept incoming call (callee initiates WebRTC) ──────────────────

      const acceptCall = useCallback(async () => {
            const { incomingCall, callId } = useCallStore.getState();
            dbg('acceptCall', { hasIncomingCall: !!incomingCall, callId });
            if (!incomingCall || !callId) { dbg('ABORT acceptCall: missing incomingCall or callId'); return; }


            // Must await emitAcceptCall to handle race condition errors
            try {
                  await emittersRef.current.emitAcceptCall({ callId });

                  // Hide IncomingCallOverlay immediately on success
                  useCallStore.getState().setCallActive();
            } catch (err) {
                  dbg('ABORT acceptCall: server rejected acceptance (answered elsewhere or ended)', err);
                  if (callId) emittersRef.current.emitHangup({ callId });
                  cleanup();
                  useCallStore.getState().resetCallState();
                  return;
            }

            // Acquire media early (while waiting for offer)
            const stream = await acquireLocalMedia();

            // Phase 4 RACE CONDITION GUARD:
            // If the call was ended (e.g., by the initiator) while we were 
            // acquiring media, abort the acceptance flow.
            const currentStatus = useCallStore.getState().callStatus;
            const currentCallId = useCallStore.getState().callId;

            if (currentStatus === 'IDLE' || !currentCallId || currentCallId !== callId) {
                  dbg('ABORT acceptCall: call was ended or changed during media acquisition');
                  if (stream) {
                        stream.getTracks().forEach(track => track.stop());
                  }
                  return;
            }

            if (!stream) {
                  dbg('ABORT acceptCall: acquireLocalMedia failed — ending call');
                  if (callId) emittersRef.current.emitHangup({ callId });
                  cleanup();
                  useCallStore.getState().resetCallState();
                  return;
            }
      }, [acquireLocalMedia]);

      // ── Hangup ──────────────────────────────────────────────────────────

      const hangup = useCallback(() => {
            const callId = useCallStore.getState().callId;
            if (callId) {
                  emittersRef.current.emitHangup({ callId }, { skipGlobalError: true }).catch(() => { });
            }
            cleanup();
            useCallStore.getState().setReconnectStartedAt(null);
            useCallStore.getState().resetCallState();
      }, [cleanup]);

      // ── Reject incoming call ────────────────────────────────────────────

      const rejectCall = useCallback(() => {
            const callId = useCallStore.getState().callId;
            if (callId) {
                  emittersRef.current.emitRejectCall({ callId }, { skipGlobalError: true }).catch(() => { });
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
            handleIceRestart,
            // Call control actions
            acceptCall,
            hangup,
            rejectCall,
            // Internal references (for advanced usage)
            peerConnectionRef: pcRef,
            cleanup,
      };
}
