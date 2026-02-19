// src/modules/media/queues/media-queue.service.ts
//
// Bull-backed IMediaQueueService. Registered only when QUEUE_PROVIDER !== 'sqs'.
// See media.module.ts for the provider factory.
//
import { Injectable, Logger, Inject } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bull';
import type { Queue, Job } from 'bull';
import queueConfig from 'src/config/queue.config';
import { MediaType } from '@prisma/client';
import {
  IMediaQueueService,
  FileProcessingJob,
  ImageProcessingJob,
  VideoProcessingJob,
  MediaJobData,
} from './media-queue.interface';

export type { FileProcessingJob, ImageProcessingJob, VideoProcessingJob, MediaJobData };
export const MEDIA_QUEUE_NAME = 'media-processing';

@Injectable()
export class MediaQueueService implements IMediaQueueService {
  private readonly logger = new Logger(MediaQueueService.name);

  constructor(
    @InjectQueue(MEDIA_QUEUE_NAME)
    private readonly mediaQueue: Queue<MediaJobData>,
    @Inject(queueConfig.KEY)
    private readonly config: ConfigType<typeof queueConfig>,
  ) { }

  // -------------------------------------------------------------------------
  // IMediaQueueService implementation
  // -------------------------------------------------------------------------

  async enqueueImageProcessing(job: ImageProcessingJob): Promise<string> {
    this.logger.log(`[Bull] Enqueuing image job: ${job.mediaId}`);
    const result = await this.mediaQueue.add(
      { type: MediaType.IMAGE, payload: job },
      {
        attempts: this.config.retry.attempts,
        backoff: this.config.retry.backoff,
        timeout: this.config.timeout.image,
        removeOnComplete: this.config.jobRetention.completed,
        removeOnFail: this.config.jobRetention.failed,
      },
    );
    return String(result.id);
  }

  async enqueueVideoProcessing(job: VideoProcessingJob): Promise<string> {
    this.logger.log(`[Bull] Enqueuing video job: ${job.mediaId}`);
    const result = await this.mediaQueue.add(
      { type: MediaType.VIDEO, payload: job },
      {
        attempts: this.config.retry.attempts,
        backoff: this.config.retry.backoff,
        timeout: this.config.timeout.video,
        priority: 1,
        removeOnComplete: this.config.jobRetention.completed,
        removeOnFail: this.config.jobRetention.failed,
      },
    );
    return String(result.id);
  }

  async enqueueFileProcessing(
    payload: FileProcessingJob,
    mediaType: MediaType,
  ): Promise<string> {
    this.logger.log(`[Bull] Enqueuing ${mediaType} file job: ${payload.mediaId}`);
    const result = await this.mediaQueue.add(
      { type: mediaType, payload },
      {
        attempts: this.config.retry.attempts,
        backoff: this.config.retry.backoff,
        removeOnComplete: this.config.jobRetention.completed,
        removeOnFail: this.config.jobRetention.failed,
      },
    );
    return String(result.id);
  }

  // -------------------------------------------------------------------------
  // Bull-specific extras (health checks, admin)
  // -------------------------------------------------------------------------

  async getJobById(jobId: string): Promise<Job | null> {
    return this.mediaQueue.getJob(jobId);
  }

  /**
   * Get queue statistics (IMediaQueueService)
   */
  async getQueueStats() {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.mediaQueue.getWaitingCount(),
      this.mediaQueue.getActiveCount(),
      this.mediaQueue.getCompletedCount(),
      this.mediaQueue.getFailedCount(),
      this.mediaQueue.getDelayedCount(),
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + completed + failed + delayed,
    };
  }

  /**
   * Pause queue processing (Bull-only)
   */
  async pauseQueue(): Promise<void> {
    await this.mediaQueue.pause();
    this.logger.warn('Queue paused');
  }

  /**
   * Resume queue processing
   */
  async resumeQueue(): Promise<void> {
    await this.mediaQueue.resume();
    this.logger.log('Queue resumed');
  }

  /**
   * Clean old jobs
   */
  async cleanOldJobs(): Promise<void> {
    const gracePeriod = 1000 * 60 * 60 * 24 * 7; // 7 days
    await this.mediaQueue.clean(gracePeriod, 'completed');
    await this.mediaQueue.clean(gracePeriod * 4, 'failed'); // 30 days for failed
    this.logger.log('Old jobs cleaned');
  }

}
