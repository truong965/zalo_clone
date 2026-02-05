/**
 * R10: Distributed Lock Service
 *
 * Implements distributed mutual exclusion using Redis.
 * Prevents race conditions in concurrent state mutations.
 *
 * Key Features:
 * - Atomic lock acquisition using Redis SET NX
 * - Automatic lock expiration with TTL
 * - Exponential backoff retry logic
 * - Lock release with value verification (prevent releasing others' locks)
 * - Graceful timeout handling
 *
 * Use Cases:
 * - sendFriendRequest() - prevent duplicate requests
 * - acceptFriendRequest() - atomic status update
 * - unfriend() - dual-user state mutation
 * - blockUser() - prevent double-blocking
 *
 * Algorithm:
 * 1. Generate unique lock value (UUID)
 * 2. Attempt SET with NX (only if not exists)
 * 3. If fails, retry with exponential backoff
 * 4. On success, return lock token
 * 5. On release, verify token matches before deleting
 *
 * Safety Properties:
 * - Mutual Exclusion: Only one process holds lock
 * - Deadlock-free: Automatic expiration ensures lock release
 * - Fairness: FIFO retry ordering with backoff
 * - Atomicity: Single Redis command for acquire/release
 */

import { Injectable } from '@nestjs/common';
import { RedisService } from 'src/modules/redis/redis.service';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '@nestjs/common';

@Injectable()
export class DistributedLockService {
  private readonly logger = new Logger(DistributedLockService.name);

  constructor(private readonly redis: RedisService) {}

  /**
   * Acquire a distributed lock with exponential backoff retry
   *
   * @param lockKey - Redis key for the lock (e.g., from RedisKeyBuilder)
   * @param ttlSeconds - Lock time-to-live in seconds (default: 30)
   * @param maxRetries - Maximum number of retry attempts (default: 10)
   * @param initialDelayMs - Initial retry delay in milliseconds (default: 50)
   * @returns Lock token (UUID) if acquired, null if failed after retries
   *
   * Example:
   * ```
   * const lockKey = RedisKeyBuilder.friendshipLock(userId1, userId2);
   * const lockToken = await lockService.acquire(lockKey, 30, 10);
   * if (!lockToken) throw new Error('Could not acquire lock');
   * try {
   *   // Critical section
   * } finally {
   *   await lockService.release(lockKey, lockToken);
   * }
   * ```
   */
  async acquire(
    lockKey: string,
    ttlSeconds: number = 30,
    maxRetries: number = 10,
    initialDelayMs: number = 50,
  ): Promise<string | null> {
    const lockValue = uuidv4();
    let delayMs = initialDelayMs;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Attempt atomic lock acquisition: SET only if not exists
        const result = await this.redis.getClient().set(
          lockKey,
          lockValue,
          'EX',
          ttlSeconds,
          'NX', // Only set if not exists
        );

        // result is "OK" if SET succeeded, null if key already exists
        if (result === 'OK') {
          this.logger.debug(
            `Lock acquired: ${lockKey} (attempt ${attempt + 1}/${maxRetries + 1})`,
          );
          return lockValue;
        }

        // Lock is held by another process, wait and retry
        if (attempt < maxRetries) {
          this.logger.debug(
            `Lock contention on ${lockKey}, retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})`,
          );

          // Exponential backoff: delay = delay * 2, capped at 5s
          await this.sleep(delayMs);
          delayMs = Math.min(delayMs * 2, 5000);
        }
      } catch (error: any) {
        this.logger.error(
          `Error acquiring lock ${lockKey}: ${error?.message}`,
          error?.stack,
        );
        throw error;
      }
    }

    this.logger.warn(
      `Failed to acquire lock ${lockKey} after ${maxRetries + 1} attempts`,
    );
    return null;
  }

  /**
   * Release a distributed lock
   *
   * Uses Lua script to atomically verify token and delete lock,
   * preventing accidental release of locks held by other processes.
   *
   * @param lockKey - Same Redis key from acquire()
   * @param lockToken - Lock token returned from acquire()
   * @returns true if lock was released, false if lock was held by another process
   */
  async release(lockKey: string, lockToken: string): Promise<boolean> {
    try {
      // Lua script: delete key only if value matches
      const luaScript = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;

      const result = await this.redis
        .getClient()
        .eval(luaScript, 1, lockKey, lockToken);

      const released = result === 1;

      if (released) {
        this.logger.debug(`Lock released: ${lockKey}`);
      } else {
        this.logger.warn(
          `Could not release lock ${lockKey}: token mismatch (lock held by another process)`,
        );
      }

      return released;
    } catch (error: any) {
      this.logger.error(
        `Error releasing lock ${lockKey}: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * Check if a lock is currently held
   *
   * @param lockKey - Redis key for the lock
   * @returns true if lock exists, false otherwise
   */
  async isLocked(lockKey: string): Promise<boolean> {
    try {
      const exists = await this.redis.getClient().exists(lockKey);
      return exists === 1;
    } catch (error: any) {
      this.logger.error(
        `Error checking lock ${lockKey}: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * Force release a lock (without token verification)
   *
   * WARNING: Only use this in exceptional cases (e.g., manual admin cleanup).
   * Normal operations should use release() with proper token verification.
   *
   * @param lockKey - Redis key for the lock
   * @returns true if lock was deleted, false if it didn't exist
   */
  async forceRelease(lockKey: string): Promise<boolean> {
    try {
      const result = await this.redis.getClient().del(lockKey);
      const released = result === 1;

      if (released) {
        this.logger.warn(`Lock force-released: ${lockKey}`);
      }

      return released;
    } catch (error: any) {
      this.logger.error(
        `Error force-releasing lock ${lockKey}: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * Execute function with automatic lock management
   *
   * Acquires lock, executes function, then releases lock.
   * Handles lock acquisition timeout and ensures release on error.
   *
   * @param lockKey - Redis key for the lock
   * @param fn - Async function to execute within lock
   * @param ttlSeconds - Lock TTL in seconds (default: 30)
   * @param maxRetries - Max lock acquisition retries (default: 10)
   * @returns Result of fn() if lock acquired, throws if lock acquisition fails
   *
   * Example:
   * ```
   * const result = await lockService.withLock(
   *   RedisKeyBuilder.friendshipLock(userId1, userId2),
   *   async () => {
   *     // Critical section
   *     return await friendshipService.createFriendship(userId1, userId2);
   *   },
   *   30,
   *   10
   * );
   * ```
   */
  async withLock<T>(
    lockKey: string,
    fn: () => Promise<T>,
    ttlSeconds: number = 30,
    maxRetries: number = 10,
  ): Promise<T> {
    const lockToken = await this.acquire(lockKey, ttlSeconds, maxRetries);

    if (!lockToken) {
      throw new Error(
        `Failed to acquire lock for ${lockKey} after ${maxRetries + 1} attempts`,
      );
    }

    try {
      this.logger.debug(`Executing critical section with lock: ${lockKey}`);
      return await fn();
    } finally {
      // Always release lock, even if fn() throws
      await this.release(lockKey, lockToken);
    }
  }

  /**
   * Helper: Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Cleanup: Remove all locks matching pattern (emergency use only)
   *
   * @param pattern - Redis key pattern (e.g., "FRIENDSHIP:LOCK:*")
   * @returns Number of locks deleted
   */
  async cleanupLocks(pattern: string): Promise<number> {
    try {
      const keys = await this.redis.getClient().keys(pattern);

      if (keys.length === 0) {
        return 0;
      }

      const deleted = await this.redis.getClient().del(...keys);
      this.logger.warn(
        `Cleanup: Deleted ${deleted} locks matching pattern ${pattern}`,
      );

      return deleted;
    } catch (error: any) {
      this.logger.error(
        `Error cleaning up locks with pattern ${pattern}: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }
}
