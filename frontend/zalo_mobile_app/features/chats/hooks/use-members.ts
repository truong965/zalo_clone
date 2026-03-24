import { useQuery } from '@tanstack/react-query';
import { mobileApi } from '@/services/api';
import { useAuth } from '@/providers/auth-provider';

export function useConversationMembers(conversationId: string, limit?: number, enabled = true) {
  const { accessToken } = useAuth();
  
  return useQuery({
    queryKey: ['conversation-members', conversationId, limit],
    queryFn: () => mobileApi.getConversationMembers(conversationId, accessToken!, limit),
    enabled: !!conversationId && !!accessToken && enabled,
    staleTime: 60_000,
  });
}
