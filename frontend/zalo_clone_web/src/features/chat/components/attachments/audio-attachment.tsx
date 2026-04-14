/**
 * AudioAttachment — Renders audio media attachments in message bubbles.
 *
 * Custom lightweight audio player: play/pause + duration + waveform.
 *
 * Rules: composition-patterns, react-best-practices.
 */

import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { MediaProcessingStatus } from '@/types/api';
import type { MessageMediaAttachmentItem } from '@/types/api';
import { CustomerServiceOutlined, DownloadOutlined } from '@ant-design/icons';
import { formatBytes } from '@/lib/utils';
import { useEffect, useRef, useState } from 'react';
import { getFullUrl } from '@/utils/url';

const AUDIO_BAR_HEIGHTS = [6, 10, 7, 13, 9, 16, 14, 11, 8, 10, 7];

interface AudioAttachmentProps {
      attachment: MessageMediaAttachmentItem;
      className?: string;
}

function parseDurationFromFileName(fileName?: string | null): number {
      if (!fileName) return 0;
      const match = fileName.match(/_(\d+)s(?:\.[A-Za-z0-9]+)?$/i);
      if (!match) return 0;
      const seconds = Number(match[1]);
      return Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
}

export function AudioAttachment({ attachment, className }: AudioAttachmentProps) {
      const { t } = useTranslation();
      const durationFromName = parseDurationFromFileName(attachment.originalName);
      const [isDownloading, setIsDownloading] = useState(false);
      const [isPlaying, setIsPlaying] = useState(false);
      const [duration, setDuration] = useState(attachment.duration ?? durationFromName);
      const [playableSrc, setPlayableSrc] = useState<string | undefined>(undefined);
      const audioRef = useRef<HTMLAudioElement | null>(null);
      const blobUrlRef = useRef<string | null>(null);
      const durationResolvedRef = useRef(false);
      const isReady = attachment.processingStatus === MediaProcessingStatus.READY;
      const isFailed = attachment.processingStatus === MediaProcessingStatus.FAILED;

      // Use cdnUrl when ready, localUrl for optimistic preview
      const audioSrc = isReady
            ? (attachment.cdnUrl ?? attachment._localUrl ?? undefined)
            : (attachment._localUrl ?? undefined);
      const resolvedAudioSrc = getFullUrl(audioSrc);
      const resolvedDownloadUrl = getFullUrl(attachment.cdnUrl);

      useEffect(() => {
            setPlayableSrc(resolvedAudioSrc);
      }, [resolvedAudioSrc]);

      useEffect(() => {
            return () => {
                  if (blobUrlRef.current) {
                        URL.revokeObjectURL(blobUrlRef.current);
                        blobUrlRef.current = null;
                  }
            };
      }, []);

      useEffect(() => {
            setIsPlaying(false);
            setDuration(attachment.duration ?? durationFromName);
            durationResolvedRef.current = false;
      }, [resolvedAudioSrc, attachment.duration, durationFromName]);

      useEffect(() => {
            const audioEl = audioRef.current;
            if (!audioEl) return;

            const handleLoadedMetadata = () => {
                  if (Number.isFinite(audioEl.duration) && audioEl.duration > 0) {
                        durationResolvedRef.current = true;
                        setDuration(audioEl.duration);
                        return;
                  }

                  if (durationResolvedRef.current) return;

                  // Some mobile-recorded M4A files can play but expose Infinity/NaN duration
                  // until we force a one-time seek to the tail.
                  const originalTime = audioEl.currentTime;
                  audioEl.currentTime = 1e10;

                  const handleDurationProbe = () => {
                        if (Number.isFinite(audioEl.duration) && audioEl.duration > 0) {
                              durationResolvedRef.current = true;
                              setDuration(audioEl.duration);
                        }
                        audioEl.currentTime = originalTime;
                        audioEl.removeEventListener('timeupdate', handleDurationProbe);
                  }

                  audioEl.addEventListener('timeupdate', handleDurationProbe);
            };
            const handlePlay = () => setIsPlaying(true);
            const handlePause = () => setIsPlaying(false);
            const handleEnded = () => setIsPlaying(false);
            const handleError = () => setIsPlaying(false);

            audioEl.addEventListener('loadedmetadata', handleLoadedMetadata);
            audioEl.addEventListener('play', handlePlay);
            audioEl.addEventListener('pause', handlePause);
            audioEl.addEventListener('ended', handleEnded);
            audioEl.addEventListener('error', handleError);

            return () => {
                  audioEl.removeEventListener('loadedmetadata', handleLoadedMetadata);
                  audioEl.removeEventListener('play', handlePlay);
                  audioEl.removeEventListener('pause', handlePause);
                  audioEl.removeEventListener('ended', handleEnded);
                  audioEl.removeEventListener('error', handleError);
            };
      }, [resolvedAudioSrc]);

      const formatTime = (seconds: number) => {
            const safeSeconds = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
            const mins = Math.floor(safeSeconds / 60);
            const secs = safeSeconds % 60;
            return `${mins}:${String(secs).padStart(2, '0')}`;
      };

      const handleTogglePlayPause = async () => {
            const audioEl = audioRef.current;
            if (!audioEl || !playableSrc) return;

            if (isPlaying) {
                  setIsPlaying(false);
                  audioEl.pause();
                  return;
            }

            try {
                  setIsPlaying(true);
                  await audioEl.play();
            } catch (error) {
                  // Fallback: fetch audio as Blob then retry.
                  if (error instanceof DOMException && error.name === 'NotSupportedError' && resolvedAudioSrc) {
                        try {
                              const response = await fetch(resolvedAudioSrc);
                              if (!response.ok) throw new Error(`Audio fetch failed: ${response.status}`);
                              const blob = await response.blob();
                              const blobUrl = URL.createObjectURL(blob);

                              if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
                              blobUrlRef.current = blobUrl;
                              setPlayableSrc(blobUrl);
                              setIsPlaying(false);

                              // Wait for src update then replay.
                              requestAnimationFrame(async () => {
                                    if (!audioRef.current) return;
                                    try {
                                          setIsPlaying(true);
                                          await audioRef.current.play();
                                    } catch (retryError) {
                                          setIsPlaying(false);
                                          console.error('Play retry failed:', retryError);
                                    }
                              });
                              return;
                        } catch (fallbackError) {
                              console.error('Audio fallback failed:', fallbackError);
                        }
                  }
                  setIsPlaying(false);
                  console.error('Play failed:', error);
            }
      };

      const handleDownload = async (e: React.MouseEvent) => {
            e.preventDefault();
            if (!resolvedDownloadUrl || isDownloading) return;

            try {
                  setIsDownloading(true);
                  const response = await fetch(resolvedDownloadUrl);
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

                  {playableSrc ? (
                        <div className="flex items-center gap-2 mt-1">
                              <audio ref={audioRef} src={playableSrc} className="hidden" preload="metadata">
                                    <track kind="captions" />
                              </audio>
                              <button
                                    onClick={handleTogglePlayPause}
                                    className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-full bg-blue-500 hover:bg-blue-600 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    title={isPlaying ? t('chat.messageList.pause', 'Tạm dừng') : t('chat.messageList.play', 'Phát')}
                                    disabled={!playableSrc}
                              >
                                    {isPlaying ? (
                                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                                <rect x="5" y="4" width="5" height="16" rx="1.5" />
                                                <rect x="14" y="4" width="5" height="16" rx="1.5" />
                                          </svg>
                                    ) : (
                                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                                <path d="M8 5.14v13.72c0 .79.87 1.27 1.54.84l10.24-6.86a1 1 0 000-1.66L9.54 4.3A1 1 0 008 5.14z" />
                                          </svg>
                                    )}
                              </button>
                              <div className="flex-1 min-w-0 flex items-center gap-2">
                                    <div className="h-6 flex items-center gap-1">
                                          {AUDIO_BAR_HEIGHTS.map((barHeight, idx) => (
                                                <span
                                                      key={idx}
                                                      className={cn(
                                                            'w-[3px] rounded-sm bg-blue-500 transition-all duration-300',
                                                            isPlaying ? 'opacity-100' : 'opacity-60',
                                                            isPlaying ? 'animate-pulse' : '',
                                                      )}
                                                      style={{
                                                            height: isPlaying ? `${barHeight}px` : '4px',
                                                            animationDelay: isPlaying ? `${idx * 0.06}s` : undefined,
                                                      }}
                                                />
                                          ))}
                                    </div>
                                    <div className="text-[11px] text-blue-500 font-medium tabular-nums min-w-[38px] text-right">
                                          <span>{duration > 0 ? formatTime(duration) : '--:--'}</span>
                                    </div>
                              </div>
                              {resolvedDownloadUrl && (
                                    <button
                                          onClick={handleDownload}
                                          disabled={isDownloading}
                                          className={`flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full transition-colors ${isDownloading ? 'text-blue-300 cursor-not-allowed bg-blue-50' : 'text-gray-500 hover:text-blue-600 hover:bg-black/5'}`}
                                          title={t('conversation.attachments.download')}
                                    >
                                          <DownloadOutlined className={isDownloading ? "text-lg animate-pulse" : "text-lg"} />
                                    </button>
                              )}
                        </div>
                  ) : isFailed ? (
                        <div className="text-xs text-red-500">{t('conversation.attachments.audioProcessingError')}</div>
                  ) : (
                        <div className="flex items-center gap-1.5 text-xs text-gray-400">
                              <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                              </svg>
                              <span>{t('conversation.attachments.processing')}</span>
                        </div>
                  )}
            </div>
      );
}
