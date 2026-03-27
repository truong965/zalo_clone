import { IsEnum, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CallStatus,
  CallType,
  CallProvider,
  CallParticipantRole,
  CallParticipantStatus,
} from '@prisma/client';
import { CursorPaginationDto } from 'src/common/dto/cursor-pagination.dto';
import { Type } from 'class-transformer';

// ─── Internal DTOs ─────────────────────────────────────────────────────────────

/**
 * Internal input for ending a call (used by gateway → service).
 * Not exposed via HTTP — no class-validator decorators needed.
 */
export interface EndCallInput {
  callId?: string;
  initiatorId: string;
  calleeId: string;
  status: CallStatus;
  duration?: number;
  startedAt: string;
  endedAt?: string;
  callType?: CallType;
  provider?: CallProvider;
  endReason?: string;
}

// ─── Response DTOs ─────────────────────────────────────────────────────────────

export class CallParticipantDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  userId: string;

  @ApiProperty({ enum: CallParticipantRole })
  role: CallParticipantRole;

  @ApiProperty({ enum: CallParticipantStatus })
  status: CallParticipantStatus;

  @ApiPropertyOptional()
  joinedAt?: Date;

  @ApiPropertyOptional()
  leftAt?: Date;

  @ApiPropertyOptional()
  duration?: number;

  @ApiPropertyOptional()
  user?: {
    id: string;
    displayName: string;
    avatarUrl?: string | null;
  };
}

export class JoinExistingCallDto {
  @ApiProperty()
  conversationId: string;
}

export class ActiveGroupCallDto {
  @ApiProperty()
  callId: string;

  @ApiProperty()
  conversationId: string;

  @ApiProperty({ enum: CallStatus })
  status: CallStatus;

  @ApiProperty()
  participantCount: number;

  @ApiProperty()
  startedAt: Date;

  @ApiProperty()
  isJoined: boolean;
}

export class CallHistoryResponseDto {
  @ApiProperty()
  id: string;

  /** HOST of the call */
  @ApiProperty()
  initiatorId: string;

  @ApiProperty()
  participantCount: number;

  @ApiProperty({ enum: CallStatus })
  status: CallStatus;

  @ApiProperty({ enum: CallType })
  callType: CallType;

  @ApiProperty({ enum: CallProvider })
  provider: CallProvider;

  @ApiProperty()
  duration: number;

  @ApiProperty()
  startedAt: Date;

  @ApiPropertyOptional()
  endedAt?: Date;

  @ApiPropertyOptional()
  endReason?: string;

  @ApiPropertyOptional()
  conversationId?: string;

  @ApiProperty()
  isViewed: boolean;

  @ApiProperty({ type: [CallParticipantDto] })
  participants: CallParticipantDto[];

  /** Convenience field — initiator user info. */
  @ApiPropertyOptional()
  initiator?: {
    id: string;
    displayName: string;
    avatarUrl?: string | null;
  };
}

/**
 * Active call session (Redis only, not in DB)
 *
 * Business rule: 1 active call per user.
 * Redis key: `call:user:{userId}:current` → callId (String)
 * Redis key: `call:session:{callId}` → JSON of this DTO
 */
export class ActiveCallSession {
  callId: string;
  initiatorId: string;
  calleeId: string;
  callType: CallType;
  provider: CallProvider;
  conversationId?: string;
  dailyRoomName?: string;
  startedAt: Date;
  status: 'RINGING' | 'ACTIVE' | 'RECONNECTING';
  serverInstance?: string;

  /**
   * Phase 4.4: Group call support.
   * All receiver user IDs (includes calleeId for backward compat).
   * For 1-1 calls: [calleeId]. For group: [calleeId, ...otherReceiverIds].
   */
  participantIds?: string[];

  /** True when receiverIds.length > 1 (forces Daily.co) */
  isGroupCall?: boolean;
  /**
   * Map: userId -> deviceId
   */
  activeDevices?: Record<string, string>;

  /**
   * Map: userId -> boolean (true if mobile device)
   * Prevents premature disconnects on backgrounding
   */
  mobileDevices?: Record<string, boolean>;

  /**
   * D2: Accurate duration tracking (excluding reconnecting time).
   */
  accumulatedDurationS?: number;
  lastStatusChangedAt?: string;

  /**
   * Phase 3: G4/D1 - Track actual participant journey
   * Map: userId -> array of timeline segments
   */
  participantTimeline?: Record<
    string,
    { joinedAt: string; leftAt?: string; durationS?: number }[]
  >;

  /**
   * Phase 4: L5 - Media state persistence
   * Map: userId -> { audioEnabled, videoEnabled }
   */
  mediaState?: Record<string, { audioEnabled?: boolean; videoEnabled?: boolean }>;
}

/**
 * DTO for getting call history (query params)
 */
export class GetCallHistoryQueryDto extends CursorPaginationDto {
  @ApiPropertyOptional({ enum: CallStatus })
  @IsOptional()
  @IsEnum(CallStatus)
  status?: CallStatus;

  @ApiPropertyOptional({
    description: 'Include total count (expensive, default: first page only)',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  includeTotal?: boolean;
}

/**
 * DTO for missed calls count
 */
export class MissedCallsCountDto {
  @ApiProperty()
  count: number;

  @ApiProperty()
  lastMissedAt?: Date;
}
