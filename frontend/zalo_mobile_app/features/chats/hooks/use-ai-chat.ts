import { useCallback, useEffect, useRef } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { useSocket } from '@/providers/socket-provider';
import { SocketEvents } from '@/constants/socket-events';
import { mobileApi } from '@/services/api';
import { useAiStore, type AiChatMessage } from '../stores/ai.store';

function createRequestId() {
  return `ai-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function mapSessionMessage(message: any, conversationId: string): AiChatMessage {
  return {
    id: String(message.id ?? createRequestId()),
    requestId: String(message.requestId ?? message.metadata?.requestId ?? message.id ?? createRequestId()),
    role: message.role === 'assistant' ? 'assistant' : 'user',
    content: String(message.content ?? ''),
    createdAt: message.createdAt ?? new Date().toISOString(),
    status: 'completed',
    responseType: (message.metadata?.responseType ?? 'ask') as 'ask' | 'agent' | 'summary',
    metadata: {
      ...(message.metadata ?? {}),
      conversationId,
    },
  };
}

export function useAiChat(conversationId: string) {
  const { accessToken } = useAuth();
  const { socket } = useSocket();
  const {
    hydrateAiConversation,
    startAiRequest,
    streamAiContent,
    appendAiRequestThoughtDelta,
    completeAiRequest,
    failAiRequest,
    resetAiChat,
  } = useAiStore();

  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!socket) return;

    const resolveRequestId = (payload: { conversationId?: string; requestId?: string }) => {
      if (payload.requestId) return payload.requestId;
      if (!payload.conversationId) return undefined;

      const conv = useAiStore.getState().aiConversations[payload.conversationId];
      return conv?.activeRequestId ?? undefined;
    };

    const handleProgress = (data: {
      requestId?: string;
      conversationId?: string;
      contentDelta?: string;
      content?: string;
      text?: string;
      step?: string;
      message?: string;
      percent?: number;
    }) => {
      if (!data.conversationId || data.conversationId !== conversationId) return;
      const requestId = resolveRequestId(data);
      if (!requestId) return;

      const contentDelta = data.contentDelta || data.content || data.text || '';
      const currentContent =
        useAiStore.getState().aiConversations[conversationId]?.requests?.[requestId]?.content || '';

      streamAiContent({
        conversationId,
        requestId,
        content: contentDelta ? `${currentContent}${contentDelta}` : currentContent,
        progress: data.step
          ? {
              message: data.message || data.step,
              percent: data.percent,
            }
          : undefined,
      });
    };

    const handleThought = (data: {
      requestId?: string;
      conversationId?: string;
      thoughtDelta?: string;
    }) => {
      if (!data.conversationId || data.conversationId !== conversationId) return;
      const requestId = resolveRequestId(data);
      if (!requestId || !data.thoughtDelta) return;

      appendAiRequestThoughtDelta({
        conversationId,
        requestId,
        thoughtDelta: data.thoughtDelta,
      });
    };

    const handleCompleted = (data: {
      requestId?: string;
      conversationId?: string;
      content?: string;
    }) => {
      if (!data.conversationId || data.conversationId !== conversationId) return;
      const requestId = resolveRequestId(data);
      if (!requestId) return;

      completeAiRequest({
        conversationId,
        requestId,
        content:
          data.content ||
          useAiStore.getState().aiConversations[conversationId]?.requests?.[requestId]?.content ||
          '',
      });
    };

    const handleError = (data: {
      requestId?: string;
      conversationId?: string;
      code?: string;
      message?: string;
      retriable?: boolean;
    }) => {
      if (!data.conversationId || data.conversationId !== conversationId) return;
      const requestId = resolveRequestId(data);
      if (!requestId) return;

      failAiRequest({
        conversationId,
        requestId,
        error: {
          code: data.code || 'AI_REQUEST_FAILED',
          message: data.message || 'Không thể kết nối với AI',
          retriable: Boolean(data.retriable ?? true),
        },
      });
    };

    socket.on(SocketEvents.AI_RESPONSE_PROGRESS, handleProgress);
    socket.on(SocketEvents.AI_RESPONSE_THOUGHT, handleThought);
    socket.on(SocketEvents.AI_RESPONSE_DELTA, handleProgress);
    socket.on(SocketEvents.AI_STREAM_CHUNK, handleProgress);
    socket.on(SocketEvents.AI_RESPONSE_COMPLETED, handleCompleted);
    socket.on(SocketEvents.AI_STREAM_DONE, handleCompleted);
    socket.on(SocketEvents.AI_SUMMARY, handleCompleted);
    socket.on(SocketEvents.AI_RESPONSE_ERROR, handleError);
    socket.on(SocketEvents.AI_STREAM_ERROR, handleError);

    return () => {
      socket.off(SocketEvents.AI_RESPONSE_PROGRESS, handleProgress);
      socket.off(SocketEvents.AI_RESPONSE_THOUGHT, handleThought);
      socket.off(SocketEvents.AI_RESPONSE_DELTA, handleProgress);
      socket.off(SocketEvents.AI_STREAM_CHUNK, handleProgress);
      socket.off(SocketEvents.AI_RESPONSE_COMPLETED, handleCompleted);
      socket.off(SocketEvents.AI_STREAM_DONE, handleCompleted);
      socket.off(SocketEvents.AI_SUMMARY, handleCompleted);
      socket.off(SocketEvents.AI_RESPONSE_ERROR, handleError);
      socket.off(SocketEvents.AI_STREAM_ERROR, handleError);
    };
  }, [socket, conversationId, streamAiContent, completeAiRequest, failAiRequest]);

  // Fetch history on conversation change
  const syncHistory = useCallback(async () => {
    if (!accessToken) return;

    try {
      const data = await mobileApi.getAiSessions(accessToken, conversationId, 'ASK');

      const sessions = data?.data?.sessions || data?.sessions || [];
      
      if (!sessions.length) {
        hydrateAiConversation({ conversationId, messages: [] });
        return;
      }

      const detailData = await mobileApi.getAiSession(accessToken, sessions[0].id);
      const sessionData = detailData?.data?.session || detailData?.session;
      const sessionMessages = Array.isArray(sessionData?.messages)
        ? sessionData.messages
        : [];

      hydrateAiConversation({
        conversationId,
        messages: sessionMessages.map((item: any) =>
          mapSessionMessage(item, conversationId)
        ),
        sessionId: sessions[0].id,
      });
    } catch (error) {
      console.error('[useAiChat] Failed to fetch history:', error);
      hydrateAiConversation({ conversationId, messages: [] });
    }
  }, [conversationId, accessToken, hydrateAiConversation]);

  useEffect(() => {
    void syncHistory();
  }, [syncHistory]);

  const sendMessage = useCallback(
    async (
      text: string,
      type: 'ask' | 'summary' | 'agent' = 'agent',
      startMessageId?: string | null
    ) => {
      if (!text.trim() || !accessToken) return;

      const requestId = createRequestId();

      startAiRequest({
        conversationId,
        requestId,
        responseType: type,
        prompt: text,
      });

      // Cancel previous request if exists
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      try {
        const endpoint =
          type === 'summary'
            ? '/api/v1/ai/summary'
            : type === 'agent'
              ? '/api/v1/ai/agent'
              : '/api/v1/ai/ask';

        const response = await mobileApi.streamAiRequest(accessToken, endpoint, {
          type,
          conversationId,
          text,
          startMessageId: startMessageId || undefined,
          stream: true,
          requestId,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || `AI request failed: ${response.status}`);
        }

        // Backend can accept request (202) and push updates via socket events.
        // Keep pending state and let socket listeners complete/error it.
        if (!response.body) {
          return;
        }

        // Handle streaming response
        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('No response body');
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Process complete lines
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.trim()) continue;

            // Handle SSE format: data: {...}
            if (line.startsWith('data: ')) {
              try {
                const jsonStr = line.slice(6);
                const data = JSON.parse(jsonStr);

                if (data.content) {
                  streamAiContent({
                    conversationId,
                    requestId,
                    content: data.content,
                    progress: data.progress,
                  });
                }

                if (data.completed) {
                  completeAiRequest({
                    conversationId,
                    requestId,
                    content: data.content || '',
                  });
                }
              } catch (e) {
                console.warn('[useAiChat] Failed to parse SSE:', line);
              }
            }
          }
        }

        // Process remaining buffer
        if (buffer.trim()) {
          if (buffer.startsWith('data: ')) {
            try {
              const jsonStr = buffer.slice(6);
              const data = JSON.parse(jsonStr);
              if (data.content) {
                completeAiRequest({
                  conversationId,
                  requestId,
                  content: data.content,
                });
              }
            } catch (e) {
              console.warn('[useAiChat] Failed to parse final buffer:', buffer);
            }
          }
        }
      } catch (error: any) {
        if (error.name === 'AbortError') {
          console.log('[useAiChat] Request cancelled');
          return;
        }

        console.error('[useAiChat] Request failed:', error);
        failAiRequest({
          conversationId,
          requestId,
          error: {
            code: 'AI_REQUEST_FAILED',
            message: error?.message || 'Không thể kết nối với AI',
            retriable: true,
          },
        });
      }
    },
    [conversationId, accessToken, startAiRequest, streamAiContent, completeAiRequest, failAiRequest]
  );

  const cancelAiRequest = useCallback(async () => {
    const activeId = useAiStore.getState().aiConversations[conversationId]?.activeRequestId;
    if (!accessToken || !activeId) return;

    try {
      await mobileApi.cancelAiRequest(accessToken, activeId, conversationId);
      failAiRequest({
        conversationId,
        requestId: activeId,
        error: {
          code: 'CANCELLED',
          message: 'Đã hủy yêu cầu',
          retriable: true,
        },
      });
    } catch (error) {
      console.error('[useAiChat] Failed to cancel request:', error);
    }
  }, [conversationId, accessToken, failAiRequest]);

  const clearHistory = useCallback(
    async (sessionId?: string) => {
      if (!accessToken || !sessionId) return;

      try {
        const activeId = useAiStore.getState().aiConversations[conversationId]?.activeRequestId;
        if (activeId) {
          await cancelAiRequest();
        }
        await mobileApi.deleteAiSession(accessToken, sessionId);
        resetAiChat(conversationId);
      } catch (error) {
        console.error('[useAiChat] Failed to clear history:', error);
        throw error;
      }
    },
    [conversationId, accessToken, resetAiChat, cancelAiRequest]
  );

  return {
    sendMessage,
    clearHistory,
    syncHistory,
    cancelAiRequest,
  };
}
