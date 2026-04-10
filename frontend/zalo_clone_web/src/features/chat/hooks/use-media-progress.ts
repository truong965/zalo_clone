/**
 * useMediaProgress — WebSocket listener for media processing updates.
 *
 * Subscribes to `progress:{mediaId}` events emitted by the backend
 * media processing workers (image/video/document).
 *
 * When a progress event arrives, the hook deep-updates the matching
 * attachment in the TanStack Query infinite cache (messages query),
 * so the UI reactively shows the new processingStatus / thumbnailUrl.
 *
 * Backend emits (from sqs-media.consumer / media.consumer):
 *   { status: 'processing', progress: number }
 *   { status: 'completed', progress: 100, thumbnailUrl?: string, hlsPlaylistUrl?: string }
 *   { status: 'failed', progress: 0, error?: string }
 *
 * Plan §7: WebSocket `progress:*` Listener.
 * Rules: react-best-practices (stable refs, minimal re-renders).
 */

import { useEffect, useRef } from 'react';
import { notification } from 'antd';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useSocket } from '@/hooks/use-socket';
import type { MessagesInfiniteData } from '../utils/message-cache-helpers';
import { mediaService } from '@/features/chat/api/media.service';

// ============================================================================
// TYPES
// ============================================================================

interface MediaProgressPayload {
      status: 'processing' | 'completed' | 'failed';
      progress: number;
      thumbnailUrl?: string;
      hlsPlaylistUrl?: string;
      error?: string;
      /** Present on failure: ID of the message the attachment belongs to. */
      messageId?: string | null;
      /**
       * Full CDN URL — only present in catch-up fetch results, not in live
       * socket events. Lets user B see the image after processing completes.
       */
      cdnUrl?: string | null;
}

interface UseMediaProgressParams {
      /** Messages query key for the current conversation */
      messagesQueryKey: QueryKey;
      /** List of mediaIds to subscribe to (confirmed but not yet READY) */
      mediaIds: string[];
}

// ============================================================================
// CACHE UPDATE HELPER
// ============================================================================

/**
 * Deep-update a single media attachment inside the infinite query cache.
 * Returns SAME reference if nothing changed (prevents re-renders).
 */
function updateAttachmentInCache(
      prev: MessagesInfiniteData | undefined,
      mediaId: string,
      payload: MediaProgressPayload,
): MessagesInfiniteData | undefined {
      if (!prev) return prev;

      const processingStatus =
            payload.status === 'completed' ? 'READY'
                  : payload.status === 'failed' ? 'FAILED'
                        : 'PROCESSING';

      let anyChange = false;

      const pages = prev.pages.map((page) => {
            let pageChanged = false;

            const data = page.data.map((msg) => {
                  const attachments = msg.mediaAttachments;
                  if (!attachments || attachments.length === 0) return msg;

                  const idx = attachments.findIndex((a) => a.id === mediaId);
                  if (idx === -1) return msg;

                  const existing = attachments[idx];

                  // Bug 2 fix: don't skip if we're setting a thumbnailUrl that wasn't there.
                  // The backend sets processingStatus=READY immediately; the worker adds
                  // thumbnailUrl later. We must apply the thumbnail even when status stays READY.
                  const statusUnchanged = existing.processingStatus === processingStatus;
                  const thumbnailWillUpdate = payload.thumbnailUrl && !existing.thumbnailUrl;
                  if (statusUnchanged && !thumbnailWillUpdate) return msg;

                  pageChanged = true;

                  const updatedAttachment = {
                        ...existing,
                        processingStatus: processingStatus as typeof existing.processingStatus,
                        ...(payload.cdnUrl ? { cdnUrl: payload.cdnUrl } : {}),
                        ...(payload.thumbnailUrl ? { thumbnailUrl: payload.thumbnailUrl } : {}),
                        // For completed images, thumbnailUrl may double as optimizedUrl
                        ...(payload.status === 'completed' && payload.thumbnailUrl
                              ? { optimizedUrl: payload.thumbnailUrl }
                              : {}),
                  };

                  const nextAttachments = [...attachments];
                  nextAttachments[idx] = updatedAttachment;

                  return {
                        ...msg,
                        mediaAttachments: nextAttachments,
                  };
            });

            if (!pageChanged) return page;
            anyChange = true;
            return { ...page, data };
      });

      if (!anyChange) return prev;
      return { ...prev, pages };
}

// ============================================================================
// HOOK
// ============================================================================

export function useMediaProgress({ messagesQueryKey, mediaIds }: UseMediaProgressParams) {
      const queryClient = useQueryClient();
      const { socket, isConnected } = useSocket();

      // Keep stable refs to avoid re-subscribing on every render
      const queryKeyRef = useRef(messagesQueryKey);
      useEffect(() => { queryKeyRef.current = messagesQueryKey; }, [messagesQueryKey]);

      const queryClientRef = useRef(queryClient);
      useEffect(() => { queryClientRef.current = queryClient; }, [queryClient]);

      // Track which mediaIds have already received a catch-up status check,
      // so we don't re-fetch on every re-render. Persists across effects.
      const checkedIdsRef = useRef(new Set<string>());

      useEffect(() => {
            if (!socket || !isConnected) return;
            if (mediaIds.length === 0) return;

            // DEBUG: Log media progress subscription
            // console.log('🔄 [MediaProgress] Subscribing to media progress for:', mediaIds);
            // console.log('📊 [MediaProgress] Total media items:', mediaIds.length);

            const handlers = new Map<string, (payload: MediaProgressPayload) => void>();

            for (const mediaId of mediaIds) {
                  const eventName = `progress:${mediaId}`;

                  const handler = (payload: MediaProgressPayload) => {
                        // DEBUG: Log received progress event
                        // console.log(`📡 [MediaProgress] Event for ${mediaId}:`, payload);

                        queryClientRef.current.setQueryData<MessagesInfiniteData>(
                              queryKeyRef.current,
                              (prev) => updateAttachmentInCache(prev, mediaId, payload),
                        );

                        // Bug 3 fix: when a live socket event reports failure for an
                        // attachment that is already attached to a sent message, notify
                        // the sender so they know the file could not be processed.
                        if (payload.status === 'failed' && payload.messageId) {
                              notification.error({
                                    message: 'Xử lý media thất bại',
                                    description:
                                          'Một file đính kèm không thể xử lý được. ' +
                                          'Tin nhắn đã được gửi nhưng file không khả dụng. ' +
                                          (payload.error ? `Chi tiết: ${payload.error}` : ''),
                                    placement: 'topRight',
                                    duration: 0, // keep until dismissed
                              });
                        }
                  };

                  handlers.set(eventName, handler);
                  socket.on(eventName, handler);
            }

            // ── Catch-up polling ─────────────────────────────────────────────────────
            // `progress:{mediaId}` is only emitted to the uploader (emitToUser).
            // Conversation partners (user B) never receive the socket event, so we
            // poll GET /media/:id until the status reaches a terminal state.
            //
            // Also covers the sender-side race window where the socket event fires
            // before this effect's subscription is active.
            //
            // Strategy:
            //   • Fire immediately (catches already-READY inline media at zero cost).
            //   • If still processing, retry every POLL_INTERVAL_MS up to MAX_RETRIES.
            //   • Clean up all pending timers on effect teardown.
            const POLL_INTERVAL_MS = 3_000;
            const MAX_RETRIES = 20; // ~60 s max wait

            // Map mediaId -> cancel function so we can clean up on unmount.
            const pollCancels = new Map<string, () => void>();

            for (const mediaId of mediaIds) {
                  if (checkedIdsRef.current.has(mediaId)) continue;
                  checkedIdsRef.current.add(mediaId);

                  let cancelled = false;
                  let timerId: ReturnType<typeof setTimeout> | null = null;
                  let retries = 0;

                  const poll = () => {
                        // DEBUG: Log polling attempt
                        // console.log(`🔍 [MediaProgress] Polling media ${mediaId} (attempt ${retries + 1}/${MAX_RETRIES})`);

                        mediaService.getMedia(mediaId)
                              .then((result) => {
                                    if (cancelled) return;

                                    // DEBUG: Log poll result
                                    // console.log(`📊 [MediaProgress] Media ${mediaId} result:`, {
                                    //       status: result.processingStatus,
                                    //       hasThumb: !!result.thumbnailUrl,
                                    //       mediaType: result.mediaType,
                                    // });

                                    // Bug 2 fix: for VIDEO/IMAGE, READY is only truly terminal
                                    // once thumbnailUrl is populated. The worker adds the thumbnail
                                    // asynchronously after the backend marks the file READY.
                                    const needsThumb =
                                          result.processingStatus === 'READY' &&
                                          !result.thumbnailUrl &&
                                          (result.mediaType === 'VIDEO' || result.mediaType === 'IMAGE');

                                    if ((result.processingStatus === 'READY' && !needsThumb) || result.processingStatus === 'FAILED') {
                                          // DEBUG: Log completion
                                          // console.log(`✅ [MediaProgress] Media ${mediaId} processing complete:`, result.processingStatus);

                                          queryClientRef.current.setQueryData<MessagesInfiniteData>(
                                                queryKeyRef.current,
                                                (prev) => updateAttachmentInCache(prev, mediaId, {
                                                      status: result.processingStatus === 'READY' ? 'completed' : 'failed',
                                                      progress: result.processingStatus === 'READY' ? 100 : 0,
                                                      thumbnailUrl: result.thumbnailUrl ?? undefined,
                                                      // Pass cdnUrl so user B can actually display the image.
                                                      cdnUrl: result.cdnUrl,
                                                }),
                                          );
                                          // Remove from checkedIdsRef so if it re-enters pendingMediaIds
                                          // (shouldn't happen but defensive), polling can restart.
                                          checkedIdsRef.current.delete(mediaId);
                                          // Terminal state reached — stop polling.
                                    } else if (retries < MAX_RETRIES) {
                                          retries++;
                                          timerId = setTimeout(poll, POLL_INTERVAL_MS);
                                    }
                              })
                              .catch((err: unknown) => {
                                    // DEBUG: Log errors
                                    const status = (err as { response?: { status?: number } })?.response?.status;
                                    // console.log(`❌ [MediaProgress] Media ${mediaId} poll error (status: ${status}):`, err);

                                    // 403 = not the media owner (user B).
                                    // The backend now broadcasts progress:{mediaId} to all conversation
                                    // members, so stop polling and let the socket event handle it.
                                    // 404 = media deleted; also stop.
                                    if (status === 403 || status === 404 || cancelled || retries >= MAX_RETRIES) return;
                                    retries++;
                                    timerId = setTimeout(poll, POLL_INTERVAL_MS);
                              });
                  };

                  poll();
                  pollCancels.set(mediaId, () => {
                        cancelled = true;
                        if (timerId !== null) clearTimeout(timerId);
                  });
            }

            return () => {
                  for (const [eventName, handler] of handlers) {
                        socket.off(eventName, handler);
                  }
                  for (const cancel of pollCancels.values()) {
                        cancel();
                  }
            };
      }, [socket, isConnected, mediaIds]);
}
