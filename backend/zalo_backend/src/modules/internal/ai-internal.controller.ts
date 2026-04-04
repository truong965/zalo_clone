import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Param,
  UseGuards,
  Logger,
  BadRequestException,
  ForbiddenException,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InternalAuthGuard } from 'src/common/guards/internal-auth.guard';
import { PrismaService } from 'src/database/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OUTBOUND_SOCKET_EVENT } from '@common/events/outbound-socket.event';
import { SocketEvents } from 'src/common/constants/socket-events.constant';
import { safeJSON } from 'src/common/utils/json.util';
import { Public } from 'src/common/decorator/customize';

import { IsOptional, IsString, IsArray, IsInt, Min } from 'class-validator';
import { Type, Transform } from 'class-transformer';

type AIUnifiedSocketEvent =
  | typeof SocketEvents.AI_RESPONSE_STARTED
  | typeof SocketEvents.AI_RESPONSE_PROGRESS
  | typeof SocketEvents.AI_RESPONSE_THOUGHT
  | typeof SocketEvents.AI_RESPONSE_DELTA
  | typeof SocketEvents.AI_RESPONSE_COMPLETED
  | typeof SocketEvents.AI_RESPONSE_ERROR;

type AIInternalNotifyPayload = {
  conversationId: string;
  userId: string;
  type: string;
  payload: any;
};

type LegacyAiSocketEventName =
  | typeof SocketEvents.AI_SUMMARY
  | typeof SocketEvents.AI_STREAM_START
  | typeof SocketEvents.AI_STREAM_CHUNK
  | typeof SocketEvents.AI_STREAM_DONE
  | typeof SocketEvents.AI_STREAM_ERROR;

export class GetInternalMessagesDto {
  @IsOptional()
  @IsString()
  conversationId?: string;

  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsArray()
  @IsString({ each: true })
  messageIds?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  offset?: number = 0;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number = 50;
  
  @IsOptional()
  @IsString()
  sort?: 'asc' | 'desc' = 'asc';

  @IsOptional()
  @IsString()
  after?: string;

  @IsOptional()
  @IsString()
  startMessageId?: string;

  @IsOptional()
  @IsString()
  endMessageId?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}

export class GetMessageContextDto {
  @IsString()
  conversationId!: string;

  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsArray()
  @IsString({ each: true })
  messageIds!: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  k?: number = 5;

  @IsOptional()
  @IsString()
  userId?: string;
}

/**
 * Internal AI API Controller
 * 
 * Path: /internal/ai/*
 * Protection: InternalAuthGuard (x-api-key)
 */
@Controller({
  path: 'internal/ai',
  version: VERSION_NEUTRAL,
})
@Public()
@UseGuards(InternalAuthGuard)
export class AIInternalController {
  private readonly logger = new Logger(AIInternalController.name);
  private readonly unifiedStreamEnabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly configService: ConfigService,
  ) {
    this.unifiedStreamEnabled = this.configService.get<boolean>('ai.unifiedStreamEnabled', false);
  }

  @Get('messages')
  async getMessages(@Query() query: GetInternalMessagesDto) {
    this.logger.debug(`Incoming getMessages query: ${JSON.stringify(query)}`);
    
    const { 
      conversationId, limit, offset, sort, userId, after, 
      startMessageId, endMessageId, startDate, endDate 
    } = query;

    // Security check: If userId is provided, verify membership
    if (userId && conversationId) {
      await this.validateMembership(conversationId, userId);
    }
    
    const ids = query.messageIds || [];
    
    const where: any = { deletedAt: null };
    if (ids.length > 0) {
      where.id = { in: ids.map(id => BigInt(id)) };
      this.logger.debug(`Searching by IDs: ${ids.join(', ')}`);
    } else if (conversationId) {
      where.conversationId = conversationId;
      this.logger.debug(`Searching by conversationId: ${conversationId}`);
    } else {
      this.logger.debug(`Fetching all messages (global backfill mode)`);
    }

    if (after) {
      where.id = { ...where.id, gt: BigInt(after) };
      this.logger.debug(`Filtering messages after ID: ${after}`);
    }

    if (startMessageId) {
      where.id = { ...where.id, gte: BigInt(startMessageId) };
    }

    if (endMessageId) {
      where.id = { ...where.id, lte: BigInt(endMessageId) };
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const messages = await this.prisma.message.findMany({
      where,
      take: Number(limit),
      skip: Number(offset),
      orderBy: { id: sort || 'asc' }, // Consistent order for pagination
    });

    this.logger.debug(`Found ${messages.length} messages`);

    // Attach sender names manually due to decoupled relations
    const messagesWithSenders = await this.attachSenderNames(messages);

    return {
      messages: safeJSON(messagesWithSenders),
    };
  }

  @Get('messages/count')
  async countMessages(@Query() query: GetInternalMessagesDto) {
    this.logger.debug(`Incoming countMessages query: ${JSON.stringify(query)}`);
    
    const { conversationId, userId, after } = query;

    // Security check: If userId is provided, verify membership
    if (userId && conversationId) {
      await this.validateMembership(conversationId, userId);
    }
    
    const where: any = { deletedAt: null };
    if (conversationId) {
      where.conversationId = conversationId;
    }

    if (after) {
      where.id = { gt: BigInt(after) };
    }

    const count = await this.prisma.message.count({ where });
    this.logger.debug(`Counted ${count} messages`);

    return { count };
  }

  @Get('messages/context')
  async getMessagesContext(@Query() query: GetMessageContextDto) {
    this.logger.debug(`Incoming getMessagesContext query: ${JSON.stringify(query)}`);
    const { conversationId, messageIds, k, userId } = query;

    // Security check: If userId is provided, verify membership
    if (userId && conversationId) {
      await this.validateMembership(conversationId, userId);
    }

    if (!messageIds || messageIds.length === 0) {
      return { messages: [] };
    }

    const allMessagesMap = new Map<string, any>();

    for (const idStr of messageIds) {
      const id = BigInt(idStr);
      // Fetch the message itself
      const msg = await this.prisma.message.findUnique({
        where: { id },
      });
      if (msg) allMessagesMap.set(msg.id.toString(), msg);

      // Fetch k before
      const before = await this.prisma.message.findMany({
        where: { conversationId, id: { lt: id }, deletedAt: null },
        orderBy: { id: 'desc' },
        take: Number(k),
      });
      for (const m of before) allMessagesMap.set(m.id.toString(), m);

      // Fetch k after
      const after = await this.prisma.message.findMany({
        where: { conversationId, id: { gt: id }, deletedAt: null },
        orderBy: { id: 'asc' },
        take: Number(k),
      });
      for (const m of after) allMessagesMap.set(m.id.toString(), m);
    }

    // Sort messages logically (ascending by id)
    const sortedMessages = Array.from(allMessagesMap.values()).sort((a, b) => 
      Number(BigInt(a.id) - BigInt(b.id))
    );

    // Attach sender names
    const messagesWithSenders = await this.attachSenderNames(sortedMessages);

    return {
      messages: safeJSON(messagesWithSenders),
    };
  }

  @Get('conversations/:id')
  async getConversationInfo(@Param('id') id: string) {
    const room = await this.prisma.conversation.findUnique({
      where: { id },
      include: {
        members: {
          where: { status: 'ACTIVE' },
          select: { userId: true },
        },
      },
    });

    if (!room) {
      throw new BadRequestException('Conversation not found');
    }

    return safeJSON(room);
  }

  @Get('users/display-names')
  async getDisplayNames(@Query() query: any) {
    this.logger.debug(`Fetching display names for userIds: ${JSON.stringify(query.userIds)}`);

    // Parse userIds from query (can be array or string)
    const userIds = Array.isArray(query.userIds) 
      ? query.userIds 
      : (query.userIds ? [query.userIds] : []);

    if (userIds.length === 0) {
      return {};
    }

    try {
      const users = await this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, displayName: true },
      });

      // Return as map: { userId: displayName }
      const displayNameMap = Object.fromEntries(
        users.map(u => [u.id, u.displayName || 'Unknown User'])
      );

      this.logger.debug(`Found ${users.length} users, returning displayNameMap`);
      return displayNameMap;
    } catch (err: any) {
      this.logger.error(`Error fetching display names: ${err.message}`);
      throw new BadRequestException('Failed to fetch display names');
    }
  }

  @Post('notify')
  async notify(@Body() payload: AIInternalNotifyPayload) {
    this.logger.log(`Received AI notification: ${payload.type} for conversation ${payload.conversationId}`);

    const normalizedData = {
      ...(payload.payload || {}),
      conversationId: payload.payload?.conversationId || payload.conversationId,
    };

    if (payload.type === 'unified-response') {
      const event = normalizedData?.event as AIUnifiedSocketEvent | undefined;

      if (!event) {
        this.logger.warn('Received unified-response payload without event field');
        return { success: false, reason: 'missing-event' };
      }

      if (this.unifiedStreamEnabled) {
        this.eventEmitter.emit(OUTBOUND_SOCKET_EVENT, {
          userId: payload.userId,
          event,
          data: normalizedData,
        });
      }

      const legacyEvent = this.mapUnifiedEventToLegacyEvent(event, normalizedData);
      if (legacyEvent) {
        this.eventEmitter.emit(OUTBOUND_SOCKET_EVENT, {
          userId: payload.userId,
          event: legacyEvent.event,
          data: legacyEvent.data,
        });
      }

      return { success: true };
    }

    // AI results are per-user UI state, so prefer the triggering user's sockets.
    // This avoids depending on conversation-room membership for translation delivery.
    this.eventEmitter.emit(OUTBOUND_SOCKET_EVENT, {
      userId: payload.userId,
      event: this.resolveLegacyEventName(payload.type),
      data: normalizedData,
    });

    return { success: true };
  }

  @Post('validate-access')
  async validateAccess(@Body() body: { userId: string; conversationId: string }) {
    this.logger.debug(`Incoming validate-access: ${JSON.stringify(body)}`);
    try {
      await this.validateMembership(body.conversationId, body.userId);
      return { hasAccess: true };
    } catch (err: any) {
      this.logger.warn(`Access denied for user ${body.userId} to conversation ${body.conversationId}: ${err.message}`);
      return { hasAccess: false, error: err.message };
    }
  }

  /**
   * Helper to validate user membership in a conversation
   * Returns conversation if valid, throws ForbiddenException if not
   */
  private async validateMembership(conversationId: string, userId: string) {
    const member = await this.prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId,
        },
      },
      select: { status: true },
    });

    if (!member || member.status !== 'ACTIVE') {
      this.logger.warn(`Unauthorized access attempt by user ${userId} to conversation ${conversationId}`);
      throw new ForbiddenException('User is not an active member of this conversation');
    }

    return member;
  }

  private resolveLegacyEventName(type: string): string {
    switch (type) {
      case 'summary':
        return SocketEvents.AI_SUMMARY;
      case 'stream-start':
        return SocketEvents.AI_STREAM_START;
      case 'stream-chunk':
        return SocketEvents.AI_STREAM_CHUNK;
      case 'stream-done':
        return SocketEvents.AI_STREAM_DONE;
      case 'stream-error':
        return SocketEvents.AI_STREAM_ERROR;
      default:
        return `ai:${type}`;
    }
  }

  private mapUnifiedEventToLegacyEvent(
    event: AIUnifiedSocketEvent,
    data: Record<string, any>,
  ): { event: LegacyAiSocketEventName; data: Record<string, any> } | null {
    switch (event) {
      case SocketEvents.AI_RESPONSE_STARTED:
        return {
          event: SocketEvents.AI_STREAM_START,
          data: {
            ...data,
            event: SocketEvents.AI_STREAM_START,
            type: data.type,
          },
        };
      case SocketEvents.AI_RESPONSE_PROGRESS:
        return {
          event: SocketEvents.AI_STREAM_CHUNK,
          data: {
            ...data,
            event: SocketEvents.AI_STREAM_CHUNK,
            type: data.type,
          },
        };
      case SocketEvents.AI_RESPONSE_THOUGHT:
        return {
          event: SocketEvents.AI_STREAM_CHUNK,
          data: {
            ...data,
            event: SocketEvents.AI_STREAM_CHUNK,
            type: data.type,
          },
        };
      case SocketEvents.AI_RESPONSE_DELTA:
        return {
          event: SocketEvents.AI_STREAM_CHUNK,
          data: {
            ...data,
            event: SocketEvents.AI_STREAM_CHUNK,
            type: data.type,
          },
        };
      case SocketEvents.AI_RESPONSE_COMPLETED:
        return data.type === 'summary'
          ? {
              event: SocketEvents.AI_SUMMARY,
              data: {
                ...data,
                event: SocketEvents.AI_SUMMARY,
                type: data.type,
              },
            }
          : {
              event: SocketEvents.AI_STREAM_DONE,
              data: {
                ...data,
                event: SocketEvents.AI_STREAM_DONE,
                type: data.type,
              },
            };
      case SocketEvents.AI_RESPONSE_ERROR:
        return {
          event: SocketEvents.AI_STREAM_ERROR,
          data: {
            ...data,
            event: SocketEvents.AI_STREAM_ERROR,
            type: data.type,
          },
        };
      default:
        return null;
    }
  }

  /**
   * Helper to attach sender display names manually due to decoupled schema
   */
  private async attachSenderNames(messages: any[]) {
    const senderIds = [...new Set(messages.map(m => m.senderId).filter(Boolean))];
    if (senderIds.length === 0) return messages;

    const users = await this.prisma.user.findMany({
      where: { id: { in: senderIds } },
      select: { id: true, displayName: true },
    });

    const userMap = new Map(users.map(u => [u.id.toString(), u.displayName]));

    return messages.map(m => ({
      ...m,
      sender: m.senderId ? { 
        displayName: userMap.get(m.senderId.toString()) || 'Unknown User' 
      } : undefined,
    }));
  }
}
