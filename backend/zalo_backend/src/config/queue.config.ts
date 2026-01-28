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
}));
