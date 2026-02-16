/**
 * DTO for group conversation list item
 * Used by GET /conversations/groups endpoint
 *
 * Reuses structure similar to GroupSearchResultDto from search_engine
 * but includes additional fields needed for the group list (unreadCount, lastMessage)
 */
export class GroupListItemDto {
      id: string;
      name: string | null;
      avatarUrl: string | null;
      memberCount: number;
      membersPreview: string[]; // First 3 member display names
      lastMessageAt: string | null;
      lastMessage: {
            id: string;
            content: string | null;
            type: string;
            senderId: string | null;
            createdAt: string;
      } | null;
      unreadCount: number;
      myRole: string;            // Current user's role: 'ADMIN' | 'MEMBER'
      isMuted: boolean;          // Whether current user has muted this group
      requireApproval: boolean;  // Whether group requires approval to join
      createdAt: string;
      updatedAt: string;
}
