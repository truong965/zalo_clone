import { IsUUID, IsArray, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';

export class MarkAsReadDto {
  @IsUUID()
  @IsNotEmpty()
  conversationId: string;

  @IsArray()
  @Type(() => BigInt)
  messageIds: bigint[]; // Can batch multiple messages
}
