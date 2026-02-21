/**
 * DocumentAttachment — Renders document/file media attachments in message bubbles.
 *
 * Displays: file icon + name + size + download link when ready.
 *
 * Rules: composition-patterns, react-best-practices.
 */

import { cn } from '@/lib/utils';
import { MediaProcessingStatus } from '@/types/api';
import type { MessageMediaAttachmentItem } from '@/types/api';
import { FileOutlined, FilePdfOutlined, FileExcelOutlined, FileWordOutlined, DownloadOutlined } from '@ant-design/icons';
import { formatBytes } from '@/lib/utils';

interface DocumentAttachmentProps {
      attachment: MessageMediaAttachmentItem;
      className?: string;
}

/** Map common MIME types to specific icons */
function getFileIcon(mimeType?: string) {
      if (!mimeType) return <FileOutlined className="text-2xl text-gray-500" />;

      if (mimeType === 'application/pdf') {
            return <FilePdfOutlined className="text-2xl text-red-500" />;
      }
      if (mimeType.includes('word') || mimeType.includes('document')) {
            return <FileWordOutlined className="text-2xl text-blue-500" />;
      }
      if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) {
            return <FileExcelOutlined className="text-2xl text-green-600" />;
      }
      return <FileOutlined className="text-2xl text-gray-500" />;
}

export function DocumentAttachment({ attachment, className }: DocumentAttachmentProps) {
      const isReady = attachment.processingStatus === MediaProcessingStatus.READY;
      const isFailed = attachment.processingStatus === MediaProcessingStatus.FAILED;
      const isProcessing = !isReady && !isFailed;

      return (
            <div
                  className={cn(
                        'relative flex items-center gap-3 rounded-lg bg-gray-100 p-3 min-w-[200px]',
                        className,
                  )}
            >
                  <div className="flex-shrink-0">
                        {getFileIcon(attachment.mimeType)}
                  </div>

                  <div className="flex-1 overflow-hidden">
                        <p className="text-sm font-medium truncate" title={attachment.originalName}>
                              {attachment.originalName}
                        </p>
                        <p className="text-xs text-gray-500">
                              {attachment.size > 0 ? formatBytes(attachment.size) : ''}
                              {isFailed && <span className="ml-1 text-red-500">· Lỗi xử lý</span>}
                              {isProcessing && <span className="ml-1 text-gray-400">· Đang xử lý...</span>}
                        </p>
                  </div>

                  {isReady && attachment.cdnUrl && (
                        <a
                              href={attachment.cdnUrl}
                              download={attachment.originalName}
                              target="_blank"
                              rel="noreferrer"
                              className="flex-shrink-0 text-gray-500 hover:text-blue-500 transition-colors"
                              title="Tải xuống"
                        >
                              <DownloadOutlined className="text-lg" />
                        </a>
                  )}

                  {/* Linear progress bar when processing */}
                  {isProcessing && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-200 overflow-hidden">
                              <div className="h-full w-1/3 bg-blue-400 animate-pulse rounded-full" />
                        </div>
                  )}
            </div>
      );
}
