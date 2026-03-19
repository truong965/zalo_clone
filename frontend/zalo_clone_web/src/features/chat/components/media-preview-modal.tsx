import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Modal } from 'antd';
import {
      DownloadOutlined,
      RotateLeftOutlined,
      RotateRightOutlined,
      ZoomInOutlined,
      ZoomOutOutlined,
} from '@ant-design/icons';
import type { RecentMediaItem } from '@/types/api';

interface MediaPreviewModalProps {
      isOpen: boolean;
      items: RecentMediaItem[];
      initialIndex: number;
      onClose: () => void;
}

export function MediaPreviewModal({
      isOpen,
      items,
      initialIndex,
      onClose,
}: MediaPreviewModalProps) {
      const { t } = useTranslation();
      const [currentIndex, setCurrentIndex] = useState(initialIndex);

      // Reset to initial index when modal opens
      useEffect(() => {
            if (isOpen) {
                  setCurrentIndex(initialIndex);
            }
      }, [isOpen, initialIndex]);

      const currentItem = items[currentIndex];
      const isVideo = currentItem?.messageType === 'VIDEO';
      const visualItems = items.filter(
            (item) => item.messageType === 'IMAGE' || item.messageType === 'VIDEO',
      );

      // ── Keyboard Navigation for up/down arrows ──
      const handleKeyDown = useCallback(
            (e: KeyboardEvent) => {
                  if (!isOpen || visualItems.length <= 1) return;
                  if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
                        e.preventDefault();
                        setCurrentIndex((prev) => (prev > 0 ? prev - 1 : visualItems.length - 1));
                  } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
                        e.preventDefault();
                        setCurrentIndex((prev) => (prev < visualItems.length - 1 ? prev + 1 : 0));
                  }
            },
            [isOpen, visualItems.length],
      );

      useEffect(() => {
            window.addEventListener('keydown', handleKeyDown);
            return () => window.removeEventListener('keydown', handleKeyDown);
      }, [handleKeyDown]);

      // ── Download Handler ──
      const handleDownload = async (url: string, filename: string) => {
            try {
                  const response = await fetch(url);
                  const blob = await response.blob();
                  const blobUrl = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = blobUrl;
                  a.download = filename;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(blobUrl);
            } catch (error) {
                  console.error('Failed to download media:', error);
            }
      };

      if (!isOpen || !currentItem) return null;

      if (isVideo) {
            return (
                  <Modal
                        open={isOpen}
                        onCancel={onClose}
                        footer={null}
                        destroyOnClose
                        width={800}
                        centered
                        className="bg-black/90 p-0"
                        styles={{ body: { padding: 0, backgroundColor: '#000' } }}
                        closeIcon={<span className="text-white bg-black/50 rounded-full w-8 h-8 flex items-center justify-center">✕</span>}
                        afterOpenChange={(visible) => {
                              // Reset index if needed when modal actually closes
                              if (!visible) setCurrentIndex(initialIndex);
                        }}
                  >
                        <div className="relative w-full h-[80vh] flex flex-col items-center justify-center">
                              <video
                                    src={currentItem.cdnUrl ?? ''}
                                    controls
                                    autoPlay
                                    className="max-w-full max-h-full"
                              />
                        </div>
                        {/* Custom Toolbar overlay for Video (just Download and index) */}
                        <div className="absolute top-4 left-4 text-white text-sm bg-black/50 px-3 py-1 rounded-full">
                              {currentIndex + 1} / {visualItems.length}
                        </div>
                        <div className="absolute top-4 right-16 flex gap-4">
                              <button
                                    onClick={() => handleDownload(currentItem.cdnUrl ?? '', currentItem.originalName)}
                                    className="text-white bg-black/50 hover:bg-black/70 rounded-full w-8 h-8 flex items-center justify-center transition-colors"
                                    title={t('chat.messageList.actions.download')}
                              >
                                    <DownloadOutlined />
                              </button>
                        </div>
                  </Modal>
            );
      }

      return (
            <Image.PreviewGroup
                  preview={{
                        visible: isOpen,
                        onVisibleChange: (val) => {
                              if (!val) onClose();
                        },
                        current: currentIndex,
                        onChange: (current) => setCurrentIndex(current),
                        toolbarRender: (
                              _,
                              {
                                    transform: { scale },
                                    actions: { onZoomOut, onZoomIn, onRotateLeft, onRotateRight },
                              },
                        ) => (
                              <div className="ant-image-preview-operations flex gap-6 px-6 py-4 bg-black/60 rounded-full items-center">
                                    <DownloadOutlined
                                          className="text-white text-xl cursor-pointer hover:text-gray-300 transition-colors"
                                          onClick={() =>
                                                handleDownload(items[currentIndex].cdnUrl ?? '', items[currentIndex].originalName)
                                          }
                                          title={t('chat.messageList.actions.download')}
                                    />
                                    <ZoomOutOutlined
                                          disabled={scale === 1}
                                          className={`text-white text-xl cursor-pointer hover:text-gray-300 transition-colors ${scale === 1 ? 'opacity-50 cursor-not-allowed' : ''}`}
                                          onClick={onZoomOut}
                                          title="Thu nhỏ"
                                    />
                                    <ZoomInOutlined
                                          disabled={scale === 50}
                                          className={`text-white text-xl cursor-pointer hover:text-gray-300 transition-colors ${scale === 50 ? 'opacity-50 cursor-not-allowed' : ''}`}
                                          onClick={onZoomIn}
                                          title="Phóng to"
                                    />
                                    <RotateLeftOutlined
                                          className="text-white text-xl cursor-pointer hover:text-gray-300 transition-colors"
                                          onClick={onRotateLeft}
                                          title="Xoay trái"
                                    />
                                    <RotateRightOutlined
                                          className="text-white text-xl cursor-pointer hover:text-gray-300 transition-colors"
                                          onClick={onRotateRight}
                                          title="Xoay phải"
                                    />
                              </div>
                        ),
                  }}
                  items={visualItems.map((item) => ({
                        src: item.cdnUrl ?? '',
                  }))}
            >
                  {/* Hidden images required by Image.PreviewGroup but we trigger it programmatically */}
                  <div className="hidden">
                        {visualItems.map((item) => (
                              <Image key={item.mediaId} src={item.cdnUrl ?? ''} />
                        ))}
                  </div>
            </Image.PreviewGroup>
      );
}
