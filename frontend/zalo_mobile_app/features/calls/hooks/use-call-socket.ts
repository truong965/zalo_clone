import { useEffect, useCallback } from 'react';
import { socketManager } from '@/lib/socket';
import { SocketEvents } from '@/constants/socket-events';
import { useCallStore, IncomingCallData } from '../stores/call.store';
import { useAuth } from '@/providers/auth-provider';
import { useNotificationStore } from '@/lib/notification-settings';
import { useSocket } from '@/providers/socket-provider';
import { Alert, AppState } from 'react-native';
import Toast from 'react-native-toast-message';
import * as Notifications from 'expo-notifications';
import { useWebRTCCall } from './use-webrtc-call';
import { isExpoGo } from '@/constants/platform';

export function useCallSocket() {
  if (isExpoGo) {
    return {
      emitInitiateCall: async () => { },
      emitAcceptCall: async () => { },
      emitRejectCall: async () => { },
      emitHangup: async () => { },
      emitRingingAck: async () => { },
      emitJoinExisting: async () => { },
    };
  }
  const { isConnected } = useSocket();
  const socket = socketManager.getSocket();
  const { user } = useAuth();

  const {
    handleCallAccepted,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    handleIceRestart,
    cleanup: cleanupWebRTC
  } = useWebRTCCall({
    emitOffer: (data: any) => socketManager.emitWithAck(SocketEvents.CALL_OFFER, data),
    emitAnswer: (data: any) => socketManager.emitWithAck(SocketEvents.CALL_ANSWER, data),
    emitIceCandidate: (data: any) => socketManager.emitWithAck(SocketEvents.CALL_ICE_CANDIDATE, data),
    emitIceRestart: (data: any) => socketManager.emitWithAck(SocketEvents.CALL_ICE_RESTART, data),
    emitHangup: (data: any) => socketManager.emitWithAck(SocketEvents.CALL_HANGUP, data),
  });

  useEffect(() => {
    if (!socket || !isConnected) return;

    const onIncoming = (payload: any) => {
      console.log('[CallSocket] onIncoming:', payload);
      const isCallEnabledInApp = useNotificationStore.getState().isCallEnabledInApp;
      if (!isCallEnabledInApp) {
        console.log('[CallSocket] ignoring incoming call because in-app calls are disabled');
        return;
      }

      const store = useCallStore.getState();

      if (store.callStatus !== 'IDLE') {
        console.log('[CallSocket] ignoring incoming call, status is:', store.callStatus);
        return;
      }

      useCallStore.getState().setIncomingCall({
        ...payload,
        receivedAt: Date.now(),
      });

      // Show local notification if app is in background but socket is still alive
      if (AppState.currentState !== 'active') {
        Notifications.scheduleNotificationAsync({
          identifier: payload.callId,
          content: {
            title: `Cuộc gọi từ ${payload.callerInfo?.displayName || 'Người dùng'}`,
            body: payload.callType === 'VIDEO' ? 'Cuộc gọi video đến' : 'Cuộc gọi thoại đến',
            data: { ...payload, type: 'INCOMING_CALL' },
            sound: true,
            priority: Notifications.AndroidNotificationPriority.MAX,
          },
          trigger: {
            channelId: 'default',
          } as any, // immediate with channel
        }).catch(err => console.error('[CallSocket] Failed to show background notification:', err));
      }

      // Send ringing acknowledgement to server (prevents backup FCM push if possible)
      socket.emit(SocketEvents.CALL_RINGING_ACK, { callId: payload.callId });
    };

    const onAccepted = (payload: any) => {
      console.log('[CallSocket] onAccepted:', payload);
      const store = useCallStore.getState();
      if (store.callStatus !== 'RINGING' && store.callStatus !== 'DIALING') return;
      store.setCallAccepted({
        callId: payload.callId,
        iceServers: payload.iceServers,
        iceTransportPolicy: payload.iceTransportPolicy,
        dailyRoomUrl: payload.dailyRoomUrl,
      });
      if (!payload.dailyRoomUrl) {
        handleCallAccepted(payload);
      } else {
        store.setPeerConnected(true);
      }
    };

    const onOffer = (payload: any) => {
      console.log('[CallSocket] onOffer received');
      const store = useCallStore.getState();
      // Accept offer in any non-IDLE state (offer may arrive before ACTIVE is set)
      if (store.callStatus !== 'IDLE') {
        handleOffer(payload);
      }
    };

    const onAnswer = (payload: any) => {
      console.log('[CallSocket] onAnswer received');
      const store = useCallStore.getState();
      if (store.callStatus !== 'IDLE') {
        handleAnswer(payload);
      }
    };

    const onIceCandidate = (payload: any) => {
      console.log('[CallSocket] onIceCandidate received');
      const store = useCallStore.getState();
      if (store.callStatus !== 'IDLE') {
        handleIceCandidate(payload);
      }
    };

    const onRejected = (payload: any) => {
      console.log('[CallSocket] onRejected:', payload);
      useCallStore.getState().resetCallState();
    };

    const onEnded = (payload: any) => {
      console.log('[CallSocket] onEnded received:', payload);
      const store = useCallStore.getState();

      // Guard: only reset if this event belongs to the current call.
      // Prevents stale call:ended from a previous call wiping out a
      // newly-initiated call (race condition when user quickly re-calls).
      if (store.callStatus === 'IDLE') return;
      const currentCallId = store.callId;
      if (currentCallId && payload.callId && currentCallId !== payload.callId) {
        console.log('[CallSocket] onEnded IGNORED (stale)', { received: payload.callId, current: currentCallId });
        return;
      }

      if (payload.reason === 'answered_elsewhere') {
        Toast.show({
          type: 'info',
          text1: 'Thông báo',
          text2: 'Cuộc gọi đã được trả lời trên thiết bị khác.',
        });
      }

      if (payload.reason === 'privacy_restricted') {
        Toast.show({
          type: 'error',
          text1: 'Cuộc gọi bị ngắt',
          text2: 'Yêu cầu kết bạn hoặc quyền riêng tư đã thay đổi.',
        });
      }

      console.log('[CallSocket] resetting call state due to onEnded');
      cleanupWebRTC();

      // Dismiss any existing notification for this call
      if (payload.callId) {
        Notifications.dismissNotificationAsync(payload.callId).catch(() => { });
      }

      store.resetCallState();
    };

    const onBusy = (payload: any) => {
      console.log('[CallSocket] onBusy:', payload);
      Toast.show({
        type: 'info',
        text1: 'Thông báo',
        text2: 'Người dùng đang trong một cuộc gọi khác.',
      });
      useCallStore.getState().resetCallState();
    };

    const onDailyRoom = (payload: any) => {
      console.log('[CallSocket] onDailyRoom:', payload);
      if (payload.roomUrl) {
        const myToken = user?.id && payload.tokens ? payload.tokens[user.id] : undefined;
        useCallStore.getState().setCallActive({
          callId: payload.callId,
          dailyRoomUrl: payload.roomUrl,
          dailyToken: myToken,
        });
      }
    };

    const onCallerDisconnected = (payload: any) => {
      console.log('[CallSocket] onCallerDisconnected:', payload);
      const store = useCallStore.getState();
      if (!store.isGroupCall && store.callId === payload.callId) {
        store.setCallStatus('RECONNECTING');
      }
    };

    const onQualityChange = (payload: any) => {
      console.log('[CallSocket] onQualityChange:', payload);
      // Mobile store currently doesn't track quality, but we log it for now
    };

    const onError = (payload: any) => {
      console.error('[CallSocket] onError:', payload);
      const message = payload.message || payload.error || 'Đã có lỗi xảy ra';
      const store = useCallStore.getState();

      // Phase 12: If we get a CALL_ERROR, always reset if we are in a transition state
      if (payload.code === 'CALL_ERROR' || store.callStatus === 'DIALING' || store.callStatus === 'RINGING') {
        Toast.show({
          type: 'error',
          text1: 'Lỗi cuộc gọi',
          text2: message,
        });
        store.resetCallState();
      }
    };

    const onIceRestart = (payload: any) => {
      console.log('[CallSocket] onIceRestart received');
      const store = useCallStore.getState();
      if (store.callStatus !== 'IDLE') {
        // Phase 7: Update credentials if provided
        if (payload.iceServers) {
          store.setIceServers(payload.iceServers);
        }
        store.setCallStatus('RECONNECTING');
        // Mobile WebRTC handleIceRestart manages the side of taking new config or restarting
        handleIceRestart(payload);
      }
    };

    const onMediaState = (payload: { callId: string; cameraOff: boolean; muted: boolean }) => {
      console.log('[CallSocket] onMediaState:', payload);
      useCallStore.getState().setPeerMediaState(payload.cameraOff, payload.muted);
    };

    const onGroupCallStarted = (payload: { conversationId: string; dailyRoomUrl?: string }) => {
      console.log('[CallSocket] onGroupCallStarted:', payload);
      useCallStore.getState().setActiveGroupCall(payload.conversationId, true, payload.dailyRoomUrl);
    };

    const onGroupCallEnded = (payload: { conversationId: string }) => {
      console.log('[CallSocket] onGroupCallEnded:', payload);
      useCallStore.getState().setActiveGroupCall(payload.conversationId, false);
    };

    socket.on(SocketEvents.CALL_INCOMING, onIncoming);
    socket.on(SocketEvents.CALL_ACCEPTED, onAccepted);
    socket.on(SocketEvents.CALL_REJECTED, onRejected);
    socket.on(SocketEvents.CALL_ENDED, onEnded);
    socket.on(SocketEvents.CALL_BUSY, onBusy);
    socket.on(SocketEvents.CALL_DAILY_ROOM, onDailyRoom);
    socket.on(SocketEvents.CALL_CALLER_DISCONNECTED, onCallerDisconnected);
    socket.on(SocketEvents.CALL_QUALITY_CHANGE, onQualityChange);
    socket.on(SocketEvents.CALL_OFFER, onOffer);
    socket.on(SocketEvents.CALL_ANSWER, onAnswer);
    socket.on(SocketEvents.CALL_ICE_CANDIDATE, onIceCandidate);
    socket.on(SocketEvents.CALL_ICE_RESTART, onIceRestart);
    socket.on(SocketEvents.ERROR, onError);
    socket.on(SocketEvents.CALL_MEDIA_STATE, onMediaState);
    socket.on(SocketEvents.GROUP_CALL_STARTED, onGroupCallStarted);
    socket.on(SocketEvents.GROUP_CALL_ENDED, onGroupCallEnded);

    return () => {
      socket.off(SocketEvents.CALL_INCOMING, onIncoming);
      socket.off(SocketEvents.CALL_ACCEPTED, onAccepted);
      socket.off(SocketEvents.CALL_REJECTED, onRejected);
      socket.off(SocketEvents.CALL_ENDED, onEnded);
      socket.off(SocketEvents.CALL_BUSY, onBusy);
      socket.off(SocketEvents.CALL_DAILY_ROOM, onDailyRoom);
      socket.off(SocketEvents.CALL_CALLER_DISCONNECTED, onCallerDisconnected);
      socket.off(SocketEvents.CALL_QUALITY_CHANGE, onQualityChange);
      socket.off(SocketEvents.CALL_OFFER, onOffer);
      socket.off(SocketEvents.CALL_ANSWER, onAnswer);
      socket.off(SocketEvents.CALL_ICE_CANDIDATE, onIceCandidate);
      socket.off(SocketEvents.CALL_ICE_RESTART, onIceRestart);
      socket.off(SocketEvents.ERROR, onError);
      socket.off(SocketEvents.CALL_MEDIA_STATE, onMediaState);
      socket.off(SocketEvents.GROUP_CALL_STARTED, onGroupCallStarted);
      socket.off(SocketEvents.GROUP_CALL_ENDED, onGroupCallEnded);
    };
  }, [socket, isConnected]);

  // Auto-emit call:media-state when local camera/mute state changes
  useEffect(() => {
    if (!socket || !isConnected) return;

    const unsub = useCallStore.subscribe(
      (s) => ({ isCameraOff: s.isCameraOff, isMuted: s.isMuted, callStatus: s.callStatus, callId: s.callId }),
      ({ isCameraOff, isMuted, callStatus, callId }) => {
        if (callStatus === 'ACTIVE' && callId) {
          socket.emit(SocketEvents.CALL_MEDIA_STATE, { callId, cameraOff: isCameraOff, muted: isMuted });
        }
      },
      { equalityFn: (a, b) => a.isCameraOff === b.isCameraOff && a.isMuted === b.isMuted && a.callStatus === b.callStatus },
    );

    return unsub;
  }, [socket, isConnected]);

  const emitInitiateCall = useCallback(
    async (data: { calleeId: string; callType: string; conversationId?: string }) => {
      console.log('[CallSocket] emitInitiateCall:', data);
      return socketManager.emitWithAck(SocketEvents.CALL_INITIATE, data);
    },
    []
  );

  const emitAcceptCall = useCallback(async (data: { callId: string }) => {
    console.log('[CallSocket] emitAcceptCall:', data);
    return socketManager.emitWithAck(SocketEvents.CALL_ACCEPT, data);
  }, []);

  const emitRejectCall = useCallback(async (data: { callId: string }) => {
    console.log('[CallSocket] emitRejectCall:', data);
    return socketManager.emitWithAck(SocketEvents.CALL_REJECT, data);
  }, []);

  const emitHangup = useCallback(async (data: { callId: string }) => {
    console.log('[CallSocket] emitHangup:', data);
    return socketManager.emitWithAck(SocketEvents.CALL_HANGUP, data);
  }, []);

  const emitRingingAck = useCallback(async (data: { callId: string }) => {
    console.log('[CallSocket] emitRingingAck:', data);
    return socketManager.emitWithAck(SocketEvents.CALL_RINGING_ACK, data);
  }, []);

  const emitJoinExisting = useCallback(async (data: { conversationId: string }) => {
    console.log('[CallSocket] emitJoinExisting:', data);
    return socketManager.emitWithAck(SocketEvents.CALL_JOIN_EXISTING, data);
  }, []);

  return {
    emitInitiateCall,
    emitAcceptCall,
    emitRejectCall,
    emitHangup,
    emitJoinExisting,
    emitHeartbeat: useCallback(async (data: { callId: string }) => {
      socketManager.getSocket()?.emit(SocketEvents.CALL_HEARTBEAT, data);
    }, []),
  };
}
