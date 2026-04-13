/**
 * CallManager — Invisible orchestrator component mounted at App root.
 *
 * Wires useCallSocket + useWebRTCCall + useDailyCall together so that
 * socket events automatically drive the WebRTC and Daily.co lifecycles.
 *
 * Listens for CustomEvents dispatched by UI components:
 * - 'call:initiate'         → ChatHeader wants to start a call
 * - 'call:accept-incoming'  → IncomingCallOverlay accept button
 * - 'call:reject-incoming'  → IncomingCallOverlay reject button
 * - 'call:hangup'           → CallScreen / ActiveCallFloating hangup
 *
 * Phase 4: Also handles P2P→Daily.co transition when server sends
 * call:daily-room event (ICE fallback or group call).
 *
 * This component renders nothing visible — it only hosts hooks.
 */

import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { notification } from 'antd';
import { socketManager } from '@/lib/socket';
import { SocketEvents } from '@/constants/socket-events';
import { useCallSocket } from '../hooks/use-call-socket';
import { useWebRTCCall } from '../hooks/use-webrtc-call';
import { useDailyCall } from '../hooks/use-daily-call';
import { useConnectionStats } from '../hooks/use-connection-stats';
import { useAdaptiveBitrate } from '../hooks/use-adaptive-bitrate';
import { useCallStore } from '../stores/call.store';
import { useAuthStore } from '@/features/auth';
import type { CallType, PeerInfo, DailyRoomPayload, ParticipantJoinedPayload, ParticipantLeftPayload } from '../types';

// ── Debug helper ──────────────────────────────────────────────────────
const DEBUG = import.meta.env.DEV;
function dbg(label: string, ...args: unknown[]) {
      if (DEBUG) console.warn(`[CallManager] ${label}`, ...args);
}

// ── CustomEvent detail types ──────────────────────────────────────────

interface InitiateCallDetail {
      calleeId: string;
      callType: CallType;
      peerInfo: PeerInfo;
      conversationId: string | null;
      /** Phase 4.4: extra receiver IDs for group calls */
      receiverIds?: string[];
      /** When true, start the call with the local camera off */
      initialCameraOff?: boolean;
}

interface IncomingCallFromPushDetail {
      callId: string;
      callType: CallType;
      callerId: string;
      callerName: string;
      callerAvatar: string | null;
      conversationId: string | null;
}

export function CallManager() {
      const navigate = useNavigate();
      // ── Wire hooks ──────────────────────────────────────────────────────
      // Refs for circular deps: useCallSocket ↔ useWebRTCCall ↔ useDailyCall

      const webrtcRef = useRef<ReturnType<typeof useWebRTCCall> | null>(null);
      const dailyRef = useRef<ReturnType<typeof useDailyCall> | null>(null);

      const socketEmitters = useCallSocket({
            onCallAccepted: (payload) => webrtcRef.current?.handleCallAccepted(payload),
            onOffer: (payload) => {
                  void webrtcRef.current?.handleOffer(payload);
            },
            onAnswer: (payload) => {
                  void webrtcRef.current?.handleAnswer(payload);
            },
            onIceCandidate: (payload) => {
                  void webrtcRef.current?.handleIceCandidate(payload);
            },
            onDailyRoom: (payload: DailyRoomPayload) => {
                  void handleDailyRoomReceived(payload);
            },
            onIceRestart: (payload) => {
                  void webrtcRef.current?.handleIceRestart(payload);
            },
            // Phase 4.4: Group call participant events (handled by Daily.co SDK internally)
            onParticipantJoined: (_payload: ParticipantJoinedPayload) => {
                  // Daily.co SDK handles participant track management automatically.
                  // This socket event is for server-side tracking — frontend uses
                  // daily.on('participant-joined') from useDailyCall hook instead.
            },
            onParticipantLeft: (_payload: ParticipantLeftPayload) => {
                  // Same as above — Daily.co SDK handles cleanup.
            },
      });

      const webrtc = useWebRTCCall({ socketEmitters });
      const daily = useDailyCall();

      // Phase 6: Connection stats monitor + adaptive bitrate
      const connectionStats = useConnectionStats();
      const adaptiveBitrate = useAdaptiveBitrate();

      // Keep refs updated
      useEffect(() => {
            webrtcRef.current = webrtc;
      });
      useEffect(() => {
            dailyRef.current = daily;
      });

      // ── Phase 6: Bind stats + bitrate hooks to PeerConnection ──────────
      const callStatus = useCallStore((s) => s.callStatus);
      const callId = useCallStore((s) => s.callId);
      const provider = useCallStore((s) => s.provider);

      useEffect(() => {
            // Only active for WebRTC P2P calls
            if (provider !== 'WEBRTC_P2P') return;

            const pc = webrtc.peerConnectionRef.current;
            if (!pc) return;

            if (callStatus === 'ACTIVE') {
                  connectionStats.startMonitoring(pc);
                  adaptiveBitrate.bindPeerConnection(pc);
            }

            return () => {
                  connectionStats.stopMonitoring();
                  adaptiveBitrate.unbind();
            };
      }, [callStatus, provider, webrtc.peerConnectionRef, connectionStats, adaptiveBitrate]);

      // ── P2P → Daily.co transition handler ───────────────────────────────
      const handleDailyRoomReceived = async (payload: DailyRoomPayload) => {
            dbg('handleDailyRoomReceived', { roomUrl: payload.roomUrl, tokenKeys: Object.keys(payload.tokens) });
            const { roomUrl, tokens } = payload;
            const store = useCallStore.getState();

            // Guard: If call was already ended/rejected, do not transition or navigate.
            if (store.callStatus === 'IDLE' || (store.callId && store.callId !== payload.callId)) {
                  dbg('ABORT handleDailyRoomReceived: call is idle or ID mismatch', { status: store.callStatus, currentId: store.callId, receivedId: payload.callId });
                  return;
            }

            // Determine current user's token using auth store (reliable for all cases)
            const myUserId = useAuthStore.getState().user?.id;
            const myToken = myUserId ? tokens[myUserId] : undefined;

            dbg('Token lookup', { myUserId, hasToken: !!myToken, tokenKeys: Object.keys(tokens) });

            if (!myToken) {
                  // Fallback: try finding token by excluding peerId (legacy 1-1 path)
                  const fallbackId = store.peerId
                        ? Object.keys(tokens).find((id) => id !== store.peerId)
                        : Object.keys(tokens)[0];
                  const fallbackToken = fallbackId ? tokens[fallbackId] : undefined;

                  if (!fallbackToken) {
                        dbg('ERROR: No meeting token found for current user');
                        useCallStore.getState().setError('No meeting token received');
                        return;
                  }

                  dbg('Using fallback token lookup', { fallbackId });
                  // Close P2P connection
                  webrtcRef.current?.cleanup();
                  useCallStore.getState().switchToDaily({
                        callId: payload.callId,
                        roomUrl,
                        token: fallbackToken
                  });
                  navigate(`/calls/${payload.callId}`);
                  return;
            }

            // Close P2P connection
            webrtcRef.current?.cleanup();

            // Switch store to Daily.co
            useCallStore.getState().switchToDaily({
                  callId: payload.callId,
                  roomUrl: payload.roomUrl,
                  token: myToken
            });
            navigate(`/calls/${payload.callId}`);
      };

      // ── Listen for CustomEvents from UI components ──────────────────────
      useEffect(() => {
            const handleInitiate = async (e: Event) => {
                  const detail = (e as CustomEvent<InitiateCallDetail>).detail;
                  if (!detail) return;
                  dbg('call:initiate', { calleeId: detail.calleeId, callType: detail.callType, receiverIds: detail.receiverIds?.length });

                  const isGroupCall = (detail.receiverIds?.length ?? 0) > 0;

                  // Clear any previous error state
                  useCallStore.getState().setError(null);

                  // Optimistic UI: Set store to DIALING immediately so the "Calling..." overlay shows
                  useCallStore.getState().startDialing({
                        callType: detail.callType,
                        peerId: detail.calleeId,
                        peerInfo: detail.peerInfo,
                        conversationId: detail.conversationId,
                        isGroupCall,
                        initialCameraOff: detail.initialCameraOff,
                  });

                  try {
                        // Emit to server
                        await socketEmitters.emitInitiateCall({
                              calleeId: detail.calleeId,
                              callType: detail.callType,
                              conversationId: detail.conversationId ?? undefined,
                              receiverIds: detail.receiverIds,
                        });
                  } catch (err: any) {
                        dbg('handleInitiate FAILED', err.message);
                        useCallStore.getState().setError(err.message);
                        useCallStore.getState().resetCallState();
                  }
            };

            const handleAccept = () => {
                  const store = useCallStore.getState();
                  dbg('call:accept-incoming', { isGroupCall: store.isGroupCall, hasDailyRoom: !!store.dailyRoomUrl, provider: store.provider });

                  if (store.isGroupCall && store.dailyRoomUrl && store.dailyToken) {
                        // Group call: hide overlay immediately, transition to ACTIVE.
                        // DailyCallView will handle joining when it mounts.
                        useCallStore.getState().setCallActive();
                        socketEmitters.emitAcceptCall({ callId: store.callId! });
                        navigate(`/calls/${store.callId}`);
                  } else {
                        // 1-1 P2P call: acceptCall() needs incomingCall in store
                        // to read callType + callId, so do NOT call setCallActive()
                        // here (it clears incomingCall). The overlay hides when
                        // call:accepted arrives and setCallAccepted() runs.
                        void webrtcRef.current?.acceptCall();
                  }
            };

            const handleReject = () => {
                  webrtcRef.current?.rejectCall();
            };

            const handleHangup = (event?: Event) => {
                  const store = useCallStore.getState();
                  // Fallback: read callId from CustomEvent detail (left-meeting resets store before this fires)
                  const eventCallId = (event as CustomEvent)?.detail?.callId;

                  // Guard: if this hangup event belongs to a previous/stale callId, ignore it completely.
                  // This is CRITICAL because left-meeting events can arrive late or out of order.
                  if (eventCallId && store.callId && eventCallId !== store.callId) {
                        dbg('call:hangup IGNORED (stale)', { eventId: eventCallId, currentId: store.callId });
                        return;
                  }

                  const callId = store.callId || eventCallId;
                  dbg('call:hangup', { provider: store.provider, callId });

                  if (store.provider === 'DAILY_CO' || eventCallId) {
                        // ── Group / Daily.co call hangup ──────────────────────
                        // 1. Leave Daily room (triggers 'left-meeting' event which
                        //    clears dailyParticipants in the store)
                        // 2. Notify server via call:hangup so backend can either
                        //    remove this participant or end the call (if host)
                        // 3. Reset local state — for non-host participants the
                        //    server sends CALL_PARTICIPANT_LEFT (not CALL_ENDED),
                        //    so we must reset ourselves.
                        //
                        // IMPORTANT: Do NOT call webrtc.hangup() here — there is
                        // no PeerConnection in a Daily.co call, and hangup() would
                        // redundantly emit call:hangup + resetCallState, causing a
                        // race condition with the left-meeting event.
                        void dailyRef.current?.leave();

                        if (callId) {
                              socketEmitters.emitHangup({ callId }, { skipGlobalError: true }).catch(() => { });
                        }

                        useCallStore.getState().resetCallState();
                  } else {
                        // ── 1-1 P2P call hangup (unchanged) ──────────────────
                        webrtcRef.current?.hangup();
                  }
            };

            const handleIncomingFromPush = (e: Event) => {
                  const detail = (e as CustomEvent<IncomingCallFromPushDetail>).detail;
                  if (!detail?.callId || !detail?.callerId || !detail?.callType) return;

                  // Do not override an existing call lifecycle.
                  const currentStatus = useCallStore.getState().callStatus;
                  if (currentStatus !== 'IDLE') return;

                  // Fallback ICE config for restoration path from push click.
                  // Backend will continue normal signaling once user accepts.
                  useCallStore.getState().setIncomingCall({
                        callId: detail.callId,
                        callType: detail.callType,
                        conversationId: detail.conversationId,
                        callerInfo: {
                              id: detail.callerId,
                              displayName: detail.callerName || 'Unknown',
                              avatarUrl: detail.callerAvatar,
                        },
                        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
                        iceTransportPolicy: 'all',
                        receivedAt: Date.now(),
                        isGroupCall: false,
                  });
            };

            const handleJoinExisting = async (e: Event) => {
                  const detail = (e as CustomEvent<{ conversationId: string; peerInfo: PeerInfo }>).detail;
                  if (!detail?.conversationId) return;

                  const currentStatus = useCallStore.getState().callStatus;
                  if (currentStatus !== 'IDLE') return;

                  dbg('call:join-existing', { conversationId: detail.conversationId });

                  // Clear any previous error state
                  useCallStore.getState().setError(null);

                  // Optimistic UI: Set store to DIALING
                  useCallStore.getState().startDialing({
                        callType: 'VIDEO',
                        peerId: detail.conversationId,
                        peerInfo: detail.peerInfo,
                        conversationId: detail.conversationId,
                        isGroupCall: true,
                  });

                  try {
                        // Emit to server
                        await socketEmitters.emitJoinExisting({ conversationId: detail.conversationId });
                  } catch (err: any) {
                        dbg('handleJoinExisting FAILED', err.message);
                        useCallStore.getState().setError(err.message);
                        useCallStore.getState().resetCallState();
                  }
            };

            window.addEventListener('call:initiate', handleInitiate);
            window.addEventListener('call:accept-incoming', handleAccept);
            window.addEventListener('call:reject-incoming', handleReject);
            window.addEventListener('call:hangup', handleHangup);
            window.addEventListener('call:incoming-from-push', handleIncomingFromPush);
            window.addEventListener('call:join-existing', handleJoinExisting);

            return () => {
                  window.removeEventListener('call:initiate', handleInitiate);
                  window.removeEventListener('call:accept-incoming', handleAccept);
                  window.removeEventListener('call:reject-incoming', handleReject);
                  window.removeEventListener('call:hangup', handleHangup);
                  window.removeEventListener('call:incoming-from-push', handleIncomingFromPush);
                  window.removeEventListener('call:join-existing', handleJoinExisting);
            };
      }, [socketEmitters]);

      // ── Duration timer for Daily.co group calls ──────────────────
      // Bug 3 fix: WebRTC P2P starts its own timer inside use-webrtc-call.
      // Daily.co calls had no timer, so callDuration stayed at 0.
      useEffect(() => {
            if (callStatus !== 'ACTIVE' || !callId) return;

            // 1. Duration timer (every 1s)
            const durationTimer = setInterval(() => {
                  useCallStore.getState().tick();
            }, 1_000);

            // 2. Phase 9: Heartbeat (every 60s) to keep Redis session alive
            // Important for long group calls where we don't have P2P ICE restarts
            const heartbeatTimer = setInterval(() => {
                  dbg('Sending call:heartbeat', { callId });
                  socketEmitters.emitHeartbeat({ callId });
            }, 60_000);

            return () => {
                  clearInterval(durationTimer);
                  clearInterval(heartbeatTimer);
            };
      }, [callStatus, provider, callId, socketEmitters]);

      // ── Sync store camera/mute state → Daily.co SDK ──────────────────
      // Pattern: state-decouple-implementation — the store is the single
      // source of truth for isCameraOff / isMuted. This bridge reactively
      // forwards state changes to the Daily.co call object so that
      // CallControls doesn't need to know about the call provider.

      const isCameraOff = useCallStore((s) => s.isCameraOff);
      const isMuted = useCallStore((s) => s.isMuted);

      useEffect(() => {
            if (provider !== 'DAILY_CO' || callStatus !== 'ACTIVE') return;
            dailyRef.current?.toggleVideo(!isCameraOff);
      }, [isCameraOff, provider, callStatus]);

      useEffect(() => {
            if (provider !== 'DAILY_CO' || callStatus !== 'ACTIVE') return;
            dailyRef.current?.toggleAudio(!isMuted);
      }, [isMuted, provider, callStatus]);

      // ── Emit media state changes to peer via signaling ──────────────────
      // When camera or mute state changes, notify the peer via call:media-state
      // so they don't depend on unreliable WebRTC track mute/unmute events.
      useEffect(() => {
            if (callStatus !== 'ACTIVE' || !callId) return;
            socketEmitters.emitMediaState({ callId, cameraOff: isCameraOff, muted: isMuted });
      }, [isCameraOff, isMuted, callStatus, callId, socketEmitters]);



      // ── Cleanup on unmount or when call ends ────────────────────────────
      // Use refs to avoid re-running every render (webrtc/daily are new objects
      // each render unless React Compiler memoizes them).
      const webrtcCleanupRef = useRef(webrtc.cleanup);
      const dailyCleanupRef = useRef(daily.cleanup);
      useEffect(() => {
            webrtcCleanupRef.current = webrtc.cleanup;
            dailyCleanupRef.current = daily.cleanup;
      });

      useEffect(() => {
            if (callStatus === 'IDLE' || callStatus === 'ENDED') {
                  dbg('Cleanup: callStatus is', callStatus);
                  webrtcCleanupRef.current();
                  void dailyCleanupRef.current();
            }
      }, [callStatus]);

      // This component renders nothing — it's a hook host
      return null;
}
