import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { RedisService } from '../redis.service';
import { RedisKeyBuilder } from '../redis-key-builder';

@Injectable()
export class UserSecurityLockService {
  private readonly logger = new Logger(UserSecurityLockService.name);

  constructor(private readonly redis: RedisService) {}

  /**
   * Run an action with a distributed security lock on the userId.
   */
  async runWithLock<T>(
    userId: string,
    action: () => Promise<T>,
    ttlSeconds = 10,
  ): Promise<T> {
    const lockKey = RedisKeyBuilder.userSecurityLock(userId);
    return this.runWithKeyLock(lockKey, action, ttlSeconds);
  }

  /**
   * Run an action with a distributed security lock on the phoneNumber.
   */
  async runWithPhoneLock<T>(
    phone: string,
    action: () => Promise<T>,
    ttlSeconds = 10,
  ): Promise<T> {
    const lockKey = RedisKeyBuilder.phoneSecurityLock(phone);
    return this.runWithKeyLock(lockKey, action, ttlSeconds);
  }

  /**
   * Core distributed lock logic
   */
  private async runWithKeyLock<T>(
    lockKey: string,
    action: () => Promise<T>,
    ttlSeconds = 10,
  ): Promise<T> {
    const lockValue = uuidv4();
    const client = this.redis.getClient();

    // 1. Try to acquire lock: SET key uuid NX EX ttl
    const acquired = await client.set(lockKey, lockValue, 'EX', ttlSeconds, 'NX');

    if (acquired !== 'OK') {
      this.logger.warn(`Security lock failed for key ${lockKey} - resource busy`);
      throw new HttpException(
        'Yêu cầu của bạn đang được xử lý. Vui lòng thử lại sau giây lát.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    try {
      this.logger.debug(`Security lock acquired for key ${lockKey}`);
      return await action();
    } finally {
      // 2. Safe release using Lua script
      const releaseScript = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;
      
      try {
        await client.eval(releaseScript, 1, lockKey, lockValue);
        this.logger.debug(`Security lock released for key ${lockKey}`);
      } catch (err) {
        this.logger.error(`Failed to release security lock for key ${lockKey}`, err);
      }
    }
  }
}
