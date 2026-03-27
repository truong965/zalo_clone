/**
 * call.store.ts — Zustand store for call UI state.
 *
 * Owns all ephemeral call state: status, streams, peer info, controls.
 * Does NOT use persist middleware (MediaStream is non-serializable).
 *
 * Pattern: Separate State / Actions interfaces (same as chat.store.ts).
 */

import { create } from 'zustand';
import type {
      CallType,
      CallProvider,
      CallStatus,
      ConnectionQuality,
      PeerInfo,
      IncomingCallData,
      IceServerConfig,
      DailyParticipant,
} from '../types';

// ============================================================================
// STATE
// ============================================================================

interface CallStoreState {
      // ── Call metadata ──────────────────────────────────────────────────────
      callStatus: CallStatus;
      callType: CallType | null;
      callId: string | null;
      conversationId: string | null;
      provider: CallProvider | null;

      // ── Peer ──────────────────────────────────────────────────────────────
      peerId: string | null;
      peerInfo: PeerInfo | null;

      // ── Media streams ─────────────────────────────────────────────────────
      localStream: MediaStream | null;
      remoteStream: MediaStream | null;

      // ── Controls ──────────────────────────────────────────────────────────
      isMuted: boolean;
      isCameraOff: boolean;

      // ── Connection ────────────────────────────────────────────────────────
      connectionQuality: ConnectionQuality;
      callDuration: number; // seconds, incremented by timer
      iceServers: IceServerConfig[];
      iceTransportPolicy: RTCIceTransportPolicy;

      // ── Reconnection (Phase 6) ────────────────────────────────────────────
      /** Timestamp (Date.now()) when RECONNECTING started, null otherwise */
      reconnectStartedAt: number | null;

      // ── Incoming call (callee side) ───────────────────────────────────────
      incomingCall: IncomingCallData | null;

      // ── Error ─────────────────────────────────────────────────────────────
      error: string | null;

      // ── Daily.co (Phase 4) ────────────────────────────────────────────────
      /** Daily.co room URL (set when switching to Daily or group call) */
      dailyRoomUrl: string | null;
      /** Meeting token for current user */
      dailyToken: string | null;
      /** Participants in a Daily.co call (group or fallback) */
      dailyParticipants: DailyParticipant[];

      // ── Group Call (Phase 4.4) ─────────────────────────────────────────────
      /** True when >1 receiver (always uses Daily.co) */
      isGroupCall: boolean;

      // ── Peer media state (cross-platform sync) ──────────────────────────
      /** Remote peer's camera state (synced via call:media-state event) */
      peerCameraOff: boolean;
      /** Remote peer's mute state (synced via call:media-state event) */
      peerMuted: boolean;

      // ── Group call re-join tracking (Phase 3 & Phase 5) ──────────────────
      /** Map of conversationId -> Context state for floating banner to consume */
      activeGroupCalls: Record<string, { active: boolean; roomUrl?: string }>;
}

// ============================================================================
// ACTIONS
// ============================================================================

interface CallStoreActions {
      /** Caller initiates — set DIALING state before socket emit */
      startDialing: (params: {
            callType: CallType;
            peerId: string;
            peerInfo: PeerInfo;
            conversationId: string | null;
            isGroupCall?: boolean;
            initialCameraOff?: boolean;
      }) => void;

      /** Callee receives an incoming call */
      setIncomingCall: (data: IncomingCallData) => void;

      /** Callee accepted — transition to ACTIVE */
      setCallActive: (params?: {
            callId?: string;
            iceServers?: IceServerConfig[];
            iceTransportPolicy?: RTCIceTransportPolicy;
            initialMuted?: boolean;
            initialCameraOff?: boolean;
      }) => void;

      /** Caller received call:accepted — store ICE config */
      setCallAccepted: (params: {
            callId: string;
            iceServers: IceServerConfig[];
            iceTransportPolicy: RTCIceTransportPolicy;
      }) => void;

      /** Set local MediaStream */
      setLocalStream: (stream: MediaStream | null) => void;

      /** Set remote MediaStream (from ontrack) */
      setRemoteStream: (stream: MediaStream | null) => void;

      /** Toggle audio mute */
      toggleMute: () => void;

      /** Toggle camera on/off */
      toggleCamera: () => void;

      /** Explicitly set camera off state (used by Daily.co hook on join) */
      setCameraOff: (off: boolean) => void;

      /** Update connection quality indicator */
      setConnectionQuality: (quality: ConnectionQuality) => void;

      /** Set call status (e.g. RECONNECTING) */
      setCallStatus: (status: CallStatus) => void;

      /** Set reconnection start timestamp (Phase 6 countdown) */
      setReconnectStartedAt: (ts: number | null) => void;

      /** Increment call duration by 1s (called by interval) */
      tick: () => void;

      /** Set error message */
      setError: (error: string | null) => void;

      /** Full reset back to IDLE (call ended / rejected / error) */
      resetCallState: () => void;

      // ── Daily.co (Phase 4) ────────────────────────────────────────────────

      /** Switch provider to Daily.co and set room info */
      switchToDaily: (params: {
            callId: string;
            roomUrl: string;
            token: string;
      }) => void;

      /** Update Daily.co participants list */
      setDailyParticipants: (participants: DailyParticipant[]) => void;

      /** Set provider explicitly */
      setProvider: (provider: CallProvider) => void;

      /** Set callId after receiving server acknowledgment from call:initiate */
      setCallId: (callId: string) => void;

      /** Update peer media state from call:media-state signaling event */
      setPeerMediaState: (cameraOff: boolean, muted: boolean) => void;

      /** Update active status of a group call for a specific conversation (Phase 3/5) */
      setActiveGroupCall: (conversationId: string, isActive: boolean, roomUrl?: string) => void;
}

// ============================================================================
// INITIAL STATE
// ============================================================================

const initialState: CallStoreState = {
      callStatus: 'IDLE',
      callType: null,
      callId: null,
      conversationId: null,
      provider: null,
      peerId: null,
      peerInfo: null,
      localStream: null,
      remoteStream: null,
      isMuted: false,
      isCameraOff: false,
      connectionQuality: 'GOOD',
      callDuration: 0,
      iceServers: [],
      iceTransportPolicy: 'all',
      reconnectStartedAt: null,
      incomingCall: null,
      error: null,
      dailyRoomUrl: null,
      dailyToken: null,
      dailyParticipants: [],
      isGroupCall: false,
      peerCameraOff: false,
      peerMuted: false,
      activeGroupCalls: {},
};

// ============================================================================
// STORE
// ============================================================================

export const useCallStore = create<CallStoreState & CallStoreActions>((set) => ({
      ...initialState,

      // ── Actions ───────────────────────────────────────────────────────────

      startDialing: ({ callType, peerId, peerInfo, conversationId, isGroupCall, initialCameraOff }) =>
            set({
                  callStatus: 'DIALING',
                  callType,
                  peerId,
                  peerInfo,
                  conversationId,
                  provider: isGroupCall ? 'DAILY_CO' : 'WEBRTC_P2P',
                  isGroupCall: isGroupCall ?? false,
                  isCameraOff: initialCameraOff ?? (callType === 'VOICE'),
                  error: null,
            }),

      setIncomingCall: (data) =>
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
                  provider: data.isGroupCall ? 'DAILY_CO' : 'WEBRTC_P2P',
                  iceServers: data.iceServers,
                  iceTransportPolicy: data.iceTransportPolicy,
                  isGroupCall: data.isGroupCall ?? false,
                  isCameraOff: data.callType === 'VOICE',
                  // Store Daily.co info for group calls (received at incoming time)
                  dailyRoomUrl: data.dailyRoomUrl ?? null,
                  dailyToken: data.dailyToken ?? null,
                  error: null,
            }),

      setCallActive: (params) =>
            set((state) => {
                  // Guard: prevent activating an IDLE/ended call state
                  if (state.callStatus === 'IDLE' && !params?.callId) {
                        return state;
                  }

                  // Guard: if params.callId is provided, and we already have a different callId, abort
                  if (params?.callId && state.callId && params.callId !== state.callId) {
                        return state;
                  }

                  return {
                        ...state, // Preserve existing state (like iceServers if not provided here)
                        callStatus: 'ACTIVE',
                        incomingCall: null,
                        isMuted: params?.initialMuted ?? state.isMuted,
                        isCameraOff: params?.initialCameraOff ?? state.isCameraOff,
                        ...(params?.callId ? { callId: params.callId } : {}),
                        ...(params?.iceServers ? { iceServers: params.iceServers } : {}),
                        ...(params?.iceTransportPolicy ? { iceTransportPolicy: params.iceTransportPolicy } : {}),
                  };
            }),

      setCallAccepted: ({ callId, iceServers, iceTransportPolicy }) =>
            set((state) => {
                  // Guard: prevent late acceptance from re-activating an idle state
                  if (state.callStatus === 'IDLE' || (state.callId && state.callId !== callId)) {
                        return state;
                  }

                  return {
                        ...state,
                        callId,
                        callStatus: 'ACTIVE',
                        callDuration: 0,
                        iceServers,
                        iceTransportPolicy,
                        incomingCall: null,
                  };
            }),

      setLocalStream: (stream) => set({ localStream: stream }),
      setRemoteStream: (stream) => set({ remoteStream: stream }),

      toggleMute: () =>
            set((state) => {
                  const next = !state.isMuted;
                  // Immediately toggle audio tracks on the local stream
                  if (state.localStream) {
                        for (const track of state.localStream.getAudioTracks()) {
                               track.enabled = !next;
                        }
                  }
                  return { isMuted: next };
            }),

      toggleCamera: () =>
            set((state) => {
                  const next = !state.isCameraOff;
                  if (state.localStream) {
                        for (const track of state.localStream.getVideoTracks()) {
                               track.enabled = !next;
                        }
                  }
                  return { isCameraOff: next };
            }),

      setCameraOff: (off) => set({ isCameraOff: off }),

      setConnectionQuality: (quality) => set({ connectionQuality: quality }),
      setCallStatus: (status) => set({ callStatus: status }),
      setReconnectStartedAt: (ts) => set({ reconnectStartedAt: ts }),
      tick: () => set((state) => ({ callDuration: state.callDuration + 1 })),
      setError: (error) => set({ error }),

      resetCallState: () =>
            set((state) => {
                  // Stop all local tracks before resetting
                  if (state.localStream) {
                        for (const track of state.localStream.getTracks()) {
                               track.stop();
                        }
                  }
                  return {
                        ...initialState,
                        activeGroupCalls: state.activeGroupCalls, // Preserve active calls map
                  };
            }),

      // ── Daily.co (Phase 4) ────────────────────────────────────────────

      switchToDaily: ({ callId, roomUrl, token }) =>
            set((state) => {
                  // Guard: prevent provider switch if call ended
                  if (state.callStatus === 'IDLE' || (state.callId && state.callId !== callId)) {
                        return state;
                  }

                  return {
                        ...state,
                        callId,
                        provider: 'DAILY_CO',
                        dailyRoomUrl: roomUrl,
                        dailyToken: token,
                        callStatus: 'ACTIVE',
                        connectionQuality: 'GOOD',
                  };
            }),

      setDailyParticipants: (participants) =>
            set({ dailyParticipants: participants }),

      setProvider: (provider) => set({ provider }),

      setCallId: (callId) => set({ callId }),

      setPeerMediaState: (cameraOff, muted) => set({ peerCameraOff: cameraOff, peerMuted: muted }),

      setActiveGroupCall: (conversationId, isActive, roomUrl) =>
            set((state) => ({
                  activeGroupCalls: {
                        ...state.activeGroupCalls,
                        [conversationId]: { 
                              active: isActive, 
                              roomUrl: roomUrl || state.activeGroupCalls[conversationId]?.roomUrl 
                        },
                  },
            })),
}));
