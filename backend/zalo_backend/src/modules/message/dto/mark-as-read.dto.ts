import { IsUUID, IsArray, IsNotEmpty, IsString } from 'class-validator';

export class MarkAsReadDto {
  @IsUUID()
  @IsNotEmpty()
  conversationId: string;

  @IsArray()
  @IsString({ each: true })
  messageIds: string[];
}
