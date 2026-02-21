/**
 * FilePreviewPanel — Horizontal scrollable strip showing selected files
 * before sending. Sits above the ChatInput toolbar.
 *
 * Renders per-file cards with:
 *   - Image/Video: 80×80 thumbnail from localUrl + upload progress overlay
 *   - Document/Audio: file-card (icon + name + size) + linear progress bar
 *   - × (close) button to remove (disabled during upload)
 *   - Error state with retry action
 *
 * Composition rules applied:
 *   - architecture-avoid-boolean-props: uses explicit FileUploadState union
 *   - patterns-explicit-variants: separate card renders by media category
 *   - rendering-conditional-render: ternary over && for conditionals
 */

import {
      CloseOutlined,
      FileOutlined,
      FilePdfOutlined,
      FileWordOutlined,
      FileExcelOutlined,
      FileTextOutlined,
      PlayCircleOutlined,
      SoundOutlined,
      ReloadOutlined,
      WarningOutlined,
} from '@ant-design/icons';
import { Tooltip } from 'antd';
import { cn } from '@/lib/utils';
import { formatBytes } from '@/lib/utils';
import type { PendingFile } from '../hooks/use-media-upload';

// ============================================================================
// PROPS
// ============================================================================

interface FilePreviewPanelProps {
      files: PendingFile[];
      onRemove: (localId: string) => void;
      onRetry: (localId: string) => Promise<void>;
      disabled?: boolean;
}

// ============================================================================
// HELPERS
// ============================================================================

/** Pick an icon for document/audio MIME types. */
function getFileIcon(mimeType: string) {
      if (mimeType === 'application/pdf') return <FilePdfOutlined className="text-red-500" />;
      if (mimeType.includes('word') || mimeType.includes('wordprocessingml'))
            return <FileWordOutlined className="text-blue-600" />;
      if (mimeType.includes('excel') || mimeType.includes('spreadsheetml'))
            return <FileExcelOutlined className="text-green-600" />;
      if (mimeType === 'text/plain') return <FileTextOutlined className="text-gray-500" />;
      if (mimeType.startsWith('audio/')) return <SoundOutlined className="text-purple-500" />;
      return <FileOutlined className="text-gray-500" />;
}

/** Whether a file state is "active" (i.e. upload in progress, cannot remove). */
function isActiveUpload(state: PendingFile['state']): boolean {
      return state === 'initiating' || state === 'uploading' || state === 'confirming';
}

/** Whether this MIME type is visual (image/video) and should show thumbnail. */
function isVisualMedia(mimeType: string): boolean {
      return mimeType.startsWith('image/') || mimeType.startsWith('video/');
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/** Circular progress ring (SVG) for image/video thumbnails. */
function CircularProgress({ percent }: { percent: number }) {
      const radius = 18;
      const circumference = 2 * Math.PI * radius;
      const offset = circumference - (percent / 100) * circumference;

      return (
            <svg width="44" height="44" viewBox="0 0 44 44" className="drop-shadow-sm">
                  {/* Background circle */}
                  <circle
                        cx="22"
                        cy="22"
                        r={radius}
                        fill="none"
                        stroke="rgba(255,255,255,0.3)"
                        strokeWidth="3"
                  />
                  {/* Progress arc */}
                  <circle
                        cx="22"
                        cy="22"
                        r={radius}
                        fill="none"
                        stroke="white"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={offset}
                        transform="rotate(-90 22 22)"
                        className="transition-[stroke-dashoffset] duration-200"
                  />
                  {/* Percent text */}
                  <text
                        x="22"
                        y="22"
                        textAnchor="middle"
                        dominantBaseline="central"
                        fill="white"
                        fontSize="11"
                        fontWeight="600"
                  >
                        {percent}%
                  </text>
            </svg>
      );
}

/** Processing spinner overlay for image/video cards. */
function ProcessingOverlay() {
      return (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-lg">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            </div>
      );
}

/** Error overlay with retry button for any card. */
function ErrorOverlay({ onRetry }: { onRetry: () => void }) {
      return (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/40 rounded-lg">
                  <WarningOutlined className="text-orange-400 text-lg" />
                  <button
                        type="button"
                        onClick={(e) => {
                              e.stopPropagation();
                              onRetry();
                        }}
                        className="flex items-center gap-1 px-2 py-0.5 text-[10px] text-white bg-white/20 hover:bg-white/30 rounded transition-colors"
                  >
                        <ReloadOutlined className="text-[10px]" />
                        Thử lại
                  </button>
            </div>
      );
}

// ── Visual card (Image / Video) ─────────────────────────────────────────────

function VisualFileCard({
      file,
      onRemove,
      onRetry,
      disabled,
}: {
      file: PendingFile;
      onRemove: () => void;
      onRetry: () => void;
      disabled: boolean;
}) {
      const isActive = isActiveUpload(file.state);
      const isVideo = file.file.type.startsWith('video/');

      return (
            <div className="relative flex-shrink-0 w-20 h-20 group">
                  {/* Thumbnail */}
                  <img
                        src={file.localUrl}
                        alt={file.file.name}
                        className={cn(
                              'w-full h-full object-cover rounded-lg',
                              file.state === 'error' ? 'opacity-50' : '',
                              isActive ? 'opacity-70' : '',
                        )}
                  />

                  {/* Video play icon (only when queued/confirmed) */}
                  {isVideo && !isActive && file.state !== 'error' ? (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                              <PlayCircleOutlined className="text-white text-2xl drop-shadow-lg" />
                        </div>
                  ) : null}

                  {/* Upload progress overlay */}
                  {file.state === 'uploading' ? (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-lg">
                              <CircularProgress percent={file.uploadProgress} />
                        </div>
                  ) : null}

                  {/* Initiating / Confirming spinner */}
                  {file.state === 'initiating' || file.state === 'confirming' ? (
                        <ProcessingOverlay />
                  ) : null}

                  {/* Error overlay */}
                  {file.state === 'error' ? <ErrorOverlay onRetry={onRetry} /> : null}

                  {/* Confirmed checkmark */}
                  {file.state === 'confirmed' ? (
                        <div className="absolute bottom-1 right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                              <span className="text-white text-[10px] font-bold">✓</span>
                        </div>
                  ) : null}

                  {/* Close button */}
                  {!isActive && !disabled ? (
                        <button
                              type="button"
                              onClick={onRemove}
                              className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-gray-700 hover:bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
                              aria-label={`Xóa ${file.file.name}`}
                        >
                              <CloseOutlined className="text-[9px]" />
                        </button>
                  ) : null}
            </div>
      );
}

// ── Document / Audio card ───────────────────────────────────────────────────

function DocumentFileCard({
      file,
      onRemove,
      onRetry,
      disabled,
}: {
      file: PendingFile;
      onRemove: () => void;
      onRetry: () => void;
      disabled: boolean;
}) {
      const isActive = isActiveUpload(file.state);

      return (
            <div className="relative flex-shrink-0 w-48 group">
                  <div
                        className={cn(
                              'flex items-center gap-2 p-2 pr-7 rounded-lg border bg-gray-50',
                              file.state === 'error' ? 'border-red-300 bg-red-50' : 'border-gray-200',
                        )}
                  >
                        {/* File icon */}
                        <div className="flex-shrink-0 text-xl">
                              {getFileIcon(file.file.type)}
                        </div>

                        {/* Name + Size */}
                        <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-gray-700 truncate" title={file.file.name}>
                                    {file.file.name}
                              </p>
                              <p className="text-[10px] text-gray-400">
                                    {formatBytes(file.file.size)}
                              </p>
                        </div>

                        {/* Confirmed badge */}
                        {file.state === 'confirmed' ? (
                              <div className="flex-shrink-0 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                                    <span className="text-white text-[10px] font-bold">✓</span>
                              </div>
                        ) : null}
                  </div>

                  {/* Linear progress bar (bottom edge) */}
                  {file.state === 'uploading' ? (
                        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-200 rounded-b-lg overflow-hidden">
                              <div
                                    className="h-full bg-blue-500 transition-all duration-200"
                                    style={{ width: `${file.uploadProgress}%` }}
                              />
                        </div>
                  ) : null}

                  {/* Initiating / Confirming indicator */}
                  {file.state === 'initiating' || file.state === 'confirming' ? (
                        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-200 rounded-b-lg overflow-hidden">
                              <div className="h-full bg-blue-400 animate-pulse w-full" />
                        </div>
                  ) : null}

                  {/* Error state */}
                  {file.state === 'error' ? (
                        <Tooltip title={file.error ?? 'Upload thất bại'}>
                              <button
                                    type="button"
                                    onClick={onRetry}
                                    className="absolute top-1/2 right-7 -translate-y-1/2 flex items-center gap-0.5 text-[10px] text-red-500 hover:text-red-700"
                              >
                                    <ReloadOutlined />
                              </button>
                        </Tooltip>
                  ) : null}

                  {/* Close button */}
                  {!isActive && !disabled ? (
                        <button
                              type="button"
                              onClick={onRemove}
                              className="absolute top-1/2 -translate-y-1/2 right-1.5 w-5 h-5 text-gray-400 hover:text-red-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                              aria-label={`Xóa ${file.file.name}`}
                        >
                              <CloseOutlined className="text-[10px]" />
                        </button>
                  ) : null}
            </div>
      );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function FilePreviewPanel({ files, onRemove, onRetry, disabled = false }: FilePreviewPanelProps) {
      if (files.length === 0) return null;

      return (
            <div className="px-3 py-2 border-b border-gray-100 bg-gray-50/50">
                  <div className="flex items-center gap-2 overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300">
                        {files.map((file) => {
                              const handleRemove = () => onRemove(file.localId);
                              const handleRetry = () => {
                                    void onRetry(file.localId);
                              };

                              return isVisualMedia(file.file.type) ? (
                                    <VisualFileCard
                                          key={file.localId}
                                          file={file}
                                          onRemove={handleRemove}
                                          onRetry={handleRetry}
                                          disabled={disabled}
                                    />
                              ) : (
                                    <DocumentFileCard
                                          key={file.localId}
                                          file={file}
                                          onRemove={handleRemove}
                                          onRetry={handleRetry}
                                          disabled={disabled}
                                    />
                              );
                        })}
                  </div>

                  {/* File count summary */}
                  <p className="text-[10px] text-gray-400 mt-1">
                        {files.length} file{files.length > 1 ? 's' : ''} đã chọn
                  </p>
            </div>
      );
}
