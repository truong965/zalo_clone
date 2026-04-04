/**
 * chat.store.ts — Zustand store for ephemeral chat UI state.
 *
 * Owns:
 * - selectedConversationId + sessionStorage persistence
 * - rightSidebar mode ('none' | 'search' | 'info')
 * - global search panel open/close
 * - friend search modal open/close
 * - search keyword prefill (for navigating from global search to in-conv search)
 * - typingUserIds per conversation
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { STORAGE_KEYS } from '@/constants/storage-keys';
import type {
      RightSidebarState,
      AiChatMessage,
      AiConversationState,
      AiRequestError,
      AiRequestProgress,
      AiRequestState,
} from '../types';

export type MediaBrowserTab = 'photos' | 'files';

/**
 * Lightweight snapshot of the message being replied to.
 * Kept minimal — just what ReplyPreviewBar + optimistic send need.
 */
export interface ReplyTarget {
      messageId: string;
      senderName: string;
      content?: string | null;
      type: string;
      mediaAttachments?: { mediaType: string; originalName: string }[];
}

interface ChatStoreState {
      // ── Selection ──────────────────────────────────────────────────────────
      selectedId: string | null;

      // ── Sidebar / panels ──────────────────────────────────────────────────
      rightSidebar: RightSidebarState;
      isGlobalSearchOpen: boolean;
      isFriendSearchOpen: boolean;
      prefillSearchKeyword: string | undefined;

      // ── Media Browser ──────────────────────────────────────────────────────
      mediaBrowserTab: MediaBrowserTab;

      // ── Typing ────────────────────────────────────────────────────────────
      typingUserIds: string[];

      // ── Reply ─────────────────────────────────────────────────────────────
      replyTarget: ReplyTarget | null;

      // ── AI Summary / Assistant ────────────────────────────────────────────
      aiSummaryStartMessageId: string | null;
      aiConversations: Record<string, AiConversationState>;
}

type StartAiRequestInput = {
      conversationId: string;
      requestId: string;
      responseType: 'ask' | 'agent' | 'summary';
      prompt: string;
      sessionId?: string;
};

type ProgressAiRequestInput = {
      conversationId: string;
      requestId: string;
      progress: AiRequestProgress;
      sessionId?: string;
};

type DeltaAiRequestInput = {
      conversationId: string;
      requestId: string;
      contentDelta?: string;
      thoughtDelta?: string;
      sessionId?: string;
};

type CompleteAiRequestInput = {
      conversationId: string;
      requestId: string;
      content: string;
      sessionId?: string;
      responseType?: 'ask' | 'agent' | 'summary';
};

type FailAiRequestInput = {
      conversationId: string;
      requestId: string;
      error: AiRequestError;
      sessionId?: string;
};

type HydrateConversationInput = {
      conversationId: string;
      messages: AiChatMessage[];
      activeRequestId?: string | null;
};

interface ChatStoreActions {
      setSelectedId: (id: string | null) => void;
      setRightSidebar: (value: RightSidebarState | ((prev: RightSidebarState) => RightSidebarState)) => void;
      setIsGlobalSearchOpen: (open: boolean) => void;
      setIsFriendSearchOpen: (open: boolean) => void;
      setPrefillSearchKeyword: (keyword: string | undefined) => void;
      setMediaBrowserTab: (tab: MediaBrowserTab) => void;
      setTypingUserIds: (updater: string[] | ((prev: string[]) => string[])) => void;
      setReplyTarget: (target: ReplyTarget | null) => void;
      setAiSummaryStartMessageId: (id: string | null) => void;
      hydrateAiConversation: (input: HydrateConversationInput) => void;
      startAiRequest: (input: StartAiRequestInput) => void;
      updateAiRequestProgress: (input: ProgressAiRequestInput) => void;
      appendAiRequestDelta: (input: DeltaAiRequestInput) => void;
      appendAiRequestThoughtDelta: (input: { conversationId: string; requestId: string; thoughtDelta: string }) => void;
      completeAiRequest: (input: CompleteAiRequestInput) => void;
      failAiRequest: (input: FailAiRequestInput) => void;
      toggleAiThoughtVisibility: (conversationId: string, messageId: string) => void;
      resetAiChat: (conversationId?: string) => void;
}

function createEmptyAiConversation(conversationId: string): AiConversationState {
      return {
            conversationId,
            activeRequestId: null,
            messages: [],
            requests: {},
      };
}

function ensureAiConversation(state: ChatStoreState, conversationId: string): AiConversationState {
      return state.aiConversations[conversationId] ?? createEmptyAiConversation(conversationId);
}

function upsertConversation(
      conversations: Record<string, AiConversationState>,
      conversationId: string,
      next: (current: AiConversationState) => AiConversationState,
) {
      const current = conversations[conversationId] ?? createEmptyAiConversation(conversationId);
      return {
            ...conversations,
            [conversationId]: next(current),
      };
}

function upsertRequest(
      requestMap: Record<string, AiRequestState>,
      requestId: string,
      updater: (current: AiRequestState) => AiRequestState,
) {
      const current = requestMap[requestId];
      if (!current) {
            return requestMap;
      }

      return {
            ...requestMap,
            [requestId]: updater(current),
      };
}

function buildAssistantPlaceholder({
      requestId,
      responseType,
      createdAt,
}: {
      requestId: string;
      responseType: 'ask' | 'agent' | 'summary';
      createdAt: string;
}): AiChatMessage {
      return {
            id: `${requestId}:assistant`,
            requestId,
            role: 'assistant',
            content: '',
            createdAt,
            status: 'streaming',
            responseType,
            isThoughtVisible: true,
      };
}

export const useChatStore = create<ChatStoreState & ChatStoreActions>()(
      persist(
            (set) => ({
      // ── Initial state ───────────────────────────────────────────────────────
      selectedId: sessionStorage.getItem(STORAGE_KEYS.CHAT_SELECTED_ID) ?? null,
      rightSidebar: 'none',
      isGlobalSearchOpen: false,
      isFriendSearchOpen: false,
      prefillSearchKeyword: undefined,
      mediaBrowserTab: 'photos',
      typingUserIds: [],
      replyTarget: null,
      aiSummaryStartMessageId: null,
      aiConversations: {},

      // ── Actions ─────────────────────────────────────────────────────────────
      setSelectedId: (id) => {
            if (id) {
                  sessionStorage.setItem(STORAGE_KEYS.CHAT_SELECTED_ID, id);
            } else {
                  sessionStorage.removeItem(STORAGE_KEYS.CHAT_SELECTED_ID);
            }
            set({ selectedId: id });
      },

      setRightSidebar: (value) =>
            set((state) => ({
                  rightSidebar: typeof value === 'function' ? value(state.rightSidebar) : value,
            })),

      setIsGlobalSearchOpen: (open) => set({ isGlobalSearchOpen: open }),
      setIsFriendSearchOpen: (open) => set({ isFriendSearchOpen: open }),
      setPrefillSearchKeyword: (keyword) => set({ prefillSearchKeyword: keyword }),
      setMediaBrowserTab: (tab) => set({ mediaBrowserTab: tab }),

      setTypingUserIds: (updater) =>
            set((state) => ({
                  typingUserIds: typeof updater === 'function' ? updater(state.typingUserIds) : updater,
            })),

      setReplyTarget: (target) => set({ replyTarget: target }),
      setAiSummaryStartMessageId: (id) => set({ aiSummaryStartMessageId: id }),
      hydrateAiConversation: ({ conversationId, messages, activeRequestId = null }) =>
            set((state) => ({
                  aiConversations: upsertConversation(state.aiConversations, conversationId, (current) => ({
                        ...current,
                        conversationId,
                        activeRequestId: activeRequestId ?? current.activeRequestId,
                        messages,
                  })),
            })),
      startAiRequest: ({ conversationId, requestId, responseType, prompt, sessionId }) =>
            set((state) => {
                  const existingConversation = ensureAiConversation(state, conversationId);
                  const existingRequest = existingConversation.requests[requestId];

                  if (existingRequest) {
                        return {
                              aiConversations: upsertConversation(state.aiConversations, conversationId, (current) => ({
                                    ...current,
                                    activeRequestId: requestId,
                                    requests: upsertRequest(current.requests, requestId, (request) => ({
                                          ...request,
                                          status: request.status === 'error' ? 'error' : 'started',
                                          sessionId: sessionId || request.sessionId,
                                          updatedAt: new Date().toISOString(),
                                    })),
                              })),
                        };
                  }

                  const createdAt = new Date().toISOString();
                  const userMessage: AiChatMessage = {
                        id: `${requestId}:user`,
                        requestId,
                        role: 'user',
                        content: prompt,
                        createdAt,
                        status: 'completed',
                        responseType,
                        isThoughtVisible: true,
                  };

                  const assistantMessage = buildAssistantPlaceholder({ requestId, responseType, createdAt });

                  return {
                        aiConversations: upsertConversation(state.aiConversations, conversationId, (current) => ({
                              ...current,
                              conversationId,
                              activeRequestId: requestId,
                              messages: [...current.messages, userMessage, assistantMessage],
                              requests: {
                                    ...current.requests,
                                    [requestId]: {
                                          requestId,
                                          conversationId,
                                          responseType,
                                          status: 'started',
                                          createdAt,
                                          updatedAt: createdAt,
                                          userMessageId: userMessage.id,
                                          assistantMessageId: assistantMessage.id,
                                          content: '',
                                          isThoughtVisible: true,
                                          sessionId,
                                    },
                              },
                        })),
                  };
            }),

      appendAiRequestThoughtDelta: ({ conversationId, requestId, thoughtDelta }) =>
            set((state) => {
                  const conv = state.aiConversations[conversationId];
                  if (!conv || !conv.requests[requestId]) return state;

                  const request = conv.requests[requestId];
                  const newThought = (request.thought || '') + thoughtDelta;

                  const updatedRequests: Record<string, AiRequestState> = {
                        ...conv.requests,
                        [requestId]: {
                              ...request,
                              thought: newThought,
                              status: 'streaming' as const,
                              updatedAt: new Date().toISOString(),
                        },
                  };

                  // Update the assistant message if it exists
                  let updatedMessages = [...conv.messages];
                  if (request.assistantMessageId) {
                        updatedMessages = updatedMessages.map((m) =>
                              m.id === request.assistantMessageId ? { ...m, thought: newThought, status: 'streaming' as const } : m,
                        );
                  }

                  return {
                        aiConversations: {
                              ...state.aiConversations,
                              [conversationId]: {
                                    ...conv,
                                    requests: updatedRequests,
                                    messages: updatedMessages,
                              },
                        },
                  };
            }),
      updateAiRequestProgress: ({ conversationId, requestId, progress, sessionId }) =>
            set((state) => ({
                  aiConversations: upsertConversation(state.aiConversations, conversationId, (current) => ({
                        ...current,
                        requests: upsertRequest(current.requests, requestId, (request) => ({
                              ...request,
                              status: 'progress',
                              progress,
                              sessionId: sessionId || request.sessionId,
                              updatedAt: new Date().toISOString(),
                        })),
                  })),
            })),
      appendAiRequestDelta: ({ conversationId, requestId, contentDelta, sessionId }) =>
            set((state) => ({
                  aiConversations: upsertConversation(state.aiConversations, conversationId, (current) => {
                        const request = current.requests[requestId];
                        if (!request || !request.assistantMessageId) {
                              return current;
                        }

                        const nextMessages = current.messages.map((message) => {
                              if (message.id !== request.assistantMessageId) {
                                    return message;
                              }

                              return {
                                    ...message,
                                    content: `${message.content || ''}${contentDelta}`,
                                    status: 'streaming' as const,
                                    responseType: request.responseType,
                                    requestId,
                              };
                        });

                        return {
                              ...current,
                              activeRequestId: requestId,
                              messages: nextMessages,
                              requests: upsertRequest(current.requests, requestId, (nextRequest) => ({
                                    ...nextRequest,
                                    status: 'streaming',
                                    content: `${nextRequest.content || ''}${contentDelta}`,
                                    sessionId: sessionId || nextRequest.sessionId,
                                    updatedAt: new Date().toISOString(),
                              })),
                        };
                  }),
            })),
      completeAiRequest: ({ conversationId, requestId, content, sessionId, responseType }) =>
            set((state) => ({
                  aiConversations: upsertConversation(state.aiConversations, conversationId, (current) => {
                        const request = current.requests[requestId];
                        if (!request || !request.assistantMessageId) {
                              return current;
                        }

                        const resolvedContent = content || request.content;
                        const now = new Date().toISOString();
                        const nextMessages: AiChatMessage[] = current.messages.map((message): AiChatMessage => {
                              if (message.id !== request.assistantMessageId) {
                                    return message;
                              }

                              return {
                                    ...message,
                                    content: resolvedContent,
                                    status: 'completed' as const,
                                    responseType: responseType || request.responseType,
                                    requestId,
                                    createdAt: message.createdAt || now,
                              };
                        });

                        return {
                              ...current,
                              activeRequestId: current.activeRequestId === requestId ? null : current.activeRequestId,
                              messages: nextMessages,
                              requests: upsertRequest(current.requests, requestId, (nextRequest) => ({
                                    ...nextRequest,
                                    status: 'completed',
                                    content: resolvedContent,
                                    sessionId: sessionId || nextRequest.sessionId,
                                    updatedAt: now,
                              })),
                        };
                  }),
            })),
      failAiRequest: ({ conversationId, requestId, error, sessionId }) =>
            set((state) => ({
                  aiConversations: upsertConversation(state.aiConversations, conversationId, (current) => {
                        const request = current.requests[requestId];
                        if (!request || !request.assistantMessageId) {
                              return current;
                        }

                        const now = new Date().toISOString();
                        const nextMessages: AiChatMessage[] = current.messages.map((message): AiChatMessage => {
                              if (message.id !== request.assistantMessageId) {
                                    return message;
                              }

                              return {
                                    ...message,
                                    content: error.message,
                                    status: 'error' as const,
                                    responseType: request.responseType,
                                    requestId,
                              };
                        });

                        return {
                              ...current,
                              activeRequestId: current.activeRequestId === requestId ? null : current.activeRequestId,
                              messages: nextMessages,
                              requests: upsertRequest(current.requests, requestId, (nextRequest) => ({
                                    ...nextRequest,
                                    status: 'error',
                                    error,
                                    sessionId: sessionId || nextRequest.sessionId,
                                    updatedAt: now,
                              })),
                        };
                  }),
            })),
      resetAiChat: (conversationId?: string) =>
            set((state) => {
                  if (!conversationId) {
                        return {
                              aiSummaryStartMessageId: null,
                              aiConversations: {},
                        };
                  }

                  const next = { ...state.aiConversations };
                  delete next[conversationId];
                  return {
                        aiSummaryStartMessageId: null,
                        aiConversations: next,
                  };
            }),
            toggleAiThoughtVisibility: (conversationId, messageId) =>
                  set((state) => ({
                        aiConversations: upsertConversation(state.aiConversations, conversationId, (current) => {
                              const request = Object.values(current.requests).find(
                                    (r) => r.assistantMessageId === messageId || r.userMessageId === messageId,
                              );

                              const nextMessages = current.messages.map((m) =>
                                    m.id === messageId ? { ...m, isThoughtVisible: !(m.isThoughtVisible ?? true) } : m,
                              );

                              if (!request) return { ...current, messages: nextMessages };

                              return {
                                    ...current,
                                    messages: nextMessages,
                                    requests: upsertRequest(current.requests, request.requestId, (r) => ({
                                          ...r,
                                          isThoughtVisible: !(r.isThoughtVisible ?? true),
                                    })),
                              };
                        }),
                  })),
      }),
            {
                  name: 'zalo-chat-ai-storage',
                  storage: createJSONStorage(() => sessionStorage),
                  partialize: (state) => ({
                        aiConversations: state.aiConversations,
                        aiSummaryStartMessageId: state.aiSummaryStartMessageId,
                        selectedId: state.selectedId,
                  }),
            },
      ),
);
