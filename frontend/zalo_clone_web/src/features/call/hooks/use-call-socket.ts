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
                  useCallStore.getState().setCallAccepted({
                        callId: payload.callId,
                        iceServers: payload.iceServers,
                        iceTransportPolicy: payload.iceTransportPolicy,
                  });
                  callbacksRef.current.onCallAccepted?.(payload);
            };

            const onRejected = () => {
                  useCallStore.getState().resetCallState();
            };

            const onEnded = (_payload: CallEndedPayload) => {
                  useCallStore.getState().resetCallState();
            };

            const onBusy = (_payload: CallBusyPayload) => {
                  useCallStore.getState().setError('Người dùng đang bận');
                  // Auto-reset after brief display
                  setTimeout(() => {
                        useCallStore.getState().resetCallState();
                  }, 2000);
            };

            const onOffer = (payload: SdpRelayPayload) => {
                  callbacksRef.current.onOffer?.(payload);
            };

            const onAnswer = (payload: SdpRelayPayload) => {
                  callbacksRef.current.onAnswer?.(payload);
            };

            const onIceCandidate = (payload: IceCandidateRelayPayload) => {
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
                                    useCallStore.getState().setCallId(ack.callId);
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
