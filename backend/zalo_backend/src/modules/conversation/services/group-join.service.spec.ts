import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConflictException } from '@nestjs/common';
import {
  ConversationType,
  JoinRequestStatus,
} from '@prisma/client';
import { GroupJoinService } from './group-join.service';

describe('GroupJoinService - requestJoin', () => {
  let service: GroupJoinService;
  let prisma: any;
  let eventPublisher: any;
  let displayNameResolver: any;
  let blockChecker: any;

  beforeEach(() => {
    prisma = {
      conversation: { findUnique: vi.fn() },
      conversationMember: { findUnique: vi.fn(), upsert: vi.fn() },
      groupJoinRequest: {
        findUnique: vi.fn(),
        deleteMany: vi.fn(),
        upsert: vi.fn(),
      },
    };

    eventPublisher = { publish: vi.fn().mockResolvedValue(undefined) };
    displayNameResolver = { batchResolve: vi.fn().mockResolvedValue(new Map()) };
    blockChecker = { isBlocked: vi.fn().mockResolvedValue(false) };

    service = new GroupJoinService(
      prisma,
      eventPublisher,
      displayNameResolver,
      blockChecker,
    );
  });

  it('auto-approves and clears pending when approval is disabled', async () => {
    prisma.conversation.findUnique.mockResolvedValue({
      id: 'c1',
      type: ConversationType.GROUP,
      requireApproval: false,
      name: 'Group',
    });
    prisma.conversationMember.findUnique.mockResolvedValue(null);
    prisma.groupJoinRequest.findUnique.mockResolvedValue({
      status: JoinRequestStatus.PENDING,
    });
    prisma.groupJoinRequest.deleteMany.mockResolvedValue({ count: 1 });
    prisma.conversationMember.upsert.mockResolvedValue({});

    const result = await service.requestJoin(
      { conversationId: 'c1', message: 'hi' } as any,
      'u1',
    );

    expect(result.status).toBe('APPROVED');
    expect(prisma.groupJoinRequest.deleteMany).toHaveBeenCalledWith({
      where: {
        conversationId: 'c1',
        userId: 'u1',
        status: JoinRequestStatus.PENDING,
      },
    });
    expect(prisma.conversationMember.upsert).toHaveBeenCalled();
  });

  it('throws conflict when approval is enabled and request is pending', async () => {
    prisma.conversation.findUnique.mockResolvedValue({
      id: 'c1',
      type: ConversationType.GROUP,
      requireApproval: true,
      name: 'Group',
    });
    prisma.conversationMember.findUnique.mockResolvedValue(null);
    prisma.groupJoinRequest.findUnique.mockResolvedValue({
      status: JoinRequestStatus.PENDING,
    });

    await expect(
      service.requestJoin({ conversationId: 'c1' } as any, 'u1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.groupJoinRequest.upsert).not.toHaveBeenCalled();
  });

  it('auto-approves when approval is disabled and no pending request exists', async () => {
    prisma.conversation.findUnique.mockResolvedValue({
      id: 'c1',
      type: ConversationType.GROUP,
      requireApproval: false,
      name: 'Group',
    });
    prisma.conversationMember.findUnique.mockResolvedValue(null);
    prisma.groupJoinRequest.findUnique.mockResolvedValue(null);
    prisma.conversationMember.upsert.mockResolvedValue({});

    const result = await service.requestJoin(
      { conversationId: 'c1' } as any,
      'u1',
    );

    expect(result.status).toBe('APPROVED');
    expect(prisma.groupJoinRequest.deleteMany).not.toHaveBeenCalled();
  });
});
