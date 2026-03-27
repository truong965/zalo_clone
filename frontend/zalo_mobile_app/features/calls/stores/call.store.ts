import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

export type CallStatus = 'IDLE' | 'DIALING' | 'RINGING' | 'ACTIVE' | 'RECONNECTING' | 'ENDED';
export type CallType = 'VOICE' | 'VIDEO';

export interface PeerInfo {
  displayName: string;
  avatarUrl: string | null;
}

 export type IncomingCallData = {
   callId: string;
   callType: CallType;
   conversationId: string;
   callerInfo: {
     id: string;
     displayName: string;
     avatarUrl: string | null;
   };
   receivedAt: number;
   isGroupCall?: boolean;
   dailyRoomUrl?: string;
   dailyToken?: string;
   iceServers?: any[];
   iceTransportPolicy?: string;
 };

interface CallStoreState {
  callStatus: CallStatus;
  callType: CallType | null;
  callId: string | null;
  conversationId: string | null;

  peerId: string | null;
  peerInfo: PeerInfo | null;

  callDuration: number;
  error: string | null;

  incomingCall: IncomingCallData | null;

  dailyRoomUrl: string | null;
  dailyToken: string | null;
  isGroupCall: boolean;
  isPeerConnected: boolean;
  iceServers: any[];
  iceTransportPolicy: string;
  isSpeakerOn: boolean;
  isMuted: boolean;
  isCameraOff: boolean;
  localStream: any;
  remoteStream: any;
  peerCameraOff: boolean;
  peerMuted: boolean;
  /** Phase 7: Track ongoing group calls by conversationId with roomUrl for instant rejoin */
  activeGroupCalls: Record<string, { active: boolean; roomUrl?: string }>;
}

interface CallStoreActions {
  startDialing: (params: {
    callType: CallType;
    peerId: string;
    peerInfo: PeerInfo;
    conversationId: string | null;
    isGroupCall?: boolean;
    initialCameraOff?: boolean;
  }) => void;
  setIncomingCall: (data: IncomingCallData) => void;
  setCallActive: (params?: { callId?: string; dailyRoomUrl?: string; dailyToken?: string }) => void;
  setCallAccepted: (params: { callId: string; iceServers?: any[]; iceTransportPolicy?: string; dailyRoomUrl?: string }) => void;
  setCallId: (callId: string) => void;

  setCallStatus: (status: CallStatus) => void;
  tick: () => void;
  setError: (error: string | null) => void;
  setPeerConnected: (connected: boolean) => void;
  setIceServers: (servers: any[]) => void;
  setLocalStream: (stream: any) => void;
  setRemoteStream: (stream: any) => void;
  toggleMute: () => void;
  toggleCamera: () => void;
  toggleSpeaker: () => void;
  setCameraOff: (off: boolean) => void;

  resetCallState: (preserveActiveGroupCalls?: boolean) => void;
  setPeerMediaState: (cameraOff: boolean, muted: boolean) => void;
  setActiveGroupCall: (conversationId: string, isActive: boolean, roomUrl?: string) => void;
}

const initialState: CallStoreState = {
  callStatus: 'IDLE',
  callType: null,
  callId: null,
  conversationId: null,
  peerId: null,
  peerInfo: null,
  callDuration: 0,
  error: null,
  incomingCall: null,
  dailyRoomUrl: null,
  dailyToken: null,
  isGroupCall: false,
  isPeerConnected: false,
  iceServers: [],
  iceTransportPolicy: 'all',
  isSpeakerOn: true,
  isMuted: false,
  isCameraOff: false,
  localStream: null,
  remoteStream: null,
  peerCameraOff: false,
  peerMuted: false,
  activeGroupCalls: {},
};

export const useCallStore = create<CallStoreState & CallStoreActions>()(
  subscribeWithSelector((set) => ({
    ...initialState,
    // ... actions ...
    startDialing: ({ callType, peerId, peerInfo, conversationId, isGroupCall, initialCameraOff }) => {
      console.log('[CallStore] startDialing:', { callType, peerId, peerInfo, conversationId, isGroupCall, initialCameraOff });
      set({
        callStatus: 'DIALING',
        callType,
        peerId,
        peerInfo,
        conversationId,
        isGroupCall: isGroupCall ?? false,
        isCameraOff: initialCameraOff ?? (callType === 'VOICE'),
        isSpeakerOn: callType === 'VIDEO',
        error: null,
      });
    },

    setIncomingCall: (data) => {
      console.log('[CallStore] setIncomingCall:', data);
      set({
        callStatus: 'RINGING',
        incomingCall: data,
        callId: data.callId,
        callType: data.callType,
        conversationId: data.conversationId,
        peerId: data.callerInfo.id,
        peerInfo: {
          displayName: data.callerInfo.displayName,
          avatarUrl: data.callerInfo.avatarUrl,
        },
        isGroupCall: data.isGroupCall ?? false,
        dailyRoomUrl: data.dailyRoomUrl ?? null,
        dailyToken: data.dailyToken ?? null,
        iceServers: data.iceServers ?? [],
        iceTransportPolicy: data.iceTransportPolicy ?? 'all',
        isCameraOff: data.callType === 'VOICE',
        isSpeakerOn: data.callType === 'VIDEO',
        error: null,
      });
    },

    setCallActive: (params) => {
      console.log('[CallStore] setCallActive:', params);
      set((state) => ({
        callStatus: 'ACTIVE',
        callDuration: 0,
        incomingCall: null,
        ...(params?.callId ? { callId: params.callId } : {}),
        ...(params?.dailyRoomUrl ? { dailyRoomUrl: params.dailyRoomUrl } : {}),
        ...(params?.dailyToken ? { dailyToken: params.dailyToken } : {}),
        callType: state.callType,
      }));
    },

    setCallAccepted: ({ callId, iceServers, iceTransportPolicy, dailyRoomUrl }) => {
      console.log('[CallStore] setCallAccepted:', { callId, iceServers: iceServers?.length, iceTransportPolicy, dailyRoomUrl });
      set((state) => ({
        callId,
        ...(iceServers ? { iceServers } : {}),
        ...(iceTransportPolicy ? { iceTransportPolicy } : {}),
        dailyRoomUrl: dailyRoomUrl ?? null,
        callStatus: 'ACTIVE',
        callDuration: 0,
        incomingCall: null,
        callType: state.callType,
      }));
    },

    setCallId: (callId) => set({ callId }),

    setCallStatus: (status) => {
      console.log('[CallStore] setCallStatus:', status);
      set({ callStatus: status });
    },
    tick: () => set((state) => ({ callDuration: state.callDuration + 1 })),
    setError: (error) => {
      console.log('[CallStore] setError:', error);
      set({ error });
    },

    setPeerConnected: (connected) => {
      console.log('[CallStore] setPeerConnected:', connected);
      set({ isPeerConnected: connected });
    },

    setIceServers: (servers) => {
      set({ iceServers: servers });
    },

    setLocalStream: (stream) => {
      console.log('[CallStore] setLocalStream');
      set({ localStream: stream });
    },

    setRemoteStream: (stream) => {
      console.log('[CallStore] setRemoteStream');
      set({ remoteStream: stream });
    },
    
    toggleMute: () =>
      set((state) => {
        const next = !state.isMuted;
        if (state.localStream) {
          state.localStream.getAudioTracks().forEach((track: any) => {
            track.enabled = !next;
          });
        }
        return { isMuted: next };
      }),
    
    toggleCamera: () =>
      set((state) => {
        const next = !state.isCameraOff;
        if (state.localStream) {
          state.localStream.getVideoTracks().forEach((track: any) => {
            track.enabled = !next;
          });
        }
        return { isCameraOff: next };
      }),

    toggleSpeaker: () =>
      set((state) => {
        const next = !state.isSpeakerOn;
        return { isSpeakerOn: next };
      }),

    setCameraOff: (off) => {
      set((state) => {
        if (state.localStream) {
          state.localStream.getVideoTracks().forEach((track: any) => {
            track.enabled = !off;
          });
        }
        return { isCameraOff: off };
      });
    },

    resetCallState: (preserveActiveGroupCalls = true) => {
      console.log('[CallStore] resetCallState');
      const state = useCallStore.getState();
      // Stop all local tracks before resetting (prevent camera/mic leak)
      if (state.localStream) {
        try {
          state.localStream.getTracks().forEach((track: any) => track.stop());
        } catch (e) {
          console.warn('[CallStore] Error stopping tracks:', e);
        }
      }
      
      const activeGroupCalls = state.activeGroupCalls;
      set({ ...initialState });
      if (preserveActiveGroupCalls) {
        set({ activeGroupCalls });
      }
    },

    setPeerMediaState: (cameraOff, muted) => {
      set({ peerCameraOff: cameraOff, peerMuted: muted });
    },
    setActiveGroupCall: (conversationId, isActive, roomUrl) => 
      set((state) => ({
        activeGroupCalls: {
          ...state.activeGroupCalls,
          [conversationId]: { active: isActive, roomUrl }
        }
      })),
  }))
);
