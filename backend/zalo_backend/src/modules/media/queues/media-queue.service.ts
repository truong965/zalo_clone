// src/modules/media/queues/media-queue.service.ts
import { Injectable, Logger, Inject } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bull';
import type { Queue, Job } from 'bull';
import queueConfig from 'src/config/queue.config';
import { ImageProcessingJob } from '../processors/image.processor';
import { VideoProcessingJob } from '../processors/video.processor';
import { MediaType } from '@prisma/client';

export const MEDIA_QUEUE_NAME = 'media-processing';

export interface FileProcessingJob {
  mediaId: string;
  s3Key: string;
  fileSize: number;
  mimeType: string;
}
export interface MediaJobData {
  type: MediaType;
  payload: ImageProcessingJob | VideoProcessingJob | FileProcessingJob;
}

@Injectable()
export class MediaQueueService {
  private readonly logger = new Logger(MediaQueueService.name);

  constructor(
    @InjectQueue(MEDIA_QUEUE_NAME)
    private readonly mediaQueue: Queue<MediaJobData>,
    @Inject(queueConfig.KEY)
    private readonly config: ConfigType<typeof queueConfig>,
  ) {}

  /**
   * Enqueue image processing job
   */
  async enqueueImageProcessing(
    job: ImageProcessingJob,
  ): Promise<Job<MediaJobData>> {
    this.logger.log(`Enqueuing image job: ${job.mediaId}`);

    return this.mediaQueue.add(
      // MediaType.IMAGE,
      {
        type: MediaType.IMAGE,
        payload: job,
      },
      {
        attempts: this.config.retry.attempts,
        backoff: this.config.retry.backoff,
        timeout: this.config.timeout.image,
        removeOnComplete: this.config.jobRetention.completed,
        removeOnFail: this.config.jobRetention.failed,
      },
    );
  }

  /**
   * Enqueue video processing job
   */
  async enqueueVideoProcessing(
    job: VideoProcessingJob,
  ): Promise<Job<MediaJobData>> {
    this.logger.log(`Enqueuing video job: ${job.mediaId}`);

    return this.mediaQueue.add(
      // MediaType.VIDEO,
      {
        type: MediaType.VIDEO,
        payload: job,
      },
      {
        attempts: this.config.retry.attempts,
        backoff: this.config.retry.backoff,
        timeout: this.config.timeout.video,
        priority: 1, // Lower priority than images (higher number = lower priority)
        removeOnComplete: this.config.jobRetention.completed,
        removeOnFail: this.config.jobRetention.failed,
      },
    );
  }

  /**
   * Get job status by ID
   */
  async getJobStatus(jobId: string): Promise<Job | null> {
    return this.mediaQueue.getJob(jobId);
  }

  /**
   * Get queue statistics
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
   * Pause queue processing
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
  // Thêm hàm enqueueFileProcessing
  async enqueueFileProcessing(
    payload: FileProcessingJob,
    mediaType: MediaType,
  ): Promise<Job<MediaJobData>> {
    return this.mediaQueue.add(
      { type: mediaType, payload },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: true,
      },
    );
  }
}
