import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { BlockService } from './block.service';
import { PrismaService } from '@database/prisma.service';
import { RedisService } from '@modules/redis/redis.service';
import { BLOCK_REPOSITORY } from './repositories/block.repository.interface';
import { SelfActionException } from '@shared/errors';
import socialConfig from '@config/social.config';
import { ConfigModule } from '@nestjs/config';
import { EventPublisher } from '@shared/events';

const mockBlock = {
  id: 'block-123',
  blockerId: 'user-1',
  blockedId: 'user-2',
  reason: null,
  createdAt: new Date(),
};

describe('BlockService', () => {
  let service: BlockService;
  let prisma: {
    block: {
      create: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
  };
  let eventPublisher: { publish: ReturnType<typeof vi.fn> };
  let blockRepository: { findByPair: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    prisma = {
      block: {
        create: vi.fn().mockResolvedValue(mockBlock),
        delete: vi.fn().mockResolvedValue(undefined),
      },
    };

    eventPublisher = { publish: vi.fn().mockResolvedValue('evt-1') };

    blockRepository = {
      findByPair: vi.fn().mockResolvedValue(mockBlock),
    };

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          load: [() => ({ social: { ttl: { block: 3600 } } })],
        }),
      ],
      providers: [
        BlockService,
        {
          provide: PrismaService,
          useValue: { block: prisma.block },
        },
        {
          provide: RedisService,
          useValue: {
            get: vi.fn(),
            setex: vi.fn(),
            del: vi.fn(),
            getClient: vi.fn(() => ({ mget: vi.fn(), del: vi.fn() })),
          },
        },
        {
          provide: EventPublisher,
          useValue: eventPublisher,
        },
        {
          provide: BLOCK_REPOSITORY,
          useValue: blockRepository,
        },
        {
          provide: socialConfig.KEY,
          useValue: { ttl: { block: 3600 } },
        },
      ],
    }).compile();

    service = module.get<BlockService>(BlockService);
    vi.clearAllMocks();
  });

  describe('blockUser', () => {
    it('should throw SelfActionException when blocking self', async () => {
      await expect(
        service.blockUser('user-1', { targetUserId: 'user-1' }),
      ).rejects.toThrow(SelfActionException);
      expect(prisma.block.create).not.toHaveBeenCalled();
      expect(eventPublisher.publish).not.toHaveBeenCalled();
    });

    it('should create block and emit user.blocked event', async () => {
      const result = await service.blockUser('user-1', {
        targetUserId: 'user-2',
        reason: 'test',
      });

      expect(prisma.block.create).toHaveBeenCalledWith({
        data: {
          blockerId: 'user-1',
          blockedId: 'user-2',
          reason: 'test',
        },
      });
      expect(eventPublisher.publish).toHaveBeenCalled();
      expect(result.blockerId).toBe('user-1');
      expect(result.blockedId).toBe('user-2');
    });

    it('should return existing block when P2002 (idempotent)', async () => {
      const p2002 = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        { code: 'P2002', clientVersion: '5', meta: { target: ['blockerId'] } },
      );
      prisma.block.create.mockRejectedValueOnce(p2002);

      const result = await service.blockUser('user-1', {
        targetUserId: 'user-2',
      });

      expect(blockRepository.findByPair).toHaveBeenCalledWith(
        'user-1',
        'user-2',
      );
      expect(result.blockerId).toBe('user-1');
      expect(result.blockedId).toBe('user-2');
      expect(eventPublisher.publish).not.toHaveBeenCalled();
    });
  });

  describe('unblockUser', () => {
    it('should throw SelfActionException when unblocking self', async () => {
      await expect(service.unblockUser('user-1', 'user-1')).rejects.toThrow(
        SelfActionException,
      );
    });

    it('should do nothing when block does not exist (idempotent)', async () => {
      blockRepository.findByPair.mockResolvedValueOnce(null);

      await service.unblockUser('user-1', 'user-2');

      expect(prisma.block.delete).not.toHaveBeenCalled();
      expect(eventPublisher.publish).not.toHaveBeenCalled();
    });

    it('should delete block and emit user.unblocked with blockId', async () => {
      await service.unblockUser('user-1', 'user-2');

      expect(blockRepository.findByPair).toHaveBeenCalledWith(
        'user-1',
        'user-2',
      );
      expect(prisma.block.delete).toHaveBeenCalledWith({
        where: { id: mockBlock.id },
      });
      expect(eventPublisher.publish).toHaveBeenCalled();
    });
  });
});
