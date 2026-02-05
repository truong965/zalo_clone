import {
  IsString,
  IsUUID,
  IsEnum,
  IsOptional,
  IsNotEmpty,
  MaxLength,
  IsObject,
  ValidateNested,
  IsArray,
  ArrayMaxSize,
  ValidationOptions,
  registerDecorator,
} from 'class-validator';
import { MessageType } from '@prisma/client';
import { safeStringify } from 'src/common/utils/json.util';
import { Type } from 'class-transformer';

function MaxJSONSize(maxSizeKB: number, validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'maxJSONSize',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          if (!value) return true;
          const size = safeStringify(value).length;
          return size <= maxSizeKB * 1024;
        },
        defaultMessage() {
          return `${propertyName} exceeds ${maxSizeKB}KB limit`;
        },
      },
    });
  };
}
export class ReplyToDto {
  @IsString()
  @IsNotEmpty()
  messageId: string; // Nhận string từ client (VD: "227")
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
  @MaxJSONSize(10)
  metadata?: Record<string, any>; // For file info, location, etc.

  @IsOptional()
  @ValidateNested()
  @Type(() => ReplyToDto)
  replyTo?: ReplyToDto;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true, message: 'mediaIds must contain valid UUIDs' })
  @ArrayMaxSize(10)
  mediaIds?: string[];
}
