/**
 * useConversationLoader — Ensures a conversation is loaded in the cache
 * before the user interacts with it (e.g. from search results or deep links).
 *
 * Extracted from ChatFeature. All logic preserved exactly as-is.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { conversationService } from '@/features/conversation';
import type { ConversationUI } from '../types';

interface UseConversationLoaderParams {
      selectedId: string | null;
      conversations: ConversationUI[];
      prependConversation: (item: ConversationUI) => void;
}

export function useConversationLoader(params: UseConversationLoaderParams) {
      const { selectedId, conversations, prependConversation } = params;

      const fetchedSearchConvIds = useRef(new Set<string>());
      const [searchConvMap, setSearchConvMap] = useState<Record<string, ConversationUI>>({});

      // Ref to always access latest conversations without stale closures
      const conversationsRef = useRef(conversations);
      conversationsRef.current = conversations;

      const ensureConversationLoaded = useCallback(async (id: string): Promise<void> => {
            // Already in the paginated list → no fetch needed
            if (conversationsRef.current.some((c) => c.id === id)) return;
            // Already fetched before (might still be prepending) → skip duplicate fetch
            if (fetchedSearchConvIds.current.has(id)) return;

            fetchedSearchConvIds.current.add(id);
            try {
                  const conv = await conversationService.getConversationById(id);
                  prependConversation(conv);
                  // Also store in local state as fallback (setQueryData on infinite queries
                  // may not always trigger useInfiniteQuery re-render)
                  setSearchConvMap((prev) => ({ ...prev, [id]: conv }));
            } catch (error) {
                  console.error(`[ensureConversationLoaded] Failed to load conversation ${id}:`, error);
                  fetchedSearchConvIds.current.delete(id); // Allow retry on next attempt
            }
      }, [prependConversation]);

      // Trigger fetch when selectedId changes and conversation isn't loaded yet
      useEffect(() => {
            if (!selectedId) return;
            void ensureConversationLoaded(selectedId);
      }, [selectedId, ensureConversationLoaded]);

      const selectedConversation = (
            conversations.find((c) => c.id === selectedId)
            ?? (selectedId ? searchConvMap[selectedId] : undefined)
      ) as ConversationUI | undefined;

      return { selectedConversation, ensureConversationLoaded };
}
