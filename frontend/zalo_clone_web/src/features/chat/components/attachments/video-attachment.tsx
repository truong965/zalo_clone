/**
 * VideoAttachment — Renders video media attachments in message bubbles.
 *
 * Design decision (§9 confirmed):
 *   - processingStatus = PROCESSING → video-file icon placeholder
 *   - processingStatus = READY      → real thumbnail + play button overlay
 *
 * Rules: composition-patterns, react-best-practices.
 */

import { cn } from '@/lib/utils';
import { MediaProcessingStatus } from '@/types/api';
import type { MessageMediaAttachmentItem } from '@/types/api';
import { ProcessingOverlay } from './processing-overlay';
import { PlayCircleOutlined, VideoCameraOutlined } from '@ant-design/icons';

interface VideoAttachmentProps {
      attachment: MessageMediaAttachmentItem;
      className?: string;
}

export function VideoAttachment({ attachment, className }: VideoAttachmentProps) {
      const isReady = attachment.processingStatus === MediaProcessingStatus.READY;
      const isFailed = attachment.processingStatus === MediaProcessingStatus.FAILED;

      // Use thumbnail from server when READY, or localUrl for optimistic preview
      const thumbSrc = isReady
            ? (attachment.thumbnailUrl ?? attachment.cdnUrl ?? attachment._localUrl ?? undefined)
            : (attachment._localUrl ?? undefined);

      const isProcessing = !isReady && !isFailed;

      // Duration formatting (seconds → mm:ss)
      const durationLabel = attachment.duration != null
            ? `${Math.floor(attachment.duration / 60)}:${String(Math.floor(attachment.duration % 60)).padStart(2, '0')}`
            : null;

      return (
            <div
                  className={cn(
                        'relative w-48 h-28 overflow-hidden rounded-lg bg-gray-800',
                        className,
                  )}
            >
                  {thumbSrc ? (
                        <img
                              src={thumbSrc}
                              alt={attachment.originalName}
                              loading="lazy"
                              className={cn(
                                    'h-full w-full object-cover',
                                    isProcessing && 'opacity-50 blur-[1px]',
                              )}
                        />
                  ) : (
                        /* Fallback: video-file icon when no thumbnail available */
                        <div className="flex h-full w-full items-center justify-center">
                              <VideoCameraOutlined className="text-4xl text-gray-400" />
                        </div>
                  )}

                  {/* Play button when ready */}
                  {isReady && attachment.cdnUrl && (
                        <a
                              href={attachment.cdnUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="absolute inset-0 flex items-center justify-center"
                        >
                              <PlayCircleOutlined className="text-white text-3xl drop-shadow-lg" />
                        </a>
                  )}

                  {/* Processing spinner */}
                  {isProcessing && <ProcessingOverlay />}

                  {/* Failed state */}
                  {isFailed && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                              <span className="text-xs text-red-300">Lỗi xử lý video</span>
                        </div>
                  )}

                  {/* Duration badge */}
                  {durationLabel && (
                        <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                              {durationLabel}
                        </span>
                  )}
            </div>
      );
}
