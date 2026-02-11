import {
  IsUUID,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsString,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

export class GetMessagesDto {
  @IsUUID()
  conversationId: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50; // Default 50 messages

  @IsOptional()
  @IsString()
  cursor?: string; // Message ID for cursor-based pagination (string from query)

  @IsOptional()
  @IsIn(['older', 'newer'])
  direction?: 'older' | 'newer' = 'older';
}
