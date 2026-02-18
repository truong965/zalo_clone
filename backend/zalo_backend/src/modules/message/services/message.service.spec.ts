import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { MessageService } from './message.service';
import { PrismaService } from '@database/prisma.service';
import { RedisService } from '@modules/redis/redis.service';
import { EventPublisher } from '@shared/events';
import redisConfig from '@config/redis.config';
import { InteractionAuthorizationService } from '@modules/authorization/services/interaction-authorization.service';
import {
  MediaProcessingStatus,
  MemberStatus,
  MessageType,
} from '@prisma/client';
import { GetMessagesDto } from '../dto/get-messages.dto';

describe('MessageService', () => {
  let service: MessageService;

  let prisma: {
    conversationMember: { findUnique: ReturnType<typeof vi.fn> };
    message: { findMany: ReturnType<typeof vi.fn> };
  };

  beforeEach(async () => {
    prisma = {
      conversationMember: {
        findUnique: vi.fn(),
      },
      message: {
        findMany: vi.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessageService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: RedisService,
          useValue: {
            getClient: vi.fn(() => ({ get: vi.fn(), set: vi.fn() })),
          },
        },
        {
          provide: EventPublisher,
          useValue: { publish: vi.fn() },
        },
        {
          provide: InteractionAuthorizationService,
          useValue: { assertCanInteract: vi.fn() },
        },
        {
          provide: redisConfig.KEY,
          useValue: {
            ttl: {
              messageIdempotency: 60,
            },
          },
        },
      ],
    }).compile();

    service = module.get<MessageService>(MessageService);
    vi.clearAllMocks();
  });

  describe('getMessages', () => {
    it('should throw ForbiddenException if user is not member', async () => {
      prisma.conversationMember.findUnique.mockResolvedValueOnce(null);

      const dto: GetMessagesDto = { conversationId: 'c1', limit: 10 };
      await expect(service.getMessages(dto, 'user-1')).rejects.toThrow(
        ForbiddenException,
      );

      expect(prisma.message.findMany).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when cursor is invalid', async () => {
      prisma.conversationMember.findUnique.mockResolvedValueOnce({
        status: MemberStatus.ACTIVE,
      });

      const dto: GetMessagesDto = {
        conversationId: 'c1',
        limit: 10,
        cursor: 'not-a-number',
      };
      await expect(service.getMessages(dto, 'user-1')).rejects.toThrow(
        BadRequestException,
      );

      expect(prisma.message.findMany).not.toHaveBeenCalled();
    });

    it('should return CursorPaginatedResult with data+meta', async () => {
      prisma.conversationMember.findUnique.mockResolvedValueOnce({
        status: MemberStatus.ACTIVE,
      });

      const messages = [
        {
          id: BigInt(3),
          conversationId: 'c1',
          content: 'm3',
          type: MessageType.TEXT,
          senderId: 'user-1',
          createdAt: new Date('2025-01-01T00:00:03.000Z'),
          deletedAt: null,
          sender: { id: 'user-1', displayName: 'U1', avatarUrl: null },
          parentMessage: null,
          deliveredCount: 0,
          seenCount: 0,
          totalRecipients: 1,
          directReceipts: null,
          mediaAttachments: [
            {
              id: 'media-1',
              mediaType: 'IMAGE',
              cdnUrl: 'cdn',
              thumbnailUrl: null,
              width: 100,
              height: 100,
              duration: null,
              processingStatus: MediaProcessingStatus.READY,
              originalName: 'x',
              size: 1,
            },
          ],
          deletedById: null,
        },
        {
          id: BigInt(2),
          conversationId: 'c1',
          content: 'm2',
          type: MessageType.TEXT,
          senderId: 'user-2',
          createdAt: new Date('2025-01-01T00:00:02.000Z'),
          deletedAt: null,
          sender: { id: 'user-2', displayName: 'U2', avatarUrl: null },
          parentMessage: null,
          deliveredCount: 0,
          seenCount: 0,
          totalRecipients: 1,
          directReceipts: null,
          mediaAttachments: [],
          deletedById: null,
        },
      ];

      prisma.message.findMany.mockResolvedValueOnce(messages);

      const dto: GetMessagesDto = { conversationId: 'c1', limit: 2 };
      const result = await service.getMessages(dto, 'user-1');

      expect(prisma.message.findMany).toHaveBeenCalled();
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('meta');
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.meta.limit).toBe(2);
      expect(result.data).toHaveLength(2);
      expect(result.meta.hasNextPage).toBe(false);
      expect(result.meta.nextCursor).toBe(undefined);
    });
  });
});
