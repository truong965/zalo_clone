import { useEffect, useRef, useState, useCallback } from 'react';
import { Typography, Button, Input, Empty, Tooltip, message, Modal } from 'antd';
import { CloseOutlined, SendOutlined, ClearOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Eye, EyeOff } from 'lucide-react';
import { useChatStore } from '../stores/chat.store';
import api from '@/lib/axios';
import { API_ENDPOINTS } from '@/constants/api-endpoints';
import dayjs from 'dayjs';
import type { AiChatMessage } from '../types';

const { Text, Title } = Typography;

interface ChatAiSidebarProps {
  conversationId: string;
  onClose: () => void;
}

/**
 * Parse AI response and format it with markdown-like support
 * Supports: **bold**, numbered lists, bullet points, line breaks
 */
function parseAiResponse(content: string): React.ReactNode {
  if (!content) return null;

  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];
  let currentListType: 'ordered' | 'unordered' | null = null;

  lines.forEach((line, idx) => {
    const trimmed = line.trim();

    // Check for blockquote
    const isBlockquote = trimmed.startsWith('>');
    if (isBlockquote) {
      const text = trimmed.replace(/^>\s*/, '');
      elements.push(
        <blockquote key={`bq-${idx}`} className="border-l-4 border-gray-200 pl-4 py-1 my-2 italic text-gray-600 bg-gray-50/50 rounded-r">
          {formatInlineText(text)}
        </blockquote>
      );
      return;
    }

    // Check if this is a list item (ordered or unordered)
    const isListItem = /^[\d+\.]/.test(trimmed) || trimmed.startsWith('-') || trimmed.startsWith('•');

    if (isListItem) {
      // This is a list item
      const isOrdered = /^[\d+\.]/.test(trimmed);
      const isNewListType = isOrdered ? 'ordered' : 'unordered';

      if (currentListType && currentListType !== isNewListType) {
        // Type change, flush old list
        elements.push(
          currentListType === 'ordered' ? (
            <ol key={`ol-${idx}`} className="ml-4 my-2 space-y-1">
              {listItems}
            </ol>
          ) : (
            <ul key={`ul-${idx}`} className="ml-4 my-2 space-y-1 list-disc">
              {listItems}
            </ul>
          ),
        );
        listItems = [];
      }

      currentListType = isNewListType;
      const itemText = trimmed.replace(/^[\d+\.\-•]\s*/, '');
      const formattedItem = formatInlineText(itemText);

      listItems.push(
        <li key={`li-${idx}`} className="text-sm">
          {formattedItem}
        </li>,
      );
    } else {
      // Not a list item, flush list if exists
      if (listItems.length > 0) {
        elements.push(
          currentListType === 'ordered' ? (
            <ol key={`ol-${idx}`} className="ml-4 my-2 space-y-1">
              {listItems}
            </ol>
          ) : (
            <ul key={`ul-${idx}`} className="ml-4 my-2 space-y-1 list-disc">
              {listItems}
            </ul>
          ),
        );
        listItems = [];
        currentListType = null;
      }

      // Handle paragraph
      if (trimmed.length > 0) {
        const formatted = formatInlineText(trimmed);
        elements.push(
          <div key={`p-${idx}`} className="text-sm leading-relaxed mb-2">
            {formatted}
          </div>,
        );
      } else if (elements.length > 0 && idx < lines.length - 1) {
        // Empty line as separator
        elements.push(<div key={`sep-${idx}`} className="h-1" />);
      }
    }
  });

  // Flush remaining list
  if (listItems.length > 0) {
    elements.push(
      currentListType === 'ordered' ? (
        <ol key="ol-final" className="ml-4 my-2 space-y-1">
          {listItems}
        </ol>
      ) : (
        <ul key="ul-final" className="ml-4 my-2 space-y-1 list-disc">
          {listItems}
        </ul>
      ),
    );
  }

  return (
    <div className="space-y-2">
      {elements.length > 0 ? elements : <span className="text-sm">{content}</span>}
    </div>
  );
}

/**
 * Format inline text: **bold**, *italic*, etc.
 */
function formatInlineText(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];

  // Match bold: **text**
  const patterns = [
    { regex: /\*\*(.+?)\*\*/g, tag: 'strong', class: 'font-semibold text-gray-900' },
    { regex: /\*(.+?)\*/g, tag: 'em', class: 'italic text-gray-700' },
    { regex: /`(.+?)`/g, tag: 'code', class: 'bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono' },
  ];

  let content = text;
  patterns.forEach((pattern) => {
    content = content.replace(pattern.regex, (match, inner) => {
      if (pattern.tag === 'strong') return `<strong>${inner}</strong>`;
      if (pattern.tag === 'em') return `<em>${inner}</em>`;
      if (pattern.tag === 'code') return `<code>${inner}</code>`;
      return match;
    });
  });

  // Simple split by tags
  const withTags = content.split(/(<strong>|<\/strong>|<em>|<\/em>|<code>|<\/code>)/);
  let strong = false;
  let em = false;
  let code = false;

  withTags.forEach((part, i) => {
    if (part === '<strong>') {
      strong = true;
    } else if (part === '</strong>') {
      strong = false;
    } else if (part === '<em>') {
      em = true;
    } else if (part === '</em>') {
      em = false;
    } else if (part === '<code>') {
      code = true;
    } else if (part === '</code>') {
      code = false;
    } else if (part.length > 0) {
      if (strong) {
        parts.push(
          <strong key={i} className="font-semibold text-gray-900">
            {part}
          </strong>,
        );
      } else if (em) {
        parts.push(
          <em key={i} className="italic text-gray-700">
            {part}
          </em>,
        );
      } else if (code) {
        parts.push(
          <code key={i} className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">
            {part}
          </code>,
        );
      } else {
        parts.push(part);
      }
    }
  });

  return parts.length > 0 ? <span>{parts}</span> : text;
}

function createRequestId() {
  const cryptoApi = globalThis.crypto as Crypto | undefined;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  return `ai-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function mapSessionMessage(message: any, conversationId: string): AiChatMessage {
  return {
    id: String(message.id ?? createRequestId()),
    requestId: String(message.requestId ?? message.metadata?.requestId ?? message.id ?? createRequestId()),
    role: message.role === 'assistant' ? 'assistant' : 'user',
    content: String(message.content ?? ''),
    createdAt: message.createdAt ?? new Date().toISOString(),
    status: message.role === 'assistant' ? 'completed' : 'completed',
    responseType: (message.metadata?.responseType ?? 'ask') as 'ask' | 'agent' | 'summary',
    metadata: {
      ...(message.metadata ?? {}),
      conversationId,
    },
  };
}



export function ChatAiSidebar({ conversationId, onClose }: ChatAiSidebarProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<any>(null);
  const lastProcessedIdRef = useRef<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const inputValueRef = useRef(inputValue);
  useEffect(() => {
    inputValueRef.current = inputValue;
  }, [inputValue]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const conversationState = useChatStore((s) => s.aiConversations[conversationId] ?? null);
  const messages = conversationState?.messages ?? [];
  const activeRequestId = conversationState?.activeRequestId ?? null;
  const activeRequest = activeRequestId ? conversationState?.requests[activeRequestId] ?? null : null;
  const isLoading = Boolean(activeRequest && activeRequest.status !== 'completed' && activeRequest.status !== 'error');
  const streamingContent = activeRequest?.content ?? '';
  const streamingThought = activeRequest?.thought ?? '';
  const aiSummaryStartMessageId = useChatStore((s) => s.aiSummaryStartMessageId);
  const setAiSummaryStartMessageId = useChatStore((s) => s.setAiSummaryStartMessageId);
  const hydrateAiConversation = useChatStore((s) => s.hydrateAiConversation);
  const startAiRequest = useChatStore((s) => s.startAiRequest);
  const failAiRequest = useChatStore((s) => s.failAiRequest);
  const resetAiChat = useChatStore((s) => s.resetAiChat);
  const toggleAiThoughtVisibility = useChatStore((s) => s.toggleAiThoughtVisibility);

  const syncHistory = useCallback(async () => {
    try {
      setActiveSessionId(null);
      const res = await api.get(API_ENDPOINTS.AI.SESSIONS, {
        params: { conversationId, featureType: 'ASK', activeOnly: true },
      });

      const sessions = res.data?.data?.sessions || res.data?.sessions || [];
      if (!sessions.length) {
        hydrateAiConversation({ conversationId, messages: [] });
        return;
      }

      const detail = await api.get(API_ENDPOINTS.AI.SESSION_DETAIL(sessions[0].id));
      const sessionData = detail.data?.data?.session || detail.data?.session;
      const sessionMessages = Array.isArray(sessionData?.messages) ? sessionData.messages : [];
      hydrateAiConversation({
        conversationId,
        messages: sessionMessages.map((item: any) => mapSessionMessage(item, conversationId)),
      });
      setActiveSessionId(sessions[0].id);
    } catch (error) {
      console.error('Failed to fetch AI history:', error);
    }
  }, [conversationId, hydrateAiConversation]);

  useEffect(() => {
    void syncHistory();
  }, [syncHistory]);

  const handleSend = useCallback(
    async (text?: string, overrideType?: 'ask' | 'summary' | 'agent', startMessageId?: string | null) => {
      // Use the provided text or get it from the store/input (Note: try to minimize volatile dependency)
      const messageText = (text ?? inputValueRef.current).trim();
      if (!messageText || isLoading) return;

      const requestType = overrideType ?? 'agent';
      const requestId = createRequestId();

      // Clear input manually if we are using it
      if (!text) setInputValue('');

      startAiRequest({
        conversationId,
        requestId,
        responseType: requestType as any,
        prompt: messageText,
      });

      try {
        const endpoint =
          requestType === 'summary'
            ? API_ENDPOINTS.AI.SUMMARY
            : requestType === 'agent'
              ? API_ENDPOINTS.AI.AGENT
              : API_ENDPOINTS.AI.ASK;
        await api.post(endpoint, {
          type: requestType,
          conversationId,
          text: messageText,
          startMessageId: startMessageId || undefined,
          stream: true, // Enable streaming for all supported types in this sidebar
          requestId,
        });
      } catch (error: any) {
        console.error('Failed to send AI request:', error);
        failAiRequest({
          conversationId,
          requestId,
          error: {
            code: 'AI_REQUEST_FAILED',
            message: error?.response?.data?.message || 'Không thể kết nối với AI',
            retriable: true,
          },
        });
        message.error(error?.response?.data?.message || 'Không thể kết nối với AI');
      }
    },
    [conversationId, failAiRequest, isLoading, startAiRequest, setInputValue],
  );

  const handleCancel = useCallback(async () => {
    if (!activeRequestId) return;
    try {
      await api.post(API_ENDPOINTS.AI.CANCEL, { requestId: activeRequestId, conversationId });
      failAiRequest({
        conversationId,
        requestId: activeRequestId,
        error: {
          code: 'CANCELLED',
          message: 'Đã hủy yêu cầu',
        },
      });
    } catch (error) {
      console.error('Failed to cancel AI request:', error);
    }
  }, [activeRequestId, conversationId, failAiRequest]);

  useEffect(() => {
    if (!aiSummaryStartMessageId) {
      lastProcessedIdRef.current = null;
      return;
    }

    // Guard against multiple executions for the same ID in the same mount cycle
    if (lastProcessedIdRef.current === aiSummaryStartMessageId) return;
    lastProcessedIdRef.current = aiSummaryStartMessageId;

    const startId = aiSummaryStartMessageId;
    setAiSummaryStartMessageId(null);
    void handleSend('Tóm tắt cho tôi từ tin nhắn được đánh dấu.', 'summary', startId);
  }, [aiSummaryStartMessageId, handleSend, setAiSummaryStartMessageId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, activeRequestId, streamingContent]);

  const handleClearHistory = async () => {
    if (messages.length === 0 && !activeRequestId) return;

    Modal.confirm({
      title: 'Xóa lịch sử AI?',
      icon: <ExclamationCircleOutlined />,
      content: 'Bạn có chắc chắn muốn xóa toàn bộ lịch sử hội thoại AI? Hành động này không thể hoàn tác.',
      okText: 'Xóa',
      cancelText: 'Hủy',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          if (activeRequestId) {
            await handleCancel();
          }
          if (activeSessionId) {
            await api.delete(API_ENDPOINTS.AI.DELETE_SESSION(activeSessionId));
          }
          resetAiChat(conversationId);
          setActiveSessionId(null);
          message.success('Đã xóa dữ liệu hội thoại AI');
        } catch (error) {
          console.error('Failed to clear history:', error);
          message.error('Lỗi khi xóa lịch sử');
        }
      },
    });
  };



  return (
    <div className="w-[400px] h-full bg-white border-l border-gray-200 flex flex-col shadow-2xl shrink-0 animate-in slide-in-from-right duration-300">
      <div className="h-16 px-4 border-b border-gray-100 flex items-center justify-between shrink-0 bg-white shadow-sm z-10">
        <div className="flex items-center gap-2.5">
          <div>
            <Title level={5} className="!mb-0 text-gray-800 font-bold tracking-tight">Trợ lý AI</Title>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Tooltip title="Xóa lịch sử">
            <Button
              type="text"
              shape="circle"
              icon={<ClearOutlined className="text-gray-400" />}
              onClick={handleClearHistory}
              disabled={messages.length === 0 && !activeRequestId}
            />
          </Tooltip>
          <Button type="text" shape="circle" icon={<CloseOutlined className="text-gray-400" />} onClick={onClose} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50 custom-scrollbar" ref={scrollRef}>
        {messages.length === 0 && !isLoading && (
          <Empty
            className="mt-20"
            description={
              <div className="space-y-2">
                <Text type="secondary">Chào bạn! Tôi là trợ lý AI của nhóm.</Text>
                <div className="text-xs text-gray-400 px-10">
                  Tôi có thể giúp bạn tóm tắt tin nhắn, phân tích lịch sử nhóm hoặc thực hiện các tác vụ khác như nhắc lịch, dịch thuật...
                </div>
              </div>
            }
          />
        )}



        {messages.map((msg) => {
          const isAssistantPending = msg.role === 'assistant' && (msg.status === 'streaming' || msg.status === 'pending') && !msg.content;
          const isAssistantError = msg.role === 'assistant' && msg.status === 'error';
          return (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm ${msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-tr-none'
                  : isAssistantError
                    ? 'bg-red-50 border border-red-100 text-red-800 rounded-tl-none'
                    : 'bg-white border border-gray-100 rounded-tl-none shadow-sm'
                  }`}
              >


                {isAssistantPending ? (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2 text-gray-500">
                      <div className="flex gap-1.5">
                        <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                        <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                        <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" />
                      </div>
                      <span className="text-xs font-medium text-blue-600">AI đang xử lý...</span>
                    </div>
                    {msg.thought && (
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between px-1">
                          <span className="text-[10px] font-bold text-orange-600/70 uppercase tracking-widest">Suy nghĩ</span>
                          <button 
                            onClick={() => toggleAiThoughtVisibility(conversationId, msg.id)}
                            className="p-1 hover:bg-orange-100 rounded-md transition-colors text-orange-600/50 hover:text-orange-600"
                            title={msg.isThoughtVisible === false ? "Hiện suy nghĩ" : "Ẩn suy nghĩ"}
                          >
                            {msg.isThoughtVisible === false ? <Eye size={12} /> : <EyeOff size={12} />}
                          </button>
                        </div>
                        <AnimatePresence>
                          {msg.isThoughtVisible !== false && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="bg-orange-50/80 border border-orange-100/50 rounded-xl p-3 text-xs text-orange-800 italic leading-relaxed">
                                {parseAiResponse(msg.thought)}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}
                  </div>
                ) : msg.role === 'user' ? (
                  <div className="text-sm leading-relaxed">{msg.content}</div>
                ) : (
                  <div className="space-y-3">
                    {msg.thought && (
                      <div className="bg-orange-50/30 border border-orange-100/50 rounded-xl p-2.5 mb-1.5">
                        <div className="flex items-center justify-between mb-1 px-0.5">
                          <div className="flex items-center gap-1.5">
                            <Brain size={10} className="text-orange-500/70" />
                            <span className="text-[10px] font-bold text-orange-600/60 uppercase tracking-wider">Lập luận của AI</span>
                          </div>
                          <button 
                            onClick={() => toggleAiThoughtVisibility(conversationId, msg.id)}
                            className="p-1 hover:bg-orange-200/50 rounded-md transition-colors text-orange-600/40 hover:text-orange-600"
                          >
                            {msg.isThoughtVisible === false ? <Eye size={12} /> : <EyeOff size={12} />}
                          </button>
                        </div>
                        <AnimatePresence>
                          {msg.isThoughtVisible !== false && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="text-[11px] text-orange-800/80 italic leading-relaxed pt-1.5 border-t border-orange-100/30">
                                {parseAiResponse(msg.thought)}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}
                    <div className="text-sm leading-relaxed text-gray-800">{parseAiResponse(msg.content)}</div>
                  </div>
                )}
                <div className={`text-[10px] mt-1.5 opacity-50 font-medium ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                  {dayjs(msg.createdAt).format('HH:mm')}
                </div>
              </div>
            </div>
          );
        })}

        {isLoading && !activeRequest?.assistantMessageId && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-100 rounded-2xl rounded-tl-none px-4 py-3 shadow-sm flex items-center gap-2">
              <div className="flex gap-1.5">
                <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" />
              </div>
            </div>
          </div>
        )}
      </div>


      {/* Unified Agent Mode - No tabs needed */}

      <div className="p-4 bg-white border-t border-gray-100 shrink-0 shadow-[0_-4px_10px_rgba(0,0,0,0.02)]">
        <div className="relative flex items-center gap-2 bg-gray-50 rounded-2xl p-1.5 pr-2 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100 transition-all border border-transparent focus-within:border-blue-200">
          <Input.TextArea
            ref={inputRef}
            placeholder="Bạn cần hỗ trợ gì?"
            autoSize={{ minRows: 1, maxRows: 4 }}
            className="!bg-transparent !border-none !shadow-none !resize-none pr-10 text-[14px] scrollbar-hide py-1.5"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onPressEnter={(e) => {
              if (!e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
          />
          <Button
            type="primary"
            shape="circle"
            icon={isLoading ? <CloseOutlined className="text-xs" /> : <SendOutlined className="text-xs" />}
            size="middle"
            onClick={() => (isLoading ? void handleCancel() : void handleSend())}
            disabled={!isLoading && !inputValue.trim()}
            className={`shadow-md flex items-center justify-center transition-all ${isLoading
              ? 'bg-red-500 hover:bg-red-600 border-none'
              : inputValue.trim()
                ? 'bg-blue-600 hover:bg-blue-700'
                : 'bg-gray-200 border-none'
              }`}
          />
        </div>
      </div>
    </div>
  );
}
