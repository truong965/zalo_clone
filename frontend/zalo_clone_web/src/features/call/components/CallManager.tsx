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
import type { CallType, PeerInfo, DailyRoomPayload, ParticipantJoinedPayload, ParticipantLeftPayload } from '../types';

// ── CustomEvent detail types ──────────────────────────────────────────

interface InitiateCallDetail {
      calleeId: string;
      callType: CallType;
      peerInfo: PeerInfo;
      conversationId: string | null;
      /** Phase 4.4: extra receiver IDs for group calls */
      receiverIds?: string[];
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
            const { roomUrl, tokens } = payload;
            const store = useCallStore.getState();

            // Determine current user's token
            // We need to find which token belongs to us. The tokens map is userId→token.
            // We check peerId (the other person) and use the other token for us.
            const myId = store.peerId
                  ? Object.keys(tokens).find((id) => id !== store.peerId)
                  : Object.keys(tokens)[0];

            const myToken = myId ? tokens[myId] : undefined;
            if (!myToken) {
                  useCallStore.getState().setError('No meeting token received');
                  return;
            }

            // Close P2P connection
            webrtcRef.current?.cleanup();

            // Switch store to Daily.co
            useCallStore.getState().switchToDaily({ roomUrl, token: myToken });

            // Join Daily.co room
            await dailyRef.current?.join(roomUrl, myToken);
      };

      // ── Listen for CustomEvents from UI components ──────────────────────
      useEffect(() => {
            const handleInitiate = (e: Event) => {
                  const detail = (e as CustomEvent<InitiateCallDetail>).detail;
                  if (!detail) return;

                  const isGroupCall = (detail.receiverIds?.length ?? 0) > 0;

                  // Set store to DIALING
                  useCallStore.getState().startDialing({
                        callType: detail.callType,
                        peerId: detail.calleeId,
                        peerInfo: detail.peerInfo,
                        conversationId: detail.conversationId,
                        isGroupCall,
                  });

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

                  if (store.isGroupCall && store.dailyRoomUrl && store.dailyToken) {
                        // Group call: hide overlay immediately, join Daily.co directly
                        useCallStore.getState().setCallActive();
                        socketEmitters.emitAcceptCall({ callId: store.callId! });
                        void dailyRef.current?.join(store.dailyRoomUrl, store.dailyToken);
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
                  const provider = useCallStore.getState().provider;
                  if (provider === 'DAILY_CO') {
                        void dailyRef.current?.leave();
                  }
                  webrtcRef.current?.hangup();
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

      // ── Cleanup on unmount or when call ends ────────────────────────────
      useEffect(() => {
            if (callStatus === 'IDLE' || callStatus === 'ENDED') {
                  webrtc.cleanup();
                  void daily.cleanup();
            }
      }, [callStatus, webrtc, daily]);

      // This component renders nothing — it's a hook host
      return null;
}
