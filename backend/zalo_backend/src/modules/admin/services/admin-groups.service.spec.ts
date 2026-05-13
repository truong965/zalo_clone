import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConversationType, MemberRole, MemberStatus } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';
import { AdminGroupsService } from './admin-groups.service';

describe('AdminGroupsService', () => {
  let service: AdminGroupsService;
  let prisma: any;
  let eventPublisher: any;

  beforeEach(() => {
    prisma = {
      conversation: {
        findFirst: vi.fn(),
        update: vi.fn(),
      },
      conversationMember: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
      },
      message: {
        create: vi.fn(),
      },
    };
    eventPublisher = { publish: vi.fn().mockResolvedValue('event-1') };
    service = new AdminGroupsService(prisma, eventPublisher);
  });

  it('prevents demoting the last active group admin', async () => {
    prisma.conversation.findFirst.mockResolvedValue({
      id: 'group-1',
      type: ConversationType.GROUP,
      deletedAt: null,
    });
    prisma.conversationMember.findUnique.mockResolvedValue({
      conversationId: 'group-1',
      userId: 'user-1',
      role: MemberRole.ADMIN,
      status: MemberStatus.ACTIVE,
    });
    prisma.conversationMember.findFirst.mockResolvedValue(null);

    await expect(
      service.updateMemberRole(
        'group-1',
        'user-1',
        { role: MemberRole.MEMBER },
        'admin-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('force closes a group with system message and dissolve event', async () => {
    prisma.conversation.findFirst.mockResolvedValue({
      id: 'group-1',
      type: ConversationType.GROUP,
      deletedAt: null,
    });
    prisma.conversationMember.findMany.mockResolvedValue([
      { userId: 'user-1' },
      { userId: 'user-2' },
    ]);
    prisma.message.create.mockResolvedValue({
      id: 1n,
      createdAt: new Date('2026-05-12T10:00:00.000Z'),
    });
    prisma.conversation.update.mockResolvedValue({ id: 'group-1' });

    const result = await service.forceCloseGroup('group-1', 'admin-1');

    expect(result.success).toBe(true);
    expect(prisma.message.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        conversationId: 'group-1',
        type: 'SYSTEM',
        metadata: expect.objectContaining({
          action: 'ADMIN_FORCE_CLOSED_GROUP',
          actorId: 'admin-1',
        }),
      }),
    });
    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'group-1' },
      data: expect.objectContaining({
        deletedById: 'admin-1',
        deletedAt: expect.any(Date),
      }),
    });
    expect(eventPublisher.publish).toHaveBeenCalledOnce();
  });
});
