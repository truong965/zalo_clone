// src/config/queue.config.ts
import { registerAs } from '@nestjs/config';

export default registerAs('queue', () => ({
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || 'password123',
    db: parseInt(process.env.REDIS_QUEUE_DB || '1', 10), // Separate DB for queues
  },

  // Job retention settings
  jobRetention: {
    completed: 3600 * 24 * 7, // 7 days
    failed: 3600 * 24 * 30, // 30 days
  },

  // Retry strategy
  retry: {
    attempts: 3,
    backoff: {
      type: 'exponential' as const,
      delay: 5000, // 5s, 10s, 20s
    },
  },

  // Worker concurrency limits
  concurrency: {
    image: parseInt(process.env.IMAGE_WORKER_CONCURRENCY || '4', 10),
    video: parseInt(process.env.VIDEO_WORKER_CONCURRENCY || '2', 10), // CPU-intensive
  },

  // Job timeouts (milliseconds)
  timeout: {
    image: 60000, // 1 minute
    video: 600000, // 10 minutes
  },

  // Queue provider: 'bull' (local/dev) | 'sqs' (production AWS)
  provider: process.env.QUEUE_PROVIDER || 'bull',

  // AWS SQS configuration (used when QUEUE_PROVIDER=sqs)
  sqs: {
    region: process.env.AWS_REGION || 'ap-southeast-1',
    imageQueueUrl: process.env.SQS_IMAGE_QUEUE_URL || '',
    imageDeadLetterQueueUrl: process.env.SQS_IMAGE_DLQ_URL || '',
    videoQueueUrl: process.env.SQS_VIDEO_QUEUE_URL || '',
    videoDeadLetterQueueUrl: process.env.SQS_VIDEO_DLQ_URL || '',
    // Visibility timeout must be > job processing time
    visibilityTimeoutImage: parseInt(process.env.SQS_VISIBILITY_TIMEOUT_IMAGE || '120', 10),   // 2 min
    visibilityTimeoutVideo: parseInt(process.env.SQS_VISIBILITY_TIMEOUT_VIDEO || '900', 10),   // 15 min
    longPollingWaitSeconds: parseInt(process.env.SQS_WAIT_TIME || '20', 10),
    maxMessages: parseInt(process.env.SQS_MAX_MESSAGES || '1', 10), // 1 = serialize per worker
  },
}));
