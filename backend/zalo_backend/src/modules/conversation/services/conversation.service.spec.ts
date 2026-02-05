import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ConversationService } from './conversation.service';
import { PrismaService } from '@database/prisma.service';
import { ConversationType, MemberRole, MemberStatus } from '@prisma/client';

type Tx = {
  conversation: {
    create: (args: unknown) => Promise<{ id: string }>;
  };
  conversationMember: {
    createMany: (args: unknown) => Promise<{ count: number }>;
  };
};

type Transaction = (
  fn: (tx: Tx) => Promise<{ id: string }>,
) => Promise<{ id: string }>;

describe('ConversationService', () => {
  let service: ConversationService;

  let prisma: {
    conversationMember: { findUnique: ReturnType<typeof vi.fn> };
    conversation: {
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    $transaction: ReturnType<typeof vi.fn<Transaction>>;
  };

  beforeEach(async () => {
    prisma = {
      conversationMember: { findUnique: vi.fn() },
      conversation: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
      },
      $transaction: vi.fn<Transaction>(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<ConversationService>(ConversationService);
    vi.clearAllMocks();
  });

  describe('isMember', () => {
    it('should return false when member not found', async () => {
      prisma.conversationMember.findUnique.mockResolvedValueOnce(null);

      const result = await service.isMember('c1', 'u1');
      expect(result).toBe(false);
    });

    it('should return true when member is ACTIVE', async () => {
      prisma.conversationMember.findUnique.mockResolvedValueOnce({
        status: MemberStatus.ACTIVE,
      });

      const result = await service.isMember('c1', 'u1');
      expect(result).toBe(true);
    });
  });

  describe('getOrCreateDirectConversation', () => {
    it('should throw when creating conversation with self', async () => {
      await expect(
        service.getOrCreateDirectConversation('u1', 'u1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should return existing conversation when found', async () => {
      prisma.conversation.findFirst.mockResolvedValueOnce({ id: 'c-existing' });

      const result = await service.getOrCreateDirectConversation('u1', 'u2');

      expect(prisma.conversation.findFirst).toHaveBeenCalledWith({
        where: {
          type: ConversationType.DIRECT,
          members: {
            every: {
              userId: { in: ['u1', 'u2'].sort() },
              status: MemberStatus.ACTIVE,
            },
          },
        },
        select: { id: true },
      });
      expect(result).toEqual({ id: 'c-existing', isNew: false });
    });

    it('should create conversation in a transaction when none exists', async () => {
      prisma.conversation.findFirst.mockResolvedValueOnce(null);

      const tx: Tx = {
        conversation: {
          create: vi.fn().mockResolvedValue({ id: 'c-new' }),
        },
        conversationMember: {
          createMany: vi.fn().mockResolvedValue({ count: 2 }),
        },
      };

      prisma.$transaction.mockImplementationOnce((fn) => {
        return fn(tx);
      });

      const result = await service.getOrCreateDirectConversation('u2', 'u1');

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result).toEqual({ id: 'c-new', isNew: true });
    });
  });

  describe('getUserConversations', () => {
    it('should return CursorPaginatedResult with data+meta', async () => {
      const convs = [
        {
          id: 'c1',
          type: ConversationType.DIRECT,
          name: null,
          avatarUrl: null,
          createdAt: new Date('2025-01-01T00:00:00.000Z'),
          lastMessageAt: new Date('2025-01-01T00:00:10.000Z'),
          members: [
            {
              userId: 'u1',
              role: MemberRole.MEMBER,
              status: MemberStatus.ACTIVE,
              user: {
                id: 'u1',
                displayName: 'U1',
                avatarUrl: null,
                lastSeenAt: new Date('2025-01-01T00:00:00.000Z'),
              },
            },
            {
              userId: 'u2',
              role: MemberRole.MEMBER,
              status: MemberStatus.ACTIVE,
              user: {
                id: 'u2',
                displayName: 'U2',
                avatarUrl: null,
                lastSeenAt: new Date('2025-01-01T00:00:00.000Z'),
              },
            },
          ],
          messages: [
            {
              id: BigInt(1),
              content: 'hi',
              type: 'TEXT',
              senderId: 'u1',
              createdAt: new Date('2025-01-01T00:00:10.000Z'),
              deletedById: null,
            },
          ],
        },
      ];

      prisma.conversation.findMany.mockResolvedValueOnce(convs);

      const result = await service.getUserConversations('u1', undefined, 20);

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('meta');
      expect(result.meta.limit).toBe(20);
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data).toHaveLength(1);
    });
  });
});
