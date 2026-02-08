import type { ChatMessage } from '../types';
import { Badge, FloatButton } from 'antd';
import { DownOutlined } from '@ant-design/icons';
import { MessageList } from './message-list';

interface NewMessageIndicatorProps {
      count: number;
      onClick: () => void;
}

function NewMessageIndicator({ count, onClick }: NewMessageIndicatorProps) {
      if (count <= 0) return null;

      return (
            <div className="absolute bottom-40 right-5 z-10">
                  <Badge count={count} size="small">
                        <FloatButton
                              type="primary"
                              icon={<DownOutlined />}
                              onClick={onClick}
                        />
                  </Badge>
            </div>
      );
}

interface ChatContentProps {
      messages: ChatMessage[];
      isLoadingMsg: boolean;
      msgHasMore: boolean;
      msgLoadMoreRef: React.Ref<HTMLDivElement>;
      isInitialLoad: boolean;
      messagesContainerRef: React.RefObject<HTMLDivElement | null>;
      messagesEndRef: React.RefObject<HTMLDivElement | null>;
      isAtBottom: boolean;
      newMessageCount: number;
      onScrollToBottom: () => void;
      onRetry?: (msg: ChatMessage) => void;
}

export function ChatContent({
      messages,
      isLoadingMsg,
      msgHasMore,
      msgLoadMoreRef,
      isInitialLoad,
      messagesContainerRef,
      messagesEndRef,
      isAtBottom,
      newMessageCount,
      onScrollToBottom,
      onRetry,
}: ChatContentProps) {
      return (
            <div
                  ref={messagesContainerRef}
                  className="relative flex-1 overflow-y-auto px-4 py-4 bg-[#eef0f1]"
            >
                  {!isAtBottom && (
                        <NewMessageIndicator
                              count={newMessageCount}
                              onClick={onScrollToBottom}
                        />
                  )}
                  <MessageList
                        messages={messages}
                        isLoadingMsg={isLoadingMsg}
                        msgHasMore={msgHasMore}
                        msgLoadMoreRef={msgLoadMoreRef}
                        isInitialLoad={isInitialLoad}
                        messagesEndRef={messagesEndRef}
                        onRetry={onRetry}
                  />
            </div>
      );
}
