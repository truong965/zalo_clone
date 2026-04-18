import { useRef, useCallback, useEffect } from 'react';
import InCallManager from 'react-native-incall-manager';
import { useCallStore } from '../stores/call.store';
import { isExpoGo } from '@/constants/platform';

/**
 * useWebRTCCall (Mobile) — Manages RTCPeerConnection for mobile.
 */

export function useWebRTCCall(socketEmitters: {
  emitOffer: (data: any) => void;
  emitAnswer: (data: any) => void;
  emitIceCandidate: (data: any) => void;
  emitIceRestart: (data: any) => void;
  emitHangup: (data: any) => void;
}) {
  const pcRef = useRef<any>(null);
  const localStreamRef = useRef<any>(null);
  const reconnectTimeoutRef = useRef<any>(null);
  const reconnectGraceTimeoutRef = useRef<any>(null);
  const timerIntervalRef = useRef<any>(null);

  // Handle InCallManager lifecycle based on callStatus
  useEffect(() => {
    if (isExpoGo) return;

    // We subscribe to multiple state changes to manage InCallManager correctly
    const unsubscribe = useCallStore.subscribe(
      (s) => ({ status: s.callStatus, speakerOn: s.isSpeakerOn, type: s.callType, isGroupCall: s.isGroupCall }),
      ({ status, speakerOn, type, isGroupCall }) => {
        // Group calls (WebView) don't trigger ICE connection, so we must start InCallManager explicitly
        // to put the OS in VoIP mode, which enables hardware Acoustic Echo Cancellation (AEC).
        if (isGroupCall) {
          if (status === 'ACTIVE' || status === 'DIALING' || status === 'RINGING') {
            console.log('[InCallManager] Starting (Daily.co mode)');
            InCallManager.start({ media: type === 'VIDEO' ? 'video' : 'audio' });
            InCallManager.setKeepScreenOn(true);
            InCallManager.setSpeakerphoneOn(speakerOn);
          } else if (status === 'IDLE' || status === 'ENDED') {
            console.log('[InCallManager] Stopping (Daily.co mode)');
            InCallManager.stop();
            InCallManager.setKeepScreenOn(false);
          }
        } else {
          // For WebRTC P2P, we only sync the speakerphone state here. 
          // The actual start/stop is handled by the ICE connection state callbacks.
          if (status === 'ACTIVE' || status === 'DIALING' || status === 'RINGING') {
            // console.log('[InCallManager] Sync speakerphone:', speakerOn);
            InCallManager.setSpeakerphoneOn(speakerOn);
          }
        }
      },
      {
        equalityFn: (a, b) =>
          a.status === b.status &&
          a.speakerOn === b.speakerOn &&
          a.type === b.type &&
          a.isGroupCall === b.isGroupCall,
      }
    );

    return () => unsubscribe();
  }, []);

  const stopTimer = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  }, []);

  const startDurationTimer = useCallback(() => {
    stopTimer();
    const store = useCallStore.getState();
    timerIntervalRef.current = setInterval(() => {
      useCallStore.getState().tick();
    }, 1000);
  }, [stopTimer]);

  const cleanup = useCallback(() => {
    console.log('[WebRTC] cleanup');
    stopTimer();
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    if (reconnectGraceTimeoutRef.current) clearTimeout(reconnectGraceTimeoutRef.current);

    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track: any) => track.stop());
      localStreamRef.current = null;
    }

    if (!isExpoGo) {
      InCallManager.stop();
      InCallManager.setKeepScreenOn(false);
    }

    const store = useCallStore.getState();
    store.setPeerConnected(false);
    store.setLocalStream(null);
    store.setRemoteStream(null);
  }, [stopTimer]);

  const getLocalStream = useCallback(async () => {
    if (isExpoGo) return null;
    try {
      // Stop existing tracks if any
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track: any) => track.stop());
      }

      const { mediaDevices } = require('react-native-webrtc');
      const stream = await mediaDevices.getUserMedia({
        audio: true,
        video: {
          facingMode: 'user',
          width: 640,
          height: 480,
          frameRate: 30
        }
      });

      localStreamRef.current = stream;
      const storeState = useCallStore.getState();
      if (storeState.isCameraOff) {
        stream.getVideoTracks().forEach((track: any) => {
          track.enabled = false;
        });
      }
      useCallStore.getState().setLocalStream(stream);
      return stream;
    } catch (error) {
      console.error('[WebRTC] getLocalStream error:', error);
      return null;
    }
  }, []);

  const handleIceRestart = useCallback(async (payload?: any) => {
    if (isExpoGo) return;
    const pc = pcRef.current;
    if (!pc) {
      console.log('[WebRTC] handleIceRestart skipped: no active PeerConnection');
      return;
    }

    const store = useCallStore.getState();
    const currentCallId = store.callId;
    console.log('[WebRTC] handleIceRestart', { hasPayload: !!payload, callId: currentCallId });

    // Guard against phantom reconnects
    if (!currentCallId || store.callStatus === 'IDLE' || store.callStatus === 'ENDED') {
      console.log('[WebRTC] Aborting ICE restart: call is already IDLE/ENDED');
      return;
    }

    try {
      store.setCallStatus('RECONNECTING');

      // Start a 30s timeout to end the call if reconnection fails
      if (!reconnectTimeoutRef.current) {
        reconnectTimeoutRef.current = setTimeout(() => {
          console.warn('[WebRTC] Reconnection timeout (30s) reached, hanging up.');
          const cid = useCallStore.getState().callId;
          if (cid) {
            socketEmitters.emitHangup({ callId: cid }); // Ignoring promise rejection
          }
          cleanup();
          useCallStore.getState().resetCallState();
        }, 30000);
      }

      // Request ICE restart from server (server generates fresh TURN creds)
      try {
        await socketEmitters.emitIceRestart({ callId: currentCallId });
      } catch (err) {
        console.warn('[WebRTC] emitIceRestart failed:', err);
      }

      // The call may have ended while awaiting the restart ACK.
      const afterAckStore = useCallStore.getState();
      if (
        !pcRef.current ||
        pcRef.current !== pc ||
        !afterAckStore.callId ||
        afterAckStore.callId !== currentCallId ||
        afterAckStore.callStatus === 'IDLE' ||
        afterAckStore.callStatus === 'ENDED'
      ) {
        console.log('[WebRTC] ICE restart aborted: call/pc no longer active');
        return;
      }

      // Check for restartIce() or fallback to { iceRestart: true }
      if (typeof pc.restartIce === 'function') {
        pc.restartIce();
      }

      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);

      if (pc.localDescription) {
        try {
          await socketEmitters.emitOffer({
            callId: currentCallId,
            sdp: pc.localDescription.sdp
          });
        } catch (err) {
          console.warn('[WebRTC] emitOffer for ICE restart failed:', err);
        }
      }
    } catch (e) {
      console.error('[WebRTC] handleIceRestart error:', e);
    }
  }, [cleanup, socketEmitters]);

  const createPeerConnection = useCallback((iceServers: any[]) => {
    if (isExpoGo) return null;
    console.log('[WebRTC] createPeerConnection');
    try {
      const { RTCPeerConnection } = require('react-native-webrtc');
      const store = useCallStore.getState();

      // Phase 7: Always use the latest servers from the store
      const effectiveServers = iceServers && iceServers.length > 0 ? iceServers : store.iceServers;

      const pc = new RTCPeerConnection({
        iceServers: effectiveServers,
        iceTransportPolicy: (store.iceTransportPolicy as any) || 'all',
      });
      let fallbackRemoteStream: any = null;

      const candidateBufferRef = { current: [] as any[] };
      let flushTimeout: any = null;

      (pc as any).onicecandidate = (event: any) => {
        if (event.candidate) {
          candidateBufferRef.current.push(event.candidate.toJSON());

          if (!flushTimeout) {
            flushTimeout = setTimeout(() => {
              const candidates = candidateBufferRef.current;
              candidateBufferRef.current = [];
              flushTimeout = null;

              if (candidates.length > 0) {
                // Use plain emit for candidates to avoid ACK overhead and rate limiting
                const socket = require('@/lib/socket').socketManager.getSocket();
                if (socket) {
                  socket.emit(require('@/constants/socket-events').SocketEvents.CALL_ICE_CANDIDATE, {
                    callId: useCallStore.getState().callId,
                    candidates: JSON.stringify(candidates)
                  });
                }
              }
            }, 100); // 100ms batch window
          }
        }
      };

      (pc as any).oniceconnectionstatechange = () => {
        const state = pc.iceConnectionState;
        console.log('[WebRTC] ICE state:', state);
        const store = useCallStore.getState();

        // Guard against phantom reconnects after the call has ended
        if (store.callStatus === 'IDLE' || store.callStatus === 'ENDED') {
          console.log('[WebRTC] Ignoring ICE state change because call is inactive');
          return;
        }

        if (state === 'connected' || state === 'completed') {
          store.setPeerConnected(true);
          if (store.callStatus === 'RECONNECTING') {
            store.setCallStatus('ACTIVE');
          }

          // Start InCallManager when active
          if (!isExpoGo) {
            const media = store.callType === 'VIDEO' ? 'video' : 'audio';
            InCallManager.start({ media });
            InCallManager.setKeepScreenOn(true);
            InCallManager.setSpeakerphoneOn(store.isSpeakerOn);
          }

          startDurationTimer();

          // Clear any pending reconnect timeouts
          if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
          if (reconnectGraceTimeoutRef.current) clearTimeout(reconnectGraceTimeoutRef.current);
          reconnectTimeoutRef.current = null;
          reconnectGraceTimeoutRef.current = null;
        } else if (state === 'disconnected') {
          store.setPeerConnected(false);
          // 3s grace period for transient network dips
          if (!reconnectGraceTimeoutRef.current) {
            console.log('[WebRTC] ICE disconnected, waiting 3s grace period...');
            reconnectGraceTimeoutRef.current = setTimeout(() => {
              console.log('[WebRTC] Grace period over, initiating ICE restart');
              handleIceRestart();
            }, 3000);
          }
        } else if (state === 'failed') {
          store.setPeerConnected(false);
          console.log('[WebRTC] ICE failed, initiating ICE restart immediately');
          handleIceRestart();
        } else if (state === 'closed') {
          store.setPeerConnected(false);
          stopTimer();
        }
      };

      // Modern 'ontrack' support
      (pc as any).ontrack = (event: any) => {
        console.log('[WebRTC] ontrack event');
        if (event.streams && event.streams[0]) {
          useCallStore.getState().setRemoteStream(event.streams[0]);
          return;
        }

        // Some mobile/web combinations deliver track events without streams[].
        if (event.track) {
          const { MediaStream } = require('react-native-webrtc');
          if (!fallbackRemoteStream) {
            fallbackRemoteStream = new MediaStream();
          }

          const hasTrack = fallbackRemoteStream
            .getTracks()
            .some((track: any) => track.id === event.track.id);

          if (!hasTrack) {
            fallbackRemoteStream.addTrack(event.track);
          }

          useCallStore.getState().setRemoteStream(fallbackRemoteStream);
        }
      };

      // Legacy fallback for environments still emitting only onaddstream.
      (pc as any).onaddstream = (event: any) => {
        console.log('[WebRTC] onaddstream event');
        if (event?.stream) {
          useCallStore.getState().setRemoteStream(event.stream);
        }
      };

      pcRef.current = pc;
      return pc;
    } catch (e) {
      console.error('[WebRTC] Failed to create PeerConnection:', e);
      return null;
    }
  }, [socketEmitters, handleIceRestart, startDurationTimer, stopTimer]);

  const handleCallAccepted = useCallback(async (payload: any) => {
    if (isExpoGo) return;
    console.log('[WebRTC] handleCallAccepted');
    const store = useCallStore.getState();

    // Save ICE servers for potential future ICE restart
    if (payload.iceServers) {
      store.setIceServers(payload.iceServers);
    }

    const pc = createPeerConnection(payload.iceServers || []);
    if (!pc) return;

    const stream = await getLocalStream();
    if (stream) {
      stream.getTracks().forEach((track: any) => pc.addTrack(track, stream));
    }

    const offer = await pc.createOffer({});
    await pc.setLocalDescription(offer);

    socketEmitters.emitOffer({
      callId: payload.callId,
      sdp: pc.localDescription?.sdp
    });
  }, [createPeerConnection, getLocalStream, socketEmitters]);

  const handleOffer = useCallback(async (payload: any) => {
    if (isExpoGo) return;
    console.log('[WebRTC] handleOffer');
    try {
      const { RTCSessionDescription } = require('react-native-webrtc');
      const store = useCallStore.getState();
      const pc = pcRef.current || createPeerConnection(store.iceServers);
      if (!pc) return;

      await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: payload.sdp }));

      // Add local stream if not already added
      if (!localStreamRef.current) {
        const stream = await getLocalStream();
        if (stream) {
          stream.getTracks().forEach((track: any) => pc.addTrack(track, stream));
        }
      }

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socketEmitters.emitAnswer({
        callId: payload.callId,
        sdp: pc.localDescription?.sdp
      });
    } catch (e) {
      console.error('[WebRTC] handleOffer error:', e);
    }
  }, [createPeerConnection, getLocalStream, socketEmitters]);

  const handleAnswer = useCallback(async (payload: any) => {
    if (isExpoGo || !pcRef.current) return;
    console.log('[WebRTC] handleAnswer');
    try {
      const { RTCSessionDescription } = require('react-native-webrtc');
      await pcRef.current.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: payload.sdp }));
    } catch (e) {
      console.error('[WebRTC] handleAnswer error:', e);
    }
  }, []);

  const handleIceCandidate = useCallback(async (payload: any) => {
    if (isExpoGo || !pcRef.current) return;
    console.log('[WebRTC] handleIceCandidate');
    try {
      const { RTCIceCandidate } = require('react-native-webrtc');
      const raw = payload.candidates;
      let candidates: any[];

      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      candidates = Array.isArray(parsed) ? parsed : [parsed];

      for (const candidateData of candidates) {
        if (candidateData && candidateData.candidate) {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(candidateData));
        }
      }
    } catch (e) {
      console.error('[WebRTC] Error adding ICE candidate:', e);
    }
  }, []);


  return {
    handleCallAccepted,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    handleIceRestart,
    cleanup
  };
}
