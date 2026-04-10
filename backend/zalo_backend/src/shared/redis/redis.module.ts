import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisService } from './redis.service';

import redisConfig from '../../config/redis.config';
import { RedisRateLimitService } from './services/redis-rate-limit.service';
import { RedisPubSubService } from './services/redis-pub-sub.service';
import { RedisPresenceService } from './services/redis-presence.service';
import { RedisRegistryService } from './services/redis-registry.service';
import { UserSecurityLockService } from './services/user-security-lock.service';

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
  ],
  exports: [
    RedisService,
    RedisPubSubService,
    RedisPresenceService,
    RedisRegistryService,
    RedisRateLimitService,
    UserSecurityLockService,
  ],
})
export class RedisModule {}
