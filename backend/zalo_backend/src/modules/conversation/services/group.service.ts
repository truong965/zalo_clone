// src/modules/conversation/services/group.service.ts

import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { ConversationType, MemberRole, MemberStatus, Prisma } from '@prisma/client';
import { CreateGroupDto } from '../dto/create-group.dto';
import { UpdateGroupDto } from '../dto/update-group.dto';
import { AddMembersDto } from '../dto/add-members.dto';
import { RemoveMemberDto } from '../dto/remove-member.dto';
import { TransferAdminDto } from '../dto/transfer-admin.dto';
import { EventPublisher } from '@shared/events';
import { DisplayNameResolver } from '@shared/services';
import {
  ConversationCreatedEvent,
  ConversationMemberAddedEvent,
  ConversationMemberDemotedEvent,
  ConversationMemberLeftEvent,
  ConversationMemberPromotedEvent,
} from '../events';

export interface GroupSettings {
  description?: string;
  pinnedMessages?: string[];
  [key: string]: any;
}

@Injectable()
export class GroupService {
  private readonly logger = new Logger(GroupService.name);
  private readonly MAX_GROUP_SIZE = 256;

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventPublisher: EventPublisher,
    private readonly displayNameResolver: DisplayNameResolver,
  ) { }

  async createGroup(dto: CreateGroupDto, creatorId: string) {
    if (dto.memberIds.includes(creatorId)) {
      throw new BadRequestException('You are automatically added as admin');
    }

    const uniqueMemberIds = [...new Set(dto.memberIds)];
    if (uniqueMemberIds.length !== dto.memberIds.length) {
      throw new BadRequestException('Duplicate member IDs');
    }

    const users = await this.prisma.user.findMany({
      where: { id: { in: [...uniqueMemberIds, creatorId] } },
      select: { id: true },
    });

    if (users.length !== uniqueMemberIds.length + 1) {
      throw new BadRequestException('Some users do not exist');
    }

    const group = await this.prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.create({
        data: {
          type: ConversationType.GROUP,
          name: dto.name,
          avatarUrl: dto.avatarUrl,
          createdById: creatorId,
          requireApproval: dto.requireApproval ?? false,
          settings: {
            description: dto.description || '',
            pinnedMessages: [],
          } as Prisma.InputJsonValue,
        },
      });

      await tx.conversationMember.create({
        data: {
          conversationId: conversation.id,
          userId: creatorId,
          role: MemberRole.ADMIN,
          status: MemberStatus.ACTIVE,
        },
      });

      await tx.conversationMember.createMany({
        data: uniqueMemberIds.map((userId) => ({
          conversationId: conversation.id,
          userId,
          role: MemberRole.MEMBER,
          status: MemberStatus.ACTIVE,
        })),
      });
      return conversation;
    });

    await this.eventPublisher.publish(
      new ConversationCreatedEvent(
        group.id,
        creatorId,
        ConversationType.GROUP,
        [creatorId, ...uniqueMemberIds],
        dto.name,
      ),
    );

    this.logger.log(
      `Group ${group.id} created by ${creatorId} with ${dto.memberIds.length} members`,
    );

    return group;
  }

  async updateGroup(conversationId: string, dto: UpdateGroupDto, userId: string) {
    await this.verifyAdmin(conversationId, userId);

    let newSettings: GroupSettings | undefined;

    if (dto.description) {
      const currentSettings = await this.getGroupSettings(conversationId);
      newSettings = {
        ...currentSettings,
        description: dto.description,
      };
    }

    const updated = await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.avatarUrl && { avatarUrl: dto.avatarUrl }),
        ...(dto.requireApproval !== undefined && {
          requireApproval: dto.requireApproval,
        }),
        ...(newSettings && { settings: newSettings as Prisma.InputJsonValue }),
        updatedById: userId,
        updatedAt: new Date(),
      },
    });

    this.logger.log(`Group ${conversationId} updated by admin ${userId}`);

    return updated;
  }

  async addMembers(dto: AddMembersDto, requesterId: string) {
    const conversation = await this.getGroupOrThrow(dto.conversationId);

    if (conversation.requireApproval) {
      await this.verifyAdmin(dto.conversationId, requesterId);
    } else {
      await this.verifyMember(dto.conversationId, requesterId);
    }

    const currentSize = await this.prisma.conversationMember.count({
      where: {
        conversationId: dto.conversationId,
        status: MemberStatus.ACTIVE,
      },
    });

    if (currentSize + dto.userIds.length > this.MAX_GROUP_SIZE) {
      throw new BadRequestException(
        `Group size limit exceeded (max ${this.MAX_GROUP_SIZE})`,
      );
    }

    const users = await this.prisma.user.findMany({
      where: { id: { in: dto.userIds } },
      select: { id: true, displayName: true },
    });

    if (users.length !== dto.userIds.length) {
      throw new BadRequestException('Some users do not exist');
    }

    const existingMembers = await this.prisma.conversationMember.findMany({
      where: {
        conversationId: dto.conversationId,
        userId: { in: dto.userIds },
      },
      select: { userId: true, status: true },
    });

    const existingActiveIds = existingMembers
      .filter((m) => m.status === MemberStatus.ACTIVE)
      .map((m) => m.userId);

    const newUserIds = dto.userIds.filter(
      (id) => !existingActiveIds.includes(id),
    );

    if (newUserIds.length === 0) {
      throw new BadRequestException('All users are already members');
    }

    await this.prisma.$transaction(async (tx) => {
      for (const userId of newUserIds) {
        await tx.conversationMember.upsert({
          where: {
            conversationId_userId: {
              conversationId: dto.conversationId,
              userId,
            },
          },
          create: {
            conversationId: dto.conversationId,
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
      }
    });

    this.logger.log(
      `Added ${newUserIds.length} members to group ${dto.conversationId}`,
    );

    await this.eventPublisher.publish(
      new ConversationMemberAddedEvent(dto.conversationId, requesterId, newUserIds),
    );

    return { addedCount: newUserIds.length };
  }

  async removeMember(dto: RemoveMemberDto, requesterId: string) {
    const isAdmin = await this.isAdmin(dto.conversationId, requesterId);
    const isSelf = dto.userId === requesterId;

    if (!isAdmin && !isSelf) {
      throw new ForbiddenException('Only admin can remove others');
    }

    const targetMember = await this.prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId: dto.conversationId,
          userId: dto.userId,
        },
      },
    });

    if (!targetMember || targetMember.status !== MemberStatus.ACTIVE) {
      throw new NotFoundException('Member not found');
    }

    if (targetMember.role === MemberRole.ADMIN) {
      throw new ForbiddenException(
        'Cannot remove admin. Transfer admin rights first.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const newStatus = isSelf ? MemberStatus.LEFT : MemberStatus.KICKED;

      await tx.conversationMember.update({
        where: {
          conversationId_userId: {
            conversationId: dto.conversationId,
            userId: dto.userId,
          },
        },
        data: {
          status: newStatus,
          ...(isSelf
            ? { leftAt: new Date() }
            : {
              kickedBy: requesterId,
              kickedAt: new Date(),
            }),
        },
      });
    });

    this.logger.log(
      `Member ${dto.userId} ${isSelf ? 'left' : 'kicked from'} group ${dto.conversationId}`,
    );

    await this.eventPublisher.publish(
      new ConversationMemberLeftEvent(
        dto.conversationId,
        dto.userId,
        isSelf ? undefined : requesterId,
      ),
    );

    return { success: true };
  }

  async transferAdmin(dto: TransferAdminDto, currentAdminId: string) {
    await this.verifyAdmin(dto.conversationId, currentAdminId);

    if (dto.newAdminId === currentAdminId) {
      throw new BadRequestException('You are already the admin');
    }

    const targetMember = await this.prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId: dto.conversationId,
          userId: dto.newAdminId,
        },
      },
    });

    if (
      !targetMember ||
      targetMember.status !== MemberStatus.ACTIVE ||
      targetMember.role === MemberRole.ADMIN
    ) {
      throw new BadRequestException('Target must be an active member');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.conversationMember.update({
        where: {
          conversationId_userId: {
            conversationId: dto.conversationId,
            userId: currentAdminId,
          },
        },
        data: { role: MemberRole.MEMBER },
      });

      await tx.conversationMember.update({
        where: {
          conversationId_userId: {
            conversationId: dto.conversationId,
            userId: dto.newAdminId,
          },
        },
        data: { role: MemberRole.ADMIN },
      });
    });

    this.logger.log(
      `Admin rights transferred from ${currentAdminId} to ${dto.newAdminId} in group ${dto.conversationId}`,
    );

    await this.eventPublisher.publishBatch([
      new ConversationMemberDemotedEvent(
        dto.conversationId,
        currentAdminId,
        currentAdminId,
      ),
      new ConversationMemberPromotedEvent(
        dto.conversationId,
        currentAdminId,
        dto.newAdminId,
      ),
    ]);

    return { success: true, newAdminId: dto.newAdminId };
  }

  async dissolveGroup(conversationId: string, adminId: string) {
    await this.verifyAdmin(conversationId, adminId);

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        deletedAt: new Date(),
        deletedById: adminId,
      },
    });

    this.logger.log(`Group ${conversationId} dissolved by admin ${adminId}`);

    return { success: true };
  }

  async pinMessage(conversationId: string, messageId: bigint, userId: string) {
    await this.verifyAdmin(conversationId, userId);

    const settings = await this.getGroupSettings(conversationId);
    const pinnedMessages = settings.pinnedMessages || [];

    const messageIdStr = messageId.toString();
    if (pinnedMessages.length >= 3) {
      throw new BadRequestException('Maximum 3 pinned messages allowed');
    }

    if (pinnedMessages.includes(messageIdStr)) {
      throw new ConflictException('Message already pinned');
    }

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        settings: {
          ...settings,
          pinnedMessages: [...pinnedMessages, messageIdStr],
        } as Prisma.InputJsonValue,
        updatedById: userId,
        updatedAt: new Date(),
      },
    });

    return { success: true };
  }

  async unpinMessage(conversationId: string, messageId: bigint, userId: string) {
    await this.verifyAdmin(conversationId, userId);

    const settings = await this.getGroupSettings(conversationId);
    const pinnedMessages = settings.pinnedMessages || [];
    const messageIdStr = messageId.toString();
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        settings: {
          ...settings,
          pinnedMessages: pinnedMessages.filter((id) => id !== messageIdStr),
        } as Prisma.InputJsonValue,
        updatedById: userId,
        updatedAt: new Date(),
      },
    });

    return { success: true };
  }

  // ============================================================
  // HELPER METHODS
  // ============================================================

  private async getGroupOrThrow(conversationId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId, deletedAt: null },
    });

    if (!conversation) {
      throw new NotFoundException('Group not found');
    }

    if (conversation.type !== ConversationType.GROUP) {
      throw new BadRequestException('Not a group conversation');
    }

    return conversation;
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

  private async isAdmin(conversationId: string, userId: string): Promise<boolean> {
    const member = await this.prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: { conversationId, userId },
      },
    });

    return (
      member?.status === MemberStatus.ACTIVE && member?.role === MemberRole.ADMIN
    );
  }

  private async verifyMember(conversationId: string, userId: string) {
    const member = await this.prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: { conversationId, userId },
      },
    });

    if (!member || member.status !== MemberStatus.ACTIVE) {
      throw new ForbiddenException('You are not a member of this group');
    }
  }

  private async getGroupSettings(conversationId: string): Promise<GroupSettings> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { settings: true },
    });

    return (conversation?.settings as unknown as GroupSettings) || {};
  }

  async getGroupMembers(conversationId: string, userId: string) {
    await this.verifyMember(conversationId, userId);

    const members = await this.prisma.conversationMember.findMany({
      where: {
        conversationId,
        status: MemberStatus.ACTIVE,
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
      orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
    });

    // Batch resolve display names per viewer
    const memberIds = members.map((m) => m.user.id);
    const nameMap = await this.displayNameResolver.batchResolve(userId, memberIds);

    return members.map((m) => ({
      ...m,
      user: {
        ...m.user,
        displayName: nameMap.get(m.user.id) ?? m.user.displayName,
      },
    }));
  }
}
