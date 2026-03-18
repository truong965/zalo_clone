/**
 * AudioAttachment — Renders audio media attachments in message bubbles.
 *
 * Design decision (§9 confirmed): HTML5 native `<audio controls>`, no custom player.
 *
 * Rules: composition-patterns, react-best-practices.
 */

import { cn } from '@/lib/utils';
import { MediaProcessingStatus } from '@/types/api';
import type { MessageMediaAttachmentItem } from '@/types/api';
import { CustomerServiceOutlined, DownloadOutlined } from '@ant-design/icons';
import { formatBytes } from '@/lib/utils';
import { useState } from 'react';

interface AudioAttachmentProps {
      attachment: MessageMediaAttachmentItem;
      className?: string;
}

export function AudioAttachment({ attachment, className }: AudioAttachmentProps) {
      const [isDownloading, setIsDownloading] = useState(false);
      const isReady = attachment.processingStatus === MediaProcessingStatus.READY;
      const isFailed = attachment.processingStatus === MediaProcessingStatus.FAILED;

      // Use cdnUrl when ready, localUrl for optimistic preview
      const audioSrc = isReady
            ? (attachment.cdnUrl ?? attachment._localUrl ?? undefined)
            : (attachment._localUrl ?? undefined);

      const handleDownload = async (e: React.MouseEvent) => {
            e.preventDefault();
            if (!attachment.cdnUrl || isDownloading) return;

            try {
                  setIsDownloading(true);
                  const response = await fetch(attachment.cdnUrl);
                  const blob = await response.blob();
                  const blobUrl = URL.createObjectURL(blob);
                  
                  const a = document.createElement('a');
                  a.href = blobUrl;
                  a.download = attachment.originalName;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  
                  URL.revokeObjectURL(blobUrl);
            } catch (error) {
                  console.error('Download failed:', error);
            } finally {
                  setIsDownloading(false);
            }
      };

      return (
            <div
                  className={cn(
                        'flex flex-col gap-1 rounded-lg bg-gray-100 p-2 min-w-[220px]',
                        className,
                  )}
            >
                  <div className="flex items-center gap-2">
                        <CustomerServiceOutlined className="text-base text-gray-500 flex-shrink-0" />
                        <p className="text-xs text-gray-600 truncate flex-1">{attachment.originalName}</p>
                        {attachment.size > 0 && (
                              <span className="text-[10px] text-gray-400 flex-shrink-0">
                                    {formatBytes(attachment.size)}
                              </span>
                        )}
                  </div>

                  {audioSrc ? (
                        <div className="flex items-center gap-2 mt-1">
                              <audio controls src={audioSrc} className="w-full h-8" preload="metadata">
                                    <track kind="captions" />
                              </audio>
                              {attachment.cdnUrl && (
                                    <button
                                          onClick={handleDownload}
                                          disabled={isDownloading}
                                          className={`flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full transition-colors ${isDownloading ? 'text-blue-300 cursor-not-allowed bg-blue-50' : 'text-gray-500 hover:text-blue-600 hover:bg-black/5'}`}
                                          title="Tải xuống"
                                    >
                                          <DownloadOutlined className={isDownloading ? "text-lg animate-pulse" : "text-lg"} />
                                    </button>
                              )}
                        </div>
                  ) : isFailed ? (
                        <div className="text-xs text-red-500">Lỗi xử lý audio</div>
                  ) : (
                        <div className="flex items-center gap-1.5 text-xs text-gray-400">
                              <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                              </svg>
                              <span>Đang xử lý...</span>
                        </div>
                  )}
            </div>
      );
}
