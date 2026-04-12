import { Fragment } from 'react';
import { Button, Dropdown, Empty, Spin, Tooltip, Avatar } from 'antd';
import type { MenuProps } from 'antd';
import { MoreOutlined, UserOutlined } from '@ant-design/icons';
import type { ChatMessage } from '../types';
import type { DirectReceipts } from '@/types/api';
import { ImageAttachment, VideoAttachment, AudioAttachment, DocumentAttachment } from './attachments';
import { ReplyQuote } from './reply-quote';
import { useTranslation } from 'react-i18next';
import api from '@/lib/axios';
import React from 'react';
import { useTranslationStore } from '../stores/use-translation-store';
import { useChatStore } from '../stores/chat.store';
import { useForwardMessageStore } from '../stores/forward-message.store';
import { API_ENDPOINTS } from '@/constants/api-endpoints';

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
      /** Called when user clicks "Reply" on a message */
      onReply?: (msg: ChatMessage) => void;
      /** Called when user clicks a reply quote to scroll to the original message */
      onJumpToMessage?: (messageId: string) => void;
      /** Set of pinned message IDs — used to show "Bỏ ghim" vs "Ghim tin nhắn" */
      pinnedMessageIds?: Set<string>;
      /** Called when user clicks "Ghim tin nhắn" */
      onPinMessage?: (messageId: string) => void;
      /** Called when user clicks "Bỏ ghim" */
      onUnpinMessage?: (messageId: string) => void;
      /** Called when user clicks "Thu hồi" */
      onRecallMessage?: (msg: ChatMessage) => void;
      /** Called when user clicks "Xóa ở phía bạn" */
      onDeleteForMeMessage?: (msg: ChatMessage) => void;

}

// ── Date-divider helpers ──

function formatDateLabel(isoString: string, t: any): string {
      const msgDate = new Date(isoString);
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);

      const sameDay = (a: Date, b: Date) =>
            a.getFullYear() === b.getFullYear() &&
            a.getMonth() === b.getMonth() &&
            a.getDate() === b.getDate();

      if (sameDay(msgDate, today)) return t('chat.messageList.today');
      if (sameDay(msgDate, yesterday)) return t('chat.messageList.yesterday');

      const dd = String(msgDate.getDate()).padStart(2, '0');
      const mm = String(msgDate.getMonth() + 1).padStart(2, '0');
      const yyyy = msgDate.getFullYear();
      return `${dd}/${mm}/${yyyy}`;
}

function DateDivider({ label }: { label: string }) {
      return (
            <div className="flex items-center gap-3 my-1 px-2">
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="text-[11px] text-gray-400 font-medium whitespace-nowrap select-none">{label}</span>
                  <div className="flex-1 h-px bg-gray-200" />
            </div>
      );
}

// ── CALL_LOG / SYSTEM message rendering ──────────────────────────────────────

interface CallLogMeta {
      action: string;
      callType?: 'VOICE' | 'VIDEO';
      status?: 'COMPLETED' | 'MISSED' | 'REJECTED' | 'CANCELLED' | 'NO_ANSWER' | 'FAILED';
      duration?: number; // seconds
}

function formatCallDuration(seconds: number, t: any): string {
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      if (m === 0) return t('chat.messageList.durationSec', { s });
      if (s === 0) return t('chat.messageList.durationMin', { m });
      return t('chat.messageList.durationMinSec', { m, s });
}

function getCallLogLabel(meta: CallLogMeta, t: any): string {
      const typeLabel = meta.callType === 'VIDEO' ? t('chat.messageList.callVideo') : t('chat.messageList.callVoice');
      const typeLabelLower = typeLabel.toLowerCase();
      const duration = meta.duration ? formatCallDuration(meta.duration, t) : '';
      switch (meta.status) {
            case 'COMPLETED':
                  return t('chat.messageList.callCompleted', { type: typeLabelLower, duration });
            case 'MISSED':
                  return t('chat.messageList.callMissed', { type: typeLabelLower });
            case 'REJECTED':
                  return t('chat.messageList.callRejected', { type: typeLabelLower });
            case 'CANCELLED':
                  return t('chat.messageList.callCancelled', { type: typeLabelLower });
            case 'NO_ANSWER':
                  return t('chat.messageList.callNoAnswer', { type: typeLabel });
            case 'FAILED':
                  return t('chat.messageList.callFailed', { type: typeLabelLower });
            default:
                  return t('chat.messageList.callDefault', { type: typeLabelLower });
      }
}

/** Centered pill display for CALL_LOG system messages */
function CallLogEntry({ msg, t }: { msg: ChatMessage, t: any }) {
      const meta = (msg.metadata ?? {}) as unknown as CallLogMeta;

      if (meta.action !== 'CALL_LOG') {
            // Generic system message fallback (e.g. "User joined group")
            return (
                  <div className="flex justify-center py-1">
                        <span className="text-[12px] text-gray-400 italic px-3 py-1 bg-gray-100 rounded-full">
                              {msg.content}
                        </span>
                  </div>
            );
      }

      const isVideo = meta.callType === 'VIDEO';
      const isMissed = meta.status === 'MISSED' || meta.status === 'NO_ANSWER';

      return (
            <div className="flex justify-center py-0.5">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-100 text-[12px] select-none">
                        <span className={isMissed ? 'text-red-400' : 'text-blue-400'} aria-hidden>
                              {isVideo ? '📹' : '📞'}
                        </span>
                        <span className={isMissed ? 'text-red-500' : 'text-gray-600'}>
                              {getCallLogLabel(meta, t)}
                        </span>
                  </div>
            </div>
      );
}

function isMessageRecalled(metadata: ChatMessage['metadata']): boolean {
      if (!metadata || typeof metadata !== 'object') return false;
      return (metadata as Record<string, unknown>).recalled === true;
}

function isForwardedMessage(metadata: ChatMessage['metadata']): boolean {
      if (!metadata || typeof metadata !== 'object') return false;
      const forward = (metadata as Record<string, unknown>).forward;
      return !!forward && typeof forward === 'object';
}

function renderMessageBody(msg: ChatMessage) {
      if (isMessageRecalled(msg.metadata)) {
            return <div className="whitespace-pre-wrap italic text-gray-400">Tin nhắn đã được thu hồi</div>;
      }

      const attachments = msg.mediaAttachments ?? [];

      if (attachments.length > 0) {
            const images = attachments.filter((a) => a.mediaType === 'IMAGE');
            const videos = attachments.filter((a) => a.mediaType === 'VIDEO');
            const audios = attachments.filter((a) => a.mediaType === 'AUDIO');
            const documents = attachments.filter((a) => a.mediaType === 'DOCUMENT');

            return (
                  <div className="space-y-2">
                        {msg.content && <div className="whitespace-pre-wrap">{msg.content}</div>}

                        {/* Image grid
                             - 1 image  : natural size (no forced h-32 / full-width)
                             - 2+ images: 2-col grid; last item spans both cols when count is odd
                        */}
                        {images.length === 1 && (
                              <ImageAttachment
                                    attachment={images[0]}
                                    isSingle
                              />
                        )}
                        {images.length > 1 && (
                              <div className="grid grid-cols-2 gap-2">
                                    {images.map((a, idx) => (
                                          <ImageAttachment
                                                key={a.id}
                                                attachment={a}
                                                className={
                                                      images.length % 2 !== 0 && idx === images.length - 1
                                                            ? 'col-span-2'
                                                            : undefined
                                                }
                                          />
                                    ))}
                              </div>
                        )}

                        {/* Video attachments */}
                        {videos.length > 0 && (
                              <div className="space-y-2">
                                    {videos.map((a) => (
                                          <VideoAttachment
                                                key={a.id}
                                                attachment={a}
                                          />
                                    ))}
                              </div>
                        )}

                        {/* Audio attachments — native HTML5 player */}
                        {audios.length > 0 && (
                              <div className="space-y-2">
                                    {audios.map((a) => (
                                          <AudioAttachment
                                                key={a.id}
                                                attachment={a}
                                          />
                                    ))}
                              </div>
                        )}

                        {/* Document/file attachments */}
                        {documents.length > 0 && (
                              <div className="space-y-2">
                                    {documents.map((a) => (
                                          <DocumentAttachment
                                                key={a.id}
                                                attachment={a}
                                          />
                                    ))}
                              </div>
                        )}
                  </div>
            );
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
function GroupSeenCounter({ msg, t }: { msg: ChatMessage, t: any }) {
      const total = msg.totalRecipients ?? 0;
      if (total === 0) return null;
      const seen = Math.min(msg.seenCount ?? 0, total);
      if (seen === 0) return null;

      return (
            <span className="text-[10px] text-blue-500">
                  {t('chat.messageList.groupSeen', { seen, total })}
            </span>
      );
}

/** Vietnamese text labels for receipt status */
function getReceiptText(state: ReceiptDisplayState, t: any): string {
      switch (state) {
            case 'sent':
                  return t('chat.messageList.statusSent');
            case 'delivered':
                  return t('chat.messageList.statusDelivered');
            case 'seen':
                  return t('chat.messageList.statusSeen');
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
      onReply,
      onJumpToMessage,
      pinnedMessageIds,
      onPinMessage,
      onUnpinMessage,
      onRecallMessage,
      onDeleteForMeMessage,
}: MessageListProps) {
      const { t } = useTranslation();
      const {
            translations,
            setTranslation,
            removeTranslation,
            hideTranslation,
            showTranslation,
            startTranslation,
            finishTranslation,
            isTranslationHidden,
            isTranslationPending,
      } = useTranslationStore();

      const setRightSidebar = useChatStore(s => s.setRightSidebar);
      const setAiSummaryStartMessageId = useChatStore(s => s.setAiSummaryStartMessageId);
      const openForwardModal = useForwardMessageStore((s) => s.open);

      const handleTranslate = async (msg: ChatMessage, lang: string) => {
            startTranslation(msg.id, lang);
            try {
                  const res = await api.post(API_ENDPOINTS.AI.TRANSLATE, {
                        type: 'translate',
                        conversationId: msg.conversationId,
                        messageId: msg.id,
                        targetLang: lang,
                  });
                  const translatedText = res.data?.data?.translatedText || res.data?.translatedText;
                  if (translatedText) {
                        setTranslation(msg.id, lang, translatedText);
                        finishTranslation(msg.id, lang);
                  }
            } catch (error) {
                  finishTranslation(msg.id, lang);
                  console.error('Translation failed', error);
            }
      };

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
                              {messages.map((msg, idx) => {
                                    const dateLabel = formatDateLabel(msg.createdAt, t);
                                    const prevDateLabel = idx > 0
                                          ? formatDateLabel(messages[idx - 1].createdAt, t)
                                          : '';
                                    const showDivider = dateLabel !== prevDateLabel;
                                    const isHighlighted = highlightedMessageId === msg.id;
                                    const isLatestMyMessage = msg.id === latestMyMessageId;
                                    const hasViTranslation = Boolean(translations[msg.id]?.vi);
                                    const hasEnTranslation = Boolean(translations[msg.id]?.en);
                                    const viHidden = isTranslationHidden(msg.id, 'vi');
                                    const enHidden = isTranslationHidden(msg.id, 'en');
                                    const recalled = isMessageRecalled(msg.metadata);
                                    const translationEntries = Object.entries(translations[msg.id] || {});
                                    const visibleTranslationEntries = translationEntries.filter(([lang]) =>
                                          !isTranslationHidden(msg.id, lang),
                                    );
                                    const hiddenTranslationEntries = translationEntries.filter(([lang]) =>
                                          isTranslationHidden(msg.id, lang),
                                    );
                                    return (
                                          <Fragment key={msg.id}>
                                                {showDivider && <DateDivider label={dateLabel} />}
                                                {msg.type === 'SYSTEM' ? (
                                                      <div data-message-id={msg.id}>
                                                            <CallLogEntry msg={msg} t={t} />
                                                      </div>
                                                ) : (() => {
                                                      // Build menu config once, shared between contextMenu + hover button
                                                      const menuProps: MenuProps = {
                                                            items: [
                                                                  { key: 'reply', label: t('chat.messageList.reply') },
                                                                  {
                                                                        key: 'forward',
                                                                        label: 'Chuyển tiếp',
                                                                        disabled: recalled,
                                                                  },
                                                                  {
                                                                        key: 'translate',
                                                                        label: t('chat.messageList.translate', 'Dịch'),
                                                                        children: [
                                                                              {
                                                                                    key: 'translate_vi',
                                                                                    label: 'Tiếng Việt',
                                                                                    disabled: hasViTranslation,
                                                                              },
                                                                              {
                                                                                    key: 'translate_en',
                                                                                    label: 'Tiếng Anh',
                                                                                    disabled: hasEnTranslation,
                                                                              },
                                                                        ]
                                                                  },
                                                                  {
                                                                        key: 'translation_visibility',
                                                                        label: 'Bản dịch',
                                                                        children: [
                                                                              {
                                                                                    key: 'hide_vi',
                                                                                    label: 'Ẩn Tiếng Việt',
                                                                                    disabled: !hasViTranslation || viHidden,
                                                                              },
                                                                              {
                                                                                    key: 'show_vi',
                                                                                    label: 'Hiện Tiếng Việt',
                                                                                    disabled: !hasViTranslation || !viHidden,
                                                                              },
                                                                              {
                                                                                    key: 'hide_en',
                                                                                    label: 'Ẩn Tiếng Anh',
                                                                                    disabled: !hasEnTranslation || enHidden,
                                                                              },
                                                                              {
                                                                                    key: 'show_en',
                                                                                    label: 'Hiện Tiếng Anh',
                                                                                    disabled: !hasEnTranslation || !enHidden,
                                                                              },
                                                                        ],
                                                                  },
                                                                  pinnedMessageIds?.has(msg.id)
                                                                        ? { key: 'unpin', label: t('chat.messageList.unpinMsg') }
                                                                        : { key: 'pin', label: t('chat.messageList.pinMsg') },
                                                                  {
                                                                        key: 'recall',
                                                                        label: 'Thu hồi',
                                                                        disabled: msg.senderSide !== 'me' || recalled,
                                                                        danger: true,
                                                                  },
                                                                  {
                                                                        key: 'delete_for_me',
                                                                        label: 'Xóa ở phía bạn',
                                                                        danger: true,
                                                                  },
                                                                  { type: 'divider' },
                                                                  { key: 'summary', label: 'Tóm tắt từ đây trở đi ✨' },
                                                            ],
                                                            onClick: (e) => {
                                                                  e.domEvent?.stopPropagation();
                                                                  const { key } = e;
                                                                  if (key === 'reply') onReply?.(msg);
                                                                  if (key === 'forward') openForwardModal(msg);
                                                                  if (key === 'pin') onPinMessage?.(msg.id);
                                                                  if (key === 'unpin') onUnpinMessage?.(msg.id);
                                                                  if (key === 'recall') onRecallMessage?.(msg);
                                                                  if (key === 'delete_for_me') onDeleteForMeMessage?.(msg);
                                                                  if (key === 'translate_vi' && !hasViTranslation) handleTranslate(msg, 'vi');
                                                                  if (key === 'translate_en' && !hasEnTranslation) handleTranslate(msg, 'en');
                                                                  if (key === 'hide_vi' && hasViTranslation && !viHidden) hideTranslation(msg.id, 'vi');
                                                                  if (key === 'show_vi' && hasViTranslation && viHidden) showTranslation(msg.id, 'vi');
                                                                  if (key === 'hide_en' && hasEnTranslation && !enHidden) hideTranslation(msg.id, 'en');
                                                                  if (key === 'show_en' && hasEnTranslation && enHidden) showTranslation(msg.id, 'en');
                                                                  if (key === 'summary') {
                                                                        setAiSummaryStartMessageId(msg.id);
                                                                        setRightSidebar('ai-summary');
                                                                  }
                                                            },
                                                      };

                                                      return (
                                                            <Dropdown
                                                                  menu={menuProps}
                                                                  trigger={['contextMenu']}
                                                            >
                                                                  <div data-message-id={msg.id} className={`flex group ${msg.senderSide === 'me' ? 'justify-end' : 'justify-start'}`}>
                                                                        {msg.senderSide !== 'me' && (
                                                                              <div className="mr-2 flex-shrink-0">
                                                                                    <Avatar
                                                                                          src={msg.sender?.avatarUrl}
                                                                                          icon={<UserOutlined />}
                                                                                          className="bg-blue-200 border border-gray-100"
                                                                                          size={32}
                                                                                          alt={msg.sender?.resolvedDisplayName ?? msg.sender?.displayName ?? 'User'}
                                                                                    />
                                                                              </div>
                                                                        )}
                                                                        <div className={`px-3 py-2 rounded-lg max-w-[70%] text-[15px] shadow-sm 
                                                      ${msg.senderSide === 'me'
                                                                                    ? 'bg-white text-gray-800 border border-gray-200'
                                                                                    : 'bg-white text-gray-800 border border-gray-200'
                                                                              }
                                                      ${isHighlighted
                                                                                    ? 'ring-2 ring-blue-400 ring-offset-2 bg-blue-50 transition-all duration-1000 ease-out'
                                                                                    : ''
                                                                              }
                                                `}>
                                                                              {isForwardedMessage(msg.metadata) && (
                                                                                    <div className="mb-1 text-[11px] text-gray-400 font-medium">Đã chuyển tiếp</div>
                                                                              )}
                                                                              {/* Reply quote (if this message is a reply) */}
                                                                              {msg.parentMessage ? (
                                                                                    <ReplyQuote
                                                                                          parentMessage={msg.parentMessage}
                                                                                          onJumpToMessage={onJumpToMessage}
                                                                                    />
                                                                              ) : null}
                                                                              {renderMessageBody(msg)}
                                                                              {isTranslationPending(msg.id) && (
                                                                                    <div className="mt-2 text-[13px] italic opacity-70 flex items-center gap-2 border-t border-gray-100 pt-1.5">
                                                                                          <Spin size="small" /> Đang dịch...
                                                                                    </div>
                                                                              )}
                                                                              {!isTranslationPending(msg.id) && visibleTranslationEntries.map(([lang, text]) => (
                                                                                    <div key={lang} className="mt-2 text-[14px] italic opacity-90 border-t border-gray-100 pt-2 flex gap-2">
                                                                                          <div className="text-blue-500 font-bold shrink-0">✨</div>
                                                                                          <div className="flex-1 min-w-0">
                                                                                                <div className="flex items-center justify-between gap-2 mb-0.5">
                                                                                                      <div className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">
                                                                                                            {lang === 'vi' ? 'Tiếng Việt' : 'Tiếng Anh'}
                                                                                                      </div>
                                                                                                      <div className="flex items-center gap-1">
                                                                                                            <Button
                                                                                                                  size="small"
                                                                                                                  type="text"
                                                                                                                  className="!h-5 !px-1 text-[10px] !text-gray-400 hover:!text-gray-600"
                                                                                                                  onClick={(e) => {
                                                                                                                        e.stopPropagation();
                                                                                                                        hideTranslation(msg.id, lang);
                                                                                                                  }}
                                                                                                            >
                                                                                                                  Ẩn
                                                                                                            </Button>
                                                                                                            <Button
                                                                                                                  size="small"
                                                                                                                  type="text"
                                                                                                                  className="!h-5 !px-1 text-[10px] !text-red-400 hover:!text-red-600"
                                                                                                                  onClick={(e) => {
                                                                                                                        e.stopPropagation();
                                                                                                                        removeTranslation(msg.id, lang);
                                                                                                                  }}
                                                                                                            >
                                                                                                                  Xóa
                                                                                                            </Button>
                                                                                                      </div>
                                                                                                </div>
                                                                                                <div className="whitespace-pre-wrap">{text}</div>
                                                                                          </div>
                                                                                    </div>
                                                                              ))}
                                                                              {!isTranslationPending(msg.id) && hiddenTranslationEntries.length > 0 && (
                                                                                    <div className="mt-2 border-t border-gray-100 pt-2 flex flex-wrap items-center gap-1.5">
                                                                                          <span className="text-[10px] text-gray-400">Bản dịch đã ẩn:</span>
                                                                                          {hiddenTranslationEntries.map(([lang]) => (
                                                                                                <Button
                                                                                                      key={`show-${lang}`}
                                                                                                      size="small"
                                                                                                      type="text"
                                                                                                      className="!h-5 !px-1 text-[10px] !text-blue-500 hover:!text-blue-700"
                                                                                                      onClick={(e) => {
                                                                                                            e.stopPropagation();
                                                                                                            showTranslation(msg.id, lang);
                                                                                                      }}
                                                                                                >
                                                                                                      Hiện {lang === 'vi' ? 'Tiếng Việt' : 'Tiếng Anh'}
                                                                                                </Button>
                                                                                          ))}
                                                                                    </div>
                                                                              )}
                                                                              {msg.senderSide === 'me' && getSendStatus(msg.metadata) === 'FAILED' && (
                                                                                    <div className="mt-2 flex items-center justify-end gap-2">
                                                                                          <span className="text-[11px] text-red-600 opacity-90">{t('chat.messageList.sendFail')}</span>
                                                                                          <Button
                                                                                                size="small"
                                                                                                type="link"
                                                                                                className="!p-0 !h-auto"
                                                                                                onClick={() => onRetry?.(msg)}
                                                                                          >
                                                                                                {t('chat.messageList.retry')}
                                                                                          </Button>
                                                                                    </div>
                                                                              )}
                                                                              <div className="text-[10px] opacity-60 text-right mt-1 flex items-center justify-end gap-1.5">
                                                                                    {msg.senderSide === 'me' && getSendStatus(msg.metadata) === 'SENDING' && (
                                                                                          <span className="inline-flex items-center gap-1">
                                                                                                <Spin size="small" />
                                                                                                <span>{t('chat.messageList.sending')}</span>
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
                                                                                                            {getReceiptText(state, t)}
                                                                                                      </span>
                                                                                                      {!isDirect && <GroupSeenCounter msg={msg} t={t} />}
                                                                                                </span>
                                                                                          );
                                                                                    })()}
                                                                              </div>
                                                                        </div>
                                                                        {/* Hover action button — visible cue for interactions */}
                                                                        <div
                                                                              className={`hidden group-hover:flex items-center self-center ${msg.senderSide === 'me' ? 'order-first mr-1' : 'ml-1'}`}
                                                                              onClick={(e) => e.stopPropagation()}
                                                                        >
                                                                              <Dropdown menu={menuProps} trigger={['click']} placement={msg.senderSide === 'me' ? 'bottomRight' : 'bottomLeft'}>
                                                                                    <Tooltip title={t('chat.messageList.actionTooltip')}>
                                                                                          <button className="p-1 rounded-full hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors">
                                                                                                <MoreOutlined style={{ fontSize: 16 }} />
                                                                                          </button>
                                                                                    </Tooltip>
                                                                              </Dropdown>
                                                                        </div>
                                                                  </div>
                                                            </Dropdown>
                                                      );
                                                })()}
                                          </Fragment>
                                    );
                              })}
                        </div>
                  ) : (
                        //  HIỂN THỊ KHI KHÔNG CÓ TIN NHẮN
                        <div className="flex h-full flex-col items-center justify-center text-gray-500">
                              <Empty description={t('chat.messageList.noMessages')} />
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
