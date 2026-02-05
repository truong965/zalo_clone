import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { FriendshipBlockListener } from './friendship-block.listener';
import { PrismaService } from '@database/prisma.service';
import { IdempotencyService } from '@common/idempotency/idempotency.service';
import { RedisService } from '@modules/redis/redis.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UserBlockedEvent, UserUnblockedEvent } from '@modules/block/events/versioned-events';

describe('FriendshipBlockListener', () => {
  let listener: FriendshipBlockListener;
  let prisma: { friendship: { findFirst: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn> } };
  let idempotency: { isProcessed: ReturnType<typeof vi.fn>; recordProcessed: ReturnType<typeof vi.fn> };
  let redis: { del: ReturnType<typeof vi.fn> };
  let eventEmitter: { emit: ReturnType<typeof vi.fn> };

  const blockedEvent = new UserBlockedEvent('user-1', 'user-2', 'block-123');
  const unblockedEvent = new UserUnblockedEvent('user-1', 'user-2', 'block-123');

  const mockFriendship = {
    id: 'friendship-1',
    user1Id: 'user-1',
    user2Id: 'user-2',
    status: 'ACCEPTED',
    deletedAt: null,
  };

  beforeEach(async () => {
    prisma = {
      friendship: {
        findFirst: vi.fn().mockResolvedValue(mockFriendship),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };

    idempotency = {
      isProcessed: vi.fn().mockResolvedValue(false),
      recordProcessed: vi.fn().mockResolvedValue(undefined),
    };

    redis = { del: vi.fn().mockResolvedValue(undefined) };

    eventEmitter = { emit: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FriendshipBlockListener,
        { provide: PrismaService, useValue: prisma },
        { provide: IdempotencyService, useValue: idempotency },
        { provide: RedisService, useValue: { del: redis.del } },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    listener = module.get<FriendshipBlockListener>(FriendshipBlockListener);
    vi.clearAllMocks();
  });

  describe('handleUserBlocked', () => {
    it('should skip when already processed', async () => {
      idempotency.isProcessed.mockResolvedValueOnce(true);

      await listener.handleUserBlocked(blockedEvent);

      expect(prisma.friendship.updateMany).not.toHaveBeenCalled();
      expect(redis.del).not.toHaveBeenCalled();
    });

    it('should soft delete friendship when one exists', async () => {
      await listener.handleUserBlocked(blockedEvent);

      expect(prisma.friendship.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            user1Id: expect.any(String),
            user2Id: expect.any(String),
            deletedAt: null,
          }),
        }),
      );
      expect(prisma.friendship.updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          user1Id: expect.any(String),
          user2Id: expect.any(String),
          deletedAt: null,
        }),
        data: { deletedAt: expect.any(Date) },
      });
      expect(redis.del).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'cache.invalidate',
        expect.objectContaining({ reason: 'friendship_deleted_by_block' }),
      );
      expect(idempotency.recordProcessed).toHaveBeenCalled();
    });

    it('should not update when no friendship exists', async () => {
      prisma.friendship.findFirst.mockResolvedValueOnce(null);

      await listener.handleUserBlocked(blockedEvent);

      expect(prisma.friendship.updateMany).not.toHaveBeenCalled();
      expect(redis.del).toHaveBeenCalled();
    });
  });

  describe('handleUserUnblocked', () => {
    it('should restore soft-deleted friendship', async () => {
      await listener.handleUserUnblocked(unblockedEvent);

      expect(prisma.friendship.updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          deletedAt: { not: null },
        }),
        data: { deletedAt: null },
      });
      expect(redis.del).toHaveBeenCalled();
      expect(idempotency.recordProcessed).toHaveBeenCalled();
    });

    it('should skip when already processed', async () => {
      idempotency.isProcessed.mockResolvedValueOnce(true);

      await listener.handleUserUnblocked(unblockedEvent);

      expect(prisma.friendship.updateMany).not.toHaveBeenCalled();
    });
  });
});
