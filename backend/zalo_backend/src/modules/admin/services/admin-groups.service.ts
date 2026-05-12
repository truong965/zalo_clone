import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ConversationType,
  MemberRole,
  MemberStatus,
  Prisma,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from 'src/database/prisma.service';
import { EventPublisher } from '@shared/events';
import { ConversationDissolvedEvent } from '@modules/conversation/events';
import {
  AddAdminGroupMembersDto,
  CreateAdminGroupDto,
  GroupListQueryDto,
  UpdateAdminGroupDto,
  UpdateAdminGroupMemberRoleDto,
} from '../dto/admin-group.dto';

type GroupSettings = {
  description?: string;
  pinnedMessages?: string[];
  [key: string]: unknown;
};

@Injectable()
export class AdminGroupsService {
  private readonly logger = new Logger(AdminGroupsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventPublisher: EventPublisher,
  ) {}

  async getGroups(dto: GroupListQueryDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.ConversationWhereInput = {
      type: ConversationType.GROUP,
    };

    if (dto.status === 'CLOSED') {
      where.deletedAt = { not: null };
    } else if (dto.status !== 'ALL') {
      where.deletedAt = null;
    }

    if (dto.search) {
      where.name = { contains: dto.search, mode: 'insensitive' };
    }

    const [groups, total] = await Promise.all([
      this.prisma.conversation.findMany({
        where,
        select: {
          id: true,
          name: true,
          avatarUrl: true,
          requireApproval: true,
          lastMessageAt: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
          _count: { select: { members: true, messages: true } },
        },
        orderBy: [
          { deletedAt: { sort: 'asc', nulls: 'first' } },
          { lastMessageAt: { sort: 'desc', nulls: 'last' } },
          { createdAt: 'desc' },
        ],
        skip,
        take: limit,
      }),
      this.prisma.conversation.count({ where }),
    ]);

    const ids = groups.map((g) => g.id);
    const [activeCounts, adminCounts] =
      ids.length > 0
        ? await Promise.all([
            this.prisma.conversationMember.groupBy({
              by: ['conversationId'],
              where: {
                conversationId: { in: ids },
                status: MemberStatus.ACTIVE,
              },
              _count: { userId: true },
            }),
            this.prisma.conversationMember.groupBy({
              by: ['conversationId'],
              where: {
                conversationId: { in: ids },
                status: MemberStatus.ACTIVE,
                role: MemberRole.ADMIN,
              },
              _count: { userId: true },
            }),
          ])
        : [[], []];

    const activeCountMap = new Map(
      activeCounts.map((row) => [row.conversationId, row._count.userId]),
    );
    const adminCountMap = new Map(
      adminCounts.map((row) => [row.conversationId, row._count.userId]),
    );

    return {
      data: groups.map((group) => ({
        ...group,
        activeMemberCount: activeCountMap.get(group.id) ?? 0,
        adminCount: adminCountMap.get(group.id) ?? 0,
        messageCount: group._count.messages,
      })),
      total,
      page,
      limit,
    };
  }

  async getGroupDetail(groupId: string) {
    const group = await this.getGroupOrThrow(groupId, true);
    const [members, messageCount] = await Promise.all([
      this.prisma.conversationMember.findMany({
        where: { conversationId: groupId },
        select: {
          userId: true,
          role: true,
          status: true,
          joinedAt: true,
          leftAt: true,
          kickedAt: true,
          kickedBy: true,
        },
        orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
      }),
      this.prisma.message.count({
        where: { conversationId: groupId, deletedAt: null },
      }),
    ]);

    const users = await this.prisma.user.findMany({
      where: { id: { in: members.map((m) => m.userId) } },
      select: {
        id: true,
        displayName: true,
        phoneNumber: true,
        avatarUrl: true,
        status: true,
      },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));
    const activeMembers = members.filter(
      (member) => member.status === MemberStatus.ACTIVE,
    );

    return {
      ...group,
      description: this.getDescription(group.settings),
      activeMemberCount: activeMembers.length,
      adminCount: activeMembers.filter((member) => member.role === MemberRole.ADMIN)
        .length,
      messageCount,
      members: members.map((member) => ({
        ...member,
        user: userMap.get(member.userId) ?? null,
      })),
    };
  }

  async createGroup(dto: CreateAdminGroupDto, adminId: string) {
    const memberIds = [...new Set(dto.memberIds.filter((id) => id !== dto.ownerId))];
    const allUserIds = [dto.ownerId, ...memberIds];
    await this.assertUsersExist(allUserIds);

    const group = await this.prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.create({
        data: {
          type: ConversationType.GROUP,
          name: dto.name,
          avatarUrl: dto.avatarUrl,
          requireApproval: dto.requireApproval ?? false,
          createdById: adminId,
          settings: {
            description: dto.description ?? '',
            pinnedMessages: [],
          } as Prisma.InputJsonValue,
        },
      });

      await tx.conversationMember.createMany({
        data: [
          {
            conversationId: conversation.id,
            userId: dto.ownerId,
            role: MemberRole.ADMIN,
            status: MemberStatus.ACTIVE,
          },
          ...memberIds.map((userId) => ({
            conversationId: conversation.id,
            userId,
            role: MemberRole.MEMBER,
            status: MemberStatus.ACTIVE,
          })),
        ],
      });

      return conversation;
    });

    this.logger.log(`Admin ${adminId} created group ${group.id}`);
    return group;
  }

  async updateGroup(groupId: string, dto: UpdateAdminGroupDto, adminId: string) {
    const group = await this.getGroupOrThrow(groupId);
    const currentSettings = this.asSettings(group.settings);
    const nextSettings =
      dto.description !== undefined
        ? { ...currentSettings, description: dto.description }
        : undefined;

    return this.prisma.conversation.update({
      where: { id: groupId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.avatarUrl !== undefined && { avatarUrl: dto.avatarUrl }),
        ...(dto.requireApproval !== undefined && {
          requireApproval: dto.requireApproval,
        }),
        ...(nextSettings && { settings: nextSettings as Prisma.InputJsonValue }),
        updatedById: adminId,
      },
    });
  }

  async addMembers(groupId: string, dto: AddAdminGroupMembersDto) {
    await this.getGroupOrThrow(groupId);
    const userIds = [...new Set(dto.userIds)];
    await this.assertUsersExist(userIds);

    const existingMembers = await this.prisma.conversationMember.findMany({
      where: { conversationId: groupId, userId: { in: userIds } },
      select: { userId: true, status: true },
    });
    const activeIds = new Set(
      existingMembers
        .filter((member) => member.status === MemberStatus.ACTIVE)
        .map((member) => member.userId),
    );
    const targetIds = userIds.filter((id) => !activeIds.has(id));

    if (targetIds.length === 0) {
      throw new BadRequestException('All users are already active members');
    }

    await this.prisma.$transaction(
      targetIds.map((userId) =>
        this.prisma.conversationMember.upsert({
          where: { conversationId_userId: { conversationId: groupId, userId } },
          create: {
            conversationId: groupId,
            userId,
            role: MemberRole.MEMBER,
            status: MemberStatus.ACTIVE,
          },
          update: {
            role: MemberRole.MEMBER,
            status: MemberStatus.ACTIVE,
            leftAt: null,
            kickedAt: null,
            kickedBy: null,
          },
        }),
      ),
    );

    return { success: true, addedCount: targetIds.length };
  }

  async removeMember(groupId: string, userId: string, adminId: string) {
    await this.getGroupOrThrow(groupId);
    const member = await this.getActiveMemberOrThrow(groupId, userId);

    if (member.role === MemberRole.ADMIN) {
      await this.assertAnotherActiveAdmin(groupId, userId);
    }

    await this.prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId: groupId, userId } },
      data: {
        status: MemberStatus.KICKED,
        kickedAt: new Date(),
        kickedBy: adminId,
      },
    });

    return { success: true };
  }

  async updateMemberRole(
    groupId: string,
    userId: string,
    dto: UpdateAdminGroupMemberRoleDto,
    adminId: string,
  ) {
    await this.getGroupOrThrow(groupId);
    const member = await this.getActiveMemberOrThrow(groupId, userId);

    if (member.role === dto.role) {
      return { success: true };
    }

    if (member.role === MemberRole.ADMIN && dto.role === MemberRole.MEMBER) {
      await this.assertAnotherActiveAdmin(groupId, userId);
    }

    await this.prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId: groupId, userId } },
      data: {
        role: dto.role,
        ...(dto.role === MemberRole.ADMIN
          ? { promotedBy: adminId, promotedAt: new Date() }
          : { demotedBy: adminId, demotedAt: new Date() }),
      },
    });

    return { success: true };
  }

  async forceCloseGroup(groupId: string, adminId: string) {
    const group = await this.getGroupOrThrow(groupId);
    const members = await this.prisma.conversationMember.findMany({
      where: { conversationId: groupId, status: MemberStatus.ACTIVE },
      select: { userId: true },
    });
    const memberIds = members.map((member) => member.userId);

    const sysMsg = await this.prisma.message.create({
      data: {
        conversationId: groupId,
        type: 'SYSTEM',
        content: 'Admin hệ thống đã đóng nhóm này',
        metadata: {
          action: 'ADMIN_FORCE_CLOSED_GROUP',
          actorId: adminId,
        },
      },
    });

    await this.prisma.conversation.update({
      where: { id: group.id },
      data: {
        lastMessageAt: sysMsg.createdAt,
        deletedAt: new Date(),
        deletedById: adminId,
      },
    });

    await this.eventPublisher.publish(
      new ConversationDissolvedEvent(groupId, adminId, memberIds),
      { fireAndForget: true },
    );

    this.logger.log(`Admin ${adminId} force closed group ${groupId}`);
    return { success: true, message: 'Group force closed' };
  }

  private async getGroupOrThrow(groupId: string, includeClosed = false) {
    const group = await this.prisma.conversation.findFirst({
      where: {
        id: groupId,
        type: ConversationType.GROUP,
        ...(includeClosed ? {} : { deletedAt: null }),
      },
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    return group;
  }

  private async getActiveMemberOrThrow(groupId: string, userId: string) {
    const member = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId: groupId, userId } },
    });

    if (!member || member.status !== MemberStatus.ACTIVE) {
      throw new NotFoundException('Active member not found');
    }

    return member;
  }

  private async assertUsersExist(userIds: string[]) {
    const users = await this.prisma.user.findMany({
      where: {
        id: { in: userIds },
        status: { not: UserStatus.DELETED },
        deletedAt: null,
      },
      select: { id: true },
    });

    if (users.length !== userIds.length) {
      throw new BadRequestException('Some users do not exist');
    }
  }

  private async assertAnotherActiveAdmin(groupId: string, excludingUserId: string) {
    const otherAdmin = await this.prisma.conversationMember.findFirst({
      where: {
        conversationId: groupId,
        userId: { not: excludingUserId },
        role: MemberRole.ADMIN,
        status: MemberStatus.ACTIVE,
      },
      select: { userId: true },
    });

    if (!otherAdmin) {
      throw new BadRequestException('Group must keep at least one active admin');
    }
  }

  private asSettings(settings: Prisma.JsonValue): GroupSettings {
    return (settings as GroupSettings | null) ?? {};
  }

  private getDescription(settings: Prisma.JsonValue) {
    return this.asSettings(settings).description ?? '';
  }
}
