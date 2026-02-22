/**
 * useChatSelection — selectedConversationId + URL param sync.
 *
 * Extracted from ChatFeature to isolate the selection concern.
 * Logic preserved exactly as-is from the original implementation.
 */

import { useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useChatStore } from '../stores/chat.store';

export function useChatSelection() {
      const [searchParams, setSearchParams] = useSearchParams();
      const selectedId = useChatStore((s) => s.selectedId);
      const setSelectedId = useChatStore((s) => s.setSelectedId);
      const setTypingUserIds = useChatStore((s) => s.setTypingUserIds);

      // Sync selectedId when URL query param changes (e.g. navigating from /contacts)
      useEffect(() => {
            const urlConversationId = searchParams.get('conversationId');
            if (urlConversationId && urlConversationId !== selectedId) {
                  setSelectedId(urlConversationId);
                  // Clean up the query param to keep URL tidy
                  setSearchParams((prev) => {
                        const next = new URLSearchParams(prev);
                        next.delete('conversationId');
                        return next;
                  }, { replace: true });
            }
      }, [searchParams, selectedId, setSelectedId, setSearchParams]);

      const handleSelectConversation = useCallback((id: string) => {
            if (id === selectedId) return;
            setSelectedId(id);
            setTypingUserIds([]);
      }, [selectedId, setSelectedId, setTypingUserIds]);

      return {
            selectedId,
            setSelectedId,
            handleSelectConversation,
      };
}
