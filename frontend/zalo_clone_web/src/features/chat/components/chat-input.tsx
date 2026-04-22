/**
 * ChatInput — text + media file input for conversations.
 *
 * Phase 4 (plan §4): Integrated file picker, FilePreviewPanel, and
 * modified handleSend that uploads media → batches by type → sends.
 *
 * Patterns applied:
 *   - rerender-functional-setstate: functional setState
 *   - rerender-move-effect-to-event: interaction logic in event handlers
 *   - architecture-avoid-boolean-props: explicit state enums from hook
 *   - js-early-exit: early returns in handleSend
 */

import { Input, Button, Tooltip, notification, Modal } from 'antd';
import {
      SmileOutlined,
      PictureOutlined,
      PaperClipOutlined,
      SendOutlined,
      LoadingOutlined,
      ClockCircleOutlined,
      MoreOutlined,
      EnvironmentOutlined,
      IdcardOutlined,
      ThunderboltOutlined,
} from '@ant-design/icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import EmojiPicker, { type EmojiClickData, Theme } from 'emoji-picker-react';
import { FilePreviewPanel } from './file-preview-panel';
import { useMediaUpload } from '../hooks/use-media-upload';
import { batchFilesByType } from '../utils/batch-files';
import type { MessageType } from '@/types/api';
import { useTranslation } from 'react-i18next';
import { useFriendsList } from '@/features/contacts';

const { TextArea } = Input;

// ============================================================================
// FILE INPUT ACCEPT STRINGS (split for UX — two buttons, two filters)
// ============================================================================

const IMAGE_VIDEO_ACCEPT = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm',
].join(',');

const DOC_AUDIO_ACCEPT = '*/*';
const QUICK_MESSAGE_STORAGE_KEY = 'chat.quickMessages.web';
type QuickMessageMap = Record<string, string>;
const DEFAULT_QUICK_MESSAGES: QuickMessageMap = {
      '/hello': 'xin chao minh co the giup gi cho ban',
};

// ============================================================================
// TYPES
// ============================================================================

export interface SendPayload {
      type: MessageType;
      content?: string;
      mediaIds?: string[];
      /**
       * Local file metadata for optimistic rendering.
       * Each entry maps to a mediaId at the same index.
       * Only present when sending media messages.
       */
      _localFiles?: {
            mediaId: string;
            localUrl: string;
            mediaType: import('@/types/api').MediaType;
            originalName: string;
            size: number;
            mimeType: string;
            /** Status from confirmUpload response — READY for inline-processed media (AUDIO/DOCUMENT). */
            processingStatus?: import('@/types/api').MediaProcessingStatus;
            /** CDN URL from confirmUpload response — available when media is already READY. */
            cdnUrl?: string | null;
      }[];
}

interface ChatInputProps {
      conversationId: string | null;
      onSend?: (payload: SendPayload) => void;
      onTypingChange?: (isTyping: boolean) => void;
      /** Called when user clicks the reminder toolbar button */
      onSetReminder?: () => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ChatInput({ conversationId, onSend, onTypingChange, onSetReminder }: ChatInputProps) {
      const { t } = useTranslation();
      const [message, setMessage] = useState('');
      const [isSending, setIsSending] = useState(false);
      const [showEmojiPicker, setShowEmojiPicker] = useState(false);
      const [showQuickMessageModal, setShowQuickMessageModal] = useState(false);
      const [showNamecardModal, setShowNamecardModal] = useState(false);
      const [namecardSearch, setNamecardSearch] = useState('');
      const [quickMessages, setQuickMessages] = useState<QuickMessageMap>(DEFAULT_QUICK_MESSAGES);
      const [quickKeywordInput, setQuickKeywordInput] = useState('/hello');
      const [quickValueInput, setQuickValueInput] = useState(DEFAULT_QUICK_MESSAGES['/hello']);

      const isTypingRef = useRef(false);
      const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
      const emojiPickerRef = useRef<HTMLDivElement>(null);
      const emojiButtonRef = useRef<HTMLButtonElement>(null);

      // Hidden file inputs
      const imageVideoInputRef = useRef<HTMLInputElement>(null);
      const docAudioInputRef = useRef<HTMLInputElement>(null);

      // Media upload hook
      const {
            pendingFiles,
            addFiles,
            removeFile,
            retryFile,
            clearAll,
            uploadAll,
            isUploading,
            hasErrors,
            fileCount,
            getLatestPendingFiles,
      } = useMediaUpload();
      const friendsQuery = useFriendsList({
            search: namecardSearch.trim() || undefined,
            conversationId: conversationId ?? undefined,
      });

      useEffect(() => {
            return () => {
                  if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
            };
      }, []);

      useEffect(() => {
            try {
                  const raw = localStorage.getItem(QUICK_MESSAGE_STORAGE_KEY);
                  if (!raw) return;
                  const parsed = JSON.parse(raw) as QuickMessageMap;
                  if (!parsed || typeof parsed !== 'object') return;
                  const cleaned = Object.entries(parsed).reduce<QuickMessageMap>((acc, [k, v]) => {
                        if (k.trim().startsWith('/') && v.trim()) acc[k.trim().toLowerCase()] = v.trim();
                        return acc;
                  }, {});
                  if (Object.keys(cleaned).length > 0) setQuickMessages(cleaned);
            } catch {
                  // ignore invalid localStorage
            }
      }, []);

      const persistQuickMessages = useCallback((nextMap: QuickMessageMap) => {
            setQuickMessages(nextMap);
            localStorage.setItem(QUICK_MESSAGE_STORAGE_KEY, JSON.stringify(nextMap));
      }, []);

      // ── Close emoji picker on outside click ──────────────────────────────
      useEffect(() => {
            if (!showEmojiPicker) return;
            const handleClickOutside = (e: MouseEvent) => {
                  const target = e.target as Node;
                  if (
                        emojiPickerRef.current &&
                        !emojiPickerRef.current.contains(target) &&
                        emojiButtonRef.current &&
                        !emojiButtonRef.current.contains(target)
                  ) {
                        setShowEmojiPicker(false);
                  }
            };
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
      }, [showEmojiPicker]);

      // ── Typing indicator logic ────────────────────────────────────────────
      const emitTypingStart = useCallback(() => {
            if (!conversationId || !onTypingChange) return;
            if (!isTypingRef.current) {
                  isTypingRef.current = true;
                  onTypingChange(true);
            }
            if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
            stopTimerRef.current = setTimeout(() => {
                  if (!isTypingRef.current) return;
                  isTypingRef.current = false;
                  onTypingChange?.(false);
            }, 1200);
      }, [conversationId, onTypingChange]);

      const emitTypingStop = useCallback(() => {
            if (!conversationId || !onTypingChange) return;
            if (!isTypingRef.current) return;
            isTypingRef.current = false;
            onTypingChange(false);
      }, [conversationId, onTypingChange]);

      // ── File selection handlers ───────────────────────────────────────────
      const handleFileSelected = useCallback(
            (e: React.ChangeEvent<HTMLInputElement>) => {
                  const files = e.target.files;
                  if (!files || files.length === 0) return;

                  const errors = addFiles(files);
                  for (const err of errors) {
                        notification.warning({ message: err, placement: 'topRight' });
                  }

                  // Reset input so the same file can be re-selected
                  e.target.value = '';
            },
            [addFiles],
      );

      const openImageVideoPicker = useCallback(() => {
            if (isUploading || !conversationId) return;
            imageVideoInputRef.current?.click();
      }, [isUploading, conversationId]);

      const openDocAudioPicker = useCallback(() => {
            if (isUploading || !conversationId) return;
            docAudioInputRef.current?.click();
      }, [isUploading, conversationId]);

      // ── Send handler ──────────────────────────────────────────────────────
      const handleSend = useCallback(async () => {
            if (!conversationId || !onSend) return;

            const text = message.trim();
            const mappedText = quickMessages[text.toLowerCase()];
            const finalText = mappedText || text;
            const hasMedia = fileCount > 0;

            // js-early-exit: nothing to send
            if (!finalText && !hasMedia) return;

            // Cannot send while errors exist — user must retry or remove
            if (hasErrors) {
                  notification.warning({
                        message: t('chat.input.errorHasFiles'),
                        placement: 'topRight',
                  });
                  return;
            }

            emitTypingStop();
            setIsSending(true);

            try {
                  if (hasMedia) {
                        // Step 1: Upload all queued files
                        await uploadAll();

                        // Step 2: Read latest state via ref (avoids stale closure)
                        const latestFiles = getLatestPendingFiles();

                        const confirmedFiles = latestFiles
                              .filter((f) => f.state === 'confirmed' && f.mediaId)
                              .map((f) => ({
                                    localId: f.localId,
                                    mediaId: f.mediaId!,
                                    mediaType: f.mediaType,
                                    mimeType: f.file.type,
                              }));

                        if (confirmedFiles.length === 0) {
                              notification.error({
                                    message: t('chat.input.errorNoSuccess'),
                                    placement: 'topRight',
                              });
                              return;
                        }

                        const batches = batchFilesByType(confirmedFiles);

                        // Step 3: Send each batch as a separate message
                        //   Caption (text) attached to the FIRST batch only (§9 confirmed)
                        let sentAny = false;
                        for (let i = 0; i < batches.length; i++) {
                              const batch = batches[i];

                              const hasContent = (i === 0 && (finalText || '').trim().length > 0);
                              const hasMedia = batch.mediaIds.length > 0;
                              if (!hasContent && !hasMedia) continue; // skip empty batch

                              // Build _localFiles for optimistic rendering
                              const localFilesForBatch = batch.mediaIds
                                    .map((mid) => {
                                          const pf = latestFiles.find((f) => f.mediaId === mid);
                                          if (!pf) return null;
                                          return {
                                                mediaId: mid,
                                                localUrl: pf.localUrl,
                                                mediaType: pf.mediaType,
                                                originalName: pf.file.name,
                                                size: pf.file.size,
                                                mimeType: pf.file.type,
                                                processingStatus: pf.serverResponse?.processingStatus,
                                                cdnUrl: pf.serverResponse?.cdnUrl ?? null,
                                          };
                                    })
                                    .filter((x): x is NonNullable<typeof x> => x !== null);

                              onSend({
                                    type: batch.messageType,
                                    content: hasContent ? finalText : undefined,
                                    mediaIds: batch.mediaIds,
                                    _localFiles: localFilesForBatch.length > 0 ? localFilesForBatch : undefined,
                              });
                              sentAny = true;
                        }
                        if (!sentAny) {
                              notification.error({
                                    message: t('chat.input.errorEmpty'),
                                    placement: 'topRight',
                              });
                              return;
                        }
                  } else {
                        // Text-only message
                        onSend({ type: 'TEXT', content: finalText });
                  }

                  setMessage('');
                  clearAll();
            } catch {
                  // Upload errors are shown per-file in FilePreviewPanel.
                  // The user can retry individual files and press Send again.
                  notification.error({
                        message: t('chat.input.errorUploadAll'),
                        placement: 'topRight',
                  });
            } finally {
                  setIsSending(false);
            }
      }, [
            conversationId, onSend, message, fileCount, hasErrors, quickMessages,
            emitTypingStop, uploadAll, getLatestPendingFiles, clearAll,
      ]);

      const getFriendPhoneNumber = useCallback((friend: any): string => {
            const candidate = friend?.phoneNumber ?? friend?.phone ?? '';
            return typeof candidate === 'string' ? candidate.trim() : '';
      }, []);

      const trimmedInput = message.trim();
      const quickMessageHints = useMemo(() => {
            if (!trimmedInput.startsWith('/')) return [];
            const searchTerm = trimmedInput.slice(1).trim();
            if (searchTerm.length < 2) return [];
            const needle = trimmedInput.toLowerCase();
            return Object.entries(quickMessages)
                  .filter(([keyword, value]) => keyword.includes(needle) || value.toLowerCase().includes(needle))
                  .slice(0, 6);
      }, [quickMessages, trimmedInput]);

      const namecardFriends = friendsQuery.data?.pages.flatMap((page) => page.data) ?? [];

      const handleSendNamecard = useCallback((friend: any) => {
            if (!onSend) return;
            const displayName = friend?.resolvedDisplayName || friend?.displayName || 'Người dùng';
            const phone = getFriendPhoneNumber(friend);
            const avatarLine = friend?.avatarUrl ? `\nAvatar: ${friend.avatarUrl}` : '';
            const phoneLine = phone ? `\nPhone: ${phone}` : '';
            const namecardContent = `[Namecard]\n${displayName}${phoneLine}\nUID: ${friend.userId}${avatarLine}`;
            onSend({ type: 'TEXT', content: namecardContent });
            setShowNamecardModal(false);
            setNamecardSearch('');
      }, [getFriendPhoneNumber, onSend]);

      const handleSaveQuickMessage = useCallback(() => {
            const keyword = quickKeywordInput.trim().toLowerCase();
            const value = quickValueInput.trim();
            if (!keyword.startsWith('/')) {
                  notification.error({ message: 'Keyword phải bắt đầu bằng /', placement: 'topRight' });
                  return;
            }
            if (!value) {
                  notification.error({ message: 'Vui lòng nhập nội dung quick message', placement: 'topRight' });
                  return;
            }
            persistQuickMessages({ ...quickMessages, [keyword]: value });
            notification.success({ message: 'Đã lưu quick message', placement: 'topRight' });
      }, [persistQuickMessages, quickKeywordInput, quickMessages, quickValueInput]);

      const handleDeleteQuickMessage = useCallback((keyword: string) => {
            const nextMap = { ...quickMessages };
            delete nextMap[keyword];
            persistQuickMessages(Object.keys(nextMap).length > 0 ? nextMap : DEFAULT_QUICK_MESSAGES);
      }, [persistQuickMessages, quickMessages]);

      const handleShareCurrentLocation = useCallback(() => {
            if (!onSend) return;
            if (!navigator.geolocation) {
                  notification.error({ message: 'Trình duyệt không hỗ trợ định vị', placement: 'topRight' });
                  return;
            }
            navigator.geolocation.getCurrentPosition(
                  (position) => {
                        const { latitude, longitude } = position.coords;
                        const mapLink = `https://maps.google.com/?q=${latitude},${longitude}`;
                        const locationText = `Vi tri hien tai cua toi:\n${latitude.toFixed(6)}, ${longitude.toFixed(6)}\n${mapLink}`;
                        onSend({ type: 'TEXT', content: locationText });
                        notification.success({ message: 'Đã chia sẻ vị trí', placement: 'topRight' });
                  },
                  () => {
                        notification.error({ message: 'Không thể lấy vị trí hiện tại', placement: 'topRight' });
                  },
                  { enableHighAccuracy: false, timeout: 10000 },
            );
      }, [onSend]);

      // ── Derived state ─────────────────────────────────────────────────────
      const canSend = conversationId && (message.trim() || fileCount > 0) && !isSending && !isUploading;
      const isDisabled = !conversationId;
      const showPreviewPanel = fileCount > 0;

      return (
            <>
            <div className="bg-white border-t border-gray-200">
                  {/* Hidden file inputs */}
                  <input
                        ref={imageVideoInputRef}
                        type="file"
                        multiple
                        accept={IMAGE_VIDEO_ACCEPT}
                        className="hidden"
                        onChange={handleFileSelected}
                  />
                  <input
                        ref={docAudioInputRef}
                        type="file"
                        multiple
                        accept={DOC_AUDIO_ACCEPT}
                        className="hidden"
                        onChange={handleFileSelected}
                  />

                  {/* FILE PREVIEW PANEL (above toolbar, conditional) */}
                  {showPreviewPanel ? (
                        <FilePreviewPanel
                              files={pendingFiles}
                              onRemove={removeFile}
                              onRetry={retryFile}
                              disabled={isUploading || isSending}
                        />
                  ) : null}

                  {/* 1. TOOLBAR */}
                  <div className="flex items-center gap-1 px-2 py-1 border-b border-gray-50">
                        {/* <Tooltip title="Gửi Sticker" placement="top">
                              <Button
                                    type="text"
                                    icon={<SmileOutlined />}
                                    className="text-gray-600 hover:bg-gray-100 hover:text-blue-600 rounded"
                                    size="middle"
                                    disabled={isDisabled}
                              />
                        </Tooltip> */}

                        <Tooltip title={t('chat.input.sendImageVideo')} placement="top">
                              <Button
                                    type="text"
                                    icon={<PictureOutlined />}
                                    className="text-gray-600 hover:bg-gray-100 hover:text-blue-600 rounded"
                                    size="middle"
                                    disabled={isDisabled || isUploading}
                                    onClick={openImageVideoPicker}
                              />
                        </Tooltip>

                        <Tooltip title={t('chat.input.attachFile')} placement="top">
                              <Button
                                    type="text"
                                    icon={<PaperClipOutlined />}
                                    className="text-gray-600 hover:bg-gray-100 hover:text-blue-600 rounded"
                                    size="middle"
                                    disabled={isDisabled || isUploading}
                                    onClick={openDocAudioPicker}
                              />
                        </Tooltip>

                        <Tooltip title={t('chat.input.setReminder')} placement="top">
                              <Button
                                    type="text"
                                    icon={<ClockCircleOutlined />}
                                    className="text-gray-600 hover:bg-gray-100 hover:text-blue-600 rounded"
                                    size="middle"
                                    disabled={isDisabled}
                                    onClick={onSetReminder}
                              />
                        </Tooltip>

                        <Tooltip title="Namecard" placement="top">
                              <Button
                                    type="text"
                                    icon={<IdcardOutlined />}
                                    className="text-gray-600 hover:bg-gray-100 hover:text-blue-600 rounded"
                                    size="middle"
                                    disabled={isDisabled || isUploading || isSending}
                                    onClick={() => setShowNamecardModal(true)}
                              />
                        </Tooltip>

                        <Tooltip title="Quick message" placement="top">
                              <Button
                                    type="text"
                                    icon={<ThunderboltOutlined />}
                                    className="text-gray-600 hover:bg-gray-100 hover:text-blue-600 rounded"
                                    size="middle"
                                    disabled={isDisabled || isUploading || isSending}
                                    onClick={() => setShowQuickMessageModal(true)}
                              />
                        </Tooltip>

                        <Tooltip title="Vị trí hiện tại" placement="top">
                              <Button
                                    type="text"
                                    icon={<EnvironmentOutlined />}
                                    className="text-gray-600 hover:bg-gray-100 hover:text-blue-600 rounded"
                                    size="middle"
                                    disabled={isDisabled || isUploading || isSending}
                                    onClick={handleShareCurrentLocation}
                              />
                        </Tooltip>
                  </div>

                  {/* 2. INPUT AREA */}
                  <div className="p-3 flex items-end gap-2">
                        {/* Text Area */}
                        <div className="flex-1 relative">
                              <TextArea
                                    value={message}
                                    onChange={(e) => {
                                          setMessage(e.target.value);
                                          emitTypingStart();
                                    }}
                                    placeholder={conversationId ? t('chat.input.placeholder') : t('chat.input.placeholderEmpty')}
                                    autoSize={{ minRows: 1, maxRows: 5 }}
                                    className="!bg-transparent !resize-none pr-8 text-[15px]"
                                    variant="borderless"
                                    disabled={isDisabled}
                                    onBlur={emitTypingStop}
                                    onPressEnter={(e) => {
                                          if (!e.shiftKey) {
                                                e.preventDefault();
                                                void handleSend();
                                          }
                                    }}
                              />
                        </div>

                        {/* Action Buttons Right Side */}
                        <div className="flex items-center gap-2 pb-1">
                              {/* Biểu cảm */}
                              <div className="relative">
                                    <Tooltip title={t('chat.input.emoji')} open={showEmojiPicker ? false : undefined}>
                                          <Button
                                                ref={emojiButtonRef}
                                                type="text"
                                                icon={
                                                      <SmileOutlined
                                                            className={`text-xl transition-colors ${showEmojiPicker ? 'text-yellow-500' : 'text-gray-500'
                                                                  }`}
                                                      />
                                                }
                                                className="hover:bg-gray-100 hover:text-yellow-500 rounded-full w-8 h-8 flex items-center justify-center"
                                                disabled={isDisabled}
                                                onClick={() => setShowEmojiPicker((prev) => !prev)}
                                          />
                                    </Tooltip>

                                    {showEmojiPicker && (
                                          <div
                                                ref={emojiPickerRef}
                                                className="absolute bottom-10 right-0 z-50 shadow-xl rounded-xl overflow-hidden"
                                          >
                                                <EmojiPicker
                                                      onEmojiClick={(emojiData: EmojiClickData) => {
                                                            setMessage((prev) => prev + emojiData.emoji);
                                                      }}
                                                      theme={Theme.LIGHT}
                                                      lazyLoadEmojis
                                                      searchPlaceHolder="Tìm emoji..."
                                                      width={320}
                                                      height={400}
                                                />
                                          </div>
                                    )}
                              </div>

                              {/* Send button */}
                              <div className="border-l border-gray-200 pl-2">
                                    <Tooltip title={fileCount > 0 ? t('chat.input.uploadSend') : t('chat.input.send')}>
                                          <Button
                                                type="text"
                                                disabled={!canSend}
                                                icon={
                                                      isSending || isUploading ? (
                                                            <LoadingOutlined className="text-xl text-blue-500" />
                                                      ) : (
                                                            <SendOutlined
                                                                  className={`text-xl ${canSend ? 'text-blue-600' : 'text-gray-400'}`}
                                                                  rotate={-45}
                                                            />
                                                      )
                                                }
                                                className="hover:bg-blue-50 w-10 h-10 flex items-center justify-center rounded-lg"
                                                onClick={() => void handleSend()}
                                          />
                                    </Tooltip>
                              </div>
                        </div>
                  </div>
                  {quickMessageHints.length > 0 && (
                        <div className="px-3 pb-2">
                              <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
                                    {quickMessageHints.map(([keyword, value], index) => (
                                          <button
                                                key={keyword}
                                                type="button"
                                                className={`w-full text-left px-3 py-2 hover:bg-gray-100 ${index < quickMessageHints.length - 1 ? 'border-b border-gray-200' : ''}`}
                                                onClick={() => {
                                                      setMessage(value);
                                                      setQuickKeywordInput(keyword);
                                                      setQuickValueInput(value);
                                                }}
                                          >
                                                <div className="text-xs font-semibold text-blue-600">{keyword}</div>
                                                <div className="text-sm text-gray-800 truncate">{value}</div>
                                          </button>
                                    ))}
                              </div>
                        </div>
                  )}
            </div>
            <Modal
                  title="Chọn bạn để gửi namecard"
                  open={showNamecardModal}
                  onCancel={() => {
                        setShowNamecardModal(false);
                        setNamecardSearch('');
                  }}
                  footer={null}
            >
                  <Input
                        value={namecardSearch}
                        onChange={(e) => setNamecardSearch(e.target.value)}
                        placeholder="Tìm bạn bè..."
                        className="mb-3"
                  />
                  <div className="max-h-[360px] overflow-y-auto">
                        {namecardFriends.map((friend: any) => {
                              const displayName = friend?.resolvedDisplayName || friend?.displayName || 'Người dùng';
                              const phone = getFriendPhoneNumber(friend);
                              return (
                                    <button
                                          key={friend.friendshipId}
                                          type="button"
                                          onClick={() => handleSendNamecard(friend)}
                                          className="w-full text-left px-2 py-2 rounded-lg hover:bg-gray-50 border-b border-gray-100"
                                    >
                                          <div className="text-sm font-medium text-gray-900">{displayName}</div>
                                          <div className="text-xs text-gray-500">{phone || friend.userId}</div>
                                    </button>
                              );
                        })}
                        {namecardFriends.length === 0 && (
                              <div className="text-center text-sm text-gray-500 py-6">Không có dữ liệu bạn bè</div>
                        )}
                  </div>
            </Modal>

            <Modal
                  title="Cài đặt quick message"
                  open={showQuickMessageModal}
                  onCancel={() => setShowQuickMessageModal(false)}
                  footer={null}
            >
                  <p className="text-xs text-gray-500 mb-2">
                        Khi nhập đúng /keyword và gửi, nội dung sẽ tự thay bằng quick message tương ứng.
                  </p>
                  <Input
                        value={quickKeywordInput}
                        onChange={(e) => setQuickKeywordInput(e.target.value)}
                        placeholder="/hello"
                        className="mb-2"
                  />
                  <Input
                        value={quickValueInput}
                        onChange={(e) => setQuickValueInput(e.target.value)}
                        placeholder="Nội dung quick message"
                        className="mb-3"
                  />
                  <Button type="primary" block className="mb-3" onClick={handleSaveQuickMessage}>
                        Lưu quick message
                  </Button>
                  <div className="max-h-[320px] overflow-y-auto border rounded-lg">
                        {Object.entries(quickMessages).map(([keyword, value]) => (
                              <div key={keyword} className="px-3 py-2 border-b last:border-b-0">
                                    <div className="flex items-start justify-between gap-2">
                                          <button
                                                type="button"
                                                className="text-left flex-1"
                                                onClick={() => {
                                                      setQuickKeywordInput(keyword);
                                                      setQuickValueInput(value);
                                                }}
                                          >
                                                <div className="text-xs font-semibold text-blue-600">{keyword}</div>
                                                <div className="text-sm text-gray-800">{value}</div>
                                          </button>
                                          <Button danger type="text" size="small" onClick={() => handleDeleteQuickMessage(keyword)}>
                                                Xóa
                                          </Button>
                                    </div>
                              </div>
                        ))}
                  </div>
            </Modal>
            </>
      );
}