import { MessageType } from '@prisma/client';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class BaseSocketEventDto {
  @IsString()
  @IsNotEmpty()
  event: string;

  @IsOptional()
  @ValidateNested()
  data?: any;
}

// For future chat features
export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  content: string;

  @IsNotEmpty({ message: 'Conversation ID là bắt buộc' })
  @IsUUID('4', { message: 'Conversation ID phải là UUID hợp lệ' })
  conversationId: string;

  @IsOptional()
  @IsEnum(MessageType, {
    message: 'Loại tin nhắn không hợp lệ (TEXT, IMAGE, FILE...)',
  }) // Validate theo Enum Prisma
  type?: MessageType = MessageType.TEXT; // Default value

  @IsOptional()
  @IsUUID()
  replyToId?: string;
}
