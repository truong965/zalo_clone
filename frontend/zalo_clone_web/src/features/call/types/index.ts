/**
 * Types for Call feature module.
 *
 * Aligned with backend call-signaling.gateway.ts payloads and
 * CallHistory Prisma model (Phase 0 schema).
 */

// ============================================================================
// ENUMS
// ============================================================================

export type CallType = 'VOICE' | 'VIDEO';
export type CallProvider = 'WEBRTC_P2P' | 'DAILY_CO';

export type CallStatus =
  | 'IDLE'
  | 'DIALING'
  | 'RINGING'
  | 'ACTIVE'
  | 'RECONNECTING'
  | 'ENDED';

export type ConnectionQuality = 'GOOD' | 'MEDIUM' | 'POOR' | 'DISCONNECTED';

export type CallEndReason =
  | 'USER_HANGUP'
  | 'REJECTED'
  | 'BLOCKED'
  | 'TIMEOUT'
  | 'NETWORK_DROP'
  | 'NO_ANSWER'
  | 'CANCEL';

export type CallHistoryStatus = 'COMPLETED' | 'MISSED' | 'REJECTED' | 'CANCELLED' | 'NO_ANSWER' | 'FAILED';

// ============================================================================
// ICE / WebRTC
// ============================================================================

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface IceConfig {
  iceServers: IceServerConfig[];
  iceTransportPolicy: RTCIceTransportPolicy;
}

// ============================================================================
// SOCKET PAYLOADS — Server → Client
// ============================================================================

export interface CallerInfo {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

/** Payload for `call:incoming` event (callee receives) */
export interface IncomingCallPayload {
  callId: string;
  callType: CallType;
  conversationId: string | null;
  callerInfo: CallerInfo;
  iceServers: IceServerConfig[];
  iceTransportPolicy: RTCIceTransportPolicy;
  /** Phase 4.4: true if this is a group call (>1 receiver) */
  isGroupCall?: boolean;
  /** Number of participants including caller (group calls) */
  participantCount?: number;
  /** Group conversation name (group calls) */
  conversationName?: string | null;
  /** Daily.co room URL (sent for group calls at initiation time) */
  dailyRoomUrl?: string;
  /** Meeting token for this specific receiver (group calls) */
  dailyToken?: string;
}

/** Payload for `call:accepted` event (caller receives) */
export interface CallAcceptedPayload {
  callId: string;
  iceServers: IceServerConfig[];
  iceTransportPolicy: RTCIceTransportPolicy;
}

/** Payload for `call:ended` event */
export interface CallEndedPayload {
  callId: string;
  reason: CallEndReason;
  duration: number;
  status: CallHistoryStatus;
}

/** Payload for `call:busy` event */
export interface CallBusyPayload {
  calleeId: string;
}

/** Payload for relayed `call:offer` / `call:answer` */
export interface SdpRelayPayload {
  callId: string;
  sdp: string;
  fromUserId: string;
}

/** Payload for relayed `call:ice-candidate` (batched) */
export interface IceCandidateRelayPayload {
  callId: string;
  candidates: string; // JSON-encoded array of RTCIceCandidateInit
  fromUserId: string;
}

/** Payload for `call:caller-disconnected` */
export interface CallerDisconnectedPayload {
  callId: string;
}

/** Payload for `call:quality-change` */
export interface QualityChangePayload {
  callId: string;
  quality: ConnectionQuality;
}

// PRODUCTION TODO (Phase 4): Add DailyRoomPayload for `call:daily-room`
export interface DailyRoomPayload {
  callId: string;
  roomUrl: string;
  tokens: Record<string, string>;
}

/** Payload for `call:participant-joined` (group call) */
export interface ParticipantJoinedPayload {
  callId: string;
  userId: string;
  displayName: string;
}

/** Payload for `call:participant-left` (group call) */
export interface ParticipantLeftPayload {
  callId: string;
  userId: string;
}

// ============================================================================
// DAILY.CO TYPES
// ============================================================================

/** A participant in a Daily.co call */
export interface DailyParticipant {
  /** Daily session ID */
  sessionId: string;
  /** Our user ID (set via user_id in meeting token) */
  userId: string;
  /** Display name */
  displayName: string;
  /** Whether this is the local user */
  isLocal: boolean;
  /** Audio track state */
  audioTrack: MediaStreamTrack | null;
  /** Video track state */
  videoTrack: MediaStreamTrack | null;
  /** Whether audio is enabled */
  audioEnabled: boolean;
  /** Whether video is enabled */
  videoEnabled: boolean;
}

// ============================================================================
// SOCKET PAYLOADS — Client → Server
// ============================================================================

export interface InitiateCallRequest {
  calleeId: string;
  callType: CallType;
  conversationId?: string;
  /** Phase 4.4: additional receiver IDs for group calls */
  receiverIds?: string[];
}

export interface CallIdRequest {
  callId: string;
}

export interface SdpRequest {
  callId: string;
  sdp: string;
}

export interface IceCandidateRequest {
  callId: string;
  candidates: string;
}

// ============================================================================
// STORE STATE TYPES
// ============================================================================

export interface PeerInfo {
  displayName: string;
  avatarUrl: string | null;
}

export interface IncomingCallData {
  callId: string;
  callType: CallType;
  conversationId: string | null;
  callerInfo: CallerInfo;
  iceServers: IceServerConfig[];
  iceTransportPolicy: RTCIceTransportPolicy;
  receivedAt: number; // Date.now() for timeout tracking
  /** Phase 4.4: group call flag */
  isGroupCall?: boolean;
  /** Number of participants (group calls) */
  participantCount?: number;
  /** Group conversation name (group calls) */
  conversationName?: string | null;
  /** Daily.co room URL (group calls receive this at incoming time) */
  dailyRoomUrl?: string;
  /** Meeting token for current user (group calls) */
  dailyToken?: string;
}

// ============================================================================
// CALL HISTORY (API response from backend)
// ============================================================================

export type CallParticipantRole = 'HOST' | 'MEMBER';
export type CallParticipantStatus = 'JOINED' | 'MISSED' | 'REJECTED' | 'LEFT' | 'KICKED';

export interface CallParticipantRecord {
  id: string;
  userId: string;
  role: CallParticipantRole;
  status: CallParticipantStatus;
  joinedAt?: string | null;
  leftAt?: string | null;
  duration?: number | null;
  user?: { id: string; displayName: string; avatarUrl: string | null };
}

export interface CallHistoryRecord {
  id: string;
  /** Initiator / HOST of the call */
  initiatorId: string;
  /** Total participant count (initiator + receivers) */
  participantCount: number;
  /** All participants with their roles and statuses */
  participants: CallParticipantRecord[];
  callType: CallType;
  provider: CallProvider;
  conversationId: string | null;
  status: CallHistoryStatus;
  endReason: CallEndReason | null;
  duration: number | null;
  startedAt: string;
  endedAt: string | null;
  createdAt: string;
  isViewed: boolean;
  /** Initiator user info */
  initiator?: { id: string; displayName: string; avatarUrl: string | null };
}

export interface MissedCallCount {
  count: number;
  lastMissedAt: string | null;
}
