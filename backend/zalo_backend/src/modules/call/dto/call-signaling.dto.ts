import { IsArray, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { CallType } from '@prisma/client';

// ─────────────────────────────────────────────────────────
// Client → Server DTOs
// ─────────────────────────────────────────────────────────

export class InitiateCallDto {
      @IsUUID()
      calleeId: string;

      @IsEnum(CallType)
      callType: CallType;

      @IsUUID()
      @IsOptional()
      conversationId?: string;

      /**
       * Phase 4: additional receivers for group calls.
       * If provided (length > 0), force Daily.co provider.
       * calleeId is still required (primary callee / backward compat).
       */
      @IsArray()
      @IsUUID('4', { each: true })
      @IsOptional()
      receiverIds?: string[];
}

/**
 * Phase 4: Request to switch an active P2P call to Daily.co SFU.
 * Sent by either participant when ICE restart fails.
 */
export class SwitchToDailyDto {
      @IsUUID()
      callId: string;
}

export class CallIdDto {
      @IsUUID()
      callId: string;
}

export class CallOfferDto {
      @IsUUID()
      callId: string;

      @IsString()
      sdp: string;
}

export class CallAnswerDto {
      @IsUUID()
      callId: string;

      @IsString()
      sdp: string;
}

export class CallIceCandidateDto {
      @IsUUID()
      callId: string;

      /**
       * Batched ICE candidates — serialized JSON array.
       * Frontend sends pre-serialized candidates to avoid nested validation overhead.
       */
      @IsString()
      candidates: string;
}
