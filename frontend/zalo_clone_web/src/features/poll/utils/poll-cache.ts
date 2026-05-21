import type { InfiniteData, QueryClient, QueryKey } from '@tanstack/react-query';
import type { CursorPaginatedResponse, MessageListItem, PollDetail } from '@/types/api';

type MessagesPage = CursorPaginatedResponse<MessageListItem>;
type MessagesInfiniteData = InfiniteData<MessagesPage, string | undefined>;

export function applyPollUpdateToCache(
      queryClient: QueryClient,
      messagesQueryKey: QueryKey,
      payload: { messageId: string; poll: PollDetail },
) {
      queryClient.setQueryData<MessagesInfiniteData>(messagesQueryKey, (old) => {
            if (!old) return old;
            return {
                  ...old,
                  pages: old.pages.map((page) => ({
                        ...page,
                        data: page.data.map((msg) =>
                              msg.id === payload.messageId
                                    ? { ...msg, poll: payload.poll }
                                    : msg,
                        ),
                  })),
            };
      });
}
