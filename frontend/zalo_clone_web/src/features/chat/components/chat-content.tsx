import type { ChatMessage } from '../types';
import { Badge, FloatButton, Button } from 'antd';
import { DownOutlined, VerticalAlignBottomOutlined } from '@ant-design/icons';
import { MessageList } from './message-list';

interface ChatContentProps {
      messages: ChatMessage[];
      isLoadingMsg: boolean;
      msgHasMore: boolean;
      msgLoadMoreRef: React.Ref<HTMLDivElement>;
      isInitialLoad: boolean;
      messagesContainerRef: React.RefObject<HTMLDivElement | null>;
      messagesEndRef: React.RefObject<HTMLDivElement | null>;
      isAtBottom: boolean;
      isJumpedAway?: boolean;
      newMessageCount: number;
      highlightedMessageId?: string | null;
      onScrollToBottom: () => void;
      onReturnToLatest?: () => void;
      /** Ref for bottom sentinel to trigger loadNewer */
      msgLoadNewerRef?: React.Ref<HTMLDivElement>;
      /** Whether newer messages are currently being fetched */
      isLoadingNewer?: boolean;
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
      isJumpedAway,
      newMessageCount,
      highlightedMessageId,
      onScrollToBottom,
      onReturnToLatest,
      msgLoadNewerRef,
      isLoadingNewer,
      onRetry,
}: ChatContentProps) {
      // Unified bottom indicator:
      // 1. isJumpedAway → "Quay về tin nhắn mới nhất" button
      // 2. !isAtBottom + newMessageCount > 0 → new message badge
      // 3. !isAtBottom → simple scroll-to-bottom button
      const showReturnToLatest = isJumpedAway && onReturnToLatest;
      const showNewMessageBadge = !isJumpedAway && !isAtBottom && newMessageCount > 0;
      const showScrollDown = !isJumpedAway && !isAtBottom && newMessageCount === 0;

      return (
            <div
                  ref={messagesContainerRef}
                  className="relative flex-1 overflow-y-auto px-4 py-4 bg-[#eef0f1]"
            >
                  <MessageList
                        messages={messages}
                        isLoadingMsg={isLoadingMsg}
                        msgHasMore={msgHasMore}
                        msgLoadMoreRef={msgLoadMoreRef}
                        isInitialLoad={isInitialLoad}
                        messagesEndRef={messagesEndRef}
                        highlightedMessageId={highlightedMessageId}
                        onRetry={onRetry}
                        msgLoadNewerRef={msgLoadNewerRef}
                        isJumpedAway={isJumpedAway}
                        isLoadingNewer={isLoadingNewer}
                  />
                  {showReturnToLatest && (
                        <div className="sticky bottom-4 ml-auto mr-4 w-fit z-10">
                              <Button
                                    type="primary"
                                    icon={<VerticalAlignBottomOutlined />}
                                    onClick={onReturnToLatest}
                                    className="shadow-lg"
                              >
                                    Quay về tin nhắn mới nhất
                              </Button>
                        </div>
                  )}
                  {showNewMessageBadge && (
                        <div className="sticky bottom-4 ml-auto mr-4 w-fit z-10">
                              <Badge count={newMessageCount} size="small">
                                    <FloatButton type="primary" icon={<DownOutlined />} onClick={onScrollToBottom} />
                              </Badge>
                        </div>
                  )}
                  {showScrollDown && (
                        <div className="sticky bottom-4 ml-auto mr-4 w-fit z-10">
                              <FloatButton type="default" icon={<DownOutlined />} onClick={onScrollToBottom} />
                        </div>
                  )}
            </div>
      );
}