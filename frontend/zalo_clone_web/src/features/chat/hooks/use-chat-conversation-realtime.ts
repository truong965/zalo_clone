/**
 * useChatConversationRealtime — isolates conversation socket handlers (D4).
 *
 * This hook handles chat-page-specific logic only:
 * - Cache updates (prepend/update/remove conversations)
 * - Query invalidation
 *
 * Notifications are handled globally by useGroupNotifications at ClientLayout level.
 */

import { useConversationSocket } from '@/features/conversation';
import { useInvalidateConversations } from '@/features/conversation/hooks/use-conversation-queries';
import type { ConversationUI } from '@/types/api';

interface Params {
      prependConversation: (item: ConversationUI) => void;
      updateConversation: (id: string, updates: Partial<ConversationUI>) => void;
      removeConversation: (id: string) => void;
      selectedId: string | null;
      setSelectedId: (id: string | null) => void;
}

export function useChatConversationRealtime({
      prependConversation,
      updateConversation,
      removeConversation,
      selectedId,
      setSelectedId,
}: Params) {
      const { invalidateAll } = useInvalidateConversations();

      useConversationSocket({
            onGroupCreated: (data) => {
                  prependConversation(data.group as ConversationUI);
            },

            onGroupUpdated: (data) => {
                  updateConversation(data.conversationId, data.updates as Partial<ConversationUI>);
            },

            onGroupMembersAdded: () => {
                  void invalidateAll();
            },

            onGroupMemberRemoved: () => {
                  void invalidateAll();
            },

            onGroupMemberLeft: () => {
                  void invalidateAll();
            },

            onGroupYouWereRemoved: (data) => {
                  removeConversation(data.conversationId);
                  if (selectedId === data.conversationId) {
                        setSelectedId(null);
                  }
            },

            onGroupMemberJoined: () => {
                  void invalidateAll();
            },

            onGroupDissolved: (data) => {
                  removeConversation(data.conversationId);
                  if (selectedId === data.conversationId) {
                        setSelectedId(null);
                  }
            },
      });
}
