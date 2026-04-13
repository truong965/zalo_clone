import { create } from 'zustand';
import type { ChatMessage } from '../types';

interface ForwardMessageState {
    isOpen: boolean;
    sourceMessage: ChatMessage | null;
    selectedConversationIds: string[];
}

interface ForwardMessageActions {
    open: (message: ChatMessage) => void;
    close: () => void;
    toggleConversation: (conversationId: string) => void;
    clearSelections: () => void;
}

const MAX_FORWARD_TARGETS = 5;

export const useForwardMessageStore = create<
    ForwardMessageState & ForwardMessageActions
>((set) => ({
    isOpen: false,
    sourceMessage: null,
    selectedConversationIds: [],

    open: (message) =>
        set({
            isOpen: true,
            sourceMessage: message,
            selectedConversationIds: [],
        }),

    close: () =>
        set({
            isOpen: false,
            sourceMessage: null,
            selectedConversationIds: [],
        }),

    toggleConversation: (conversationId) =>
        set((state) => {
            const exists = state.selectedConversationIds.includes(conversationId);
            if (exists) {
                return {
                    selectedConversationIds: state.selectedConversationIds.filter(
                        (id) => id !== conversationId,
                    ),
                };
            }

            if (state.selectedConversationIds.length >= MAX_FORWARD_TARGETS) {
                return state;
            }

            return {
                selectedConversationIds: [...state.selectedConversationIds, conversationId],
            };
        }),

    clearSelections: () => set({ selectedConversationIds: [] }),
}));

export { MAX_FORWARD_TARGETS };
