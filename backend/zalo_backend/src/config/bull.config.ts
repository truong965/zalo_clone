// src/config/bull.config.ts
import { registerAs } from '@nestjs/config';

export default registerAs('bull', () => ({
  redis: {
    host: process.env.BULL_REDIS_HOST || process.env.REDIS_HOST || 'localhost',
    port: parseInt(
      process.env.BULL_REDIS_PORT || process.env.REDIS_PORT || '6379',
      10,
    ),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null, // Required for Bull
  },
  worker: {
    concurrency: parseInt(process.env.WORKER_CONCURRENCY || '2', 10),
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential' as const,
      delay: 2000,
    },
    removeOnComplete: {
      age: 3600, // 1 hour
      count: 1000,
    },
    removeOnFail: {
      age: 86400, // 24 hours
    },
  },
}));
