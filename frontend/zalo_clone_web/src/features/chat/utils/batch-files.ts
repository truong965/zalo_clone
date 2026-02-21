/**
 * batch-files.ts — Group confirmed PendingFiles into message batches by type.
 *
 * Backend enforces single-type-per-message:
 *   IMAGE  → MediaType.IMAGE  only (max 10)
 *   VIDEO  → MediaType.VIDEO  only (max 1)
 *   FILE   → MediaType.DOCUMENT only (max 5)
 *   AUDIO  → MediaType.AUDIO  only (max 5)
 *
 * So mixed selections (e.g. 2 images + 1 PDF) become multiple messages.
 * Priority order for caption attachment: IMAGE > VIDEO > FILE > AUDIO
 * (text caption goes on the first batch only).
 */

import type { MessageType, MediaType } from '@/types/api';

// ============================================================================
// TYPES
// ============================================================================

export interface BatchableFile {
      localId: string;
      mediaId: string;
      mediaType: MediaType;
      mimeType: string;
}

export interface FileBatch {
      messageType: MessageType;
      mediaIds: string[];
      files: BatchableFile[];
}

// ============================================================================
// LIMITS (mirrored from backend MESSAGE_LIMITS)
// ============================================================================

const MESSAGE_TYPE_LIMITS: Record<MessageType, number> = {
      IMAGE: 10,
      VIDEO: 1,
      FILE: 5,
      AUDIO: 5,
      // Types that don't carry media — set high so they never split
      TEXT: 0,
      STICKER: 0,
      SYSTEM: 0,
      VOICE: 1,
};

// ============================================================================
// MIME → MessageType MAPPING
// ============================================================================

/**
 * Map a MIME string to the MessageType the backend expects.
 *
 * NOTE: MediaType.DOCUMENT → MessageType.FILE (not "DOCUMENT").
 */
export function mimeToMessageType(mime: string): MessageType {
      if (mime.startsWith('image/')) return 'IMAGE';
      if (mime.startsWith('video/')) return 'VIDEO';
      if (mime.startsWith('audio/')) return 'AUDIO';
      return 'FILE';
}

// ============================================================================
// BATCH FUNCTION
// ============================================================================

/** Priority order — caption goes on the first batch. */
const BATCH_PRIORITY: MessageType[] = ['IMAGE', 'VIDEO', 'FILE', 'AUDIO'];

/**
 * Group an array of confirmed files into batches suitable for `POST /messages`.
 *
 * - Groups by MessageType (derived from MIME).
 * - Respects per-message limits (VIDEO → 1 per message, IMAGE → 10, etc.).
 * - Returns batches in priority order: IMAGE > VIDEO > FILE > AUDIO.
 *
 * @example
 * ```ts
 * const batches = batchFilesByType(confirmedFiles);
 * // batches[0] ← attach caption text here
 * for (const batch of batches) {
 *   sendMessage({ type: batch.messageType, mediaIds: batch.mediaIds, ... });
 * }
 * ```
 */
export function batchFilesByType(files: BatchableFile[]): FileBatch[] {
      if (files.length === 0) return [];

      // 1. Group by MessageType
      const groups = new Map<MessageType, BatchableFile[]>();

      for (const file of files) {
            const msgType = mimeToMessageType(file.mimeType);
            const bucket = groups.get(msgType);
            if (bucket) {
                  bucket.push(file);
            } else {
                  groups.set(msgType, [file]);
            }
      }

      // 2. Build batches in priority order, splitting by per-message limits
      const batches: FileBatch[] = [];

      for (const msgType of BATCH_PRIORITY) {
            const groupFiles = groups.get(msgType);
            if (!groupFiles || groupFiles.length === 0) continue;

            const limit = MESSAGE_TYPE_LIMITS[msgType] || 10;

            // VIDEO: each file is its own message (limit = 1)
            // Others: chunk by limit
            for (let i = 0; i < groupFiles.length; i += limit) {
                  const chunk = groupFiles.slice(i, i + limit);
                  batches.push({
                        messageType: msgType,
                        mediaIds: chunk.map((f) => f.mediaId),
                        files: chunk,
                  });
            }
      }

      return batches;
}
