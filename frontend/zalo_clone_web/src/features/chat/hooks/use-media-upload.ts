/**
 * useMediaUpload — Per-file state machine for media upload orchestration.
 *
 * Manages the full lifecycle of selected files:
 *   queued → initiating → uploading (0-100%) → confirming → confirmed | error
 *
 * Design decisions (from §9 confirmed):
 *   - Caption chung: 1 text caption for the whole send (handled by caller)
 *   - Socket namespace: /socket.io
 *   - Video thumbnail: fallback to icon while processing
 *   - Audio: native <audio controls>
 *
 * Rules followed:
 *   - rerender-functional-setstate: functional setState for stable callbacks
 *   - rerender-lazy-state-init: no expensive init in useState
 *   - async-parallel: Promise.allSettled for concurrent uploads
 *   - architecture-avoid-boolean-props: explicit state enum, not booleans
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createId } from '@paralleldrive/cuid2';
import {
      mediaService,
      validateFile,
      sanitizeFileName,
      inferMediaTypeFromMime,
      MAX_FILES_PER_SEND,
} from '@/features/chat/api/media.service';
import type { MediaResponseDto } from '@/features/chat/api/media.service';
import type { MediaType, MessageType } from '@/types/api';

// ============================================================================
// TYPES
// ============================================================================

export type FileUploadState =
      | 'queued'
      | 'initiating'
      | 'uploading'
      | 'confirming'
      | 'confirmed'
      | 'error';

export interface PendingFile {
      /** Client-generated unique ID */
      localId: string;
      /** Original File reference — kept in memory for retry */
      file: File;
      /** Object URL for local preview (revoked on cleanup) */
      localUrl: string;
      /** Current upload state */
      state: FileUploadState;
      /** Upload progress 0–100 */
      uploadProgress: number;
      /** Server-assigned upload ID (after initiate) */
      uploadId?: string;
      /** Server-assigned media attachment ID (after confirm) */
      mediaId?: string;
      /** Inferred media type from MIME */
      mediaType: MediaType;
      /** Error message if state === 'error' */
      error?: string;
      /** Server response after confirm */
      serverResponse?: MediaResponseDto;
}

/** A batch of files grouped by MessageType for sending as one message. */
export interface FileBatch {
      messageType: MessageType;
      mediaIds: string[];
      files: PendingFile[];
}

export interface UseMediaUploadReturn {
      /** Current list of selected/uploading/confirmed files */
      pendingFiles: PendingFile[];
      /** Add files from a FileList or File[]. Validates and caps at MAX_FILES_PER_SEND. */
      addFiles: (files: FileList | File[]) => string[];
      /** Remove a file by its localId. Cannot remove while uploading. */
      removeFile: (localId: string) => void;
      /** Retry a failed file upload */
      retryFile: (localId: string) => Promise<void>;
      /** Clear all files and revoke object URLs */
      clearAll: () => void;
      /**
       * Upload all queued files in parallel.
       * Returns array of mediaIds in the same order as pendingFiles.
       * Throws if any file fails (partial results available in pendingFiles state).
       */
      uploadAll: () => Promise<string[]>;
      /** Whether any file is currently uploading */
      isUploading: boolean;
      /** Whether any file has error state */
      hasErrors: boolean;
      /** Total count of selected files */
      fileCount: number;
      /**
       * Group confirmed files into batches by MessageType.
       * Each batch corresponds to one message to send.
       * VIDEO files get their own batch (VIDEO_MAX = 1).
       */
      buildBatches: () => FileBatch[];
      /**
       * Get the latest pendingFiles from the ref (avoids stale closure issues).
       * Use this after async operations like uploadAll() to read confirmed state.
       */
      getLatestPendingFiles: () => PendingFile[];
}

// ============================================================================
// MESSAGE TYPE LIMITS (mirrored from backend MESSAGE_LIMITS)
// ============================================================================

const MESSAGE_TYPE_LIMITS: Record<string, number> = {
      IMAGE: 10,
      VIDEO: 1,
      FILE: 5,
      AUDIO: 5,
};

// ============================================================================
// MIME → MessageType MAPPING
// ============================================================================

function mimeToMessageType(mime: string): MessageType {
      if (mime.startsWith('image/')) return 'IMAGE';
      if (mime.startsWith('video/')) return 'VIDEO';
      if (mime.startsWith('audio/')) return 'AUDIO';
      return 'FILE';
}

// ============================================================================
// HOOK
// ============================================================================

export function useMediaUpload(): UseMediaUploadReturn {
      const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
      /**
       * Authoritative mutable snapshot — always kept in sync.
       *
       * React 18 automatic batching may defer state-updater functions
       * (setPendingFiles(fn)) to the next render flush.  Code inside the
       * updater that writes to this ref therefore runs *too late* for
       * callers that read the ref synchronously after an async upload.
       *
       * FIX: every mutation writes to this ref BEFORE calling
       * setPendingFiles so the ref is always the source of truth.
       */
      const pendingFilesRef = useRef<PendingFile[]>([]);
      /** Ref map: localId → AbortController — for cancelling individual uploads */
      const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
      /** Guard against calling uploadAll while already uploading */
      const isUploadingRef = useRef(false);

      // ── Derived state ───────────────────────────────────────────────────────
      const isUploading = pendingFiles.some(
            (f) => f.state === 'initiating' || f.state === 'uploading' || f.state === 'confirming',
      );
      const hasErrors = pendingFiles.some((f) => f.state === 'error');
      const fileCount = pendingFiles.length;

      // ── Cleanup object URLs on unmount ──────────────────────────────────────
      useEffect(() => {
            const controllers = abortControllersRef.current;
            return () => {
                  for (const file of pendingFilesRef.current) {
                        URL.revokeObjectURL(file.localUrl);
                  }
                  for (const controller of controllers.values()) {
                        controller.abort();
                  }
            };
      }, []);

      // ── Helper: update a single file by localId ────────────────────────────
      const updateFile = useCallback(
            (localId: string, updates: Partial<PendingFile>) => {
                  // Write ref synchronously so async callers always read latest
                  const next = pendingFilesRef.current.map(
                        (f) => (f.localId === localId ? { ...f, ...updates } : f),
                  );
                  pendingFilesRef.current = next;
                  setPendingFiles(next);
            },
            [],
      );

      // ── addFiles ───────────────────────────────────────────────────────────
      const addFiles = useCallback(
            (files: FileList | File[]): string[] => {
                  const fileArray = Array.from(files);
                  const errors: string[] = [];
                  const prev = pendingFilesRef.current;

                  const remaining = MAX_FILES_PER_SEND - prev.length;
                  if (remaining <= 0) {
                        errors.push(`Đã đạt giới hạn ${MAX_FILES_PER_SEND} files`);
                        return errors;
                  }

                  const toAdd = fileArray.slice(0, remaining);
                  if (fileArray.length > remaining) {
                        errors.push(
                              `Chỉ thêm được ${remaining} file (tối đa ${MAX_FILES_PER_SEND})`,
                        );
                  }

                  const newFiles: PendingFile[] = [];

                  for (const file of toAdd) {
                        const validationError = validateFile(file);
                        if (validationError) {
                              errors.push(validationError);
                              continue;
                        }

                        // Duplicate check: same name + size + type
                        const isDuplicate = prev.some(
                              (existing) =>
                                    existing.file.name === file.name &&
                                    existing.file.size === file.size &&
                                    existing.file.type === file.type,
                        ) || newFiles.some(
                              (added) =>
                                    added.file.name === file.name &&
                                    added.file.size === file.size &&
                                    added.file.type === file.type,
                        );

                        if (isDuplicate) {
                              errors.push(`File "${file.name}" đã được chọn`);
                              continue;
                        }

                        newFiles.push({
                              localId: createId(),
                              file,
                              localUrl: URL.createObjectURL(file),
                              state: 'queued',
                              uploadProgress: 0,
                              mediaType: inferMediaTypeFromMime(file.type),
                        });
                  }

                  if (newFiles.length > 0) {
                        const next = [...prev, ...newFiles];
                        pendingFilesRef.current = next;
                        setPendingFiles(next);
                  }

                  return errors;
            },
            [],
      );

      // ── removeFile ─────────────────────────────────────────────────────────
      const removeFile = useCallback((localId: string) => {
            const prev = pendingFilesRef.current;
            const file = prev.find((f) => f.localId === localId);
            if (!file) return;

            // Cannot remove while actively uploading
            if (file.state === 'uploading' || file.state === 'initiating' || file.state === 'confirming') {
                  return;
            }

            URL.revokeObjectURL(file.localUrl);

            // If confirmed, try to delete media on server (fire-and-forget)
            if (file.mediaId) {
                  mediaService.deleteMedia(file.mediaId).catch(() => {
                        // Best-effort cleanup
                  });
            }

            const next = prev.filter((f) => f.localId !== localId);
            pendingFilesRef.current = next;
            setPendingFiles(next);
      }, []);

      // ── clearAll ───────────────────────────────────────────────────────────
      const clearAll = useCallback(() => {
            const prev = pendingFilesRef.current;

            // Delay blob URL revocation so optimistic messages in the chat list
            // can keep rendering _localUrl until the server response arrives with
            // cdnUrl.  30 s is generous — server ack typically takes < 5 s.
            const urlsToRevoke = prev.map((f) => f.localUrl);
            if (urlsToRevoke.length > 0) {
                  setTimeout(() => {
                        for (const url of urlsToRevoke) {
                              URL.revokeObjectURL(url);
                        }
                  }, 30_000);
            }

            pendingFilesRef.current = [];
            setPendingFiles([]);

            // Abort any active uploads
            for (const controller of abortControllersRef.current.values()) {
                  controller.abort();
            }
            abortControllersRef.current.clear();
      }, []);

      // ── uploadSingleFile ──────────────────────────────────────────────────
      const uploadSingleFile = useCallback(
            async (localId: string, file: File): Promise<string> => {
                  const abortController = new AbortController();
                  abortControllersRef.current.set(localId, abortController);

                  try {
                        // Step 1: Initiate
                        updateFile(localId, { state: 'initiating', uploadProgress: 0, error: undefined });

                        const initResponse = await mediaService.initiateUpload({
                              fileName: sanitizeFileName(file.name),
                              mimeType: file.type,
                              fileSize: file.size,
                        });

                        updateFile(localId, {
                              state: 'uploading',
                              uploadId: initResponse.uploadId,
                        });

                        // Step 2: Upload to S3
                        await mediaService.uploadToS3(
                              initResponse.presignedUrl,
                              file,
                              (percent) => {
                                    updateFile(localId, { uploadProgress: percent });
                              },
                              abortController.signal,
                        );

                        // Step 3: Confirm
                        updateFile(localId, { state: 'confirming', uploadProgress: 100 });

                        const confirmResponse = await mediaService.confirmUpload(
                              initResponse.uploadId,
                        );

                        updateFile(localId, {
                              state: 'confirmed',
                              mediaId: confirmResponse.id,
                              serverResponse: confirmResponse,
                        });

                        return confirmResponse.id;
                  } catch (error) {
                        const message =
                              error instanceof DOMException && error.name === 'AbortError'
                                    ? 'Upload đã bị hủy'
                                    : error instanceof Error
                                          ? error.message
                                          : 'Upload thất bại';

                        updateFile(localId, { state: 'error', error: message });
                        throw error;
                  } finally {
                        abortControllersRef.current.delete(localId);
                  }
            },
            [updateFile],
      );

      // ── retryFile ─────────────────────────────────────────────────────────
      const retryFile = useCallback(
            async (localId: string): Promise<void> => {
                  const file = pendingFiles.find((f) => f.localId === localId);
                  if (!file || file.state !== 'error') return;

                  await uploadSingleFile(localId, file.file);
            },
            [pendingFiles, uploadSingleFile],
      );

      // ── uploadAll ─────────────────────────────────────────────────────────
      const uploadAll = useCallback(async (): Promise<string[]> => {
            if (isUploadingRef.current) {
                  throw new Error('Upload already in progress');
            }
            isUploadingRef.current = true;

            try {
                  // Read current snapshot directly from ref (NOT from setPendingFiles hack).
                  // React 18 may skip eager computation of state updaters when the fiber
                  // has pending updates (e.g. setIsSending(true) in the caller), so using
                  // setPendingFiles(prev => { sideEffect; return prev }) is unreliable.
                  const currentFiles = pendingFilesRef.current;
                  const queuedFiles = currentFiles.filter((f) => f.state === 'queued');
                  const confirmedIds = currentFiles
                        .filter((f) => f.state === 'confirmed' && f.mediaId)
                        .map((f) => f.mediaId!);

                  if (queuedFiles.length === 0) {
                        return confirmedIds;
                  }

                  // Upload all queued files in parallel (async-parallel rule)
                  const results = await Promise.allSettled(
                        queuedFiles.map((f) => uploadSingleFile(f.localId, f.file)),
                  );

                  // Collect all mediaIds (confirmed before + newly confirmed)
                  const newMediaIds: string[] = [];
                  const errors: string[] = [];

                  for (let i = 0; i < results.length; i++) {
                        const result = results[i];
                        if (result.status === 'fulfilled') {
                              newMediaIds.push(result.value);
                        } else {
                              errors.push(
                                    `"${queuedFiles[i].file.name}": ${result.reason instanceof Error ? result.reason.message : 'Upload failed'}`,
                              );
                        }
                  }

                  if (errors.length > 0) {
                        throw new Error(`Upload thất bại: ${errors.join('; ')}`);
                  }

                  return [...confirmedIds, ...newMediaIds];
            } finally {
                  isUploadingRef.current = false;
            }
      }, [uploadSingleFile]);

      // ── buildBatches ──────────────────────────────────────────────────────
      const buildBatches = useCallback((): FileBatch[] => {
            const confirmed = pendingFiles.filter(
                  (f) => f.state === 'confirmed' && f.mediaId,
            );

            if (confirmed.length === 0) return [];

            // Group by MessageType
            const groups = new Map<MessageType, PendingFile[]>();

            for (const file of confirmed) {
                  const msgType = mimeToMessageType(file.file.type);
                  const existing = groups.get(msgType) ?? [];
                  existing.push(file);
                  groups.set(msgType, existing);
            }

            const batches: FileBatch[] = [];

            // Priority order: IMAGE > VIDEO > FILE > AUDIO
            const priority: MessageType[] = ['IMAGE', 'VIDEO', 'FILE', 'AUDIO'];

            for (const msgType of priority) {
                  const files = groups.get(msgType);
                  if (!files || files.length === 0) continue;

                  const limit = MESSAGE_TYPE_LIMITS[msgType] ?? 10;

                  if (msgType === 'VIDEO') {
                        // Each video is its own message (VIDEO_MAX = 1)
                        for (const file of files) {
                              batches.push({
                                    messageType: 'VIDEO',
                                    mediaIds: [file.mediaId!],
                                    files: [file],
                              });
                        }
                  } else {
                        // Split into chunks respecting the per-message limit
                        for (let i = 0; i < files.length; i += limit) {
                              const chunk = files.slice(i, i + limit);
                              batches.push({
                                    messageType: msgType,
                                    mediaIds: chunk.map((f) => f.mediaId!),
                                    files: chunk,
                              });
                        }
                  }
            }

            return batches;
      }, [pendingFiles]);

      const getLatestPendingFiles = useCallback(() => pendingFilesRef.current, []);

      return {
            pendingFiles,
            addFiles,
            removeFile,
            retryFile,
            clearAll,
            uploadAll,
            isUploading,
            hasErrors,
            fileCount,
            buildBatches,
            getLatestPendingFiles,
      };
}
