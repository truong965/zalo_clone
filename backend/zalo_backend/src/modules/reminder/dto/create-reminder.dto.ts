import { IsString, IsOptional, IsDateString, MaxLength, IsNotEmpty } from 'class-validator';

export class CreateReminderDto {
      @IsString()
      @IsNotEmpty()
      @MaxLength(500)
      content: string;

      @IsDateString()
      remindAt: string;

      @IsOptional()
      @IsString()
      conversationId?: string;

      @IsOptional()
      @IsString()
      messageId?: string;
}
