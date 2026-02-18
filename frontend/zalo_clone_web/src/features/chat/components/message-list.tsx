import { Button, Empty, Spin } from 'antd';
import type { ChatMessage } from '../types';
import { MessageType } from '@/types/api';
import type { DirectReceipts } from '@/types/api';

interface MessageListProps {
      messages: ChatMessage[];
      isLoadingMsg: boolean;
      msgHasMore: boolean;
      msgLoadMoreRef: React.Ref<HTMLDivElement>;
      isInitialLoad: boolean;
      messagesEndRef: React.RefObject<HTMLDivElement | null>;
      onRetry?: (msg: ChatMessage) => void;
      highlightedMessageId?: string | null;
      /** Ref for bottom sentinel to trigger loading newer messages */
      msgLoadNewerRef?: React.Ref<HTMLDivElement>;
      /** Whether user has jumped away from latest (show bottom sentinel) */
      isJumpedAway?: boolean;
      /** Whether newer messages are currently being fetched */
      isLoadingNewer?: boolean;
      /** Whether the current conversation is DIRECT (1v1) — controls receipt display variant */
      isDirect?: boolean;
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

function getSendStatus(metadata: ChatMessage['metadata']): string | undefined {
      if (!metadata) return undefined;
      if (typeof metadata !== 'object') return undefined;
      const v = (metadata as Record<string, unknown>).sendStatus;
      return typeof v === 'string' ? v : undefined;
}

// ── Receipt status helpers ──

type ReceiptDisplayState = 'none' | 'sent' | 'delivered' | 'seen';

/**
 * Derive a single receipt display state for a message sent by the current user.
 *
 * DIRECT: reads `directReceipts` JSONB — if *any* recipient has `seen`, show "seen";
 *         else if delivered, show "delivered"; else "sent".
 * GROUP:  compare `seenCount` / `totalRecipients`.
 */
function getReceiptDisplayState(msg: ChatMessage, isDirect: boolean): ReceiptDisplayState {
      const sendStatus = getSendStatus(msg.metadata);
      if (sendStatus === 'SENDING' || sendStatus === 'FAILED') return 'none';

      if (isDirect) {
            const receipts = msg.directReceipts as DirectReceipts | null | undefined;
            if (!receipts) return 'sent';

            const entries = Object.values(receipts);
            if (entries.length === 0) return 'sent';

            const hasSeen = entries.some((e) => e.seen !== null);
            if (hasSeen) return 'seen';

            const hasDelivered = entries.some((e) => e.delivered !== null);
            if (hasDelivered) return 'delivered';

            return 'sent';
      }

      // GROUP — use counters
      const total = msg.totalRecipients ?? 0;
      if (total === 0) return 'sent';

      const seen = Math.min(msg.seenCount ?? 0, total);
      if (seen > 0) return 'seen';

      const delivered = msg.deliveredCount ?? 0;
      if (delivered > 0) return 'delivered';

      return 'sent';
}

/** Single-tick / double-tick SVG icons for receipt status */
function ReceiptTick({ state }: { state: ReceiptDisplayState }) {
      if (state === 'none') return null;

      const color = state === 'seen' ? '#3b82f6' : '#9ca3af'; // blue-500 | gray-400

      if (state === 'sent') {
            // Single tick ✓
            return (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="inline-block">
                        <path d="M5 13l4 4L19 7" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
            );
      }

      // Double tick ✓✓ (delivered or seen)
      return (
            <svg width="18" height="14" viewBox="0 0 28 24" fill="none" className="inline-block">
                  <path d="M3 13l4 4L17 7" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M10 13l4 4L24 7" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
      );
}

/** Group receipt counter — e.g. "3/10 đã xem" */
function GroupSeenCounter({ msg }: { msg: ChatMessage }) {
      const total = msg.totalRecipients ?? 0;
      if (total === 0) return null;
      const seen = Math.min(msg.seenCount ?? 0, total);
      if (seen === 0) return null;

      return (
            <span className="text-[10px] text-blue-500">
                  {seen}/{total} đã xem
            </span>
      );
}

/** Vietnamese text labels for receipt status */
function getReceiptText(state: ReceiptDisplayState): string {
      switch (state) {
            case 'sent':
                  return 'Đã gửi';
            case 'delivered':
                  return 'Đã nhận';
            case 'seen':
                  return 'Đã xem';
            default:
                  return '';
      }
}

export function MessageList({
      messages,
      isLoadingMsg,
      msgHasMore,
      msgLoadMoreRef,
      isInitialLoad,
      messagesEndRef,
      onRetry,
      highlightedMessageId,
      msgLoadNewerRef,
      isJumpedAway,
      isLoadingNewer,
      isDirect = true,
}: MessageListProps) {
      // Find the latest (newest) message sent by "me" — receipt ticks only appear on this one
      const latestMyMessageId = (() => {
            for (let i = messages.length - 1; i >= 0; i--) {
                  if (messages[i].senderSide === 'me') return messages[i].id;
            }
            return null;
      })();

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
                              {messages.map((msg) => {
                                    const isHighlighted = highlightedMessageId === msg.id;
                                    const isLatestMyMessage = msg.id === latestMyMessageId;
                                    return (
                                          <div key={msg.id} data-message-id={msg.id} className={`flex ${msg.senderSide === 'me' ? 'justify-end' : 'justify-start'}`}>
                                                {msg.senderSide !== 'me' && (
                                                      <div className="w-8 h-8 rounded-full bg-blue-200 flex items-center justify-center mr-2 text-xs flex-shrink-0">
                                                            {msg.sender?.displayName?.[0]?.toUpperCase() ?? 'U'}
                                                      </div>
                                                )}
                                                <div className={`px-3 py-2 rounded-lg max-w-[70%] text-[15px] shadow-sm 
                                                      ${msg.senderSide === 'me'
                                                            ? 'bg-[#E5EFFF] text-gray-800 border border-[#c7e0ff]'
                                                            : 'bg-white text-gray-800 border border-gray-200'
                                                      }
                                                      ${isHighlighted
                                                            ? 'ring-2 ring-blue-400 ring-offset-2 bg-blue-50 transition-all duration-1000 ease-out'
                                                            : ''
                                                      }
                                                `}>
                                                      {renderMessageBody(msg)}
                                                      {msg.senderSide === 'me' && getSendStatus(msg.metadata) === 'FAILED' && (
                                                            <div className="mt-2 flex items-center justify-end gap-2">
                                                                  <span className="text-[11px] text-red-600 opacity-90">Gửi thất bại</span>
                                                                  <Button
                                                                        size="small"
                                                                        type="link"
                                                                        className="!p-0 !h-auto"
                                                                        onClick={() => onRetry?.(msg)}
                                                                  >
                                                                        Gửi lại
                                                                  </Button>
                                                            </div>
                                                      )}
                                                      <div className="text-[10px] opacity-60 text-right mt-1 flex items-center justify-end gap-1.5">
                                                            {msg.senderSide === 'me' && getSendStatus(msg.metadata) === 'SENDING' && (
                                                                  <span className="inline-flex items-center gap-1">
                                                                        <Spin size="small" />
                                                                        <span>Đang gửi...</span>
                                                                  </span>
                                                            )}
                                                            <span>{msg.displayTimestamp}</span>
                                                            {/* Receipt status only on the latest message sent by me */}
                                                            {isLatestMyMessage && msg.senderSide === 'me' && (() => {
                                                                  const state = getReceiptDisplayState(msg, isDirect);
                                                                  if (state === 'none') return null;
                                                                  return (
                                                                        <span className="inline-flex items-center gap-1">
                                                                              <ReceiptTick state={state} />
                                                                              <span className={state === 'seen' ? 'text-blue-500' : 'text-gray-400'}>
                                                                                    {getReceiptText(state)}
                                                                              </span>
                                                                              {!isDirect && <GroupSeenCounter msg={msg} />}
                                                                        </span>
                                                                  );
                                                            })()}
                                                      </div>
                                                </div>
                                          </div>
                                    );
                              })}
                        </div>
                  ) : (
                        //  HIỂN THỊ KHI KHÔNG CÓ TIN NHẮN
                        <div className="flex h-full flex-col items-center justify-center text-gray-500">
                              <Empty description="Chưa có tin nhắn nào" />
                        </div>
                  )}
                  {/* Load Newer Trigger (Bottom) — only when jumped away */}
                  {!isInitialLoad && isJumpedAway && (
                        <div ref={msgLoadNewerRef} className="py-2 flex justify-center w-full min-h-[60px]">
                              {isLoadingNewer && <Spin size="small" />}
                        </div>
                  )}
                  <div ref={messagesEndRef} className="h-1" />
            </>
      );
}
