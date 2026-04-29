import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JoinRequestStatus } from '@prisma/client';
import { GroupService } from './group.service';

describe('GroupService - updateGroup requireApproval', () => {
  let service: GroupService;
  let prisma: any;
  let eventPublisher: any;
  let displayNameResolver: any;
  let blockChecker: any;

  beforeEach(() => {
    prisma = {
      conversation: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      groupJoinRequest: {
        deleteMany: vi.fn(),
      },
    };

    eventPublisher = { publish: vi.fn().mockResolvedValue(undefined) };
    displayNameResolver = { batchResolve: vi.fn().mockResolvedValue(new Map()) };
    blockChecker = { isBlocked: vi.fn().mockResolvedValue(false) };

    service = new GroupService(
      prisma,
      eventPublisher,
      displayNameResolver,
      blockChecker,
    );

    (service as any).verifyAdmin = vi.fn().mockResolvedValue(undefined);
  });

  it('clears pending requests when approval is disabled', async () => {
    prisma.conversation.findUnique.mockResolvedValue({ requireApproval: true });
    prisma.conversation.update.mockResolvedValue({
      id: 'c1',
      requireApproval: false,
    });
    prisma.groupJoinRequest.deleteMany.mockResolvedValue({ count: 2 });

    await service.updateGroup('c1', { requireApproval: false }, 'admin');

    expect(prisma.groupJoinRequest.deleteMany).toHaveBeenCalledWith({
      where: {
        conversationId: 'c1',
        status: JoinRequestStatus.PENDING,
      },
    });
  });
});
