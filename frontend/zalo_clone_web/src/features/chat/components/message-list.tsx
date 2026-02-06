import { Empty, Spin } from 'antd';
import type { ChatMessage } from '../types';

interface MessageListProps {
      messages: ChatMessage[];
      isLoadingMsg: boolean;
      msgHasMore: boolean;
      msgLoadMoreRef: React.Ref<HTMLDivElement>;
      isInitialLoad: boolean;
      messagesEndRef: React.RefObject<HTMLDivElement | null>;
}

export function MessageList({
      messages,
      isLoadingMsg,
      msgHasMore,
      msgLoadMoreRef,
      isInitialLoad,
      messagesEndRef,
}: MessageListProps) {
      return (
            <>
                  {/* Load More Trigger (Top) */}
                  {!isInitialLoad && msgHasMore && (
                        <div ref={msgLoadMoreRef} className="py-2 flex justify-center w-full min-h-[60px]">
                              {isLoadingMsg && <Spin size="small" />}
                        </div>
                  )}

                  {messages.length > 0 ? (
                        <div className="space-y-3">
                              {messages.map((msg) => (
                                    <div key={msg.id} className={`flex ${msg.sender === 'me' ? 'justify-end' : 'justify-start'}`}>
                                          {msg.sender === 'other' && (
                                                <div className="w-8 h-8 rounded-full bg-blue-200 flex items-center justify-center mr-2 text-xs flex-shrink-0">
                                                      A
                                                </div>
                                          )}
                                          <div className={`px-3 py-2 rounded-lg max-w-[70%] text-[15px] shadow-sm ${msg.sender === 'me'
                                                ? 'bg-[#E5EFFF] text-gray-800 border border-[#c7e0ff]'
                                                : 'bg-white text-gray-800 border border-gray-200'
                                                }`}>
                                                <div>{msg.content}</div>
                                                <div className="text-[10px] opacity-60 text-right mt-1">
                                                      {msg.displayTimestamp}
                                                </div>
                                          </div>
                                    </div>
                              ))}
                        </div>
                  ) : (
                        //  HIỂN THỊ KHI KHÔNG CÓ TIN NHẮN
                        <div className="flex h-full flex-col items-center justify-center text-gray-500">
                              <Empty description="Chưa có tin nhắn nào" />
                        </div>
                  )}
                  <div ref={messagesEndRef} className="h-1" />
            </>
      );
}
