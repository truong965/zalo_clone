import { IsUUID } from 'class-validator';

export class TransferAdminDto {
  @IsUUID()
  conversationId: string;

  @IsUUID()
  newAdminId: string; // Member to promote to ADMIN
}
