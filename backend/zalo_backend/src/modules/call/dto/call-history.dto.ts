import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsUUID,
  IsDateString,
  IsBoolean,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CallStatus } from '@prisma/client';
import { CursorPaginationDto } from 'src/common/dto/cursor-pagination.dto';
import { Type } from 'class-transformer';

export class LogCallDto {
  @IsUUID()
  callerId: string;

  @IsUUID()
  calleeId: string;

  @IsEnum(CallStatus)
  status: CallStatus;

  @IsNumber()
  @IsOptional()
  duration?: number;

  @IsDateString()
  startedAt: string;

  @IsDateString()
  @IsOptional()
  endedAt?: string;
}

export class CallHistoryResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  callerId: string;

  @ApiProperty()
  calleeId: string;

  @ApiProperty({ enum: CallStatus })
  status: CallStatus;

  @ApiProperty()
  duration: number;

  @ApiProperty()
  startedAt: Date;
  @ApiProperty()
  endedAt?: Date;
  @ApiProperty()
  isViewed: boolean;

  @ApiPropertyOptional()
  caller?: {
    id: string;
    displayName: string;
    avatarUrl?: string;
  };

  @ApiPropertyOptional()
  callee?: {
    id: string;
    displayName: string;
    avatarUrl?: string;
  };
}

/**
 * Active call session (Redis only, not in DB)
 */
export class ActiveCallSession {
  callId: string;
  callerId: string;
  calleeId: string;
  startedAt: Date;
  status: 'RINGING' | 'ACTIVE' | 'RECONNECTING';
  serverInstance?: string;
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
