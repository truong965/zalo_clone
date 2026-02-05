import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { FriendshipService } from './friendship.service';
import { PrismaService } from '@database/prisma.service';
import { RedisService } from '@modules/redis/redis.service';
import { DistributedLockService } from '@common/distributed-lock/distributed-lock.service';
import { BLOCK_CHECKER } from '@modules/block/services/block-checker.interface';
import { FriendshipStatus } from '@prisma/client';
import socialConfig from '@config/social.config';
import { EventPublisher } from '@shared/events';
import {
  FriendshipNotFoundException,
  InvalidFriendshipStateException,
  SelfActionException,
} from '../errors/friendship.errors';

const mockFriendship = {
  id: 'friendship-123',
  user1Id: 'user-1',
  user2Id: 'user-2',
  requesterId: 'user-1',
  status: FriendshipStatus.PENDING,
  deletedAt: null,
  acceptedAt: null,
  declinedAt: null,
  expiresAt: new Date(),
  lastActionAt: new Date(),
  lastActionBy: 'user-1',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('FriendshipService', () => {
  let service: FriendshipService;
  let prisma: { friendship: Record<string, ReturnType<typeof vi.fn>> };
  let blockChecker: { isBlocked: ReturnType<typeof vi.fn> };
  let eventPublisher: { publish: ReturnType<typeof vi.fn> };
  let lockService: { withLock: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    prisma = {
      friendship: {
        findFirst: vi.fn().mockResolvedValue(mockFriendship),
        findUnique: vi.fn().mockResolvedValue(mockFriendship),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue(mockFriendship),
        update: vi
          .fn()
          .mockImplementation((args) =>
            Promise.resolve({ ...mockFriendship, ...args.data }),
          ),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };

    blockChecker = { isBlocked: vi.fn().mockResolvedValue(false) };

    eventPublisher = { publish: vi.fn().mockResolvedValue('evt-1') };

    lockService = {
      withLock: vi.fn().mockImplementation((_key, fn) => fn()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FriendshipService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: RedisService,
          useValue: {
            get: vi.fn().mockResolvedValue(null),
            setex: vi.fn().mockResolvedValue('OK'),
            del: vi.fn().mockResolvedValue(undefined),
            deletePattern: vi.fn().mockResolvedValue(0),
            getClient: vi.fn(() => ({
              pipeline: vi.fn(() => ({
                incr: vi.fn().mockReturnThis(),
                expire: vi.fn().mockReturnThis(),
                exec: vi.fn().mockResolvedValue([]),
              })),
            })),
          },
        },
        { provide: EventPublisher, useValue: eventPublisher },
        { provide: DistributedLockService, useValue: lockService },
        { provide: BLOCK_CHECKER, useValue: blockChecker },
        {
          provide: socialConfig.KEY,
          useValue: {
            ttl: { friendship: 300, friendList: 600 },
            limits: { friendRequest: { daily: 50, weekly: 100 } },
            cooldowns: { declineHours: 24, requestExpiryDays: 7 },
          },
        },
      ],
    }).compile();

    service = module.get<FriendshipService>(FriendshipService);
    vi.clearAllMocks();
  });

  describe('cancelRequest', () => {
    it('should throw FriendshipNotFoundException when friendship not found', async () => {
      prisma.friendship.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.cancelRequest('user-1', 'friendship-123'),
      ).rejects.toThrow(FriendshipNotFoundException);
      expect(eventPublisher.publish).not.toHaveBeenCalled();
    });

    it('should throw InvalidFriendshipStateException when not PENDING', async () => {
      prisma.friendship.findFirst.mockResolvedValueOnce({
        ...mockFriendship,
        status: FriendshipStatus.ACCEPTED,
      });

      await expect(
        service.cancelRequest('user-1', 'friendship-123'),
      ).rejects.toThrow(InvalidFriendshipStateException);
    });

    it('should throw when requester is not the one who sent', async () => {
      prisma.friendship.findFirst.mockResolvedValueOnce({
        ...mockFriendship,
        requesterId: 'user-2',
      });

      await expect(
        service.cancelRequest('user-1', 'friendship-123'),
      ).rejects.toThrow(InvalidFriendshipStateException);
    });

    it('should soft delete and emit friendship.request.cancelled', async () => {
      await service.cancelRequest('user-1', 'friendship-123');

      expect(prisma.friendship.update).toHaveBeenCalledWith({
        where: { id: 'friendship-123' },
        data: expect.objectContaining({
          deletedAt: expect.any(Date),
          lastActionAt: expect.any(Date),
          lastActionBy: 'user-1',
        }),
      });
      expect(eventPublisher.publish).toHaveBeenCalled();
    });
  });

  describe('removeFriendship', () => {
    it('should throw SelfActionException when unfriending self', async () => {
      await expect(
        service.removeFriendship('user-1', 'user-1'),
      ).rejects.toThrow(SelfActionException);
    });

    it('should throw FriendshipNotFoundException when no friendship', async () => {
      prisma.friendship.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.removeFriendship('user-1', 'user-2'),
      ).rejects.toThrow(FriendshipNotFoundException);
    });
  });

  describe('areFriends', () => {
    it('should return true when ACCEPTED friendship exists', async () => {
      prisma.friendship.findFirst.mockResolvedValueOnce({
        ...mockFriendship,
        status: FriendshipStatus.ACCEPTED,
        deletedAt: null,
      });

      const result = await service.areFriends('user-1', 'user-2');
      expect(result).toBe(true);
    });

    it('should return false when no friendship or not ACCEPTED', async () => {
      prisma.friendship.findFirst.mockResolvedValueOnce(null);

      const result = await service.areFriends('user-1', 'user-2');
      expect(result).toBe(false);
    });
  });
});
