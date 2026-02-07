import { Empty, Spin } from 'antd';
import type { ChatMessage } from '../types';
import { MessageType } from '@/types/api';

interface MessageListProps {
      messages: ChatMessage[];
      isLoadingMsg: boolean;
      msgHasMore: boolean;
      msgLoadMoreRef: React.Ref<HTMLDivElement>;
      isInitialLoad: boolean;
      messagesEndRef: React.RefObject<HTMLDivElement | null>;
}

function renderMessageBody(msg: ChatMessage) {
      const attachments = msg.mediaAttachments ?? [];

      if (attachments.length > 0) {
            const images = attachments.filter((a) => a.mediaType === 'IMAGE');
            const nonImages = attachments.filter((a) => a.mediaType !== 'IMAGE');

            return (
                  <div className="space-y-2">
                        {msg.content && <div className="whitespace-pre-wrap">{msg.content}</div>}

                        {images.length > 0 && (
                              <div className="grid grid-cols-2 gap-2">
                                    {images.map((a) => (
                                          <a
                                                key={a.id}
                                                href={a.cdnUrl ?? undefined}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="block overflow-hidden rounded-lg bg-gray-100"
                                          >
                                                <img
                                                      src={a.thumbnailUrl ?? a.cdnUrl ?? undefined}
                                                      alt={a.originalName}
                                                      className="w-full h-32 object-cover"
                                                />
                                          </a>
                                    ))}
                              </div>
                        )}

                        {nonImages.length > 0 && (
                              <div className="space-y-1">
                                    {nonImages.map((a) => (
                                          <a
                                                key={a.id}
                                                href={a.cdnUrl ?? undefined}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="block text-sm underline text-gray-700"
                                          >
                                                {a.originalName}
                                          </a>
                                    ))}
                              </div>
                        )}
                  </div>
            );
      }

      if (msg.type !== MessageType.TEXT) {
            return <div className="whitespace-pre-wrap">{msg.content ?? ''}</div>;
      }

      return <div className="whitespace-pre-wrap">{msg.content ?? ''}</div>;
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
                                    <div key={msg.id} className={`flex ${msg.senderSide === 'me' ? 'justify-end' : 'justify-start'}`}>
                                          {msg.senderSide !== 'me' && (
                                                <div className="w-8 h-8 rounded-full bg-blue-200 flex items-center justify-center mr-2 text-xs flex-shrink-0">
                                                      {msg.sender?.displayName?.[0]?.toUpperCase() ?? 'U'}
                                                </div>
                                          )}
                                          <div className={`px-3 py-2 rounded-lg max-w-[70%] text-[15px] shadow-sm ${msg.senderSide === 'me'
                                                ? 'bg-[#E5EFFF] text-gray-800 border border-[#c7e0ff]'
                                                : 'bg-white text-gray-800 border border-gray-200'
                                                }`}>
                                                {renderMessageBody(msg)}
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
