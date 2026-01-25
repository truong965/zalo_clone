import { IsUUID, IsNotEmpty, IsBoolean } from 'class-validator';

export class TypingIndicatorDto {
  @IsUUID()
  @IsNotEmpty()
  conversationId: string;

  @IsBoolean()
  isTyping: boolean;
}
