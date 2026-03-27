import { useCallback } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { useCallStore, CallType, PeerInfo } from '../stores/call.store';
import { socketManager } from '@/lib/socket';
import { SocketEvents } from '@/constants/socket-events';
import * as Linking from 'expo-linking';
import { Alert } from 'react-native';
import { useEffect, useRef } from 'react';

export function useCallActions() {
  const { user } = useAuth();
  const dailyRoomUrl = useCallStore((s) => s.dailyRoomUrl);
  const dialingTimeoutRef = useRef<any>(null);

  const openWebCall = useCallback((url: string | null) => {
    console.log('[useCallActions] openWebCall: (handled in-app by IncomingCallModal)', url);
    // Linking.openURL(url).catch((err) => { ... });
  }, []);

  const resetCallWithTimeout = useCallback(() => {
    if (dialingTimeoutRef.current) {
      clearTimeout(dialingTimeoutRef.current);
      dialingTimeoutRef.current = null;
    }
  }, []);

  // Handle automatic redirection for callers when a call becomes ACTIVE
  useEffect(() => {
    // We subscribe to status and dailyRoomUrl specifically to trigger the side effect
    const unsubscribe = useCallStore.subscribe(
      (state) => ({ status: state.callStatus, url: state.dailyRoomUrl }),
      ({ status, url }: { status: string; url: string | null }) => {
        if (status === 'ACTIVE' && url) {
          console.log('[useCallActions] Call active with URL, keeping state for in-app WebView:', url);
          openWebCall(url);
          resetCallWithTimeout();
          // DO NOT resetCallState here. The IncomingCallModal handles the WebView rendering.
        }
      }
    );
    return () => unsubscribe();
  }, [openWebCall, resetCallWithTimeout]);

  // Phase 9: Management of duration timer and session heartbeat
  const callStatus = useCallStore((s) => s.callStatus);
  const callId = useCallStore((s) => s.callId);

  useEffect(() => {
    if (callStatus !== 'ACTIVE' || !callId) return;

    // 1. Duration timer (every 1s)
    const durationTimer = setInterval(() => {
      useCallStore.getState().tick();
    }, 1_000);

    // 2. Heartbeat (every 60s)
    const heartbeatTimer = setInterval(() => {
      console.log('[useCallActions] sending call:heartbeat', { callId });
      socketManager.getSocket()?.emit(SocketEvents.CALL_HEARTBEAT, { callId });
    }, 60_000);

    return () => {
      clearInterval(durationTimer);
      clearInterval(heartbeatTimer);
    };
  }, [callStatus, callId]);

  const initiateCall = useCallback(
    async (params: {
      callType: CallType;
      peerId: string;
      peerInfo: PeerInfo;
      conversationId: string;
      isGroupCall?: boolean;
    }) => {
      const store = useCallStore.getState();
      console.log('[useCallActions] initiateCall:', params);

      if (store.callStatus !== 'IDLE') {
        console.log('[useCallActions] initiateCall ignored, status is:', store.callStatus);
        return;
      }

      store.startDialing(params);

      // Clear any existing timeout just in case
      resetCallWithTimeout();

      // Start 35s DIALING timeout (backend is 30s)
      dialingTimeoutRef.current = setTimeout(() => {
        const currentStore = useCallStore.getState();
        if (currentStore.callStatus === 'DIALING') {
          console.warn('[useCallActions] DIALING timeout reached (35s), resetting...');
          if (currentStore.callId) {
            socketManager.emitWithAck(SocketEvents.CALL_HANGUP, { callId: currentStore.callId }).catch(e => console.warn(e));
          }
          currentStore.resetCallState();
          Alert.alert('Thông báo', 'Cuộc gọi không có phản hồi.');
        }
        dialingTimeoutRef.current = null;
      }, 35_000);

      try {
        const response = await socketManager.emitWithAck<{ callId?: string; error?: string }>(SocketEvents.CALL_INITIATE, {
          calleeId: params.peerId,
          callType: params.callType,
          conversationId: params.conversationId || undefined,
        });

        if (response?.error) {
          throw new Error(response.error);
        }

        if (response?.callId) {
          console.log('[useCallActions] initiateCall ACK success, callId:', response.callId);
          useCallStore.getState().setCallId(response.callId);
        }
      } catch (err: any) {
        console.error('[useCallActions] initiateCall error:', err);
        resetCallWithTimeout();
        useCallStore.getState().resetCallState();
        Alert.alert('Lỗi', err.message || 'Không thể thực hiện cuộc gọi');
      }
    },
    [resetCallWithTimeout]
  );

  const acceptCall = useCallback(async () => {
    console.log('[useCallActions] acceptCall');
    const store = useCallStore.getState();
    const { callId, dailyRoomUrl } = store;

    if (!callId) {
      console.warn('[useCallActions] acceptCall: no callId');
      return;
    }

    resetCallWithTimeout();
    // Wait for the server to acknowledge the acceptance successfully.
    // If it throws (e.g., answered elsewhere), it will be caught below.
    try {
      const response: any = await socketManager.emitWithAck(SocketEvents.CALL_ACCEPT, { callId });
      
      // RACE CONDITION FIX RESUMED: Set ACTIVE so the modal closes and the call UI opens natively.
      store.setCallActive({ callId });
      // If server returns a room URL in response (often it does for group calls)
      // or if we already had it in the store
      const url = dailyRoomUrl || response?.dailyRoomUrl;

      if (url) {
        console.log('[useCallActions] acceptCall: opening in-app web call URL', url);
        openWebCall(url);
        // Do not reset the state, keep it ACTIVE to render the GroupCallWebView
      }
    } catch (err) {
      console.error('[useCallActions] acceptCall error:', err);
      useCallStore.getState().resetCallState();
    }
  }, [openWebCall, resetCallWithTimeout]);

  const rejectCall = useCallback(async () => {
    console.log('[useCallActions] rejectCall');
    const store = useCallStore.getState();
    const { callId } = store;

    resetCallWithTimeout();
    if (callId) {
      socketManager.emitWithAck(SocketEvents.CALL_REJECT, { callId }).catch(e => console.warn('[useCallActions] emitRejectCall error:', e));
    }
    store.resetCallState();
  }, [resetCallWithTimeout]);

  const endCall = useCallback(async () => {
    const store = useCallStore.getState();
    const { callId } = store;

    resetCallWithTimeout();
    if (callId) {
      socketManager.emitWithAck(SocketEvents.CALL_HANGUP, { callId }).catch(e => console.warn('[useCallActions] emitHangup error:', e));
    }
    store.resetCallState();
  }, [resetCallWithTimeout]);

  const joinExistingCall = useCallback(
    async (conversationId: string, displayName: string) => {
      const store = useCallStore.getState();
      if (store.callStatus !== 'IDLE') {
        console.log('[useCallActions] joinExistingCall ignored, status is:', store.callStatus);
        return;
      }

      store.startDialing({
        callType: 'VIDEO',
        peerId: conversationId,
        peerInfo: { displayName, avatarUrl: null },
        conversationId,
        isGroupCall: true,
      });

      resetCallWithTimeout();

      // Start 35s timeout
      dialingTimeoutRef.current = setTimeout(() => {
        const currentStore = useCallStore.getState();
        if (currentStore.callStatus === 'DIALING') {
          console.warn('[useCallActions] JOIN EXISTING timeout reached (35s), resetting...');
          currentStore.resetCallState();
          Alert.alert('Thông báo', 'Không thể tham gia cuộc gọi.');
        }
        dialingTimeoutRef.current = null;
      }, 35_000);

      try {
        const response: any = await socketManager.emitWithAck(SocketEvents.CALL_JOIN_EXISTING, { conversationId });
        if (response?.error) {
          throw new Error(response.error);
        }
      } catch (err: any) {
        console.error('[useCallActions] joinExistingCall error:', err);
        resetCallWithTimeout();
        useCallStore.getState().resetCallState();
        
        // Phase 12: If call doesn't exist, clear the stale banner
        if (err.message?.includes('No active group call')) {
          useCallStore.getState().setActiveGroupCall(conversationId, false);
        }
        
        Alert.alert('Lỗi', err.message || 'Không thể tham gia cuộc gọi');
      }
    },
    [resetCallWithTimeout]
  );

  // Handle cleanup of timeout on unmount
  useEffect(() => {
    return () => resetCallWithTimeout();
  }, [resetCallWithTimeout]);

  return {
    initiateCall,
    acceptCall,
    rejectCall,
    endCall,
    joinExistingCall,
    openWebCall,
    callStatus: useCallStore((s) => s.callStatus),
    incomingCall: useCallStore((s) => s.incomingCall),
    dailyRoomUrl: useCallStore((s) => s.dailyRoomUrl),
  };
}
