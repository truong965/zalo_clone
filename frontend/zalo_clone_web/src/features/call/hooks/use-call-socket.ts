/**
 * useCallSocket — Socket.IO event handling for call signaling.
 *
 * Pattern: Same as use-message-socket.ts — register listeners in a single
 * stable useEffect, store all mutable deps in refs to avoid stale closures.
 *
 * This hook:
 * 1. Listens to server → client call events
 * 2. Returns typed emit functions for client → server events
 * 3. Delegates WebRTC lifecycle to the callbacks provided via params
 *
 * Usage:
 *   const { emitInitiateCall, emitAcceptCall, … } = useCallSocket({
 *     onOffer, onAnswer, onIceCandidate, onCallAccepted,
 *   });
 */

import { useEffect, useRef, useCallback } from 'react';
import { useSocket } from '@/hooks/use-socket';
import { SocketEvents } from '@/constants/socket-events';
import { useCallStore } from '../stores/call.store';

// ── Debug helper ──────────────────────────────────────────────────────
const DEBUG = import.meta.env.DEV;
function dbg(label: string, ...args: unknown[]) {
      if (DEBUG) console.warn(`[CallSocket] ${label}`, ...args);
}
import type {
      IncomingCallPayload,
      CallAcceptedPayload,
      CallEndedPayload,
      CallBusyPayload,
      SdpRelayPayload,
      IceCandidateRelayPayload,
      CallerDisconnectedPayload,
      QualityChangePayload,
      DailyRoomPayload,
      ParticipantJoinedPayload,
      ParticipantLeftPayload,
      InitiateCallRequest,
      CallIdRequest,
      SdpRequest,
      IceCandidateRequest,
      ConnectionQuality,
} from '../types';

// ============================================================================
// CALLBACK TYPES
// ============================================================================

export interface CallSocketCallbacks {
      /** Called when callee accepts and caller should create RTCPeerConnection + offer */
      onCallAccepted?: (payload: CallAcceptedPayload) => void;
      /** Called when receiving a relayed SDP offer (callee side) */
      onOffer?: (payload: SdpRelayPayload) => void;
      /** Called when receiving a relayed SDP answer (caller side) */
      onAnswer?: (payload: SdpRelayPayload) => void;
      /** Called when receiving relayed ICE candidates */
      onIceCandidate?: (payload: IceCandidateRelayPayload) => void;
      /** Called when caller disconnects during ringing */
      onCallerDisconnected?: (payload: CallerDisconnectedPayload) => void;
      /** Phase 4: Called when server sends Daily.co room info (P2P→SFU fallback) */
      onDailyRoom?: (payload: DailyRoomPayload) => void;
      /** Phase 4.4: Called when a participant joins a group call */
      onParticipantJoined?: (payload: ParticipantJoinedPayload) => void;
      /** Phase 4.4: Called when a participant leaves a group call */
      onParticipantLeft?: (payload: ParticipantLeftPayload) => void;
}

// ============================================================================
// HOOK
// ============================================================================

export function useCallSocket(callbacks: CallSocketCallbacks = {}) {
      const { socket, isConnected } = useSocket();

      // ── Refs for mutable callback deps (avoid stale closures) ───────────
      const callbacksRef = useRef(callbacks);
      useEffect(() => {
            callbacksRef.current = callbacks;
      }, [callbacks]);

      // ── Register all server → client listeners ──────────────────────────
      useEffect(() => {
            if (!socket || !isConnected) return;

            const onIncoming = (payload: IncomingCallPayload) => {
                  dbg('call:incoming received', { callId: payload.callId, callType: payload.callType, isGroup: payload.isGroupCall });
                  // Already in a call → ignore
                  const currentStatus = useCallStore.getState().callStatus;
                  if (currentStatus !== 'IDLE') return;

                  useCallStore.getState().setIncomingCall({
                        ...payload,
                        receivedAt: Date.now(),
                        isGroupCall: payload.isGroupCall,
                        participantCount: payload.participantCount,
                        dailyRoomUrl: payload.dailyRoomUrl,
                        dailyToken: payload.dailyToken,
                  });

                  // Send ringing acknowledgement to server
                  socket.emit(SocketEvents.CALL_RINGING_ACK, { callId: payload.callId });
            };

            const onAccepted = (payload: CallAcceptedPayload) => {
                  dbg('call:accepted received', { callId: payload.callId, servers: payload.iceServers?.length, policy: payload.iceTransportPolicy });
                  useCallStore.getState().setCallAccepted({
                        callId: payload.callId,
                        iceServers: payload.iceServers,
                        iceTransportPolicy: payload.iceTransportPolicy,
                  });
                  callbacksRef.current.onCallAccepted?.(payload);
            };

            const onRejected = () => {
                  // Only reset if we're still in DIALING/RINGING for this call
                  const { callStatus } = useCallStore.getState();
                  if (callStatus !== 'DIALING' && callStatus !== 'RINGING') {
                        dbg('call:rejected IGNORED (status is', callStatus, ')');
                        return;
                  }
                  dbg('call:rejected → resetCallState');
                  useCallStore.getState().resetCallState();
            };

            const onEnded = (payload: CallEndedPayload) => {
                  // Guard: only reset if this event belongs to the current call.
                  // Prevents stale call:ended from a previous call wiping out a
                  // newly-initiated call (race condition when user quickly re-calls).
                  const currentCallId = useCallStore.getState().callId;
                  if (currentCallId && payload.callId && currentCallId !== payload.callId) {
                        dbg('call:ended IGNORED (stale)', { received: payload.callId, current: currentCallId });
                        return;
                  }
                  dbg('call:ended → resetCallState', { callId: payload.callId });
                  useCallStore.getState().resetCallState();
            };

            const onBusy = (payload: CallBusyPayload) => {
                  // Only relevant when dialing
                  const { callStatus } = useCallStore.getState();
                  if (callStatus !== 'DIALING') {
                        dbg('call:busy IGNORED (status is', callStatus, ')');
                        return;
                  }
                  dbg('call:busy', payload);
                  useCallStore.getState().setError('Người dùng đang bận');
                  // Auto-reset after brief display
                  setTimeout(() => {
                        // Re-check: user may have already started a new call
                        const s = useCallStore.getState();
                        if (s.callStatus === 'DIALING' && s.error === 'Người dùng đang bận') {
                              useCallStore.getState().resetCallState();
                        }
                  }, 2000);
            };

            const onOffer = (payload: SdpRelayPayload) => {
                  dbg('call:offer received', { callId: payload.callId, from: payload.fromUserId, sdpLen: payload.sdp?.length });
                  callbacksRef.current.onOffer?.(payload);
            };

            const onAnswer = (payload: SdpRelayPayload) => {
                  dbg('call:answer received', { callId: payload.callId, from: payload.fromUserId, sdpLen: payload.sdp?.length });
                  callbacksRef.current.onAnswer?.(payload);
            };

            const onIceCandidate = (payload: IceCandidateRelayPayload) => {
                  dbg('call:ice-candidate received', { callId: payload.callId, from: payload.fromUserId });
                  callbacksRef.current.onIceCandidate?.(payload);
            };

            const onCallerDisconnected = (payload: CallerDisconnectedPayload) => {
                  callbacksRef.current.onCallerDisconnected?.(payload);
                  useCallStore.getState().setCallStatus('RECONNECTING');
            };

            const onQualityChange = (payload: QualityChangePayload) => {
                  useCallStore.getState().setConnectionQuality(payload.quality as ConnectionQuality);
            };

            // Phase 4: Daily.co room info (P2P→SFU fallback or group call)
            const onDailyRoom = (payload: DailyRoomPayload) => {
                  dbg('call:daily-room received', { callId: payload.callId, roomUrl: payload.roomUrl, tokenCount: Object.keys(payload.tokens).length });
                  callbacksRef.current.onDailyRoom?.(payload);
            };

            // Phase 4.4: Group call participant events
            const onParticipantJoined = (payload: ParticipantJoinedPayload) => {
                  callbacksRef.current.onParticipantJoined?.(payload);
            };

            const onParticipantLeft = (payload: ParticipantLeftPayload) => {
                  callbacksRef.current.onParticipantLeft?.(payload);
            };

            socket.on(SocketEvents.CALL_INCOMING, onIncoming);
            socket.on(SocketEvents.CALL_ACCEPTED, onAccepted);
            socket.on(SocketEvents.CALL_REJECTED, onRejected);
            socket.on(SocketEvents.CALL_ENDED, onEnded);
            socket.on(SocketEvents.CALL_BUSY, onBusy);
            socket.on(SocketEvents.CALL_OFFER, onOffer);
            socket.on(SocketEvents.CALL_ANSWER, onAnswer);
            socket.on(SocketEvents.CALL_ICE_CANDIDATE, onIceCandidate);
            socket.on(SocketEvents.CALL_CALLER_DISCONNECTED, onCallerDisconnected);
            socket.on(SocketEvents.CALL_QUALITY_CHANGE, onQualityChange);
            socket.on(SocketEvents.CALL_DAILY_ROOM, onDailyRoom);
            socket.on(SocketEvents.CALL_PARTICIPANT_JOINED, onParticipantJoined);
            socket.on(SocketEvents.CALL_PARTICIPANT_LEFT, onParticipantLeft);

            return () => {
                  socket.off(SocketEvents.CALL_INCOMING, onIncoming);
                  socket.off(SocketEvents.CALL_ACCEPTED, onAccepted);
                  socket.off(SocketEvents.CALL_REJECTED, onRejected);
                  socket.off(SocketEvents.CALL_ENDED, onEnded);
                  socket.off(SocketEvents.CALL_BUSY, onBusy);
                  socket.off(SocketEvents.CALL_OFFER, onOffer);
                  socket.off(SocketEvents.CALL_ANSWER, onAnswer);
                  socket.off(SocketEvents.CALL_ICE_CANDIDATE, onIceCandidate);
                  socket.off(SocketEvents.CALL_CALLER_DISCONNECTED, onCallerDisconnected);
                  socket.off(SocketEvents.CALL_QUALITY_CHANGE, onQualityChange);
                  socket.off(SocketEvents.CALL_DAILY_ROOM, onDailyRoom);
                  socket.off(SocketEvents.CALL_PARTICIPANT_JOINED, onParticipantJoined);
                  socket.off(SocketEvents.CALL_PARTICIPANT_LEFT, onParticipantLeft);
            };
      }, [socket, isConnected]);

      // ── Emit functions (client → server) ────────────────────────────────

      const emitInitiateCall = useCallback(
            (payload: InitiateCallRequest) => {
                  // Use Socket.IO acknowledgment to receive callId from server
                  socket?.emit(
                        SocketEvents.CALL_INITIATE,
                        payload,
                        (ack: { callId?: string; error?: string }) => {
                              if (ack?.callId) {
                                    dbg('emitInitiateCall ACK success', { callId: ack.callId });
                                    useCallStore.getState().setCallId(ack.callId);
                              } else if (ack?.error) {
                                    dbg('emitInitiateCall ACK ERROR', ack.error);
                                    useCallStore.getState().setError(ack.error);
                                    useCallStore.getState().resetCallState();
                              } else {
                                    dbg('emitInitiateCall ACK: no callId or error', ack);
                              }
                        },
                  );
            },
            [socket],
      );

      const emitAcceptCall = useCallback(
            (payload: CallIdRequest) => {
                  socket?.emit(SocketEvents.CALL_ACCEPT, payload);
            },
            [socket],
      );

      const emitRejectCall = useCallback(
            (payload: CallIdRequest) => {
                  socket?.emit(SocketEvents.CALL_REJECT, payload);
            },
            [socket],
      );

      const emitHangup = useCallback(
            (payload: CallIdRequest) => {
                  socket?.emit(SocketEvents.CALL_HANGUP, payload);
            },
            [socket],
      );

      const emitOffer = useCallback(
            (payload: SdpRequest) => {
                  socket?.emit(SocketEvents.CALL_OFFER, payload);
            },
            [socket],
      );

      const emitAnswer = useCallback(
            (payload: SdpRequest) => {
                  socket?.emit(SocketEvents.CALL_ANSWER, payload);
            },
            [socket],
      );

      const emitIceCandidate = useCallback(
            (payload: IceCandidateRequest) => {
                  socket?.emit(SocketEvents.CALL_ICE_CANDIDATE, payload);
            },
            [socket],
      );

      const emitIceRestart = useCallback(
            (payload: CallIdRequest) => {
                  socket?.emit(SocketEvents.CALL_ICE_RESTART, payload);
            },
            [socket],
      );

      /** Phase 4: Request switch from P2P to Daily.co SFU */
      const emitSwitchToDaily = useCallback(
            (payload: CallIdRequest) => {
                  socket?.emit(SocketEvents.CALL_SWITCH_TO_DAILY, payload);
            },
            [socket],
      );

      return {
            isConnected,
            emitInitiateCall,
            emitAcceptCall,
            emitRejectCall,
            emitHangup,
            emitOffer,
            emitAnswer,
            emitIceCandidate,
            emitIceRestart,
            emitSwitchToDaily,
      };
}
