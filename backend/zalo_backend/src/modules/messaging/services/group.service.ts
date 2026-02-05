// src/modules/messaging/services/group.service.ts

import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import {
  ConversationType,
  MemberRole,
  MemberStatus,
  Prisma,
} from '@prisma/client';
import { CreateGroupDto } from '../dto/create-group.dto';
import { UpdateGroupDto } from '../dto/update-group.dto';
import { AddMembersDto } from '../dto/add-members.dto';
import { RemoveMemberDto } from '../dto/remove-member.dto';
import { TransferAdminDto } from '../dto/transfer-admin.dto';
export interface GroupSettings {
  description?: string;
  pinnedMessages?: string[]; // Lưu ý: MessageId là BigInt nên cần lưu dạng string trong JSON
  [key: string]: any;
}

@Injectable()
export class GroupService {
  private readonly logger = new Logger(GroupService.name);
  private readonly MAX_GROUP_SIZE = 256;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new group
   * Creator becomes ADMIN automatically
   */
  async createGroup(dto: CreateGroupDto, creatorId: string) {
    // Validate: Creator cannot add themselves
    if (dto.memberIds.includes(creatorId)) {
      throw new BadRequestException('You are automatically added as admin');
    }

    // Validate: No duplicates
    const uniqueMemberIds = [...new Set(dto.memberIds)];
    if (uniqueMemberIds.length !== dto.memberIds.length) {
      throw new BadRequestException('Duplicate member IDs');
    }

    // Validate: All members exist
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...uniqueMemberIds, creatorId] } },
      select: { id: true },
    });

    if (users.length !== uniqueMemberIds.length + 1) {
      throw new BadRequestException('Some users do not exist');
    }

    // Create group with members in transaction
    const group = await this.prisma.$transaction(async (tx) => {
      // 1. Create conversation
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

      // 2. Add creator as ADMIN
      await tx.conversationMember.create({
        data: {
          conversationId: conversation.id,
          userId: creatorId,
          role: MemberRole.ADMIN,
          status: MemberStatus.ACTIVE,
        },
      });

      // 3. Add other members as MEMBER
      await tx.conversationMember.createMany({
        data: uniqueMemberIds.map((userId) => ({
          conversationId: conversation.id,
          userId,
          role: MemberRole.MEMBER,
          status: MemberStatus.ACTIVE,
        })),
      });

      // 4. Create system message
      const sysMsg = await tx.message.create({
        data: {
          conversationId: conversation.id,
          type: 'SYSTEM',
          content: `${creatorId} created the group "${dto.name}"`,
          metadata: {
            action: 'GROUP_CREATED',
            actorId: creatorId,
            memberCount: uniqueMemberIds.length + 1,
          },
        },
      });

      await tx.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: sysMsg.createdAt }, // Để nhóm nhảy lên đầu list
      });
      return conversation;
    });

    this.logger.log(
      `Group ${group.id} created by ${creatorId} with ${dto.memberIds.length} members`,
    );

    return group;
  }

  /**
   * Update group settings
   * Only ADMIN can update
   */
  async updateGroup(
    conversationId: string,
    dto: UpdateGroupDto,
    userId: string,
  ) {
    // Check if user is ADMIN
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
        // Manual Audit: Tự điền người update
        updatedById: userId,
        updatedAt: new Date(),
      },
    });

    this.logger.log(`Group ${conversationId} updated by admin ${userId}`);

    return updated;
  }

  /**
   * Add members to group
   * Only ADMIN can add in APPROVAL mode
   * Anyone can add in OPEN mode (future: via invite link)
   */
  async addMembers(dto: AddMembersDto, requesterId: string) {
    const conversation = await this.getGroupOrThrow(dto.conversationId);

    // If requireApproval, only ADMIN can add directly
    if (conversation.requireApproval) {
      await this.verifyAdmin(dto.conversationId, requesterId);
    } else {
      // In OPEN mode, any member can invite
      await this.verifyMember(dto.conversationId, requesterId);
    }

    // Check group size limit
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

    // Validate users exist
    const users = await this.prisma.user.findMany({
      where: { id: { in: dto.userIds } },
      select: { id: true, displayName: true },
    });

    if (users.length !== dto.userIds.length) {
      throw new BadRequestException('Some users do not exist');
    }

    // Check who's already a member
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

    // [NEW] Validate Block Relationship for EACH new member
    // Người thêm (requester) không được phép thêm người mình chặn hoặc người chặn mình
    // for (const newMemberId of dto.userIds) {
    //   const isBlocked = await this.socialFacade.isBlocked(
    //     requesterId,
    //     newMemberId,
    //   );
    //   if (isBlocked) {
    //     throw new ForbiddenException(
    //       `Cannot add user ${newMemberId} due to block relationship`,
    //     );
    //   }
    // }

    // Add new members
    await this.prisma.$transaction(async (tx) => {
      // Re-activate kicked/left members or create new
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

      // System message
      const sysMsg = await tx.message.create({
        data: {
          conversationId: dto.conversationId,
          type: 'SYSTEM',
          content: `${requesterId} added ${newUserIds.length} member(s)`,
          metadata: {
            action: 'MEMBERS_ADDED',
            actorId: requesterId,
            addedUserIds: newUserIds,
          },
        },
      });
      await tx.conversation.update({
        where: { id: dto.conversationId },
        data: { lastMessageAt: sysMsg.createdAt }, // Để nhóm nhảy lên đầu list
      });
    });

    this.logger.log(
      `Added ${newUserIds.length} members to group ${dto.conversationId}`,
    );

    return { addedCount: newUserIds.length };
  }

  /**
   * Remove/Kick member from group
   * Only ADMIN can kick
   * Members can remove themselves (leave)
   */
  async removeMember(dto: RemoveMemberDto, requesterId: string) {
    const isAdmin = await this.isAdmin(dto.conversationId, requesterId);
    const isSelf = dto.userId === requesterId;

    // Validate permission
    if (!isAdmin && !isSelf) {
      throw new ForbiddenException('Only admin can remove others');
    }

    // Cannot remove admin
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

    // Update member status
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

      // System message
      const action = isSelf ? 'left the group' : 'was removed';
      const sysMsg = await tx.message.create({
        data: {
          conversationId: dto.conversationId,
          type: 'SYSTEM',
          content: `${dto.userId} ${action}`,
          metadata: {
            action: isSelf ? 'MEMBER_LEFT' : 'MEMBER_KICKED',
            actorId: requesterId,
            targetUserId: dto.userId,
          },
        },
      });
      await tx.conversation.update({
        where: { id: dto.conversationId },
        data: { lastMessageAt: sysMsg.createdAt }, // Để nhóm nhảy lên đầu list
      });
    });

    this.logger.log(
      `Member ${dto.userId} ${isSelf ? 'left' : 'kicked from'} group ${dto.conversationId}`,
    );

    return { success: true };
  }

  /**
   * Transfer admin rights
   * Only current ADMIN can transfer
   * Target must be an ACTIVE MEMBER
   */
  async transferAdmin(dto: TransferAdminDto, currentAdminId: string) {
    // Verify requester is current admin
    await this.verifyAdmin(dto.conversationId, currentAdminId);

    if (dto.newAdminId === currentAdminId) {
      throw new BadRequestException('You are already the admin');
    }

    // Verify target is an active member
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

    // Swap roles in transaction
    await this.prisma.$transaction(async (tx) => {
      // Demote current admin to member
      await tx.conversationMember.update({
        where: {
          conversationId_userId: {
            conversationId: dto.conversationId,
            userId: currentAdminId,
          },
        },
        data: { role: MemberRole.MEMBER },
      });

      // Promote new admin
      await tx.conversationMember.update({
        where: {
          conversationId_userId: {
            conversationId: dto.conversationId,
            userId: dto.newAdminId,
          },
        },
        data: { role: MemberRole.ADMIN },
      });

      // System message
      const sysMsg = await tx.message.create({
        data: {
          conversationId: dto.conversationId,
          type: 'SYSTEM',
          content: `${currentAdminId} transferred admin rights to ${dto.newAdminId}`,
          metadata: {
            action: 'ADMIN_TRANSFERRED',
            fromUserId: currentAdminId,
            toUserId: dto.newAdminId,
          },
        },
      });
      await tx.conversation.update({
        where: { id: dto.conversationId },
        data: { lastMessageAt: sysMsg.createdAt }, // Để nhóm nhảy lên đầu list
      });
    });

    this.logger.log(
      `Admin rights transferred from ${currentAdminId} to ${dto.newAdminId} in group ${dto.conversationId}`,
    );

    return { success: true, newAdminId: dto.newAdminId };
  }

  /**
   * Dissolve/Delete group
   * Only ADMIN can dissolve
   */
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

  /**
   * Pin a message in group
   * Only ADMIN can pin
   */
  async pinMessage(conversationId: string, messageId: bigint, userId: string) {
    await this.verifyAdmin(conversationId, userId);

    const settings = await this.getGroupSettings(conversationId);
    const pinnedMessages = settings.pinnedMessages || [];

    const messageIdStr = messageId.toString();
    // Limit to 3 pinned messages
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

  /**
   * Unpin a message
   */
  async unpinMessage(
    conversationId: string,
    messageId: bigint,
    userId: string,
  ) {
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

  private async isAdmin(
    conversationId: string,
    userId: string,
  ): Promise<boolean> {
    const member = await this.prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: { conversationId, userId },
      },
    });

    return (
      member?.status === MemberStatus.ACTIVE &&
      member?.role === MemberRole.ADMIN
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

  private async getGroupSettings(
    conversationId: string,
  ): Promise<GroupSettings> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { settings: true },
    });

    return (conversation?.settings as unknown as GroupSettings) || {};
  }

  /**
   * Get group members with details
   */
  async getGroupMembers(conversationId: string, userId: string) {
    // Verify requester is a member
    await this.verifyMember(conversationId, userId);

    return this.prisma.conversationMember.findMany({
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
      orderBy: [
        { role: 'asc' }, // ADMIN first
        { joinedAt: 'asc' },
      ],
    });
  }
}
