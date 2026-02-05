import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { FriendshipBlockListener } from './friendship-block.listener';
import { PrismaService } from '@database/prisma.service';
import { IdempotencyService } from '@common/idempotency/idempotency.service';
import { RedisService } from '@modules/redis/redis.service';
import type {
  UserBlockedEventPayload,
  UserUnblockedEventPayload,
} from '@shared/events/contracts';
import { EventIdGenerator } from '@common/utils/event-id-generator';

describe('FriendshipBlockListener', () => {
  let listener: FriendshipBlockListener;
  let prisma: { friendship: any };
  let idempotency: {
    isProcessed: ReturnType<typeof vi.fn>;
    recordProcessed: ReturnType<typeof vi.fn>;
    recordError?: ReturnType<typeof vi.fn>;
  };
  let redis: { del: ReturnType<typeof vi.fn> };

  const blockedEvent: UserBlockedEventPayload = {
    eventId: EventIdGenerator.generate(),
    eventType: 'USER_BLOCKED',
    version: 1,
    timestamp: new Date(),
    source: 'BlockModule',
    aggregateId: 'user-1',
    blockerId: 'user-1',
    blockedId: 'user-2',
    blockId: 'block-123',
  };
  const unblockedEvent: UserUnblockedEventPayload = {
    eventId: EventIdGenerator.generate(),
    eventType: 'USER_UNBLOCKED',
    version: 1,
    timestamp: new Date(),
    source: 'BlockModule',
    aggregateId: 'user-1',
    blockerId: 'user-1',
    blockedId: 'user-2',
    blockId: 'block-123',
  };

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FriendshipBlockListener,
        { provide: PrismaService, useValue: prisma },
        { provide: IdempotencyService, useValue: idempotency },
        { provide: RedisService, useValue: { del: redis.del } },
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
            user1Id: expect.any(String) as unknown,
            user2Id: expect.any(String) as unknown,
            deletedAt: null,
          }) as unknown,
        }),
      );
      expect(prisma.friendship.updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          user1Id: expect.any(String) as unknown,
          user2Id: expect.any(String) as unknown,
          deletedAt: null,
        }) as unknown,
        data: { deletedAt: expect.any(Date) as unknown },
      });
      expect(redis.del).toHaveBeenCalled();
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
          deletedAt: { not: null } as unknown,
        }) as unknown,
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
