// src/modules/messaging/services/message.service.ts

import {
  Injectable,
  ForbiddenException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { RedisKeys } from 'src/common/constants/redis-keys.constant';
import { SendMessageDto } from '../dto/send-message.dto';
import { GetMessagesDto } from '../dto/get-messages.dto';
import { ConversationService } from './conversation.service';
import { Message, MessageType } from '@prisma/client';
import { RedisService } from 'src/modules/redis/redis.service';

@Injectable()
export class MessageService {
  private readonly logger = new Logger(MessageService.name);

  // Idempotency cache TTL: 5 minutes
  private readonly IDEMPOTENCY_TTL = 300;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly conversationService: ConversationService,
  ) {}

  /**
   * CORE: Send a message
   * Handles idempotency, permissions, persistence
   */
  async sendMessage(dto: SendMessageDto, senderId: string): Promise<Message> {
    // ========================================
    // STEP 1: Idempotency Check
    // ========================================
    const idempotencyKey = RedisKeys.cache.messageIdempotency(
      dto.clientMessageId,
    );
    const cachedMessage = await this.redis.getClient().get(idempotencyKey);

    if (cachedMessage) {
      this.logger.debug(
        `Duplicate send detected for clientMessageId: ${dto.clientMessageId}`,
      );
      const msg = JSON.parse(cachedMessage);
      return {
        ...msg,
        // Convert String -> BigInt
        id: BigInt(msg.id),
        // Convert String -> Date
        createdAt: new Date(msg.createdAt),
        updatedAt: new Date(msg.updatedAt),
        deletedAt: msg.deletedAt ? new Date(msg.deletedAt) : null,
      } as Message;
    }

    // ========================================
    // STEP 2: Permission Check
    // ========================================
    const isMember = await this.conversationService.isMember(
      dto.conversationId,
      senderId,
    );

    if (!isMember) {
      throw new ForbiddenException('You are not a member of this conversation');
    }
    //- Check if conversation is deleted
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: dto.conversationId },
      select: { deletedAt: true, type: true },
    });
    if (conversation?.deletedAt) {
      throw new BadRequestException('Conversation has been deleted');
    }
    // ========================================
    // STEP 3: Validation
    // ========================================
    if (dto.type === MessageType.TEXT && !dto.content?.trim()) {
      throw new BadRequestException('Text message cannot be empty');
    }

    // ========================================
    // STEP 4: Persist Message (Transaction)
    // ========================================
    const message = await this.prisma.$transaction(async (tx) => {
      // 4a. Create message
      const msg = await tx.message.create({
        data: {
          conversationId: dto.conversationId,
          senderId,
          type: dto.type,
          content: dto.content?.trim(),
          metadata: dto.metadata || {},
          clientMessageId: dto.clientMessageId,
          replyToId: dto.replyTo?.messageId,
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
        },
      });

      // 4b. Update conversation's lastMessageAt
      await tx.conversation.update({
        where: { id: dto.conversationId },
        data: { lastMessageAt: msg.createdAt },
      });

      return msg;
    });

    // ========================================
    // STEP 5: Cache Result (Idempotency)
    // ========================================
    await this.redis.getClient().setex(
      idempotencyKey,
      this.IDEMPOTENCY_TTL,
      JSON.stringify(
        message,
        (key, value) => (typeof value === 'bigint' ? value.toString() : value), // Serialize BigInt thành String để không crash
      ),
    );

    this.logger.log(
      `Message ${message.id} created by ${senderId} in conversation ${dto.conversationId}`,
    );

    return message;
  }

  /**
   * Get messages with cursor-based pagination
   * Efficient for infinite scroll
   */
  async getMessages(dto: GetMessagesDto, userId: string) {
    // Permission check
    const isMember = await this.conversationService.isMember(
      dto.conversationId,
      userId,
    );

    if (!isMember) {
      throw new ForbiddenException('You cannot view this conversation');
    }

    const limit = dto.limit || 50;

    const messages = await this.prisma.message.findMany({
      where: {
        conversationId: dto.conversationId,
        deletedAt: null, // Exclude soft-deleted messages
        ...(dto.cursor && {
          id: {
            lt: dto.cursor, // Messages older than cursor
          },
        }),
      },
      take: limit,
      orderBy: {
        createdAt: 'desc', // Newest first
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
      },
    });

    return {
      messages,
      hasMore: messages.length === limit,
      nextCursor: messages.length > 0 ? messages[messages.length - 1].id : null,
    };
  }

  /**
   * Find message by client-generated ID
   * Used for idempotency checks
   */
  async findByClientMessageId(
    clientMessageId: string,
  ): Promise<Message | null> {
    return this.prisma.message.findUnique({
      where: { clientMessageId },
    });
  }

  /**
   * Soft delete a message
   * deleteForEveryone: true = hide for all users (only sender can do this within 15 min)
   * deleteForEveryone: false = hide only for requester
   */
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

    // Check permission for "delete for everyone"
    if (deleteForEveryone) {
      if (message.senderId !== userId) {
        throw new ForbiddenException('Only sender can delete for everyone');
      }

      // Check 15-minute window
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
      if (message.createdAt < fifteenMinutesAgo) {
        throw new ForbiddenException(
          'Can only delete for everyone within 15 minutes',
        );
      }

      // Soft delete for everyone
      await this.prisma.message.update({
        where: { id: messageId },
        data: {
          deletedAt: new Date(),
          deletedById: userId,
        },
      });

      this.logger.log(`Message ${messageId} deleted for everyone by ${userId}`);
    } else {
      // Delete for me only (future feature - requires message_deletions table)
      this.logger.warn('Delete for me not implemented yet');
      throw new BadRequestException('Delete for me not yet supported');
    }
  }
}
