import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { MemberRole, MemberStatus } from '@prisma/client';
import { SystemMessageBroadcasterService } from './system-message-broadcaster.service';
import { PrismaService } from 'src/database/prisma.service';
import { safeJSON, safeStringify } from '@common/utils/json.util';
import { RedisRegistryService } from 'src/shared/redis/services/redis-registry.service';
import { RedisService } from 'src/shared/redis/redis.service';
import { RedisKeyBuilder } from '@shared/redis/redis-key-builder';

import { ConversationService } from './conversation.service';
import { GroupService } from './group.service';
import { GroupJoinService } from './group-join.service';

import { CreateGroupDto } from '../dto/create-group.dto';
import { UpdateGroupDto } from '../dto/update-group.dto';
import { AddMembersDto } from '../dto/add-members.dto';
import { RemoveMemberDto } from '../dto/remove-member.dto';
import { TransferAdminDto } from '../dto/transfer-admin.dto';
import { CreateJoinRequestDto } from '../dto/join-request.dto';
import { ReviewJoinRequestDto } from '../dto/review-join-request.dto';
import { InviteMembersDto } from '../dto/invite-members.dto';

export type ConversationGatewayNotification = {
  userId: string;
  event: string;
  data: unknown;
};

@Injectable()
export class ConversationRealtimeService {
  private readonly logger = new Logger(ConversationRealtimeService.name);

  constructor(
    private readonly conversationService: ConversationService,
    private readonly groupService: GroupService,
    private readonly groupJoinService: GroupJoinService,
    private readonly prisma: PrismaService,
    private readonly broadcaster: SystemMessageBroadcasterService,
    private readonly redisRegistry: RedisRegistryService,
    private readonly redis: RedisService,
  ) {}

  async createGroup(
    dto: CreateGroupDto,
    userId: string,
    groupCreatedEvent: string,
  ): Promise<{
    group: unknown;
    notifications: ConversationGatewayNotification[];
  }> {
    const group = await this.groupService.createGroup(dto, userId);
    const members = await this.groupService.getGroupMembers(group.id, userId);

    // Notify all members EXCEPT the creator — creator already receives
    // the result via the socket ack callback.
    const notifications: ConversationGatewayNotification[] = members
      .filter((member) => member.userId !== userId)
      .map((member) => ({
        userId: member.userId,
        event: groupCreatedEvent,
        data: {
          group,
          role: member.role,
        },
      }));

    return { group, notifications };
  }

  async updateGroup(
    conversationId: string,
    updates: UpdateGroupDto,
    userId: string,
    groupUpdatedEvent: string,
  ): Promise<{
    updated: unknown;
    notifications: ConversationGatewayNotification[];
  }> {
    const updated = await this.groupService.updateGroup(
      conversationId,
      updates,
      userId,
    );

    // Create system message for requireApproval toggle
    if (updates.requireApproval !== undefined) {
      const actor = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { displayName: true },
      });
      const actorName = actor?.displayName ?? 'Một thành viên';
      const action = updates.requireApproval ? 'bật' : 'tắt';

      const sysMsg = await this.prisma.message.create({
        data: {
          conversationId,
          type: 'SYSTEM',
          content: `${actorName} đã ${action} phê duyệt thành viên mới`,
          metadata: {
            action: 'SETTINGS_CHANGED',
            actorId: userId,
            setting: 'requireApproval',
            value: updates.requireApproval,
          },
        },
      });

      // Broadcast system message to all members
      await this.broadcaster.broadcast({
        conversationId,
        message: safeJSON(sysMsg),
        excludeUserIds: [],
      });
    }

    const members =
      await this.conversationService.getActiveMembers(conversationId);

    const notifications: ConversationGatewayNotification[] = members.map(
      (member) => ({
        userId: member.userId,
        event: groupUpdatedEvent,
        data: {
          conversationId,
          updates,
        },
      }),
    );

    return { updated, notifications };
  }

  async addMembers(
    dto: AddMembersDto,
    userId: string,
    membersAddedEvent: string,
  ): Promise<{
    result: unknown;
    notifications: ConversationGatewayNotification[];
  }> {
    const result = await this.groupService.addMembers(dto, userId);

    const members = await this.conversationService.getActiveMembers(
      dto.conversationId,
    );

    const notifications: ConversationGatewayNotification[] = members.map(
      (member) => ({
        userId: member.userId,
        event: membersAddedEvent,
        data: {
          conversationId: dto.conversationId,
          memberIds: dto.userIds,
          addedBy: userId,
        },
      }),
    );

    return { result, notifications };
  }

  async removeMember(
    dto: RemoveMemberDto,
    userId: string,
    memberRemovedEvent: string,
    youWereRemovedEvent: string,
  ): Promise<{ notifications: ConversationGatewayNotification[] }> {
    await this.groupService.removeMember(dto, userId);

    const members = await this.conversationService.getActiveMembers(
      dto.conversationId,
    );

    const notifications: ConversationGatewayNotification[] = members.map(
      (member) => ({
        userId: member.userId,
        event: memberRemovedEvent,
        data: {
          conversationId: dto.conversationId,
          memberId: dto.userId,
          removedBy: userId,
        },
      }),
    );

    notifications.push({
      userId: dto.userId,
      event: youWereRemovedEvent,
      data: {
        conversationId: dto.conversationId,
        removedBy: userId,
      },
    });

    return { notifications };
  }

  async transferAdmin(
    dto: TransferAdminDto,
    userId: string,
    adminTransferredEvent: string,
  ): Promise<{
    result: unknown;
    notifications: ConversationGatewayNotification[];
  }> {
    const result = await this.groupService.transferAdmin(dto, userId);

    const members = await this.conversationService.getActiveMembers(
      dto.conversationId,
    );

    const notifications: ConversationGatewayNotification[] = members.map(
      (member) => ({
        userId: member.userId,
        event: adminTransferredEvent,
        data: {
          conversationId: dto.conversationId,
          fromUserId: userId,
          toUserId: dto.newAdminId,
        },
      }),
    );

    return { result, notifications };
  }

  async leaveGroup(
    conversationId: string,
    userId: string,
    memberLeftEvent: string,
  ): Promise<{ notifications: ConversationGatewayNotification[] }> {
    await this.groupService.removeMember(
      {
        conversationId,
        userId,
      },
      userId,
    );

    const members =
      await this.conversationService.getActiveMembers(conversationId);

    const notifications: ConversationGatewayNotification[] = members.map(
      (member) => ({
        userId: member.userId,
        event: memberLeftEvent,
        data: {
          conversationId,
          memberId: userId,
        },
      }),
    );

    // FIX: Push notification for the leaving user so their other connected devices can sync
    notifications.push({
      userId,
      event: memberLeftEvent,
      data: {
        conversationId,
        memberId: userId,
      },
    });

    return { notifications };
  }

  async dissolveGroup(
    conversationId: string,
    userId: string,
    dissolvedEvent: string,
  ): Promise<{ notifications: ConversationGatewayNotification[] }> {
    const members =
      await this.conversationService.getActiveMembers(conversationId);
    const memberIds = members.map((m) => m.userId);

    // 1. Create system message BEFORE soft-delete (persistent audit trail)
    const admin = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true },
    });
    const actorName = admin?.displayName ?? 'Một thành viên';

    const sysMsg = await this.prisma.message.create({
      data: {
        conversationId,
        type: 'SYSTEM',
        content: `${actorName} đã giải tán nhóm`,
        metadata: {
          action: 'GROUP_DISSOLVED',
          actorId: userId,
        },
      },
    });

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: sysMsg.createdAt },
    });

    // 2. Broadcast system message to online members (before soft-delete so getActiveMembers works)
    await this.broadcaster.broadcast({
      conversationId,
      message: safeJSON(sysMsg),
      excludeUserIds: [],
    });

    // 3. Enqueue system message for offline members so they see it on reconnect
    await this.enqueueForOfflineMembers(memberIds, sysMsg);

    // 4. Soft-delete the conversation + emit domain event
    await this.groupService.dissolveGroup(conversationId, userId, memberIds);

    const notifications: ConversationGatewayNotification[] = members.map(
      (member) => ({
        userId: member.userId,
        event: dissolvedEvent,
        data: {
          conversationId,
          dissolvedBy: userId,
        },
      }),
    );

    return { notifications };
  }

  /**
   * For members who are offline (no active sockets), enqueue the message
   * to Redis offline queue so they receive it via syncOfflineMessages on reconnect.
   */
  private async enqueueForOfflineMembers(
    memberIds: string[],
    message: {
      id: bigint;
      conversationId: string;
      createdAt: Date;
      [key: string]: any;
    },
  ): Promise<void> {
    try {
      const client = this.redis.getClient();

      for (const memberId of memberIds) {
        const sockets = await this.redisRegistry.getUserSockets(memberId);
        if (sockets.length > 0) continue; // user is online, already received via broadcast

        const queueKey = RedisKeyBuilder.offlineMessages(memberId);
        const score = new Date(message.createdAt).getTime();
        const queuedMsg = {
          messageId: message.id,
          conversationId: message.conversationId,
          data: message,
          timestamp: score,
        };

        await client.zadd(queueKey, score, safeStringify(queuedMsg));
      }
    } catch (error) {
      this.logger.warn(
        `[DISSOLVE_GROUP] Failed to enqueue offline messages`,
        (error as Error).stack,
      );
    }
  }

  async requestJoin(
    dto: CreateJoinRequestDto,
    userId: string,
    joinRequestReceivedEvent: string,
  ): Promise<{
    result: unknown;
    notifications: ConversationGatewayNotification[];
  }> {
    const result = await this.groupJoinService.requestJoin(dto, userId);

    const notifications: ConversationGatewayNotification[] = [];

    if (
      typeof result === 'object' &&
      result !== null &&
      'status' in result &&
      (result as { status?: unknown }).status === MemberStatus.PENDING
    ) {
      const members = await this.conversationService.getActiveMembers(
        dto.conversationId,
      );

      const admins = members.filter((m) => m.role === MemberRole.ADMIN);
      for (const admin of admins) {
        notifications.push({
          userId: admin.userId,
          event: joinRequestReceivedEvent,
          data: {
            conversationId: dto.conversationId,
            requesterId: userId,
            message: dto.message,
          },
        });
      }
    }

    return { result, notifications };
  }

  async reviewJoinRequest(
    dto: ReviewJoinRequestDto,
    userId: string,
    joinReviewedEvent: string,
    memberJoinedEvent: string,
  ): Promise<{
    result: unknown;
    notifications: ConversationGatewayNotification[];
  }> {
    const request = await this.prisma.groupJoinRequest.findUnique({
      where: { id: dto.requestId },
      select: { userId: true, conversationId: true },
    });

    if (!request) {
      throw new NotFoundException('Request not found');
    }

    const result = await this.groupJoinService.reviewJoinRequest(dto, userId);

    const notifications: ConversationGatewayNotification[] = [
      {
        userId: request.userId,
        event: joinReviewedEvent,
        data: {
          conversationId: request.conversationId,
          approved: dto.approve,
          reviewedBy: userId,
        },
      },
    ];

    const members = await this.conversationService.getActiveMembers(
      request.conversationId,
    );

    const admins = members.filter((m) => m.role === MemberRole.ADMIN);
    for (const admin of admins) {
      notifications.push({
        userId: admin.userId,
        event: joinReviewedEvent,
        data: {
          conversationId: request.conversationId,
          requestId: dto.requestId,
          approved: dto.approve,
          reviewedBy: userId,
        },
      });
    }

    if (dto.approve) {

      for (const member of members) {
        if (member.userId === request.userId) continue;
        notifications.push({
          userId: member.userId,
          event: memberJoinedEvent,
          data: {
            conversationId: request.conversationId,
            userId: request.userId,
          },
        });
      }
    }

    return { result, notifications };
  }

  async getPendingRequests(
    conversationId: string,
    userId: string,
  ): Promise<unknown> {
    return this.groupJoinService.getPendingRequests(conversationId, userId);
  }

  async inviteMembers(
    dto: InviteMembersDto,
    inviterId: string,
    joinRequestReceivedEvent: string,
  ): Promise<{
    result: { invitedCount: number; skippedCount: number };
    notifications: ConversationGatewayNotification[];
  }> {
    const result: { invitedCount: number; skippedCount: number } =
      await this.groupJoinService.inviteMembers(
        dto.conversationId,
        dto.userIds,
        inviterId,
      );

    const notifications: ConversationGatewayNotification[] = [];

    // Notify admin about the new pending join requests
    if (result.invitedCount > 0) {
      const members = await this.conversationService.getActiveMembers(
        dto.conversationId,
      );
      const admins = members.filter((m) => m.role === MemberRole.ADMIN);
      for (const admin of admins) {
        notifications.push({
          userId: admin.userId,
          event: joinRequestReceivedEvent,
          data: {
            conversationId: dto.conversationId,
            requesterId: inviterId,
            invitedUserIds: dto.userIds,
          },
        });
      }
    }

    return { result, notifications };
  }

  async pinMessage(
    conversationId: string,
    messageId: bigint,
    userId: string,
    messagePinnedEvent: string,
  ): Promise<{ notifications: ConversationGatewayNotification[] }> {
    await this.groupService.pinMessage(conversationId, messageId, userId);

    const members =
      await this.conversationService.getActiveMembers(conversationId);

    const notifications: ConversationGatewayNotification[] = members.map(
      (member) => ({
        userId: member.userId,
        event: messagePinnedEvent,
        data: {
          conversationId,
          messageId,
          pinnedBy: userId,
        },
      }),
    );

    return { notifications };
  }

  async unpinMessage(
    conversationId: string,
    messageId: bigint,
    userId: string,
    messageUnpinnedEvent: string,
  ): Promise<{ notifications: ConversationGatewayNotification[] }> {
    await this.groupService.unpinMessage(conversationId, messageId, userId);

    const members =
      await this.conversationService.getActiveMembers(conversationId);

    const notifications: ConversationGatewayNotification[] = members.map(
      (member) => ({
        userId: member.userId,
        event: messageUnpinnedEvent,
        data: {
          conversationId,
          messageId,
          unpinnedBy: userId,
        },
      }),
    );

    return { notifications };
  }
}
