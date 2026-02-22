/**
 * useTypingIndicator — Manages typing state for the current conversation.
 *
 * Extracted from ChatFeature. All logic preserved exactly as-is.
 *
 * Two parts:
 *  1. `onTypingStatus` — socket callback (no socket-emit dependency, safe to
 *     create before useMessageSocket).
 *  2. `handleTypingChange` — ChatInput handler (needs emitters, create after).
 */

import { useCallback } from 'react';
import { useChatStore } from '../stores/chat.store';

interface TypingStatusPayload {
      conversationId: string;
      userId: string;
      isTyping: boolean;
}

/**
 * Returns:
 * - `onTypingStatus`   — pass to useMessageSocket({ onTypingStatus })
 * - `typingText`       — display in ChatHeader
 * - `buildHandleTypingChange` — call with emitters after useMessageSocket returns
 */
export function useTypingIndicator(params: {
      currentUserId: string | null;
}) {
      const { currentUserId } = params;
      const typingUserIds = useChatStore((s) => s.typingUserIds);
      const setTypingUserIds = useChatStore((s) => s.setTypingUserIds);

      /** Socket callback — passed to useMessageSocket's onTypingStatus */
      const onTypingStatus = useCallback(
            (payload: TypingStatusPayload) => {
                  const myId = currentUserId;
                  if (myId && payload.userId === myId) return;
                  setTypingUserIds((prev: string[]) => {
                        if (payload.isTyping) {
                              if (prev.includes(payload.userId)) return prev;
                              return [...prev, payload.userId];
                        }
                        return prev.filter((id: string) => id !== payload.userId);
                  });
            },
            [currentUserId, setTypingUserIds],
      );

      const typingText = typingUserIds.length > 0 ? 'Đang nhập...' : null;

      return { typingText, onTypingStatus };
}

/**
 * Builds the ChatInput onTypingChange handler.
 * Call this after useMessageSocket returns emitters.
 */
export function useHandleTypingChange(params: {
      selectedId: string | null;
      isMsgSocketConnected: boolean;
      emitTypingStart: (dto: { conversationId: string }) => void;
      emitTypingStop: (dto: { conversationId: string }) => void;
}) {
      const { selectedId, isMsgSocketConnected, emitTypingStart, emitTypingStop } = params;

      const handleTypingChange = useCallback(
            (isTyping: boolean) => {
                  if (!selectedId) return;
                  if (!isMsgSocketConnected) return;
                  if (isTyping) {
                        emitTypingStart({ conversationId: selectedId });
                        return;
                  }
                  emitTypingStop({ conversationId: selectedId });
            },
            [selectedId, isMsgSocketConnected, emitTypingStart, emitTypingStop],
      );

      return { handleTypingChange };
}
