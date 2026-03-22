export type CallStatus = 'RINGING' | 'ACTIVE' | 'ENDED' | 'MISSED' | 'NO_ANSWER' | 'CANCELLED' | 'BUSY' | 'REJECTED';
export type CallType = 'VOICE' | 'VIDEO';

export interface CallParticipant {
  id: string;
  userId: string;
  role: 'HOST' | 'MEMBER';
  status: 'JOINED' | 'LEFT' | 'MISSED' | 'DECLINED';
  user?: {
    id: string;
    displayName: string;
    avatarUrl?: string | null;
  };
}

export interface CallHistoryItem {
  id: string;
  initiatorId: string;
  participantCount: number;
  status: CallStatus;
  callType: CallType;
  duration: number;
  startedAt: string;
  endedAt?: string;
  isViewed: boolean;
  participants: CallParticipant[];
  initiator?: {
    id: string;
    displayName: string;
    avatarUrl?: string | null;
  };
}

export interface CursorPaginatedResult<T> {
  data: T[];
  meta: {
    limit: number;
    hasNextPage: boolean;
    nextCursor?: string;
    total?: number;
  };
}
