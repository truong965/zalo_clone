import { IsString, IsNotEmpty, IsEnum, IsOptional, IsUUID, IsBoolean } from 'class-validator';

export enum AiTriggerType {
  TRANSLATE = 'translate',
  ASK = 'ask',
  SUMMARY = 'summary',
  AGENT = 'agent',
}

export class AiTriggerDto {
  @IsEnum(AiTriggerType)
  @IsNotEmpty()
  type: AiTriggerType;

  @IsUUID()
  @IsNotEmpty()
  conversationId: string;

  @IsString()
  @IsOptional()
  messageId?: string;

  @IsString()
  @IsOptional()
  startMessageId?: string;

  @IsString()
  @IsOptional()
  endMessageId?: string;

  @IsString()
  @IsOptional()
  text?: string;

  @IsString()
  @IsOptional()
  targetLang?: string;

  @IsBoolean()
  @IsOptional()
  stream?: boolean;

  @IsString()
  @IsOptional()
  requestId?: string;

  @IsString()
  @IsOptional()
  startDate?: string;

  @IsString()
  @IsOptional()
  endDate?: string;
}
