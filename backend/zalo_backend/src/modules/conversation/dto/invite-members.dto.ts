import { IsUUID, IsArray, ArrayMinSize, ArrayMaxSize } from 'class-validator';

/**
 * DTO for inviting members to a group that has requireApproval enabled.
 * Creates GroupJoinRequest entries instead of directly adding members.
 */
export class InviteMembersDto {
      @IsUUID()
      conversationId: string;

      @IsArray()
      @IsUUID('all', { each: true })
      @ArrayMinSize(1)
      @ArrayMaxSize(50)
      userIds: string[];
}
