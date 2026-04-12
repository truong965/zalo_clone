import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Image } from 'antd';
import {
      DownloadOutlined,
      RotateLeftOutlined,
      RotateRightOutlined,
      ZoomInOutlined,
      ZoomOutOutlined,
      LeftOutlined,
      RightOutlined,
      CloseOutlined,
} from '@ant-design/icons';
import { createPortal } from 'react-dom';
import type { RecentMediaItem } from '@/types/api';

interface MediaPreviewModalProps {
      isOpen: boolean;
      items: RecentMediaItem[];
      initialIndex: number;
      onClose: () => void;
}

// ── Stable toolbar — only re-renders when its own props change ──
interface ToolbarProps {
      scale: number;
      onDownload: () => void;
      onZoomOut: () => void;
      onZoomIn: () => void;
      onRotateLeft: () => void;
      onRotateRight: () => void;
}

function PreviewToolbar({ scale, onDownload, onZoomOut, onZoomIn, onRotateLeft, onRotateRight }: ToolbarProps) {
      return (
            <div className="flex gap-8 px-5 py-3 bg-[#333333] rounded-full items-center shadow-2xl">
                  <DownloadOutlined
                        className="text-white text-xl cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={onDownload}
                  />
                  <ZoomOutOutlined
                        className={`text-white text-xl transition-opacity ${scale <= 0.5 ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer hover:opacity-80'}`}
                        onClick={onZoomOut}
                  />
                  <ZoomInOutlined
                        className={`text-white text-xl transition-opacity ${scale >= 5 ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer hover:opacity-80'}`}
                        onClick={onZoomIn}
                  />
                  <RotateLeftOutlined
                        className="text-white text-xl cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={onRotateLeft}
                  />
                  <RotateRightOutlined
                        className="text-white text-xl cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={onRotateRight}
                  />
            </div>
      );
}

// ── Video overlay — fully isolated from Image.PreviewGroup, no Ant Modal ──
interface VideoOverlayProps {
      item: RecentMediaItem;
      currentIndex: number;
      total: number;
      onPrev: () => void;
      onNext: () => void;
      onClose: () => void;
      onDownload: () => void;
}

function VideoOverlay({ item, currentIndex, total, onPrev, onNext, onClose, onDownload }: VideoOverlayProps) {
      const [scale, setScale] = useState(1);
      const [rotate, setRotate] = useState(0);
      // Reset transform when item changes
      const prevMediaId = useRef(item.mediaId);
      if (prevMediaId.current !== item.mediaId) {
            prevMediaId.current = item.mediaId;
            // Can't call setState here but we use key on video element below to force reset
      }

      const handleZoomOut = useCallback(() => setScale((s) => Math.max(0.5, parseFloat((s - 0.2).toFixed(1)))), []);
      const handleZoomIn = useCallback(() => setScale((s) => Math.min(5, parseFloat((s + 0.2).toFixed(1)))), []);
      const handleRotateL = useCallback(() => setRotate((r) => r - 90), []);
      const handleRotateR = useCallback(() => setRotate((r) => r + 90), []);

      // Reset transforms on navigation
      const handlePrev = useCallback(() => { setScale(1); setRotate(0); onPrev(); }, [onPrev]);
      const handleNext = useCallback(() => { setScale(1); setRotate(0); onNext(); }, [onNext]);

      return createPortal(
            // Backdrop — matches Ant Design image preview backdrop exactly
            <div
                  className="fixed inset-0 z-[1000] flex items-center justify-center"
                  style={{
                        backgroundColor: 'rgba(0, 0, 0, 0.65)',
                        backdropFilter: 'blur(12px)',
                        WebkitBackdropFilter: 'blur(12px)',
                  }}
                  onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
            >
                  {/* Close button — top-right, white, clearly visible like image preview */}
                  <button
                        onClick={onClose}
                        className="absolute top-4 right-6 z-10 text-white/80 hover:text-white transition-colors flex items-center justify-center w-10 h-10 rounded-full hover:bg-white/10"
                        style={{ fontSize: 20 }}
                  >
                        <CloseOutlined />
                  </button>

                  {/* Counter — top-center */}
                  <div className="absolute top-6 left-1/2 -translate-x-1/2 text-white/60 text-sm select-none pointer-events-none">
                        {currentIndex + 1} / {total}
                  </div>

                  {/* Video — use item.mediaId as key so element is recreated on navigation, stopping previous playback */}
                  <div
                        className="relative flex items-center justify-center"
                        style={{
                              transform: `scale(${scale}) rotate(${rotate}deg)`,
                              transition: 'transform 0.2s ease-out',
                              maxWidth: '85vw',
                              maxHeight: '85vh',
                        }}
                  >
                        <video
                              key={item.mediaId}
                              src={item.cdnUrl ?? ''}
                              controls
                              autoPlay
                              className="max-w-full max-h-full rounded shadow-2xl"
                              style={{ maxWidth: '85vw', maxHeight: '85vh' }}
                        />
                  </div>

                  {/* Navigation arrows */}
                  {total > 1 && (
                        <>
                              <button
                                    onClick={handlePrev}
                                    className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white transition-colors p-3 rounded-full hover:bg-white/10"
                                    style={{ fontSize: 24 }}
                              >
                                    <LeftOutlined />
                              </button>
                              <button
                                    onClick={handleNext}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white transition-colors p-3 rounded-full hover:bg-white/10"
                                    style={{ fontSize: 24 }}
                              >
                                    <RightOutlined />
                              </button>
                        </>
                  )}

                  {/* Toolbar — bottom-center */}
                  <div className="absolute bottom-10 left-1/2 -translate-x-1/2">
                        <PreviewToolbar
                              scale={scale}
                              onDownload={onDownload}
                              onZoomOut={handleZoomOut}
                              onZoomIn={handleZoomIn}
                              onRotateLeft={handleRotateL}
                              onRotateRight={handleRotateR}
                        />
                  </div>
            </div>,
            document.body,
      );
}

// ── Main component ──
export function MediaPreviewModal({
      isOpen,
      items,
      initialIndex,
      onClose,
}: MediaPreviewModalProps) {
      const { t } = useTranslation();
      const [currentIndex, setCurrentIndex] = useState(initialIndex);

      // Memoize so the filter doesn't run on every parent re-render
      const visualItems = useMemo(
            () => items.filter((item) => item.messageType === 'IMAGE' || item.messageType === 'VIDEO'),
            [items],
      );

      // Sync index when modal opens
      useEffect(() => {
            if (isOpen) setCurrentIndex(initialIndex);
      }, [isOpen, initialIndex]);

      const currentItem = visualItems[currentIndex];
      const isVideo = currentItem?.messageType === 'VIDEO';

      const handlePrev = useCallback(
            () => setCurrentIndex((prev) => (prev > 0 ? prev - 1 : visualItems.length - 1)),
            [visualItems.length],
      );

      const handleNext = useCallback(
            () => setCurrentIndex((prev) => (prev < visualItems.length - 1 ? prev + 1 : 0)),
            [visualItems.length],
      );

      // Keyboard navigation
      useEffect(() => {
            if (!isOpen || visualItems.length <= 1) return;
            const onKeyDown = (e: KeyboardEvent) => {
                  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); handlePrev(); }
                  else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); handleNext(); }
                  else if (e.key === 'Escape') onClose();
            };
            window.addEventListener('keydown', onKeyDown);
            return () => window.removeEventListener('keydown', onKeyDown);
      }, [isOpen, visualItems.length, handlePrev, handleNext, onClose]);

      // Download handler — stable, no state dependency
      const handleDownload = useCallback(async () => {
            if (!currentItem) return;
            try {
                  const response = await fetch(currentItem.cdnUrl ?? '');
                  const blob = await response.blob();
                  const blobUrl = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = blobUrl;
                  a.download = currentItem.originalName;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(blobUrl);
            } catch (error) {
                  console.error('Failed to download media:', error);
            }
      }, [currentItem]);

      if (!isOpen || !currentItem) return null;

      // ── Video: custom portal overlay (no Ant Modal to avoid re-render overhead) ──
      if (isVideo) {
            return (
                  <VideoOverlay
                        item={currentItem}
                        currentIndex={currentIndex}
                        total={visualItems.length}
                        onPrev={handlePrev}
                        onNext={handleNext}
                        onClose={onClose}
                        onDownload={handleDownload}
                  />
            );
      }

      // ── Image: Ant Design Image.PreviewGroup (unchanged) ──
      const imageToolbar = (
            <div className="ant-image-preview-operations">
                  <div className="flex gap-8 px-5 py-3 bg-[#333333] rounded-full items-center shadow-2xl">
                        <DownloadOutlined
                              className="text-white text-xl cursor-pointer hover:opacity-80 transition-opacity"
                              onClick={handleDownload}
                              title={t('chat.messageList.actions.download')}
                        />
                        <ZoomOutOutlined className="text-white text-xl cursor-pointer hover:opacity-80 transition-opacity" />
                        <ZoomInOutlined className="text-white text-xl cursor-pointer hover:opacity-80 transition-opacity" />
                        <RotateLeftOutlined className="text-white text-xl cursor-pointer hover:opacity-80 transition-opacity" />
                        <RotateRightOutlined className="text-white text-xl cursor-pointer hover:opacity-80 transition-opacity" />
                  </div>
            </div>
      );

      return (
            <>
                  {isOpen && !isVideo && createPortal(
                        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[2001] text-white/60 text-sm select-none pointer-events-none">
                              {currentIndex + 1} / {visualItems.length}
                        </div>,
                        document.body,
                  )}
                  <Image.PreviewGroup
                        preview={{
                              visible: isOpen,
                              onVisibleChange: (val) => { if (!val) onClose(); },
                              current: currentIndex,
                              onChange: (current) => setCurrentIndex(current),
                              toolbarRender: () => imageToolbar,
                              countRender: () => null,
                        }}
                        items={visualItems.map((item) => ({ src: item.cdnUrl ?? '' }))}
                  >
                        <div className="hidden">
                              {visualItems.map((item) => (
                                    <Image key={item.mediaId} src={item.cdnUrl ?? ''} />
                              ))}
                        </div>
                  </Image.PreviewGroup>
            </>
      );
}