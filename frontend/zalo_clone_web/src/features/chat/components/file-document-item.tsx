import { useState, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Typography } from 'antd';
import {
      DownloadOutlined,
      FilePdfOutlined,
      FileWordOutlined,
      FileExcelOutlined,
      FilePptOutlined,
      FileZipOutlined,
      FileTextOutlined,
      AudioOutlined,
      CodeOutlined,
      FileOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { FileUtils } from '@/utils/file.utils';
import { DocumentPreviewModal, canPreviewDocument } from './document-preview-modal';

const { Text } = Typography;

interface SharedFileItemProps {
      originalName: string;
      sizeBytes: number;
      createdAt: string;
      cdnUrl?: string | null;
      mimeType?: string | null;
      extraLine1?: string;
      extraLine2?: string;
}

export function formatFileSize(bytes: number): string {
      if (bytes === 0) return '0 B';
      const units = ['B', 'KB', 'MB', 'GB'];
      const k = 1024;
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      const value = bytes / Math.pow(k, i);
      return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function isBrowserViewable(mimeType?: string | null): boolean {
      if (!mimeType) return false;
      return mimeType === 'application/pdf' || mimeType.startsWith('text/');
}

// ─── Icon config: { icon component, color } grouped by category ───────────────
interface FileIconConfig {
      icon: React.ComponentType<{ className?: string }>;
      color: string;
      bg: string;
}

function getFileIconConfig(extension: string, mimeType?: string | null): FileIconConfig {
      const ext = extension.toLowerCase();

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

// ─── File Icon Component ───────────────────────────────────────────────────────
// Pure display component — no state, memoized
const FileTypeIcon = memo(function FileTypeIcon({
      extension,
      mimeType,
}: {
      extension: string;
      mimeType?: string | null;
}) {
      const { icon: Icon, color, bg } = getFileIconConfig(extension, mimeType);

      return (
            <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: bg }}
            >
                  <Icon
                        className="text-[18px]"
                        // @ts-ignore — antd icons accept style
                        style={{ color }}
                  />
            </div>
      );
});

// ─── Main Component ────────────────────────────────────────────────────────────
export const FileDocumentItem = memo(function FileDocumentItem({
      originalName,
      sizeBytes,
      createdAt,
      cdnUrl,
      mimeType,
      extraLine1,
      extraLine2,
}: SharedFileItemProps) {
      const { t } = useTranslation();
      const [downloading, setDownloading] = useState(false);
      const [isPreviewOpen, setIsPreviewOpen] = useState(false);
      const viewable = isBrowserViewable(mimeType) || canPreviewDocument(originalName, mimeType);
      const extension = FileUtils.getExtension(originalName);

      const handleDownload = async (e: React.MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();
            if (!cdnUrl || downloading) return;

            try {
                  setDownloading(true);
                  const response = await fetch(cdnUrl);
                  const blob = await response.blob();
                  const blobUrl = URL.createObjectURL(blob);

                  const a = document.createElement('a');
                  a.href = blobUrl;
                  a.download = originalName;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(blobUrl);
            } catch (error) {
                  console.error('Download failed:', error);
            } finally {
                  setDownloading(false);
            }
      };

      const handleItemClick = () => {
            if (!viewable || !cdnUrl) return;

            if (canPreviewDocument(originalName, mimeType)) {
                  setIsPreviewOpen(true);
                  return;
            }

            window.open(cdnUrl, '_blank');
      };
      return (
            <>
                  <div
                        className={`flex items-center gap-3 px-3 py-2 transition-colors group ${viewable ? 'hover:bg-gray-50 cursor-pointer' : ''
                              }`}
                        onClick={viewable ? handleItemClick : undefined}
                  >
                        <FileTypeIcon extension={extension} mimeType={mimeType} />

                        <div className="flex-1 min-w-0">
                              <Text strong className="text-sm text-gray-800 block truncate pr-2">
                                    {originalName}
                              </Text>
                              <Text className="text-[11px] text-gray-400 block">
                                    {formatFileSize(sizeBytes)} · {dayjs(createdAt).format('DD/MM/YYYY')}
                                    {extraLine1 && ` · ${extraLine1}`}
                              </Text>
                              {extraLine2 && (
                                    <Text className="text-[11px] text-gray-400 block truncate">
                                          {extraLine2}
                                    </Text>
                              )}
                        </div>

                        <button
                              onClick={handleDownload}
                              disabled={downloading}
                              className={`flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full transition-colors opacity-0 group-hover:opacity-100 ${downloading
                                    ? 'text-blue-400 bg-blue-50 opacity-100 cursor-not-allowed'
                                    : 'text-gray-500 hover:text-blue-600 hover:bg-black/5'
                                    }`}
                              title={t('chat.infoSidebar.media')}
                        >
                              <DownloadOutlined className={downloading ? 'text-lg animate-pulse' : 'text-lg'} />
                        </button>
                  </div>

                  <DocumentPreviewModal
                        open={isPreviewOpen}
                        onClose={() => setIsPreviewOpen(false)}
                        fileName={originalName}
                        fileUrl={cdnUrl}
                        mimeType={mimeType}
                  />
            </>
      );
});
