// src/modules/media/services/metrics.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MediaQueueService } from '../queues/media-queue.service';
import { PrismaService } from 'src/database/prisma.service';
import { MediaProcessingStatus } from '@prisma/client';

interface QueueMetrics {
  timestamp: Date;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  total: number;
  processingRate: number; // jobs/minute
  avgProcessingTime: number; // seconds
}

interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  total: number;
}
@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);
  private previousMetrics: QueueMetrics | null = null;

  // Alert thresholds
  private readonly THRESHOLDS = {
    maxWaitingJobs: 100,
    maxFailureRate: 0.1, // 10%
    maxProcessingTime: 600, // 10 minutes
  };

  constructor(
    private readonly queueService: MediaQueueService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Collect metrics every minute
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async collectMetrics(): Promise<void> {
    try {
      const queueStats = await this.queueService.getQueueStats();

      const metrics: QueueMetrics = {
        timestamp: new Date(),
        ...queueStats,
        processingRate: this.calculateProcessingRate(queueStats),
        avgProcessingTime: await this.getAvgProcessingTime(),
      };

      // Log metrics
      this.logger.log('Queue Metrics', {
        waiting: metrics.waiting,
        active: metrics.active,
        failed: metrics.failed,
        rate: `${metrics.processingRate.toFixed(1)} jobs/min`,
        avgTime: `${metrics.avgProcessingTime.toFixed(1)}s`,
      });

      // Check thresholds and alert
      this.checkThresholds(metrics);

      this.previousMetrics = metrics;
    } catch (error) {
      this.logger.error('Failed to collect metrics', error);
    }
  }

  /**
   * Calculate processing rate (jobs/minute)
   */
  private calculateProcessingRate(queueStats: QueueStats): number {
    if (!this.previousMetrics) return 0;

    const timeDiffMinutes =
      (Date.now() - this.previousMetrics.timestamp.getTime()) / 1000 / 60;

    const completedDiff = queueStats.completed - this.previousMetrics.completed;

    return completedDiff / timeDiffMinutes;
  }

  /**
   * Get average processing time from last 100 jobs
   */
  private async getAvgProcessingTime(): Promise<number> {
    const recentJobs = await this.prisma.mediaAttachment.findMany({
      where: {
        processingStatus: MediaProcessingStatus.READY,
        updatedAt: {
          gte: new Date(Date.now() - 60 * 60 * 1000), // Last hour
        },
      },
      select: {
        createdAt: true,
        updatedAt: true,
      },
      take: 100,
      orderBy: {
        updatedAt: 'desc',
      },
    });

    if (recentJobs.length === 0) return 0;

    const totalTime = recentJobs.reduce((sum, job) => {
      const duration =
        (job.updatedAt.getTime() - job.createdAt.getTime()) / 1000;
      return sum + duration;
    }, 0);

    return totalTime / recentJobs.length;
  }

  /**
   * Check thresholds and send alerts
   */
  //Tạm thời bỏ async cho đến khi thực sự code phần gửi Alert
  private checkThresholds(metrics: QueueMetrics): void {
    // Alert: Too many waiting jobs
    if (metrics.waiting > this.THRESHOLDS.maxWaitingJobs) {
      this.logger.warn('⚠️ HIGH QUEUE BACKLOG', {
        waiting: metrics.waiting,
        threshold: this.THRESHOLDS.maxWaitingJobs,
      });
      // TODO: Send Slack/email alert
    }

    // Alert: High failure rate
    const failureRate = metrics.total > 0 ? metrics.failed / metrics.total : 0;

    if (failureRate > this.THRESHOLDS.maxFailureRate) {
      this.logger.error('⚠️ HIGH FAILURE RATE', {
        failureRate: `${(failureRate * 100).toFixed(1)}%`,
        failed: metrics.failed,
        total: metrics.total,
      });
      // TODO: Send alert
    }

    // Alert: Slow processing
    if (metrics.avgProcessingTime > this.THRESHOLDS.maxProcessingTime) {
      this.logger.warn('⚠️ SLOW PROCESSING', {
        avgTime: `${metrics.avgProcessingTime.toFixed(1)}s`,
        threshold: `${this.THRESHOLDS.maxProcessingTime}s`,
      });
      // TODO: Send alert
    }
  }

  /**
   * Clean old completed jobs (weekly)
   */
  @Cron(CronExpression.EVERY_WEEK)
  async cleanOldJobs(): Promise<void> {
    await this.queueService.cleanOldJobs();
    this.logger.log('Old jobs cleaned');
  }

  /**
   * Get current metrics (for admin dashboard)
   */
  async getCurrentMetrics(): Promise<QueueMetrics | null> {
    return Promise.resolve(this.previousMetrics);
  }

  /**
   * Get failure statistics (last 24h)
   */
  async getFailureStats() {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const failedJobs = await this.prisma.mediaAttachment.findMany({
      where: {
        processingStatus: MediaProcessingStatus.FAILED,
        updatedAt: {
          gte: yesterday,
        },
      },
      select: {
        processingError: true,
        mediaType: true,
      },
    });

    // Group by error type
    const errorCounts: Record<string, number> = {};
    failedJobs.forEach((job) => {
      const error = job.processingError || 'Unknown';
      errorCounts[error] = (errorCounts[error] || 0) + 1;
    });

    return {
      total: failedJobs.length,
      byError: errorCounts,
    };
  }
}
