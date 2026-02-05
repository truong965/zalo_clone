import { Injectable, NotFoundException } from '@nestjs/common';
import { MemberRole, MemberStatus } from '@prisma/client';
import { PrismaService } from 'src/database/prisma.service';

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

export type ConversationGatewayNotification = {
  userId: string;
  event: string;
  data: unknown;
};

@Injectable()
export class ConversationRealtimeService {
  constructor(
    private readonly conversationService: ConversationService,
    private readonly groupService: GroupService,
    private readonly groupJoinService: GroupJoinService,
    private readonly prisma: PrismaService,
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

    const notifications: ConversationGatewayNotification[] = members.map(
      (member) => ({
        userId: member.userId,
        event: groupCreatedEvent,
        data: {
          group,
          role: member.role,
        },
      }),
    );

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
          addedUserIds: dto.userIds,
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
          removedUserId: dto.userId,
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
          userId,
        },
      }),
    );

    return { notifications };
  }

  async dissolveGroup(
    conversationId: string,
    userId: string,
    dissolvedEvent: string,
  ): Promise<{ notifications: ConversationGatewayNotification[] }> {
    const members =
      await this.conversationService.getActiveMembers(conversationId);

    await this.groupService.dissolveGroup(conversationId, userId);

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

      const admin = members.find((m) => m.role === MemberRole.ADMIN);
      if (admin) {
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

    if (dto.approve) {
      const members = await this.conversationService.getActiveMembers(
        request.conversationId,
      );

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
