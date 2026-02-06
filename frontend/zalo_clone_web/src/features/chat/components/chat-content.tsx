import type { ChatMessage } from '../types';
import { MessageList } from './message-list';

interface ChatContentProps {
      messages: ChatMessage[];
      isLoadingMsg: boolean;
      msgHasMore: boolean;
      msgLoadMoreRef: React.Ref<HTMLDivElement>;
      isInitialLoad: boolean;
      messagesContainerRef: React.RefObject<HTMLDivElement | null>;
      messagesEndRef: React.RefObject<HTMLDivElement | null>;
}

export function ChatContent({
      messages,
      isLoadingMsg,
      msgHasMore,
      msgLoadMoreRef,
      isInitialLoad,
      messagesContainerRef,
      messagesEndRef,
}: ChatContentProps) {
      return (
            <div
                  ref={messagesContainerRef}
                  className="flex-1 overflow-y-auto px-4 py-4 bg-[#eef0f1]"
            >
                  <MessageList
                        messages={messages}
                        isLoadingMsg={isLoadingMsg}
                        msgHasMore={msgHasMore}
                        msgLoadMoreRef={msgLoadMoreRef}
                        isInitialLoad={isInitialLoad}
                        messagesEndRef={messagesEndRef}
                  />
            </div>
      );
}
