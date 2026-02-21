/**
 * ProcessingOverlay — Spinner overlay shown on media attachments
 * while server-side processing (thumbnail generation, optimization) is in progress.
 *
 * Used inside ImageAttachment, VideoAttachment when processingStatus is
 * PENDING | UPLOADED | CONFIRMED | PROCESSING.
 */

import { cn } from '@/lib/utils';

interface ProcessingOverlayProps {
      /** Optional label text below spinner */
      label?: string;
      /** Additional CSS classes for the root container */
      className?: string;
}

export function ProcessingOverlay({ label = 'Đang xử lý...', className }: ProcessingOverlayProps) {
      return (
            <div
                  className={cn(
                        'absolute inset-0 flex flex-col items-center justify-center',
                        'bg-black/30 backdrop-blur-[2px]',
                        className,
                  )}
            >
                  <svg
                        className="h-6 w-6 animate-spin text-white"
                        viewBox="0 0 24 24"
                        fill="none"
                        aria-hidden="true"
                  >
                        <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="3"
                        />
                        <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                        />
                  </svg>
                  {label && (
                        <span className="mt-1 text-[10px] text-white/90 select-none">{label}</span>
                  )}
            </div>
      );
}
