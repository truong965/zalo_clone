// src/modules/conversation/services/group-join.service.ts

import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import {
  JoinRequestStatus,
  MemberRole,
  MemberStatus,
  ConversationType,
} from '@prisma/client';
import { CreateJoinRequestDto } from '../dto/join-request.dto';
import { ReviewJoinRequestDto } from '../dto/review-join-request.dto';
import { EventPublisher } from '@shared/events';
import { DisplayNameResolver } from '@shared/services';
import { ConversationMemberAddedEvent } from '../events';

@Injectable()
export class GroupJoinService {
  private readonly logger = new Logger(GroupJoinService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventPublisher: EventPublisher,
    private readonly displayNameResolver: DisplayNameResolver,
  ) { }

  async requestJoin(dto: CreateJoinRequestDto, userId: string) {
    const group = await this.prisma.conversation.findUnique({
      where: { id: dto.conversationId, deletedAt: null },
      select: {
        id: true,
        type: true,
        requireApproval: true,
        name: true,
      },
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    if (group.type !== ConversationType.GROUP) {
      throw new BadRequestException('Not a group conversation');
    }

    const existingMember = await this.prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId: dto.conversationId,
          userId,
        },
      },
    });

    if (existingMember && existingMember.status === MemberStatus.ACTIVE) {
      throw new ConflictException('Already a member of this group');
    }

    const existingRequest = await this.prisma.groupJoinRequest.findUnique({
      where: {
        conversationId_userId: {
          conversationId: dto.conversationId,
          userId,
        },
      },
    });

    if (
      existingRequest &&
      existingRequest.status === JoinRequestStatus.PENDING
    ) {
      throw new ConflictException('Join request already pending');
    }

    if (!group.requireApproval) {
      await this.autoApproveJoin(dto.conversationId, userId);

      this.logger.log(
        `User ${userId} auto-joined OPEN group ${dto.conversationId}`,
      );

      return {
        status: 'APPROVED',
        message: 'You have joined the group',
      };
    }

    await this.prisma.groupJoinRequest.upsert({
      where: {
        conversationId_userId: {
          conversationId: dto.conversationId,
          userId,
        },
      },
      create: {
        conversationId: dto.conversationId,
        userId,
        status: JoinRequestStatus.PENDING,
        message: dto.message,
      },
      update: {
        status: JoinRequestStatus.PENDING,
        message: dto.message,
        reviewedBy: null,
        reviewedAt: null,
      },
    });

    this.logger.log(
      `User ${userId} requested to join group ${dto.conversationId}`,
    );

    return {
      status: 'PENDING',
      message: 'Join request sent. Waiting for admin approval.',
    };
  }

  async reviewJoinRequest(dto: ReviewJoinRequestDto, adminId: string) {
    const request = await this.prisma.groupJoinRequest.findUnique({
      where: { id: dto.requestId },
      include: {
        conversation: {
          select: { id: true, requireApproval: true },
        },
      },
    });

    if (!request) {
      throw new NotFoundException('Join request not found');
    }

    if (request.status !== JoinRequestStatus.PENDING) {
      throw new BadRequestException('Request already reviewed');
    }

    await this.verifyAdmin(request.conversationId, adminId);

    // Check if user is already an active member (stale request scenario)
    const existingMember = await this.prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId: request.conversationId,
          userId: request.userId,
        },
      },
    });

    if (existingMember?.status === MemberStatus.ACTIVE) {
      // User is already a member — delete the stale request and return info
      await this.prisma.groupJoinRequest.delete({
        where: { id: dto.requestId },
      });

      this.logger.log(
        `[reviewJoinRequest] Deleted stale request ${dto.requestId} — user ${request.userId} is already a member`,
      );

      return {
        success: true,
        alreadyMember: true,
        message: 'Người này đã là thành viên của nhóm. Yêu cầu đã được xóa.',
      };
    }

    const newStatus = dto.approve
      ? JoinRequestStatus.APPROVED
      : JoinRequestStatus.REJECTED;

    await this.prisma.$transaction(async (tx) => {
      await tx.groupJoinRequest.update({
        where: { id: dto.requestId },
        data: {
          status: newStatus,
          reviewedBy: adminId,
          reviewedAt: new Date(),
        },
      });

      if (dto.approve) {
        await tx.conversationMember.upsert({
          where: {
            conversationId_userId: {
              conversationId: request.conversationId,
              userId: request.userId,
            },
          },
          create: {
            conversationId: request.conversationId,
            userId: request.userId,
            role: MemberRole.MEMBER,
            status: MemberStatus.ACTIVE,
          },
          update: {
            status: MemberStatus.ACTIVE,
            leftAt: null,
            kickedBy: null,
            kickedAt: null,
          },
        });
      }
    });

    this.logger.log(
      `Join request ${dto.requestId} ${dto.approve ? 'approved' : 'rejected'} by admin ${adminId}`,
    );

    if (dto.approve) {
      await this.eventPublisher.publish(
        new ConversationMemberAddedEvent(request.conversationId, adminId, [
          request.userId,
        ]),
      );
    }

    return {
      success: true,
      status: newStatus,
    };
  }

  async getPendingRequests(conversationId: string, adminId: string) {
    await this.verifyAdmin(conversationId, adminId);

    const requests = await this.prisma.groupJoinRequest.findMany({
      where: {
        conversationId,
        status: JoinRequestStatus.PENDING,
      },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { requestedAt: 'asc' },
    });

    // Batch resolve display names per admin viewer
    const userIds = requests.map((r) => r.user.id);
    const nameMap = await this.displayNameResolver.batchResolve(adminId, userIds);

    return requests.map((r) => ({
      ...r,
      user: {
        ...r.user,
        displayName: nameMap.get(r.user.id) ?? r.user.displayName,
      },
    }));
  }

  async cancelJoinRequest(conversationId: string, userId: string) {
    const request = await this.prisma.groupJoinRequest.findUnique({
      where: {
        conversationId_userId: { conversationId, userId },
      },
    });

    if (!request || request.status !== JoinRequestStatus.PENDING) {
      throw new NotFoundException('No pending request found');
    }

    await this.prisma.groupJoinRequest.delete({
      where: { id: request.id },
    });

    return { success: true };
  }

  // ============================================================
  // INVITE MEMBERS (non-admin with requireApproval)
  // ============================================================

  /**
   * Invite users to a group that has requireApproval enabled.
   * Creates GroupJoinRequest entries with inviterId set to the inviting member.
   * Only active members can invite; admin should use addMembers instead.
   */
  async inviteMembers(
    conversationId: string,
    targetUserIds: string[],
    inviterId: string,
  ): Promise<{ invitedCount: number; skippedCount: number }> {
    const group = await this.prisma.conversation.findUnique({
      where: { id: conversationId, deletedAt: null },
      select: { id: true, type: true, requireApproval: true },
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    if (group.type !== ConversationType.GROUP) {
      throw new BadRequestException('Not a group conversation');
    }

    if (!group.requireApproval) {
      throw new BadRequestException(
        'Group does not require approval. Use addMembers instead.',
      );
    }

    // Verify inviter is an active member (not admin — admin uses addMembers directly)
    const inviterMember = await this.prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: { conversationId, userId: inviterId },
      },
    });

    if (!inviterMember || inviterMember.status !== MemberStatus.ACTIVE) {
      throw new ForbiddenException('You are not a member of this group');
    }

    let invitedCount = 0;
    let skippedCount = 0;

    for (const targetUserId of targetUserIds) {
      // Skip if already a member
      const existing = await this.prisma.conversationMember.findUnique({
        where: {
          conversationId_userId: { conversationId, userId: targetUserId },
        },
      });

      if (existing && existing.status === MemberStatus.ACTIVE) {
        skippedCount++;
        continue;
      }

      // Skip if already has a pending request
      const existingRequest = await this.prisma.groupJoinRequest.findUnique({
        where: {
          conversationId_userId: { conversationId, userId: targetUserId },
        },
      });

      if (
        existingRequest &&
        existingRequest.status === JoinRequestStatus.PENDING
      ) {
        skippedCount++;
        continue;
      }

      // Create join request with inviterId
      await this.prisma.groupJoinRequest.upsert({
        where: {
          conversationId_userId: { conversationId, userId: targetUserId },
        },
        create: {
          conversationId,
          userId: targetUserId,
          inviterId,
          status: JoinRequestStatus.PENDING,
          message: null,
        },
        update: {
          status: JoinRequestStatus.PENDING,
          inviterId,
          message: null,
          reviewedBy: null,
          reviewedAt: null,
        },
      });

      invitedCount++;
    }

    this.logger.log(
      `User ${inviterId} invited ${invitedCount} users to group ${conversationId} (${skippedCount} skipped)`,
    );

    return { invitedCount, skippedCount };
  }

  // ============================================================
  // HELPER METHODS
  // ============================================================

  private async autoApproveJoin(conversationId: string, userId: string) {
    await this.prisma.conversationMember.upsert({
      where: {
        conversationId_userId: { conversationId, userId },
      },
      create: {
        conversationId,
        userId,
        role: MemberRole.MEMBER,
        status: MemberStatus.ACTIVE,
      },
      update: {
        status: MemberStatus.ACTIVE,
        leftAt: null,
        kickedBy: null,
        kickedAt: null,
      },
    });

    await this.eventPublisher.publish(
      new ConversationMemberAddedEvent(conversationId, userId, [userId]),
    );
  }

  private async verifyAdmin(conversationId: string, userId: string) {
    const member = await this.prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: { conversationId, userId },
      },
    });

    if (
      !member ||
      member.status !== MemberStatus.ACTIVE ||
      member.role !== MemberRole.ADMIN
    ) {
      throw new ForbiddenException('Only admin can perform this action');
    }
  }
}
