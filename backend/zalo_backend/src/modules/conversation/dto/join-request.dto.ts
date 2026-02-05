import { IsString, IsOptional, MaxLength, IsUUID } from 'class-validator';

export class CreateJoinRequestDto {
  @IsUUID()
  conversationId: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  message?: string; // Optional message to admin
}
