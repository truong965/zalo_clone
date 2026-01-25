// src/modules/messaging/services/group-join.service.ts

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

@Injectable()
export class GroupJoinService {
  private readonly logger = new Logger(GroupJoinService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Request to join a group
   * If group is OPEN → auto-approve
   * If group is APPROVAL_REQUIRED → create pending request
   */
  async requestJoin(dto: CreateJoinRequestDto, userId: string) {
    // Check if group exists
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

    // Check if already a member
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

    // Check for existing pending request
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

    // If OPEN mode → auto-approve
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

    // If APPROVAL_REQUIRED → create pending request
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

    // TODO: Notify admin via WebSocket

    return {
      status: 'PENDING',
      message: 'Join request sent. Waiting for admin approval.',
    };
  }

  /**
   * Admin reviews a join request
   */
  async reviewJoinRequest(dto: ReviewJoinRequestDto, adminId: string) {
    // Get request
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

    // Verify requester is ADMIN
    await this.verifyAdmin(request.conversationId, adminId);

    // Update request status
    const newStatus = dto.approve
      ? JoinRequestStatus.APPROVED
      : JoinRequestStatus.REJECTED;

    await this.prisma.$transaction(async (tx) => {
      // Update request
      await tx.groupJoinRequest.update({
        where: { id: dto.requestId },
        data: {
          status: newStatus,
          reviewedBy: adminId,
          reviewedAt: new Date(),
        },
      });

      // If approved, add user as member
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

        // System message
        const sysMsg = await tx.message.create({
          data: {
            conversationId: request.conversationId,
            type: 'SYSTEM',
            content: `${request.userId} joined the group`,
            metadata: {
              action: 'MEMBER_JOINED',
              userId: request.userId,
              approvedBy: adminId,
            },
          },
        });
        await tx.conversation.update({
          where: { id: request.conversationId },
          data: { lastMessageAt: sysMsg.createdAt }, // Để nhóm nhảy lên đầu list
        });
      }
    });

    this.logger.log(
      `Join request ${dto.requestId} ${dto.approve ? 'approved' : 'rejected'} by admin ${adminId}`,
    );

    // TODO: Notify requester via WebSocket

    return {
      success: true,
      status: newStatus,
    };
  }

  /**
   * Get pending join requests for a group
   * Only ADMIN can view
   */
  async getPendingRequests(conversationId: string, adminId: string) {
    await this.verifyAdmin(conversationId, adminId);

    return this.prisma.groupJoinRequest.findMany({
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
  }

  /**
   * Cancel own join request
   */
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

    // System message
    await this.prisma.message.create({
      data: {
        conversationId,
        type: 'SYSTEM',
        content: `${userId} joined the group`,
        metadata: {
          action: 'MEMBER_JOINED',
          userId,
        },
      },
    });
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
