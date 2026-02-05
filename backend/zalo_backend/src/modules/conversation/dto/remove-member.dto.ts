import { IsUUID } from 'class-validator';

export class RemoveMemberDto {
  @IsUUID()
  conversationId: string;

  @IsUUID()
  userId: string; // Member to remove/kick
}
