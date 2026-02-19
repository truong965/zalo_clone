// src/modules/media/queues/media-queue.interface.ts
import { MediaType } from '@prisma/client';

/**
 * Payload sent to the queue for file processing.
 * Shared by both Bull and SQS providers.
 */
export interface FileProcessingJob {
      mediaId: string;
      s3Key: string;
      // Optional context — workers resolve from DB if not provided
      uploadId?: string;
      originalFilename?: string;
      mimeType?: string;
      size?: number;
}

// These extend the processor-specific job shapes so the queue layer is aligned
export interface ImageProcessingJob extends FileProcessingJob {
      originalWidth?: number;
      originalHeight?: number;
      width?: number;
      height?: number;
}

export interface VideoProcessingJob extends FileProcessingJob {
      duration?: number;
      width?: number;
      height?: number;
}

export interface MediaJobData {
      type: MediaType;
      payload: ImageProcessingJob | VideoProcessingJob | FileProcessingJob;
}

/**
 * Abstraction over the underlying queue provider (Bull or SQS).
 * Any service that enqueues media jobs MUST use this token.
 */
export const MEDIA_QUEUE_PROVIDER = Symbol('MEDIA_QUEUE_PROVIDER');

export interface IMediaQueueService {
      enqueueImageProcessing(payload: ImageProcessingJob): Promise<string>;
      enqueueVideoProcessing(payload: VideoProcessingJob): Promise<string>;
      enqueueFileProcessing(
            payload: FileProcessingJob,
            mediaType: MediaType,
      ): Promise<string>;
      /**
       * Returns queue stats. SQS returns approximate counts.
       */
      getQueueStats(): Promise<{
            waiting: number;
            active: number;
            completed: number;
            failed: number;
            delayed: number;
            total: number;
      }>;
      /**
       * Optional: clean up old completed/failed jobs. Only meaningful for Bull.
       * SQS consumers should no-op or omit this.
       */
      cleanOldJobs?(): Promise<void>;
}
