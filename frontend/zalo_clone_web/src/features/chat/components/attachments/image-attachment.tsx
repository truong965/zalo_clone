/**
 * ImageAttachment — Renders image media attachments in message bubbles.
 *
 * Handles all states:
 *   - Local preview (optimistic, before server URL available)
 *   - Processing (blur + spinner overlay)
 *   - Ready (thumbnailUrl/cdnUrl clickable)  
 *   - Failed (error overlay)
 *
 * Plan §8: Image grid thumbnails, local preview + processing overlay.
 * Rules: composition-patterns (single-purpose component), react-best-practices.
 */

import { cn } from '@/lib/utils';
import { MediaProcessingStatus } from '@/types/api';
import type { MessageMediaAttachmentItem } from '@/types/api';
import { ProcessingOverlay } from './processing-overlay';

interface ImageAttachmentProps {
      attachment: MessageMediaAttachmentItem;
      /** Additional CSS classes for the root container */
      className?: string;
      /**
       * Pass true when this is the only image in a message.
       * Renders at natural dimensions (up to a cap) instead of the fixed
       * h-32 / w-full grid thumbnail.
       */
      isSingle?: boolean;
}

const READY_STATUSES = new Set<string>([MediaProcessingStatus.READY]);
const FAILED_STATUSES = new Set<string>([MediaProcessingStatus.FAILED]);

export function ImageAttachment({ attachment, className, isSingle = false }: ImageAttachmentProps) {
      const isReady = READY_STATUSES.has(attachment.processingStatus);
      const isFailed = FAILED_STATUSES.has(attachment.processingStatus);

      const src = attachment.thumbnailUrl
            ?? attachment.optimizedUrl
            ?? attachment.cdnUrl
            ?? attachment._localUrl
            ?? undefined;

      const fullSrc = attachment.cdnUrl
            ?? attachment.optimizedUrl
            ?? attachment.thumbnailUrl
            ?? attachment._localUrl
            ?? undefined;

      const isProcessing = !isReady && !isFailed;

      // Single-image: let the image dictate its own size (capped at a readable max).
      // Grid thumbnails: fixed 128px height so the 2-col grid stays uniform.
      const imgClass = isSingle
            ? cn('max-h-[280px] w-auto max-w-full object-contain block', isProcessing && 'opacity-60 blur-[1px]')
            : cn('h-32 w-full object-cover', isProcessing && 'opacity-60 blur-[1px]');

      return (
            <div
                  className={cn(
                        'relative overflow-hidden rounded-lg bg-gray-100',
                        isSingle && 'inline-block',
                        className,
                  )}
            >
                  {src ? (
                        isReady && fullSrc ? (
                              <a
                                    href={fullSrc}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="block"
                              >
                                    <img
                                          src={src}
                                          alt={attachment.originalName}
                                          loading="lazy"
                                          className={imgClass}
                                    />
                              </a>
                        ) : (
                              <img
                                    src={src}
                                    alt={attachment.originalName}
                                    loading="lazy"
                                    className={cn(
                                          'h-32 w-full object-cover',
                                          isProcessing && 'opacity-60 blur-[1px]',
                                    )}
                              />
                        )
                  ) : (
                        <div className={cn(
                              'flex items-center justify-center text-gray-400',
                              isSingle ? 'h-24 w-40' : 'h-32 w-full',
                        )}>
                              <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                                    <rect x="3" y="3" width="18" height="18" rx="2" />
                                    <circle cx="8.5" cy="8.5" r="1.5" />
                                    <path d="M21 15l-5-5L5 21" />
                              </svg>
                        </div>
                  )}

                  {isProcessing && <ProcessingOverlay />}

                  {isFailed && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                              <span className="text-xs text-red-300">Lỗi xử lý</span>
                        </div>
                  )}
            </div>
      );
}
