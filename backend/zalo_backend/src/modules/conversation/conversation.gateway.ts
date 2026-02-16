import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayInit,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import {
  Logger,
  UseFilters,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { AuthenticatedSocket } from 'src/common/interfaces/socket-client.interface';
import { WsThrottleGuard } from 'src/socket/guards/ws-throttle.guard';
import { SocketEvents } from 'src/common/constants/socket-events.constant';
import { SocketStateService } from 'src/socket/services/socket-state.service';
import { WsTransformInterceptor } from 'src/common/interceptor/ws-transform.interceptor';
import { WsExceptionFilter } from 'src/socket/filters/ws-exception.filter';

import { ConversationService } from './services/conversation.service';
import { GroupService } from './services/group.service';
import { GroupJoinService } from './services/group-join.service';
import { PrismaService } from '@database/prisma.service';
import {
  ConversationGatewayNotification,
  ConversationRealtimeService,
} from './services/conversation-realtime.service';

import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { AddMembersDto } from './dto/add-members.dto';
import { RemoveMemberDto } from './dto/remove-member.dto';
import { TransferAdminDto } from './dto/transfer-admin.dto';
import { CreateJoinRequestDto } from './dto/join-request.dto';
import { ReviewJoinRequestDto } from './dto/review-join-request.dto';
import { InviteMembersDto } from './dto/invite-members.dto';

@WebSocketGateway({
  cors: { origin: '*', credentials: true },
  namespace: '/socket.io',
})
@UseGuards(WsThrottleGuard)
@UsePipes(new ValidationPipe({ transform: true }))
@UseInterceptors(WsTransformInterceptor)
@UseFilters(WsExceptionFilter)
export class ConversationGateway implements OnGatewayInit {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ConversationGateway.name);

  constructor(
    private readonly conversationService: ConversationService,
    private readonly groupService: GroupService,
    private readonly groupJoinService: GroupJoinService,
    private readonly realtime: ConversationRealtimeService,
    private readonly socketState: SocketStateService,
    private readonly prisma: PrismaService,
  ) { }

  afterInit() {
    this.logger.log('🗣️ Conversation Gateway initialized');
  }

  @SubscribeMessage(SocketEvents.GROUP_CREATE)
  async handleCreateGroup(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: CreateGroupDto,
  ) {
    if (!client.userId) {
      throw new Error('Unauthenticated');
    }
    try {
      const { group, notifications } = await this.realtime.createGroup(
        dto,
        client.userId,
        SocketEvents.GROUP_CREATED,
      );

      await this.emitNotifications(notifications);
      return { group };
    } catch (error) {
      this.logger.error('Error creating group', (error as Error).stack);
      client.emit(SocketEvents.ERROR, {
        event: SocketEvents.GROUP_CREATE,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  @SubscribeMessage(SocketEvents.GROUP_UPDATE)
  async handleUpdateGroup(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: { conversationId: string; updates: UpdateGroupDto },
  ) {
    if (!client.userId) {
      throw new Error('Unauthenticated');
    }
    try {
      const { updated, notifications } = await this.realtime.updateGroup(
        dto.conversationId,
        dto.updates,
        client.userId,
        SocketEvents.GROUP_UPDATED,
      );

      await this.emitNotifications(notifications);
      return { updated };
    } catch (error) {
      this.logger.error('Error updating group', (error as Error).stack);
      client.emit(SocketEvents.ERROR, {
        event: SocketEvents.GROUP_UPDATE,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  @SubscribeMessage(SocketEvents.GROUP_ADD_MEMBERS)
  async handleAddMembers(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: AddMembersDto,
  ) {
    if (!client.userId) {
      throw new Error('Unauthenticated');
    }
    try {
      const { result, notifications } = await this.realtime.addMembers(
        dto,
        client.userId,
        SocketEvents.GROUP_MEMBERS_ADDED,
      );

      await this.emitNotifications(notifications);
      return { result };
    } catch (error) {
      this.logger.error('Error adding members', (error as Error).stack);
      client.emit(SocketEvents.ERROR, {
        event: SocketEvents.GROUP_ADD_MEMBERS,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  @SubscribeMessage(SocketEvents.GROUP_REMOVE_MEMBER)
  async handleRemoveMember(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: RemoveMemberDto,
  ) {
    if (!client.userId) {
      throw new Error('Unauthenticated');
    }
    try {
      const { notifications } = await this.realtime.removeMember(
        dto,
        client.userId,
        SocketEvents.GROUP_MEMBER_REMOVED,
        SocketEvents.GROUP_YOU_WERE_REMOVED,
      );

      await this.emitNotifications(notifications);
      return true;
    } catch (error) {
      this.logger.error('Error removing member', (error as Error).stack);
      client.emit(SocketEvents.ERROR, {
        event: SocketEvents.GROUP_REMOVE_MEMBER,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  @SubscribeMessage(SocketEvents.GROUP_TRANSFER_ADMIN)
  async handleTransferAdmin(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: TransferAdminDto,
  ) {
    if (!client.userId) {
      throw new Error('Unauthenticated');
    }
    try {
      const { result, notifications } = await this.realtime.transferAdmin(
        dto,
        client.userId,
        SocketEvents.GROUP_ADMIN_TRANSFERRED,
      );

      await this.emitNotifications(notifications);
      return { result };
    } catch (error) {
      this.logger.error('Error transferring admin', (error as Error).stack);
      client.emit(SocketEvents.ERROR, {
        event: SocketEvents.GROUP_TRANSFER_ADMIN,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  @SubscribeMessage(SocketEvents.GROUP_LEAVE)
  async handleLeaveGroup(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: { conversationId: string },
  ) {
    if (!client.userId) {
      throw new Error('Unauthenticated');
    }
    try {
      const { notifications } = await this.realtime.leaveGroup(
        dto.conversationId,
        client.userId,
        SocketEvents.GROUP_MEMBER_LEFT,
      );

      await this.emitNotifications(notifications);
      return true;
    } catch (error) {
      this.logger.error('Error leaving group', (error as Error).stack);
      client.emit(SocketEvents.ERROR, {
        event: SocketEvents.GROUP_LEAVE,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  @SubscribeMessage(SocketEvents.GROUP_DISSOLVE)
  async handleDissolveGroup(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: { conversationId: string },
  ) {
    if (!client.userId) {
      throw new Error('Unauthenticated');
    }
    try {
      const { notifications } = await this.realtime.dissolveGroup(
        dto.conversationId,
        client.userId,
        SocketEvents.GROUP_DISSOLVED,
      );

      await this.emitNotifications(notifications);
      return true;
    } catch (error) {
      this.logger.error('Error dissolving group', (error as Error).stack);
      client.emit(SocketEvents.ERROR, {
        event: SocketEvents.GROUP_DISSOLVE,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  @SubscribeMessage(SocketEvents.GROUP_REQUEST_JOIN)
  async handleRequestJoin(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: CreateJoinRequestDto,
  ) {
    if (!client.userId) {
      throw new Error('Unauthenticated');
    }
    try {
      const { result, notifications } = await this.realtime.requestJoin(
        dto,
        client.userId,
        SocketEvents.GROUP_JOIN_REQUEST_RECEIVED,
      );

      await this.emitNotifications(notifications);
      return { result };
    } catch (error) {
      this.logger.error('Error requesting join', (error as Error).stack);
      client.emit(SocketEvents.ERROR, {
        event: SocketEvents.GROUP_REQUEST_JOIN,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  @SubscribeMessage(SocketEvents.GROUP_REVIEW_JOIN)
  async handleReviewJoinRequest(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: ReviewJoinRequestDto,
  ) {
    try {
      if (!client.userId) {
        throw new Error('Unauthenticated');
      }

      const { result, notifications } = await this.realtime.reviewJoinRequest(
        dto,
        client.userId,
        SocketEvents.GROUP_JOIN_REQUEST_REVIEWED,
        SocketEvents.GROUP_MEMBER_JOINED,
      );

      await this.emitNotifications(notifications);
      return { result };
    } catch (error) {
      this.logger.error('Error reviewing join request', (error as Error).stack);
      client.emit(SocketEvents.ERROR, {
        event: SocketEvents.GROUP_REVIEW_JOIN,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  @SubscribeMessage(SocketEvents.GROUP_GET_PENDING)
  async handleGetPendingRequests(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: { conversationId: string },
  ) {
    if (!client.userId) {
      throw new Error('Unauthenticated');
    }

    try {
      return await this.realtime.getPendingRequests(
        dto.conversationId,
        client.userId,
      );
    } catch (error) {
      this.logger.error(
        'Error getting pending requests',
        (error as Error).stack,
      );
      client.emit(SocketEvents.ERROR, {
        event: SocketEvents.GROUP_GET_PENDING,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  @SubscribeMessage(SocketEvents.GROUP_INVITE_MEMBERS)
  async handleInviteMembers(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: InviteMembersDto,
  ) {
    if (!client.userId) {
      throw new Error('Unauthenticated');
    }
    try {
      const { result, notifications } = await this.realtime.inviteMembers(
        dto,
        client.userId,
        SocketEvents.GROUP_JOIN_REQUEST_RECEIVED,
      );

      await this.emitNotifications(notifications);
      return { result };
    } catch (error) {
      this.logger.error('Error inviting members', (error as Error).stack);
      client.emit(SocketEvents.ERROR, {
        event: SocketEvents.GROUP_INVITE_MEMBERS,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  @SubscribeMessage(SocketEvents.GROUP_PIN_MESSAGE)
  async handlePinMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: { conversationId: string; messageId: bigint },
  ) {
    if (!client.userId) {
      throw new Error('Unauthenticated');
    }

    try {
      const { notifications } = await this.realtime.pinMessage(
        dto.conversationId,
        dto.messageId,
        client.userId,
        SocketEvents.GROUP_MESSAGE_PINNED,
      );

      await this.emitNotifications(notifications);
      return true;
    } catch (error) {
      this.logger.error('Error pinning message', (error as Error).stack);
      client.emit(SocketEvents.ERROR, {
        event: SocketEvents.GROUP_PIN_MESSAGE,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  @SubscribeMessage(SocketEvents.GROUP_UNPIN_MESSAGE)
  async handleUnpinMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: { conversationId: string; messageId: bigint },
  ) {
    if (!client.userId) {
      throw new Error('Unauthenticated');
    }

    try {
      const { notifications } = await this.realtime.unpinMessage(
        dto.conversationId,
        dto.messageId,
        client.userId,
        SocketEvents.GROUP_MESSAGE_UNPINNED,
      );

      await this.emitNotifications(notifications);
      return true;
    } catch (error) {
      this.logger.error('Error unpinning message', (error as Error).stack);
      client.emit(SocketEvents.ERROR, {
        event: SocketEvents.GROUP_UNPIN_MESSAGE,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Listen for system-message.broadcast events emitted by ConversationEventHandler
   * and broadcast message:new + conversation:list:itemUpdated to all active members.
   */
  @OnEvent('system-message.broadcast')
  async handleSystemMessageBroadcast(payload: {
    conversationId: string;
    message: Record<string, unknown>;
    excludeUserIds?: string[];
  }): Promise<void> {
    const { conversationId, message, excludeUserIds = [] } = payload;
    const excludeSet = new Set(excludeUserIds);

    try {
      const members =
        await this.conversationService.getActiveMembers(conversationId);

      const recipientIds = members
        .map((m) => m.userId)
        .filter((uid) => !excludeSet.has(uid));

      if (recipientIds.length === 0) return;

      const isoCreatedAt =
        typeof message.createdAt === 'string'
          ? message.createdAt
          : new Date(message.createdAt as string | number | Date).toISOString();

      const listItemPayload = {
        conversationId,
        lastMessage: {
          id: String(message.id),
          content: (message.content as string) ?? null,
          type: message.type,
          senderId: (message.senderId as string) ?? null,
          createdAt: isoCreatedAt,
        },
        lastMessageAt: isoCreatedAt,
      };

      await Promise.all(
        recipientIds.map(async (userId) => {
          // Emit message:new
          await this.emitToUser(userId, SocketEvents.MESSAGE_NEW, {
            message,
            conversationId,
          });
          // Emit conversation:list:itemUpdated with unreadCountDelta
          await this.emitToUser(
            userId,
            SocketEvents.CONVERSATION_LIST_ITEM_UPDATED,
            { ...listItemPayload, unreadCountDelta: 1 },
          );
          // Increment unread count in DB
          await this.prisma.conversationMember
            .update({
              where: { conversationId_userId: { conversationId, userId } },
              data: { unreadCount: { increment: 1 } },
            })
            .catch(() => {
              /* member may have just left */
            });
        }),
      );

      this.logger.debug(
        `[SYSTEM_MSG_BROADCAST] Broadcasted to ${recipientIds.length} members in ${conversationId}`,
      );
    } catch (error) {
      this.logger.error(
        `[SYSTEM_MSG_BROADCAST] Failed to broadcast system message`,
        (error as Error).stack,
      );
    }
  }

  private async emitToUser(userId: string, event: string, data: unknown) {
    const socketIds = await this.socketState.getUserSockets(userId);

    for (const socketId of socketIds) {
      this.server.to(socketId).emit(event, data);
    }
  }

  private async emitNotifications(
    notifications: ConversationGatewayNotification[],
  ): Promise<void> {
    await Promise.all(
      notifications.map((n) =>
        this.emitToUser(n.userId, n.event, n.data).catch((err) =>
          this.logger.error(`Failed to emit to ${n.userId}`, err),
        ),
      ),
    );
  }
}
