/**
 * useConversation — Hook to manipulate the global conversation state.
 * Currently uses useChatStore from chat feature.
 */
import { useChatStore } from '@/features/chat/stores/chat.store';

export function useConversation() {
      const setSelectedId = useChatStore((s) => s.setSelectedId);

      /**
       * Deselect the current conversation and clear selection state.
       */
      const clearCurrentConversation = () => {
            setSelectedId(null);
      };

      return {
            clearCurrentConversation,
      };
}
