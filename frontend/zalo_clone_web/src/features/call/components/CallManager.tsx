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

export function CallManager() {
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
            dbg('handleDailyRoomReceived', { roomUrl: payload.roomUrl, tokenKeys: Object.keys(payload.tokens) }); const { roomUrl, tokens } = payload;
            const store = useCallStore.getState();

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
                  useCallStore.getState().switchToDaily({ roomUrl, token: fallbackToken });
                  const myAvatarUrl = useAuthStore.getState().user?.avatarUrl ?? undefined;
                  await dailyRef.current?.join(roomUrl, fallbackToken, store.callType ?? undefined, myAvatarUrl);
                  return;
            }

            // Close P2P connection
            webrtcRef.current?.cleanup();

            // Switch store to Daily.co
            useCallStore.getState().switchToDaily({ roomUrl, token: myToken });

            // Join Daily.co room
            const myAvatarUrl = useAuthStore.getState().user?.avatarUrl ?? undefined;
            await dailyRef.current?.join(roomUrl, myToken, store.callType ?? undefined, myAvatarUrl);
      };

      // ── Listen for CustomEvents from UI components ──────────────────────
      useEffect(() => {
            const handleInitiate = (e: Event) => {
                  const detail = (e as CustomEvent<InitiateCallDetail>).detail;
                  if (!detail) return;
                  dbg('call:initiate', { calleeId: detail.calleeId, callType: detail.callType, receiverIds: detail.receiverIds?.length });

                  const isGroupCall = (detail.receiverIds?.length ?? 0) > 0;

                  // Set store to DIALING
                  useCallStore.getState().startDialing({
                        callType: detail.callType,
                        peerId: detail.calleeId,
                        peerInfo: detail.peerInfo,
                        conversationId: detail.conversationId,
                        isGroupCall,
                  });

                  // Set initial camera state from user’s choice
                  if (detail.initialCameraOff) {
                        useCallStore.getState().setCameraOff(true);
                  }

                  // Emit to server (include receiverIds for group calls)
                  socketEmitters.emitInitiateCall({
                        calleeId: detail.calleeId,
                        callType: detail.callType,
                        conversationId: detail.conversationId ?? undefined,
                        receiverIds: detail.receiverIds,
                  });
            };

            const handleAccept = () => {
                  const store = useCallStore.getState();
                  dbg('call:accept-incoming', { isGroupCall: store.isGroupCall, hasDailyRoom: !!store.dailyRoomUrl, provider: store.provider });

                  if (store.isGroupCall && store.dailyRoomUrl && store.dailyToken) {
                        // Group call: hide overlay immediately, join Daily.co directly
                        useCallStore.getState().setCallActive();
                        socketEmitters.emitAcceptCall({ callId: store.callId! });
                        const myAvatar = useAuthStore.getState().user?.avatarUrl ?? undefined;
                        void dailyRef.current?.join(store.dailyRoomUrl, store.dailyToken, store.callType ?? undefined, myAvatar);
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

            const handleHangup = () => {
                  const store = useCallStore.getState();
                  dbg('call:hangup', { provider: store.provider, callId: store.callId });

                  if (store.provider === 'DAILY_CO') {
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

                        if (store.callId) {
                              socketEmitters.emitHangup({ callId: store.callId });
                        }

                        useCallStore.getState().resetCallState();
                  } else {
                        // ── 1-1 P2P call hangup (unchanged) ──────────────────
                        webrtcRef.current?.hangup();
                  }
            };

            window.addEventListener('call:initiate', handleInitiate);
            window.addEventListener('call:accept-incoming', handleAccept);
            window.addEventListener('call:reject-incoming', handleReject);
            window.addEventListener('call:hangup', handleHangup);

            return () => {
                  window.removeEventListener('call:initiate', handleInitiate);
                  window.removeEventListener('call:accept-incoming', handleAccept);
                  window.removeEventListener('call:reject-incoming', handleReject);
                  window.removeEventListener('call:hangup', handleHangup);
            };
      }, [socketEmitters]);

      // ── Duration timer for Daily.co group calls ──────────────────
      // Bug 3 fix: WebRTC P2P starts its own timer inside use-webrtc-call.
      // Daily.co calls had no timer, so callDuration stayed at 0.
      useEffect(() => {
            if (callStatus !== 'ACTIVE' || provider !== 'DAILY_CO') return;

            const timer = setInterval(() => {
                  useCallStore.getState().tick();
            }, 1_000);

            return () => clearInterval(timer);
      }, [callStatus, provider]);

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
