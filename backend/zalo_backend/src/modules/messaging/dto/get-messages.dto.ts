import { IsUUID, IsOptional, IsInt, Min, Max } from 'class-validator';
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
  cursor?: bigint; // Message ID for cursor-based pagination
}
