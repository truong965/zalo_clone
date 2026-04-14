import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisService } from './redis.service';

import redisConfig from '../../config/redis.config';
import { RedisRateLimitService } from './services/redis-rate-limit.service';
import { RedisPubSubService } from './services/redis-pub-sub.service';
import { RedisPresenceService } from './services/redis-presence.service';
import { RedisRegistryService } from './services/redis-registry.service';
import { UserSecurityLockService } from './services/user-security-lock.service';
import { AiRedisPublisherService } from './services/ai-redis-publisher.service';

@Global()
@Module({
  imports: [ConfigModule.forFeature(redisConfig)],
  providers: [
    RedisService,
    RedisPubSubService,
    RedisPresenceService,
    RedisRegistryService,
    RedisRateLimitService,
    UserSecurityLockService,
    AiRedisPublisherService,
  ],
  exports: [
    RedisService,
    RedisPubSubService,
    RedisPresenceService,
    RedisRegistryService,
    RedisRateLimitService,
    UserSecurityLockService,
    AiRedisPublisherService,
  ],
})
export class RedisModule {}
