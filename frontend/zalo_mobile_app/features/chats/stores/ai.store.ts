import { create } from 'zustand';

export interface AiChatMessage {
  id: string;
  requestId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  status: 'pending' | 'streaming' | 'completed' | 'error';
  responseType: 'ask' | 'agent' | 'summary';
  metadata?: {
    conversationId?: string;
    responseType?: 'ask' | 'agent' | 'summary';
    [key: string]: any;
  };
}

export interface AiRequest {
  requestId: string;
  status: 'pending' | 'streaming' | 'completed' | 'error';
  content: string;
  progress?: {
    message: string;
    percent?: number;
  };
  error?: {
    code: string;
    message: string;
    retriable: boolean;
  };
  assistantMessageId?: string;
}

export interface AiConversationState {
  messages: AiChatMessage[];
  requests: Record<string, AiRequest>;
  activeRequestId: string | null;
  sessionId: string | null;
}

type AiStore = {
  aiConversations: Record<string, AiConversationState>;
  aiSummaryStartMessageId: string | null;
  
  hydrateAiConversation: (params: { conversationId: string; messages: AiChatMessage[]; sessionId?: string | null }) => void;
  startAiRequest: (params: { conversationId: string; requestId: string; responseType: 'ask' | 'agent' | 'summary'; prompt: string }) => void;
  streamAiContent: (params: { conversationId: string; requestId: string; content: string; progress?: { message: string; percent?: number } }) => void;
  completeAiRequest: (params: { conversationId: string; requestId: string; content: string }) => void;
  failAiRequest: (params: { conversationId: string; requestId: string; error: { code: string; message: string; retriable: boolean } }) => void;
  addAiMessage: (params: { conversationId: string; message: AiChatMessage }) => void;
  resetAiChat: (conversationId: string) => void;
  setAiSessionId: (params: { conversationId: string; sessionId: string | null }) => void;
  setAiSummaryStartMessageId: (messageId: string | null) => void;
};

export const useAiStore = create<AiStore>((set) => ({
  aiConversations: {},
  aiSummaryStartMessageId: null,

  hydrateAiConversation: ({ conversationId, messages, sessionId }) =>
    set((state) => ({
      aiConversations: {
        ...state.aiConversations,
        [conversationId]: {
          messages,
          requests: {},
          activeRequestId: null,
          sessionId: sessionId ?? state.aiConversations[conversationId]?.sessionId ?? null,
        },
      },
    })),

  startAiRequest: ({ conversationId, requestId, responseType, prompt }) =>
    set((state) => {
      const conversation = state.aiConversations[conversationId] ?? {
        messages: [],
        requests: {},
        activeRequestId: null,
        sessionId: null,
      };

      return {
        aiConversations: {
          ...state.aiConversations,
          [conversationId]: {
            ...conversation,
            messages: [
              ...conversation.messages,
              {
                id: requestId,
                requestId,
                role: 'user' as const,
                content: prompt,
                createdAt: new Date().toISOString(),
                status: 'completed' as const,
                responseType,
              },
            ],
            requests: {
              ...conversation.requests,
              [requestId]: {
                requestId,
                status: 'pending' as const,
                content: '',
              },
            },
            activeRequestId: requestId,
          },
        },
      };
    }),

  streamAiContent: ({ conversationId, requestId, content, progress }) =>
    set((state) => {
      const conversation = state.aiConversations[conversationId];
      if (!conversation) return state;

      return {
        aiConversations: {
          ...state.aiConversations,
          [conversationId]: {
            ...conversation,
            requests: {
              ...conversation.requests,
              [requestId]: {
                ...conversation.requests[requestId],
                status: 'streaming' as const,
                content,
                progress,
              },
            },
          },
        },
      };
    }),

  completeAiRequest: ({ conversationId, requestId, content }) =>
    set((state) => {
      const conversation = state.aiConversations[conversationId];
      if (!conversation) return state;

      const existingAssistantMsg = conversation.messages.find(
        (m) => m.requestId === requestId && m.role === 'assistant'
      );

      return {
        aiConversations: {
          ...state.aiConversations,
          [conversationId]: {
            ...conversation,
            messages: existingAssistantMsg
              ? conversation.messages.map((m) =>
                  m.requestId === requestId
                    ? { ...m, content, status: 'completed' as const }
                    : m
                )
              : [
                  ...conversation.messages,
                  {
                    id: `assistant-${requestId}`,
                    requestId,
                    role: 'assistant' as const,
                    content,
                    createdAt: new Date().toISOString(),
                    status: 'completed' as const,
                    responseType: conversation.requests[requestId]?.assistantMessageId
                      ? 'agent'
                      : 'ask',
                  },
                ],
            requests: {
              ...conversation.requests,
              [requestId]: {
                ...conversation.requests[requestId],
                status: 'completed' as const,
                content,
              },
            },
            activeRequestId: null,
          },
        },
      };
    }),

  failAiRequest: ({ conversationId, requestId, error }) =>
    set((state) => {
      const conversation = state.aiConversations[conversationId];
      if (!conversation) return state;

      return {
        aiConversations: {
          ...state.aiConversations,
          [conversationId]: {
            ...conversation,
            requests: {
              ...conversation.requests,
              [requestId]: {
                ...conversation.requests[requestId],
                status: 'error' as const,
                error,
              },
            },
            activeRequestId: null,
          },
        },
      };
    }),

  addAiMessage: ({ conversationId, message }) =>
    set((state) => {
      const conversation = state.aiConversations[conversationId] ?? {
        messages: [],
        requests: {},
        activeRequestId: null,
        sessionId: null,
      };

      return {
        aiConversations: {
          ...state.aiConversations,
          [conversationId]: {
            ...conversation,
            messages: [...conversation.messages, message],
          },
        },
      };
    }),

  resetAiChat: (conversationId) =>
    set((state) => ({
      aiConversations: {
        ...state.aiConversations,
        [conversationId]: {
          messages: [],
          requests: {},
          activeRequestId: null,
          sessionId: null,
        },
      },
    })),

  setAiSessionId: ({ conversationId, sessionId }) =>
    set((state) => {
      const conversation = state.aiConversations[conversationId];
      if (!conversation) return state;

      return {
        aiConversations: {
          ...state.aiConversations,
          [conversationId]: {
            ...conversation,
            sessionId,
          },
        },
      };
    }),

  setAiSummaryStartMessageId: (messageId) =>
    set(() => ({
      aiSummaryStartMessageId: messageId,
    })),
}));
