// src/features/chat/index.tsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { ConversationSidebar } from './components/conversation-sidebar';
import { ChatHeader } from './components/chat-header';
import { ChatInput } from './components/chat-input';
import { ChatSearchSidebar } from './components/chat-search-sidebar';
import { ChatInfoSidebar } from './components/chat-info-sidebar';
import { ChatContent } from './components/chat-content';
import type { RightSidebarState } from './types';
import { mockGetConversations, mockGetMessages } from './mock-data';
// Import Custom Hook
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';

export function ChatFeature() {
      // --- STATE: UI ---
      const [selectedId, setSelectedId] = useState<string | null>('1');
      const [rightSidebar, setRightSidebar] = useState<RightSidebarState>('none');
      const [isInitialLoad, setIsInitialLoad] = useState(true);

      // --- REFS ---
      const messagesEndRef = useRef<HTMLDivElement>(null);
      const messagesContainerRef = useRef<HTMLDivElement>(null);

      // Ref để lưu vị trí scroll (Snapshot) trước khi fetch thêm tin nhắn cũ
      const scrollSnapshotRef = useRef({ scrollHeight: 0, scrollTop: 0 });

      // ============================================================================
      // 1. CONVERSATIONS LIST (Infinite Scroll - Forward)
      // ============================================================================

      // Hàm fetcher cho Conversations
      const fetchConversations = useCallback(async (cursor?: string) => {
            // Mock API là đồng bộ, bọc vào Promise để khớp với Hook
            return Promise.resolve(mockGetConversations(20, cursor));
      }, []);

      const {
            data: conversations,
            isLoading: isLoadingConv,
            hasMore: convHasMore,
            loadMoreRef: convLoadMoreRef,
            setInitialData: setConvInitialData
      } = useInfiniteScroll({
            fetcher: fetchConversations,
            direction: 'forward', // Nối đuôi danh sách
            threshold: 0.1,
            rootMargin: '100px',
      });

      // Initial Load Conversations (Chạy 1 lần)
      useEffect(() => {
            const response = mockGetConversations(20);
            setConvInitialData(response.data, response.meta.nextCursor, response.meta.hasNextPage);
      }, [setConvInitialData]);

      // ============================================================================
      // 2. MESSAGES LIST (Infinite Scroll - Backward/Reverse)
      // ============================================================================

      // Hàm fetcher cho Messages
      const fetchMessages = useCallback(async (cursor?: string) => {
            if (!selectedId) return { data: [], meta: { hasNextPage: false } };

            // 📸 Snapshot: Lưu chiều cao hiện tại TRƯỚC khi lấy dữ liệu mới
            if (messagesContainerRef.current) {
                  scrollSnapshotRef.current = {
                        scrollHeight: messagesContainerRef.current.scrollHeight,
                        scrollTop: messagesContainerRef.current.scrollTop
                  };
            }

            return Promise.resolve(mockGetMessages(selectedId, 20, cursor));
      }, [selectedId]);

      // Callback xử lý giữ vị trí scroll sau khi data update (Chạy trong onSuccess của Hook)
      const handlePreserveScroll = useCallback(() => {
            const container = messagesContainerRef.current;
            if (!container) return;

            const { scrollHeight: oldScrollHeight, scrollTop: oldScrollTop } = scrollSnapshotRef.current;
            const newScrollHeight = container.scrollHeight;
            const heightDifference = newScrollHeight - oldScrollHeight;

            // Điều chỉnh thanh cuộn để người dùng không bị nhảy trang
            container.scrollTop = oldScrollTop + heightDifference;
      }, []);

      const {
            data: messages,
            isLoading: isLoadingMsg,
            hasMore: msgHasMore,
            loadMoreRef: msgLoadMoreRef,
            reset: resetMessages,
            setInitialData: setMsgInitialData
      } = useInfiniteScroll({
            fetcher: fetchMessages,
            direction: 'backward', // Nối đầu danh sách
            enabled: !isInitialLoad && !!selectedId, // Chỉ chạy khi đã load xong lần đầu
            rootMargin: '200px',
            onSuccess: handlePreserveScroll, // ✅ Fix vị trí scroll
      });

      // Helper scroll xuống đáy
      const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
            const container = messagesContainerRef.current;
            if (!container) return;
            requestAnimationFrame(() => {
                  container.scrollTop = container.scrollHeight;
            });
      }, []);

      const handleSelectConversation = useCallback((id: string) => {
            // Nếu click lại vào người đang chat thì không làm gì
            if (id === selectedId) return;

            // Reset toàn bộ state liên quan đến tin nhắn NGAY LẬP TỨC
            setSelectedId(id);       // Đổi ID
            setIsInitialLoad(true);  // Bật chế độ loading lần đầu
            resetMessages();         // Xóa tin nhắn cũ (hàm từ hook useInfiniteScroll)
      }, [selectedId, resetMessages]); // Thêm dependencies

      // Initial Load Messages (Khi đổi conversation)
      useEffect(() => {
            if (!selectedId) return;

            // setIsInitialLoad(true);
            // resetMessages(); // Reset state của hook

            // Mô phỏng delay mạng
            setTimeout(() => {
                  const response = mockGetMessages(selectedId, 20);
                  // Đảo ngược mảng để hiển thị đúng (Cũ nhất -> Mới nhất)
                  const sortedMessages = [...response.data].reverse();

                  // Set data ban đầu vào hook
                  setMsgInitialData(sortedMessages, response.meta.nextCursor, response.meta.hasNextPage);

                  // Scroll xuống đáy sau khi render
                  requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                              scrollToBottom('auto');
                              // Mở khóa cho phép scroll ngược sau khi ổn định
                              setTimeout(() => {
                                    setIsInitialLoad(false);
                              }, 300);
                        });
                  });
            }, 300);
      }, [selectedId, resetMessages, scrollToBottom, setMsgInitialData]);

      // Helper lấy conversation hiện tại
      const selectedConversation = conversations.find(c => c.id === selectedId);

      return (
            <div className="h-full w-full flex overflow-hidden bg-gray-50">
                  <ConversationSidebar
                        conversations={conversations}
                        selectedId={selectedId}
                        onSelect={handleSelectConversation}
                        loadMoreRef={convLoadMoreRef}
                        hasMore={convHasMore}
                        isLoading={isLoadingConv}
                  />

                  <div className="flex-1 flex flex-col h-full overflow-hidden">
                        {selectedConversation ? (
                              <>
                                    <ChatHeader
                                          conversationName={selectedConversation.name || 'Chat'}
                                          onToggleSearch={() => setRightSidebar(prev => prev === 'search' ? 'none' : 'search')}
                                          onToggleInfo={() => setRightSidebar(prev => prev === 'info' ? 'none' : 'info')}
                                    />

                                    <ChatContent
                                          messages={messages}
                                          isLoadingMsg={isLoadingMsg}
                                          msgHasMore={msgHasMore}
                                          msgLoadMoreRef={msgLoadMoreRef}
                                          isInitialLoad={isInitialLoad}
                                          messagesContainerRef={messagesContainerRef}
                                          messagesEndRef={messagesEndRef}
                                    />

                                    <ChatInput />
                              </>
                        ) : (
                              <div className="flex-1 flex items-center justify-center text-gray-400">
                                    Chọn một cuộc trò chuyện để bắt đầu
                              </div>
                        )}
                  </div>

                  {rightSidebar === 'search' && <ChatSearchSidebar onClose={() => setRightSidebar('none')} />}
                  {rightSidebar === 'info' && <ChatInfoSidebar onClose={() => setRightSidebar('none')} />}
            </div>
      );
}