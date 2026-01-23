import { registerAs } from '@nestjs/config';

export default registerAs('redis', () => ({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT!, 10) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB!, 10) || 0,

  // Connection pool settings
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  enableOfflineQueue: true,

  // Retry strategy
  retryStrategy: (times: number) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },

  // Timeouts
  connectTimeout: 10000, // 10s
  commandTimeout: 5000, // 5s

  // Key prefixes
  prefixes: {
    socket: 'socket',
    user: 'user',
    presence: 'presence',
    rateLimit: 'rate_limit',
  },

  // TTL values (in seconds)
  ttl: {
    socketMetadata: 3600, // 1 hour
    userStatus: 300, // 5 minutes
    rateLimitWindow: 60, // 1 minute
    rateLimitEventWindow: 10, // 10 seconds
  },

  // Rate limit thresholds
  rateLimit: {
    messagesPerMinute: 30,
    eventsPerTenSeconds: 100,
  },
}));
