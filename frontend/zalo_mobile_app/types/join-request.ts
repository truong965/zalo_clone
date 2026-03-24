export interface JoinRequest {
  id: string;
  conversationId: string;
  userId: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestedAt: string;
  message: string | null;
  user: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
  };
}
