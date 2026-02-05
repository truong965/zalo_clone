import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PrivacyBlockListener } from './privacy-block.listener';
import { RedisService } from '@modules/redis/redis.service';
import { IdempotencyService } from '@common/idempotency/idempotency.service';

describe('PrivacyBlockListener', () => {
  let listener: PrivacyBlockListener;
  let redisDel: ReturnType<typeof vi.fn>;
  let idempotency: { isProcessed: ReturnType<typeof vi.fn>; recordProcessed: ReturnType<typeof vi.fn> };

  const blockedEvent = {
    blockerId: 'user-1',
    blockedId: 'user-2',
    eventId: 'evt-123',
    correlationId: undefined,
    version: 1,
  };

  beforeEach(async () => {
    redisDel = vi.fn().mockResolvedValue(undefined);

    idempotency = {
      isProcessed: vi.fn().mockResolvedValue(false),
      recordProcessed: vi.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrivacyBlockListener,
        {
          provide: RedisService,
          useValue: {
            del: redisDel,
          },
        },
        {
          provide: IdempotencyService,
          useValue: idempotency,
        },
      ],
    }).compile();

    listener = module.get<PrivacyBlockListener>(PrivacyBlockListener);
    vi.clearAllMocks();
  });

  describe('handleUserBlocked', () => {
    it('should skip when already processed', async () => {
      idempotency.isProcessed.mockResolvedValueOnce(true);

      await listener.handleUserBlocked(blockedEvent as any);

      expect(redisDel).not.toHaveBeenCalled();
      expect(idempotency.recordProcessed).not.toHaveBeenCalled();
    });

    it('should invalidate permission cache and record processed', async () => {
      await listener.handleUserBlocked(blockedEvent as any);

      expect(redisDel).toHaveBeenCalled();
      expect(idempotency.recordProcessed).toHaveBeenCalledWith(
        'evt-123',
        'PrivacyBlockListener',
        'USER_BLOCKED',
        undefined,
        1,
      );
    });
  });

  describe('handleUserUnblocked', () => {
    it('should skip when already processed', async () => {
      idempotency.isProcessed.mockResolvedValueOnce(true);

      await listener.handleUserUnblocked({ ...blockedEvent, eventId: 'evt-456' } as any);

      expect(redisDel).not.toHaveBeenCalled();
    });

    it('should invalidate cache and record processed', async () => {
      await listener.handleUserUnblocked({ ...blockedEvent, eventId: 'evt-456' } as any);

      expect(redisDel).toHaveBeenCalled();
      expect(idempotency.recordProcessed).toHaveBeenCalledWith(
        'evt-456',
        'PrivacyBlockListener',
        'USER_UNBLOCKED',
        undefined,
        1,
      );
    });
  });
});
