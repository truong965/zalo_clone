/**
 * DocumentAttachment — Renders document/file media attachments in message bubbles.
 *
 * Displays: file icon + name + size + download link when ready.
 *
 * Rules: composition-patterns, react-best-practices.
 */

import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { MediaProcessingStatus } from '@/types/api';
import type { MessageMediaAttachmentItem } from '@/types/api';
import {
      FileOutlined,
      FilePdfOutlined,
      FileExcelOutlined,
      FileWordOutlined,
      FilePptOutlined,
      FileZipOutlined,
      FileTextOutlined,
      AudioOutlined,
      CodeOutlined,
      DownloadOutlined,
} from '@ant-design/icons';
import { formatBytes } from '@/lib/utils';
import { useState } from 'react';
import { FileUtils } from '@/utils/file.utils';
import { DocumentPreviewModal, canPreviewDocument } from '../document-preview-modal';

interface DocumentAttachmentProps {
      attachment: MessageMediaAttachmentItem;
      className?: string;
}

interface FileIconConfig {
      icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
      color: string;
      bg: string;
}

function getFileIconConfig(fileName: string, mimeType?: string | null): FileIconConfig {
      const ext = FileUtils.getExtension(fileName).toLowerCase();

      if (ext === 'pdf' || mimeType === 'application/pdf')
            return { icon: FilePdfOutlined, color: '#E53E3E', bg: '#FFF5F5' };

      if (ext === 'doc' || ext === 'docx')
            return { icon: FileWordOutlined, color: '#2B6CB0', bg: '#EBF8FF' };

      if (ext === 'xls' || ext === 'xlsx' || ext === 'csv')
            return { icon: FileExcelOutlined, color: '#276749', bg: '#F0FFF4' };

      if (ext === 'ppt' || ext === 'pptx')
            return { icon: FilePptOutlined, color: '#C05621', bg: '#FFFAF0' };

      if (ext === 'zip' || ext === 'rar' || ext === '7z')
            return { icon: FileZipOutlined, color: '#744210', bg: '#FFFFF0' };

      if (ext === 'mp3' || ext === 'wav' || ext === 'm4a' || mimeType?.startsWith('audio/'))
            return { icon: AudioOutlined, color: '#553C9A', bg: '#FAF5FF' };

      if (['js', 'ts', 'jsx', 'tsx', 'py', 'json', 'html', 'css', 'sql'].includes(ext))
            return { icon: CodeOutlined, color: '#D69E2E', bg: '#FFFFF0' };

      if (ext === 'txt' || ext === 'md' || ext === 'log' || mimeType?.startsWith('text/'))
            return { icon: FileTextOutlined, color: '#4A5568', bg: '#F7FAFC' };

      return { icon: FileOutlined, color: '#718096', bg: '#F7FAFC' };
}

export function DocumentAttachment({ attachment, className }: DocumentAttachmentProps) {
      const { t } = useTranslation();
      const [isDownloading, setIsDownloading] = useState(false);
      const [isPreviewOpen, setIsPreviewOpen] = useState(false);
      const isReady = attachment.processingStatus === MediaProcessingStatus.READY;
      const isFailed = attachment.processingStatus === MediaProcessingStatus.FAILED;
      const isProcessing = !isReady && !isFailed;
      const previewable = canPreviewDocument(attachment.originalName, attachment.mimeType);

      const handleDownload = async (e: React.MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
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

      const { icon: Icon, color, bg } = getFileIconConfig(attachment.originalName, attachment.mimeType);

      return (
            <>
                  <div
                        className={cn(
                              'relative flex items-center gap-3 rounded-lg bg-gray-50 border border-gray-100 p-3 min-w-[220px] transition-colors hover:bg-white',
                              previewable && isReady && attachment.cdnUrl ? 'cursor-pointer' : '',
                              className,
                        )}
                        onClick={() => {
                              if (previewable && isReady && attachment.cdnUrl) {
                                    setIsPreviewOpen(true);
                              }
                        }}
                  >
                        <div
                              className="w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0"
                              style={{ backgroundColor: bg }}
                        >
                              <Icon
                                    className="text-2xl"
                                    style={{ color }}
                              />
                        </div>

                        <div className="flex-1 overflow-hidden">
                              <p className="text-sm font-medium truncate" title={attachment.originalName}>
                                    {attachment.originalName}
                              </p>
                              <p className="text-xs text-gray-500">
                                    {attachment.size > 0 ? formatBytes(attachment.size) : ''}
                                    {isFailed && <span className="ml-1 text-red-500">· {t('conversation.attachments.processingError')}</span>}
                                    {isProcessing && <span className="ml-1 text-gray-400">· {t('conversation.attachments.processing')}</span>}
                              </p>
                        </div>

                        {isReady && attachment.cdnUrl && (
                              <a
                                    href={attachment.cdnUrl}
                                    onClick={handleDownload}
                                    title={t('conversation.attachments.download')}
                                    className={`flex-shrink-0 transition-colors ${isDownloading ? 'text-blue-300 cursor-not-allowed' : 'text-gray-500 hover:text-blue-500'}`}
                              >
                                    <DownloadOutlined className={isDownloading ? 'text-lg animate-pulse' : 'text-lg'} />
                              </a>
                        )}

                        {/* Linear progress bar when processing */}
                        {isProcessing && (
                              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-200 overflow-hidden">
                                    <div className="h-full w-1/3 bg-blue-400 animate-pulse rounded-full" />
                              </div>
                        )}
                  </div>

                  <DocumentPreviewModal
                        open={isPreviewOpen}
                        onClose={() => setIsPreviewOpen(false)}
                        fileName={attachment.originalName}
                        fileUrl={attachment.cdnUrl}
                        mimeType={attachment.mimeType}
                  />
            </>
      );
}
