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

import { Input, Button, Tooltip, notification } from 'antd';
import {
      SmileOutlined,
      PictureOutlined,
      PaperClipOutlined,
      SendOutlined,
      LoadingOutlined,
      ClockCircleOutlined,
} from '@ant-design/icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import EmojiPicker, { type EmojiClickData, Theme } from 'emoji-picker-react';
import { FilePreviewPanel } from './file-preview-panel';
import { useMediaUpload } from '../hooks/use-media-upload';
import { batchFilesByType } from '../utils/batch-files';
import type { MessageType } from '@/types/api';

const { TextArea } = Input;

// ============================================================================
// FILE INPUT ACCEPT STRINGS (split for UX — two buttons, two filters)
// ============================================================================

const IMAGE_VIDEO_ACCEPT = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm',
].join(',');

const DOC_AUDIO_ACCEPT = [
      'audio/mpeg', 'audio/wav', 'audio/aac', 'audio/x-m4a', 'audio/ogg',
      'application/pdf', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
].join(',');

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
      const [message, setMessage] = useState('');
      const [isSending, setIsSending] = useState(false);
      const [showEmojiPicker, setShowEmojiPicker] = useState(false);

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

      useEffect(() => {
            return () => {
                  if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
            };
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
            const hasMedia = fileCount > 0;

            // js-early-exit: nothing to send
            if (!text && !hasMedia) return;

            // Cannot send while errors exist — user must retry or remove
            if (hasErrors) {
                  notification.warning({
                        message: 'Vui lòng thử lại hoặc xóa các file lỗi trước khi gửi',
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
                                    message: 'Không có file nào upload thành công',
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

                              const hasContent = (i === 0 && (text || '').trim().length > 0);
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
                                    content: hasContent ? text : undefined,
                                    mediaIds: batch.mediaIds,
                                    _localFiles: localFilesForBatch.length > 0 ? localFilesForBatch : undefined,
                              });
                              sentAny = true;
                        }
                        if (!sentAny) {
                              notification.error({
                                    message: 'Không có nội dung hoặc file hợp lệ để gửi',
                                    placement: 'topRight',
                              });
                              return;
                        }
                  } else {
                        // Text-only message
                        onSend({ type: 'TEXT', content: text });
                  }

                  setMessage('');
                  clearAll();
            } catch {
                  // Upload errors are shown per-file in FilePreviewPanel.
                  // The user can retry individual files and press Send again.
                  notification.error({
                        message: 'Upload thất bại. Vui lòng thử lại các file lỗi.',
                        placement: 'topRight',
                  });
            } finally {
                  setIsSending(false);
            }
      }, [
            conversationId, onSend, message, fileCount, hasErrors,
            emitTypingStop, uploadAll, getLatestPendingFiles, clearAll,
      ]);

      // ── Derived state ─────────────────────────────────────────────────────
      const canSend = conversationId && (message.trim() || fileCount > 0) && !isSending && !isUploading;
      const isDisabled = !conversationId;
      const showPreviewPanel = fileCount > 0;

      return (
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
                        <Tooltip title="Gửi Sticker" placement="top">
                              <Button
                                    type="text"
                                    icon={<SmileOutlined />}
                                    className="text-gray-600 hover:bg-gray-100 hover:text-blue-600 rounded"
                                    size="middle"
                                    disabled={isDisabled}
                              />
                        </Tooltip>

                        <Tooltip title="Gửi hình ảnh / video" placement="top">
                              <Button
                                    type="text"
                                    icon={<PictureOutlined />}
                                    className="text-gray-600 hover:bg-gray-100 hover:text-blue-600 rounded"
                                    size="middle"
                                    disabled={isDisabled || isUploading}
                                    onClick={openImageVideoPicker}
                              />
                        </Tooltip>

                        <Tooltip title="Đính kèm file / audio" placement="top">
                              <Button
                                    type="text"
                                    icon={<PaperClipOutlined />}
                                    className="text-gray-600 hover:bg-gray-100 hover:text-blue-600 rounded"
                                    size="middle"
                                    disabled={isDisabled || isUploading}
                                    onClick={openDocAudioPicker}
                              />
                        </Tooltip>

                        <Tooltip title="Nhắc hẹn" placement="top">
                              <Button
                                    type="text"
                                    icon={<ClockCircleOutlined />}
                                    className="text-gray-600 hover:bg-gray-100 hover:text-blue-600 rounded"
                                    size="middle"
                                    disabled={isDisabled}
                                    onClick={onSetReminder}
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
                                    placeholder={conversationId ? 'Nhập tin nhắn' : 'Chọn một cuộc trò chuyện để bắt đầu'}
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
                                    <Tooltip title="Biểu cảm" open={showEmojiPicker ? false : undefined}>
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
                                    <Tooltip title={fileCount > 0 ? 'Upload & Gửi (Enter)' : 'Gửi tin nhắn (Enter)'}>
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
            </div>
      );
}