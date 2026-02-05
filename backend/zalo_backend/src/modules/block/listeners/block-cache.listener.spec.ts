import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { BlockCacheListener } from './block-cache.listener';
import { RedisService } from '@modules/redis/redis.service';
import { IdempotencyService } from '@common/idempotency/idempotency.service';
import { UserBlockedEvent, UserUnblockedEvent } from '../events/versioned-events';

describe('BlockCacheListener', () => {
  let listener: BlockCacheListener;
  let redisService: { mDel: ReturnType<typeof vi.fn> };
  let idempotency: {
    isProcessed: ReturnType<typeof vi.fn>;
    recordProcessed: ReturnType<typeof vi.fn>;
    recordError: ReturnType<typeof vi.fn>;
  };

  const createBlockedEvent = (): UserBlockedEvent =>
    new UserBlockedEvent('user-1', 'user-2', 'block-123', undefined);

  const createUnblockedEvent = (): UserUnblockedEvent =>
    new UserUnblockedEvent('user-1', 'user-2', 'block-123');

  beforeEach(async () => {
    redisService = { mDel: vi.fn().mockResolvedValue(0) };

    idempotency = {
      isProcessed: vi.fn().mockResolvedValue(false),
      recordProcessed: vi.fn().mockResolvedValue(undefined),
      recordError: vi.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BlockCacheListener,
        {
          provide: RedisService,
          useValue: { mDel: redisService.mDel },
        },
        {
          provide: IdempotencyService,
          useValue: idempotency,
        },
      ],
    }).compile();

    listener = module.get<BlockCacheListener>(BlockCacheListener);
    vi.clearAllMocks();
  });

  describe('handleUserBlocked', () => {
    it('should skip when already processed', async () => {
      idempotency.isProcessed.mockResolvedValueOnce(true);

      await listener.handleUserBlocked(createBlockedEvent());

      expect(redisService.mDel).not.toHaveBeenCalled();
      expect(idempotency.recordProcessed).not.toHaveBeenCalled();
    });

    it('should invalidate cache and record processed', async () => {
      await listener.handleUserBlocked(createBlockedEvent());

      expect(redisService.mDel).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.stringContaining('BLOCK'),
          expect.stringContaining('PERMISSION'),
        ]),
      );
      expect(idempotency.recordProcessed).toHaveBeenCalledWith(
        expect.any(String),
        'BlockCacheListener',
        'USER_BLOCKED',
        undefined,
        1,
      );
    });
  });

  describe('handleUserUnblocked', () => {
    it('should skip when already processed', async () => {
      idempotency.isProcessed.mockResolvedValueOnce(true);

      await listener.handleUserUnblocked(createUnblockedEvent());

      expect(redisService.mDel).not.toHaveBeenCalled();
      expect(idempotency.recordProcessed).not.toHaveBeenCalled();
    });

    it('should invalidate permission cache and record processed', async () => {
      await listener.handleUserUnblocked(createUnblockedEvent());

      expect(redisService.mDel).toHaveBeenCalled();
      expect(idempotency.recordProcessed).toHaveBeenCalledWith(
        expect.any(String),
        'BlockCacheListener',
        'USER_UNBLOCKED',
        undefined,
        1,
      );
    });
  });
});
