import { IsString, IsOptional, IsDateString, MaxLength, IsBoolean } from 'class-validator';

export class UpdateReminderDto {
      @IsOptional()
      @IsString()
      @MaxLength(500)
      content?: string;

      @IsOptional()
      @IsDateString()
      remindAt?: string;

      @IsOptional()
      @IsBoolean()
      isCompleted?: boolean;
}
