// src/modules/media/services/metrics.service.ts
import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MEDIA_QUEUE_PROVIDER } from '../queues/media-queue.interface';
import type { IMediaQueueService } from '../queues/media-queue.interface';
import { PrismaService } from 'src/database/prisma.service';
import { MediaProcessingStatus, MediaType } from '@prisma/client';

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
  failureRate: number; // percentage
}

interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  total: number;
}
interface FailureStats {
  total: number;
  byError: Record<string, number>;
  byMediaType: Record<string, number>;
  recentFailures: Array<{
    id: string;
    mediaType: MediaType;
    error: string;
    timestamp: Date;
  }>;
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
    criticalFailureRate: 0.5, // 50% - very bad
    highWaitingJobs: 500, // Critical backlog
  };

  constructor(
    @Inject(MEDIA_QUEUE_PROVIDER) private readonly queueService: IMediaQueueService,
    private readonly prisma: PrismaService,
  ) { }

  /**
   * Collect metrics every 5 minutes
   */
  @Cron('0 */5 * * * *')
  async collectMetrics(): Promise<void> {
    try {
      const queueStats = await this.queueService.getQueueStats();

      const metrics: QueueMetrics = {
        timestamp: new Date(),
        ...queueStats,
        processingRate: this.calculateProcessingRate(queueStats),
        avgProcessingTime: await this.getAvgProcessingTime(),
        failureRate: this.calculateFailureRate(queueStats),
      };

      // Log metrics
      this.logger.log('Queue Metrics', {
        waiting: metrics.waiting,
        active: metrics.active,
        failed: metrics.failed,
        rate: `${metrics.processingRate.toFixed(1)} jobs/min`,
        avgTime: `${metrics.avgProcessingTime.toFixed(1)}s`,
        failureRate: `${(metrics.failureRate * 100).toFixed(1)}%`,
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

    if (timeDiffMinutes === 0) return 0;
    const completedDiff = queueStats.completed - this.previousMetrics.completed;

    return completedDiff / timeDiffMinutes;
  }
  /**
   * Calculate failure rate
   */
  private calculateFailureRate(queueStats: QueueStats): number {
    if (queueStats.total === 0) return 0;
    return queueStats.failed / queueStats.total;
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
    // CRITICAL: Very high backlog
    if (metrics.waiting > this.THRESHOLDS.highWaitingJobs) {
      this.logger.error('🚨 CRITICAL QUEUE BACKLOG', {
        waiting: metrics.waiting,
        threshold: this.THRESHOLDS.highWaitingJobs,
        action: 'Scale workers immediately',
      });
      // TODO: Send CRITICAL alert (PagerDuty, Slack)
    }
    // WARNING: High backlog
    else if (metrics.waiting > this.THRESHOLDS.maxWaitingJobs) {
      this.logger.warn('⚠️  HIGH QUEUE BACKLOG', {
        waiting: metrics.waiting,
        threshold: this.THRESHOLDS.maxWaitingJobs,
      });
      // TODO: Send WARNING alert
    }

    // CRITICAL: Very high failure rate
    if (metrics.failureRate > this.THRESHOLDS.criticalFailureRate) {
      this.logger.error('🚨 CRITICAL FAILURE RATE', {
        failureRate: `${(metrics.failureRate * 100).toFixed(1)}%`,
        failed: metrics.failed,
        total: metrics.total,
        action: 'Investigate worker errors immediately',
      });
      // TODO: Send CRITICAL alert
    }
    // WARNING: High failure rate
    else if (metrics.failureRate > this.THRESHOLDS.maxFailureRate) {
      this.logger.error('⚠️  HIGH FAILURE RATE', {
        failureRate: `${(metrics.failureRate * 100).toFixed(1)}%`,
        failed: metrics.failed,
        total: metrics.total,
      });
      // TODO: Send WARNING alert
    }

    // WARNING: Slow processing
    if (metrics.avgProcessingTime > this.THRESHOLDS.maxProcessingTime) {
      this.logger.warn('⚠️  SLOW PROCESSING', {
        avgTime: `${metrics.avgProcessingTime.toFixed(1)}s`,
        threshold: `${this.THRESHOLDS.maxProcessingTime}s`,
      });
      // TODO: Send WARNING alert
    }

    // ✅ NEW: Alert on zero processing rate (workers might be stuck)
    if (
      metrics.waiting > 0 &&
      metrics.active === 0 &&
      metrics.processingRate === 0
    ) {
      this.logger.error('🚨 WORKERS NOT PROCESSING', {
        waiting: metrics.waiting,
        active: metrics.active,
        action: 'Restart workers',
      });
      // TODO: Send CRITICAL alert
    }
  }

  /**
   * Clean old completed jobs (weekly)
   */
  @Cron(CronExpression.EVERY_WEEK)
  async cleanOldJobs(): Promise<void> {
    await this.queueService.cleanOldJobs?.();
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
  async getFailureStats(hours: number = 24): Promise<FailureStats> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const failedJobs = await this.prisma.mediaAttachment.findMany({
      where: {
        processingStatus: MediaProcessingStatus.FAILED,
        updatedAt: {
          gte: since,
        },
      },
      select: {
        id: true,
        processingError: true,
        mediaType: true,
        updatedAt: true,
      },
      orderBy: {
        updatedAt: 'desc',
      },
      take: 100,
    });

    // Group by error type
    const errorCounts: Record<string, number> = {};
    const mediaTypeCounts: Record<string, number> = {};

    failedJobs.forEach((job) => {
      const error = job.processingError || 'Unknown';
      const mediaType = job.mediaType;

      errorCounts[error] = (errorCounts[error] || 0) + 1;
      mediaTypeCounts[mediaType] = (mediaTypeCounts[mediaType] || 0) + 1;
    });

    return {
      total: failedJobs.length,
      byError: errorCounts,
      byMediaType: mediaTypeCounts,
      recentFailures: failedJobs.slice(0, 10).map((job) => ({
        id: job.id,
        mediaType: job.mediaType,
        error: job.processingError || 'Unknown',
        timestamp: job.updatedAt,
      })),
    };
  }
  async getOrphanedFilesCount(): Promise<{
    pending: number;
    failed: number;
    total: number;
  }> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [pending, failed] = await Promise.all([
      this.prisma.mediaAttachment.count({
        where: {
          processingStatus: {
            in: [MediaProcessingStatus.PENDING, MediaProcessingStatus.UPLOADED],
          },
          messageId: null,
          createdAt: { lt: oneDayAgo },
        },
      }),
      this.prisma.mediaAttachment.count({
        where: {
          processingStatus: MediaProcessingStatus.FAILED,
          messageId: null,
          updatedAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    return {
      pending,
      failed,
      total: pending + failed,
    };
  }

  /**
   * ✅ NEW: Get processing performance by media type
   */
  async getPerformanceByType(hours: number = 24): Promise<
    Record<
      string,
      {
        count: number;
        avgTime: number;
        failureRate: number;
      }
    >
  > {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const allJobs = await this.prisma.mediaAttachment.findMany({
      where: {
        createdAt: { gte: since },
        processingStatus: {
          in: [MediaProcessingStatus.READY, MediaProcessingStatus.FAILED],
        },
      },
      select: {
        mediaType: true,
        processingStatus: true,
        createdAt: true,
        processedAt: true,
      },
    });

    const statsByType: Record<
      string,
      {
        count: number;
        totalTime: number;
        failed: number;
      }
    > = {};

    allJobs.forEach((job) => {
      const type = job.mediaType;
      if (!statsByType[type]) {
        statsByType[type] = { count: 0, totalTime: 0, failed: 0 };
      }

      statsByType[type].count++;

      if (
        job.processingStatus === MediaProcessingStatus.READY &&
        job.processedAt
      ) {
        const duration =
          (job.processedAt.getTime() - job.createdAt.getTime()) / 1000;
        statsByType[type].totalTime += duration;
      }

      if (job.processingStatus === MediaProcessingStatus.FAILED) {
        statsByType[type].failed++;
      }
    });

    const result: Record<string, any> = {};
    for (const [type, stats] of Object.entries(statsByType)) {
      result[type] = {
        count: stats.count,
        avgTime: stats.count > 0 ? stats.totalTime / stats.count : 0,
        failureRate: stats.count > 0 ? stats.failed / stats.count : 0,
      };
    }

    return result;
  }
}
