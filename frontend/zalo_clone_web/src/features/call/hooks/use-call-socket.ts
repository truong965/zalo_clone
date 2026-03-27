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
import { socketManager } from '@/lib/socket';
import { SocketEvents } from '@/constants/socket-events';
import { useCallStore } from '../stores/call.store';
import { toast } from 'sonner';

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
      CallIceRestartPayload,
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
      /** Phase 5: W5 - Called when server pushes fresh ICE credentials mid-call */
      onIceRestart?: (payload: CallIceRestartPayload) => void;
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
                  
                  const state = useCallStore.getState();
                  if (state.callStatus === 'IDLE' || (state.callId && state.callId !== payload.callId)) {
                        dbg('call:accepted IGNORED (stale or idle)', { received: payload.callId, current: state.callId, status: state.callStatus });
                        return;
                  }

                  state.setCallAccepted({
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
                  dbg('call:ended → resetCallState', { callId: payload.callId, reason: payload.reason });

                  if (payload.reason === 'answered_elsewhere') {
                        toast.info('Cuộc gọi đã được trả lời trên thiết bị khác');
                  }

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
                  toast.error('Người dùng đang bận');
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
                  
                  const state = useCallStore.getState();
                  if (state.callStatus === 'IDLE' || (state.callId && state.callId !== payload.callId)) {
                        dbg('call:offer IGNORED (stale or idle)', { received: payload.callId, current: state.callId });
                        return;
                  }

                  callbacksRef.current.onOffer?.(payload);
            };

            const onAnswer = (payload: SdpRelayPayload) => {
                  dbg('call:answer received', { callId: payload.callId, from: payload.fromUserId, sdpLen: payload.sdp?.length });
                  
                  const state = useCallStore.getState();
                  if (state.callStatus === 'IDLE' || (state.callId && state.callId !== payload.callId)) {
                        dbg('call:answer IGNORED (stale or idle)', { received: payload.callId, current: state.callId });
                        return;
                  }

                  callbacksRef.current.onAnswer?.(payload);
            };

            const onIceCandidate = (payload: IceCandidateRelayPayload) => {
                  dbg('call:ice-candidate received', { callId: payload.callId, from: payload.fromUserId });
                  
                  const state = useCallStore.getState();
                  if (state.callStatus === 'IDLE' || (state.callId && state.callId !== payload.callId)) {
                        // Not a warning, common during transition
                        return;
                  }

                  callbacksRef.current.onIceCandidate?.(payload);
            };

            const onCallerDisconnected = (payload: CallerDisconnectedPayload) => {
                  callbacksRef.current.onCallerDisconnected?.(payload);
                  const store = useCallStore.getState();
                  if (!store.isGroupCall && store.callId === payload.callId) {
                        store.setCallStatus('RECONNECTING');
                  }
            };

            const onQualityChange = (payload: QualityChangePayload) => {
                  useCallStore.getState().setConnectionQuality(payload.quality as ConnectionQuality);
            };

            const onMediaState = (payload: { callId: string; cameraOff: boolean; muted: boolean }) => {
                  dbg('call:media-state received', payload);
                  
                  const state = useCallStore.getState();
                  if (state.callStatus === 'IDLE' || (state.callId && state.callId !== payload.callId)) {
                        return;
                  }

                  state.setPeerMediaState(payload.cameraOff, payload.muted);
            };

            // Phase 4: Daily.co room info (P2P→SFU fallback or group call)
            const onDailyRoom = (payload: DailyRoomPayload) => {
                  dbg('call:daily-room received', { callId: payload.callId, roomUrl: payload.roomUrl, tokenCount: Object.keys(payload.tokens).length });
                  
                  const state = useCallStore.getState();
                  if (state.callStatus === 'IDLE' || (state.callId && state.callId !== payload.callId)) {
                        dbg('call:daily-room IGNORED (stale or idle)', { received: payload.callId, current: state.callId });
                        return;
                  }

                  callbacksRef.current.onDailyRoom?.(payload);
            };

            // Phase 4.4: Group call participant events
            const onParticipantJoined = (payload: ParticipantJoinedPayload) => {
                  callbacksRef.current.onParticipantJoined?.(payload);
            };

            const onParticipantLeft = (payload: ParticipantLeftPayload) => {
                  callbacksRef.current.onParticipantLeft?.(payload);
            };

            // Phase 5: W5 - Receive fresh TURN credentials midway
            const onIceRestart = (payload: CallIceRestartPayload) => {
                  dbg('call:ice-restart received', payload);
                  
                  const state = useCallStore.getState();
                  if (state.callStatus === 'IDLE' || (state.callId && state.callId !== payload.callId)) {
                        return;
                  }

                  if (payload.iceServers) {
                        // Immediately persist new servers string in store
                        state.setCallAccepted({
                               callId: payload.callId,
                               iceServers: payload.iceServers,
                               iceTransportPolicy: payload.iceTransportPolicy || 'all',
                        });
                  }
                  callbacksRef.current.onIceRestart?.(payload);
            };

            const onGroupCallStarted = (payload: { conversationId: string; callId: string; dailyRoomUrl?: string }) => {
                  dbg('group:call-started', payload);
                  // Phase 5: L4 - Deep persist the room URL so standalone banners can route straight matching
                  useCallStore.getState().setActiveGroupCall(payload.conversationId, true, payload.dailyRoomUrl);
            };

            const onGroupCallEnded = (payload: { conversationId: string; callId: string }) => {
                  dbg('group:call-ended', payload);
                  // Phase 5: Clear banner state for this conversation
                  useCallStore.getState().setActiveGroupCall(payload.conversationId, false);
            };

            socket.on(SocketEvents.CALL_INCOMING, onIncoming);
            socket.on(SocketEvents.CALL_ACCEPTED, onAccepted);
            socket.on(SocketEvents.CALL_REJECTED, onRejected);
            socket.on(SocketEvents.CALL_ENDED, onEnded);
            socket.on(SocketEvents.CALL_BUSY, onBusy);
            socket.on(SocketEvents.CALL_OFFER, onOffer);
            socket.on(SocketEvents.CALL_ANSWER, onAnswer);
            socket.on(SocketEvents.CALL_ICE_CANDIDATE, onIceCandidate);
            socket.on(SocketEvents.CALL_ICE_RESTART, onIceRestart); // Phase 5
            socket.on(SocketEvents.CALL_CALLER_DISCONNECTED, onCallerDisconnected);
            socket.on(SocketEvents.CALL_QUALITY_CHANGE, onQualityChange);
            socket.on(SocketEvents.CALL_DAILY_ROOM, onDailyRoom);
            socket.on(SocketEvents.CALL_PARTICIPANT_JOINED, onParticipantJoined);
            socket.on(SocketEvents.CALL_PARTICIPANT_LEFT, onParticipantLeft);
            socket.on(SocketEvents.GROUP_CALL_STARTED, onGroupCallStarted);
            socket.on(SocketEvents.GROUP_CALL_ENDED, onGroupCallEnded);
            socket.on(SocketEvents.CALL_MEDIA_STATE, onMediaState);

            return () => {
                  socket.off(SocketEvents.CALL_INCOMING, onIncoming);
                  socket.off(SocketEvents.CALL_ACCEPTED, onAccepted);
                  socket.off(SocketEvents.CALL_REJECTED, onRejected);
                  socket.off(SocketEvents.CALL_ENDED, onEnded);
                  socket.off(SocketEvents.CALL_BUSY, onBusy);
                  socket.off(SocketEvents.CALL_OFFER, onOffer);
                  socket.off(SocketEvents.CALL_ANSWER, onAnswer);
                  socket.off(SocketEvents.CALL_ICE_CANDIDATE, onIceCandidate);
                  socket.off(SocketEvents.CALL_ICE_RESTART, onIceRestart); // Phase 5
                  socket.off(SocketEvents.CALL_CALLER_DISCONNECTED, onCallerDisconnected);
                  socket.off(SocketEvents.CALL_QUALITY_CHANGE, onQualityChange);
                  socket.off(SocketEvents.CALL_DAILY_ROOM, onDailyRoom);
                  socket.off(SocketEvents.CALL_PARTICIPANT_JOINED, onParticipantJoined);
                  socket.off(SocketEvents.CALL_PARTICIPANT_LEFT, onParticipantLeft);
                  socket.off(SocketEvents.GROUP_CALL_STARTED, onGroupCallStarted);
                  socket.off(SocketEvents.GROUP_CALL_ENDED, onGroupCallEnded);
                  socket.off(SocketEvents.CALL_MEDIA_STATE, onMediaState);
            };
      }, [socket, isConnected]);

      // ── Emit functions (client → server) ────────────────────────────────

      const emitInitiateCall = useCallback(
            async (payload: InitiateCallRequest, options?: { skipGlobalError?: boolean }) => {
                  try {
                        const ack = await socketManager.emitWithAck<{ callId?: string }>(
                               SocketEvents.CALL_INITIATE,
                               payload,
                               options
                        );
                        if (ack?.callId) {
                               dbg('emitInitiateCall ACK success', { callId: ack.callId });
                               useCallStore.getState().setCallId(ack.callId);
                        }
                  } catch (err: any) {
                        dbg('emitInitiateCall ERROR', err.message);
                        useCallStore.getState().setError(err.message);
                        useCallStore.getState().resetCallState();
                  }
            },
            [],
      );

      const emitAcceptCall = useCallback(
            (payload: CallIdRequest, options?: { skipGlobalError?: boolean }) => {
                  return socketManager.emitWithAck<void>(SocketEvents.CALL_ACCEPT, payload, options);
            },
            [],
      );

      const emitRejectCall = useCallback(
            (payload: CallIdRequest, options?: { skipGlobalError?: boolean }) => {
                  return socketManager.emitWithAck<void>(SocketEvents.CALL_REJECT, payload, options);
            },
            [],
      );

      const emitHangup = useCallback(
            (payload: CallIdRequest, options?: { skipGlobalError?: boolean }) => {
                  return socketManager.emitWithAck<void>(SocketEvents.CALL_HANGUP, payload, options);
            },
            [],
      );

      const emitOffer = useCallback(
            (payload: SdpRequest, options?: { skipGlobalError?: boolean }) => {
                  return socketManager.emitWithAck<void>(SocketEvents.CALL_OFFER, payload, options);
            },
            [],
      );

      const emitAnswer = useCallback(
            (payload: SdpRequest, options?: { skipGlobalError?: boolean }) => {
                  return socketManager.emitWithAck<void>(SocketEvents.CALL_ANSWER, payload, options);
            },
            [],
      );

      const emitIceCandidate = useCallback(
            (payload: IceCandidateRequest, options?: { skipGlobalError?: boolean }) => {
                  return socketManager.emitWithAck<void>(SocketEvents.CALL_ICE_CANDIDATE, payload, options);
            },
            [],
      );

      const emitIceRestart = useCallback(
            (payload: CallIdRequest, options?: { skipGlobalError?: boolean }) => {
                  return socketManager.emitWithAck<void>(SocketEvents.CALL_ICE_RESTART, payload, options);
            },
            [],
      );

      /** Phase 4: Request switch from P2P to Daily.co SFU */
      const emitSwitchToDaily = useCallback(
            (payload: CallIdRequest, options?: { skipGlobalError?: boolean }) => {
                  return socketManager.emitWithAck<void>(SocketEvents.CALL_SWITCH_TO_DAILY, payload, options);
            },
            [],
      );

      /** Re-join an existing group call by conversationId */
      const emitJoinExisting = useCallback(
            (payload: { conversationId: string }, options?: { skipGlobalError?: boolean }) => {
                  return socketManager.emitWithAck<{ callId: string }>(SocketEvents.CALL_JOIN_EXISTING, payload, options);
            },
            [],
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
            emitJoinExisting,
            emitMediaState: useCallback(
                  (payload: { callId: string; cameraOff: boolean; muted: boolean }) => {
                        socketManager.getSocket()?.emit(SocketEvents.CALL_MEDIA_STATE, payload);
                  },
                  [],
            ),
            emitHeartbeat: useCallback(
                  (payload: { callId: string }) => {
                        socketManager.getSocket()?.emit(SocketEvents.CALL_HEARTBEAT, payload);
                  },
                  [],
            ),
      };
}
