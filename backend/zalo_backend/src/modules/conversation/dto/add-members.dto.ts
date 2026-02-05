import { IsUUID, IsArray, ArrayMinSize, ArrayMaxSize } from 'class-validator';

export class AddMembersDto {
  @IsUUID()
  conversationId: string;

  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(50) // Limit bulk add to 50 at a time
  userIds: string[];
}
