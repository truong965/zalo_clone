import {
  IsString,
  IsUUID,
  IsEnum,
  IsOptional,
  IsNotEmpty,
  MaxLength,
  IsObject,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MessageType } from '@prisma/client';

class ReplyToDto {
  @IsNotEmpty()
  messageId: bigint;
}
export class SendMessageDto {
  @IsUUID()
  @IsNotEmpty()
  conversationId: string;

  @IsUUID()
  @IsNotEmpty()
  clientMessageId: string; // Client generates this UUID

  @IsEnum(MessageType)
  @IsNotEmpty()
  type: MessageType;

  @IsString()
  @MaxLength(10000) // 10KB text limit
  @IsOptional()
  content?: string;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>; // For file info, location, etc.

  @IsOptional()
  @ValidateNested()
  @Type(() => ReplyToDto)
  replyTo?: ReplyToDto;
}
