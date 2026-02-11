// src/modules/message/services/message.service.ts

import {
  Injectable,
  ForbiddenException,
  Logger,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { RedisKeyBuilder } from '@shared/redis/redis-key-builder';
import { SendMessageDto } from '../dto/send-message.dto';
import { GetMessagesDto } from '../dto/get-messages.dto';
import {
  ConversationType,
  MediaProcessingStatus,
  MemberStatus,
  Message,
  MessageType,
  Prisma,
} from '@prisma/client';
import { RedisService } from 'src/modules/redis/redis.service';
import { MessageValidator } from '../helpers/message-validation.helper';
import redisConfig from 'src/config/redis.config';
import type { ConfigType } from '@nestjs/config';
import { safeJSON, safeStringify } from 'src/common/utils/json.util';
import { EventPublisher } from '@shared/events';
import { MessageSentEvent } from '../events';
import { InteractionAuthorizationService } from '@modules/authorization/services/interaction-authorization.service';
import { PermissionAction } from '@common/constants/permission-actions.constant';
import { CursorPaginationHelper } from '@common/utils/cursor-pagination.helper';
import type { CursorPaginatedResult } from '@common/interfaces/paginated-result.interface';

@Injectable()
export class MessageService {
  private readonly logger = new Logger(MessageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly eventPublisher: EventPublisher,
    private readonly interactionAuth: InteractionAuthorizationService,
    @Inject(redisConfig.KEY)
    private readonly config: ConfigType<typeof redisConfig>,
  ) { }

  private async getDirectTargetUserId(
    conversationId: string,
    senderId: string,
  ): Promise<string | null> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        type: true,
        members: {
          where: { status: MemberStatus.ACTIVE },
          select: { userId: true },
        },
      },
    });

    if (!conversation) {
      throw new BadRequestException('Conversation not found');
    }

    if (conversation.type !== ConversationType.DIRECT) {
      return null;
    }

    const other = conversation.members.find((m) => m.userId !== senderId);
    if (!other) {
      throw new BadRequestException('Invalid direct conversation members');
    }

    return other.userId;
  }

  /**
   * Check if user is member of conversation
   * Direct Prisma query to avoid cross-module dependency
   */
  private async isMember(
    conversationId: string,
    userId: string,
  ): Promise<boolean> {
    const member = await this.prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId,
        },
      },
      select: { status: true },
    });

    return member?.status === MemberStatus.ACTIVE;
  }

  /**
   * CORE: Send a message with Media Support
   */
  async sendMessage(dto: SendMessageDto, senderId: string): Promise<Message> {
    MessageValidator.validateMessageTypeConsistency(dto);

    const idempotencyKey = RedisKeyBuilder.messageIdempotency(
      dto.clientMessageId,
    );
    const cachedMessage = await this.redis.getClient().get(idempotencyKey);

    if (cachedMessage) {
      this.logger.debug(`Duplicate send detected: ${dto.clientMessageId}`);
      const cached = JSON.parse(cachedMessage) as Message;
      const existingMessage = await this.prisma.message.findUniqueOrThrow({
        where: { id: cached.id },
        include: {
          sender: {
            select: { id: true, displayName: true, avatarUrl: true },
          },
          mediaAttachments: {
            select: {
              id: true,
              mediaType: true,
              cdnUrl: true,
              thumbnailUrl: true,
              width: true,
              height: true,
              duration: true,
              processingStatus: true,
            },
            where: { deletedAt: null },
          },
        },
      });
      return safeJSON(existingMessage);
    }

    const isMember = await this.isMember(dto.conversationId, senderId);
    if (!isMember) {
      throw new ForbiddenException('Not a member of conversation');
    }

    const targetUserId = await this.getDirectTargetUserId(
      dto.conversationId,
      senderId,
    );

    if (targetUserId) {
      const authz = await this.interactionAuth.canInteract(
        senderId,
        targetUserId,
        PermissionAction.MESSAGE,
      );
      if (!authz.allowed) {
        throw new ForbiddenException(
          authz.reason ?? 'User privacy settings do not allow messaging',
        );
      }
    }

    if (dto.mediaIds && dto.mediaIds.length > 0) {
      await this.validateMediaAttachments(dto.mediaIds, senderId, dto.type);
    }

    let replyToId: bigint | null = null;

    if (dto.replyTo?.messageId) {
      try {
        replyToId = BigInt(dto.replyTo.messageId);
      } catch {
        throw new BadRequestException('Invalid replyTo message ID format');
      }

      await this.validateReplyToMessage(replyToId, dto.conversationId);
    }

    let message: Message;

    try {
      message = await this.prisma.$transaction(async (tx) => {
        const msg = await tx.message.create({
          data: {
            conversationId: dto.conversationId,
            senderId,
            type: dto.type,
            content: dto.content?.trim() || null,
            metadata: dto.metadata || {},
            clientMessageId: dto.clientMessageId,
            replyToId: replyToId,
          },
        });

        if (dto.mediaIds && dto.mediaIds.length > 0) {
          await tx.mediaAttachment.updateMany({
            where: { id: { in: dto.mediaIds } },
            data: { messageId: msg.id },
          });
        }

        await tx.conversation.update({
          where: { id: dto.conversationId },
          data: { lastMessageAt: msg.createdAt },
        });

        return msg;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          const target = error.meta?.target as string[] | undefined;
          if (target?.includes('clientMessageId')) {
            this.logger.warn(
              `Duplicate clientMessageId detected: ${dto.clientMessageId}`,
            );
          }
          const existing = await this.prisma.message.findUniqueOrThrow({
            where: { clientMessageId: dto.clientMessageId },
            include: {
              sender: {
                select: { id: true, displayName: true, avatarUrl: true },
              },
              mediaAttachments: {
                select: {
                  id: true,
                  mediaType: true,
                  cdnUrl: true,
                  thumbnailUrl: true,
                  width: true,
                  height: true,
                  duration: true,
                  processingStatus: true,
                },
                where: { deletedAt: null },
              },
            },
          });

          return safeJSON(existing);
        }

        if (error.code === 'P2003') {
          this.logger.error(
            'Foreign key constraint failed - media may have been deleted',
            {
              clientMessageId: dto.clientMessageId,
              error: error.message,
            },
          );
          throw new BadRequestException(
            'One or more media files are no longer available. Please retry upload.',
          );
        }
      }
      throw error;
    }

    const fullMessage = await this.prisma.message.findUniqueOrThrow({
      where: { id: message.id },
      include: {
        sender: {
          select: { id: true, displayName: true, avatarUrl: true },
        },
        mediaAttachments: {
          select: {
            id: true,
            mediaType: true,
            cdnUrl: true,
            thumbnailUrl: true,
            width: true,
            height: true,
            duration: true,
            processingStatus: true,
          },
          where: { deletedAt: null },
        },
      },
    });

    await this.redis.getClient().setex(
      idempotencyKey,
      this.config.ttl.messageIdempotency,
      safeStringify({
        id: fullMessage.id,
        createdAt: fullMessage.createdAt,
        conversationId: fullMessage.conversationId,
      }),
    );

    await this.eventPublisher.publish(
      new MessageSentEvent(
        fullMessage.id.toString(),
        fullMessage.conversationId,
        fullMessage.senderId ?? senderId,
        fullMessage.content || '',
        fullMessage.type,
      ),
      { throwOnListenerError: true },
    );

    this.logger.log(`Message ${message.id} sent (Type: ${dto.type})`);
    return safeJSON(fullMessage);
  }

  private async validateMediaAttachments(
    mediaIds: string[],
    senderId: string,
    messageType: MessageType,
  ): Promise<void> {
    const mediaList = await this.prisma.mediaAttachment.findMany({
      where: { id: { in: mediaIds } },
      select: {
        id: true,
        uploadedBy: true,
        messageId: true,
        processingStatus: true,
        deletedAt: true,
        mediaType: true,
      },
    });

    if (mediaList.length !== mediaIds.length) {
      throw new BadRequestException('One or more media files not found');
    }

    for (const media of mediaList) {
      if (media.uploadedBy !== senderId) {
        throw new ForbiddenException(`You do not own media ${media.id}`);
      }

      if (media.messageId !== null) {
        throw new BadRequestException(
          `Media ${media.id} is already attached to another message`,
        );
      }

      if (media.deletedAt) {
        throw new BadRequestException(`Media ${media.id} has been deleted`);
      }

      const allowedStatuses: MediaProcessingStatus[] = [
        MediaProcessingStatus.READY,
        MediaProcessingStatus.PROCESSING,
      ];

      if (!allowedStatuses.includes(media.processingStatus)) {
        throw new BadRequestException(
          `Media ${media.id} is not ready (status: ${media.processingStatus})`,
        );
      }
    }

    MessageValidator.validateMediaTypeConsistency(messageType, mediaList);
  }

  private async validateReplyToMessage(
    replyToId: bigint | null,
    conversationId: string,
  ): Promise<void> {
    if (!replyToId) {
      throw new BadRequestException('Reply-to message not found');
    }
    const parentMessage = await this.prisma.message.findUnique({
      where: { id: replyToId },
      select: { conversationId: true, deletedAt: true },
    });

    if (!parentMessage) {
      throw new BadRequestException('Reply-to message not found');
    }

    if (parentMessage.conversationId !== conversationId) {
      throw new BadRequestException(
        'Cannot reply to message from different conversation',
      );
    }

    if (parentMessage.deletedAt) {
      throw new BadRequestException('Cannot reply to deleted message');
    }
  }

  async getMessages(
    dto: GetMessagesDto,
    userId: string,
  ): Promise<CursorPaginatedResult<unknown>> {
    const isMember = await this.isMember(dto.conversationId, userId);

    if (!isMember) {
      throw new ForbiddenException('You cannot view this conversation');
    }

    const limit = dto.limit || 50;
    const direction = dto.direction || 'older';

    let cursorId: bigint | undefined;
    if (dto.cursor) {
      try {
        cursorId = BigInt(dto.cursor);
      } catch {
        throw new BadRequestException('Invalid cursor');
      }
    }

    const isNewer = direction === 'newer';

    const messages = await this.prisma.message.findMany({
      where: {
        conversationId: dto.conversationId,
        deletedAt: null,
        ...(cursorId && { id: isNewer ? { gt: cursorId } : { lt: cursorId } }),
      },
      take: limit + 1,
      orderBy: {
        createdAt: isNewer ? 'asc' : 'desc',
      },
      include: {
        sender: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        parentMessage: {
          select: {
            id: true,
            content: true,
            senderId: true,
          },
        },
        receipts: {
          select: {
            userId: true,
            status: true,
            timestamp: true,
          },
        },
        mediaAttachments: {
          select: {
            id: true,
            mediaType: true,
            cdnUrl: true,
            thumbnailUrl: true,
            width: true,
            height: true,
            duration: true,
            processingStatus: true,
            originalName: true,
            size: true,
          },
          where: {
            processingStatus: MediaProcessingStatus.READY,
            deletedAt: null,
          },
        },
      },
    });

    const result = CursorPaginationHelper.buildResult({
      items: messages,
      limit,
      getCursor: (m) => m.id.toString(),
      mapToDto: (m) => safeJSON(m),
    });

    // For 'newer' direction: query was ASC, reverse data to maintain DESC order
    // for the frontend. hasNextPage/nextCursor are already correct from ASC order.
    if (isNewer) {
      result.data = result.data.reverse();
    }

    return result;
  }

  /**
   * Get messages around a target message (for jump-to-message from search).
   * Returns messages in the same shape as getMessages() (MessageListItem).
   */
  async getMessagesContext(
    conversationId: string,
    targetMessageId: string,
    userId: string,
    before = 25,
    after = 25,
  ) {
    const isMember = await this.isMember(conversationId, userId);
    if (!isMember) {
      throw new ForbiddenException('You cannot view this conversation');
    }

    let targetBigInt: bigint;
    try {
      targetBigInt = BigInt(targetMessageId);
    } catch {
      throw new BadRequestException('Invalid message ID');
    }

    // Get the target message to obtain its createdAt for range query
    const target = await this.prisma.message.findFirst({
      where: {
        id: targetBigInt,
        conversationId,
        deletedAt: null,
      },
      select: { id: true, createdAt: true },
    });

    if (!target) {
      throw new BadRequestException('Message not found in this conversation');
    }

    const includeFields = {
      sender: {
        select: { id: true, displayName: true, avatarUrl: true },
      },
      parentMessage: {
        select: { id: true, content: true, senderId: true },
      },
      receipts: {
        select: { userId: true, status: true, timestamp: true },
      },
      mediaAttachments: {
        select: {
          id: true,
          mediaType: true,
          cdnUrl: true,
          thumbnailUrl: true,
          width: true,
          height: true,
          duration: true,
          processingStatus: true,
          originalName: true,
          size: true,
        },
        where: {
          processingStatus: MediaProcessingStatus.READY,
          deletedAt: null,
        },
      },
    } as const;

    // Fetch: before messages, target message, after messages in parallel
    const [beforeMsgs, targetMsg, afterMsgs] = await Promise.all([
      this.prisma.message.findMany({
        where: {
          conversationId,
          deletedAt: null,
          OR: [
            { createdAt: { lt: target.createdAt } },
            { createdAt: target.createdAt, id: { lt: targetBigInt } },
          ],
        },
        take: before,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: includeFields,
      }),
      this.prisma.message.findUnique({
        where: { id: targetBigInt },
        include: includeFields,
      }),
      this.prisma.message.findMany({
        where: {
          conversationId,
          deletedAt: null,
          OR: [
            { createdAt: { gt: target.createdAt } },
            { createdAt: target.createdAt, id: { gt: targetBigInt } },
          ],
        },
        take: after,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        include: includeFields,
      }),
    ]);

    // Combine: before (reversed to ASC) + target + after — all in DESC order for consistency
    const allMessages = [
      ...afterMsgs.reverse(),  // newest first
      ...(targetMsg ? [targetMsg] : []),
      ...beforeMsgs,           // already DESC order from query
    ];

    const hasOlderMessages = beforeMsgs.length >= before;
    const hasNewerMessages = afterMsgs.length >= after;

    return {
      data: allMessages.map((m) => safeJSON(m)),
      targetMessageId: targetMessageId,
      hasOlderMessages,
      hasNewerMessages,
    };
  }

  async findByClientMessageId(
    clientMessageId: string,
  ): Promise<Message | null> {
    return this.prisma.message.findUnique({
      where: { clientMessageId },
    });
  }

  async deleteMessage(
    messageId: bigint,
    userId: string,
    deleteForEveryone: boolean = false,
  ): Promise<void> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: {
        senderId: true,
        createdAt: true,
        conversationId: true,
      },
    });

    if (!message) {
      throw new BadRequestException('Message not found');
    }

    if (deleteForEveryone) {
      if (message.senderId !== userId) {
        throw new ForbiddenException('Only sender can delete for everyone');
      }

      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
      if (message.createdAt < fifteenMinutesAgo) {
        throw new ForbiddenException(
          'Can only delete for everyone within 15 minutes',
        );
      }

      await this.prisma.message.update({
        where: { id: messageId },
        data: {
          deletedAt: new Date(),
          deletedById: userId,
        },
      });

      this.logger.log(`Message ${messageId} deleted for everyone by ${userId}`);
    } else {
      this.logger.warn('Delete for me not implemented yet');
      throw new BadRequestException('Delete for me not yet supported');
    }
  }
}
