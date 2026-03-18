import { useCursorPagination } from '@/hooks/use-cursor-pagination';
import { mobileApi } from '@/services/api';
import { useAuth } from '@/providers/auth-provider';
import { Conversation } from '@/types/conversation';

export function useConversationsList(limit: number = 20) {
  const { accessToken } = useAuth();

  return useCursorPagination<Conversation>(
    ['conversations', accessToken],
    (cursor) => mobileApi.getConversations(accessToken!, { cursor, limit }),
    {
      enabled: !!accessToken,
    }
  );
}
