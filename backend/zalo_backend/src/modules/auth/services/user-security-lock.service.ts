import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { RedisService } from 'src/shared/redis/redis.service';
import { RedisKeyBuilder } from '@shared/redis/redis-key-builder';

@Injectable()
export class UserSecurityLockService {
  private readonly logger = new Logger(UserSecurityLockService.name);

  constructor(private readonly redis: RedisService) {}

  /**
   * Run an action with a distributed security lock on the userId.
   * Prevents simultaneous sensitive operations (password change, reset, deletion).
   * 
   * @param userId The userId to lock
   * @param action The operation to perform while holding the lock
   * @param ttlSeconds Lock timeout (default 10s)
   */
  async runWithLock<T>(
    userId: string,
    action: () => Promise<T>,
    ttlSeconds = 10,
  ): Promise<T> {
    const lockKey = RedisKeyBuilder.userSecurityLock(userId);
    const lockValue = uuidv4();
    const client = this.redis.getClient();

    // 1. Try to acquire lock: SET key uuid NX EX ttl
    const acquired = await client.set(lockKey, lockValue, 'EX', ttlSeconds, 'NX');

    if (acquired !== 'OK') {
      this.logger.warn(`Security lock failed for user ${userId} - resource busy`);
      throw new HttpException(
        'Tài khoản của bạn đang được xử lý một yêu cầu bảo mật khác. Vui lòng thử lại sau giây lát.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    try {
      this.logger.debug(`Security lock acquired for user ${userId}`);
      return await action();
    } finally {
      // 2. Safe release using Lua script: only delete if current value matches my lockValue
      const releaseScript = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;
      
      try {
        await client.eval(releaseScript, 1, lockKey, lockValue);
        this.logger.debug(`Security lock released for user ${userId}`);
      } catch (err) {
        this.logger.error(`Failed to release security lock for user ${userId}`, err);
      }
    }
  }
}
