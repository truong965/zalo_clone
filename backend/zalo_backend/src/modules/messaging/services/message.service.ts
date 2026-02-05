// src/modules/messaging/services/message.service.ts

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
import { ConversationService } from './conversation.service';
import {
  MediaProcessingStatus,
  Message,
  MessageType,
  Prisma,
} from '@prisma/client';
import { RedisService } from 'src/modules/redis/redis.service';
import { MessageValidator } from '../helpers/message-validation.helper';
import redisConfig from 'src/config/redis.config';
import type { ConfigType } from '@nestjs/config';
import { safeJSON, safeStringify } from 'src/common/utils/json.util';

@Injectable()
export class MessageService {
  private readonly logger = new Logger(MessageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly conversationService: ConversationService,
    @Inject(redisConfig.KEY)
    private readonly config: ConfigType<typeof redisConfig>,
  ) {}

  /**
   * CORE: Send a message
   * Handles idempotency, permissions, persistence
   */
  /**
   * CORE: Send a message with Media Support
   */
  async sendMessage(dto: SendMessageDto, senderId: string): Promise<Message> {
    MessageValidator.validateMessageTypeConsistency(dto);
    // 1. Idempotency Check
    const idempotencyKey = RedisKeyBuilder.messageIdempotency(dto.clientMessageId);
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

    // 2. Permission Check
    const isMember = await this.conversationService.isMember(
      dto.conversationId,
      senderId,
    );
    if (!isMember) throw new ForbiddenException('Not a member of conversation');

    // Validate media OUTSIDE transaction
    if (dto.mediaIds && dto.mediaIds.length > 0) {
      await this.validateMediaAttachments(dto.mediaIds, senderId, dto.type);
    }
    let replyToId: bigint | null = null;

    if (dto.replyTo?.messageId) {
      try {
        // 1. Convert String -> BigInt (Vì JSON client gửi lên là string)
        replyToId = BigInt(dto.replyTo.messageId);
      } catch (e) {
        throw new BadRequestException('Invalid replyTo message ID format');
      }

      // 2. Validate Logic (Bắt buộc chạy nếu có replyToId)
      await this.validateReplyToMessage(replyToId, dto.conversationId);
    }

    let message: Message;
    //Transaction - only writes
    try {
      message = await this.prisma.$transaction(async (tx) => {
        // A. Create Message
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

        // B. Link Media to Message
        if (dto.mediaIds && dto.mediaIds.length > 0) {
          await tx.mediaAttachment.updateMany({
            where: { id: { in: dto.mediaIds } },
            data: { messageId: msg.id },
          });
        }

        // C. Update Conversation
        await tx.conversation.update({
          where: { id: dto.conversationId },
          data: { lastMessageAt: msg.createdAt },
        });

        return msg;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        // ✅ FIXED: Handle unique constraint violation (Issue #2 - race condition)
        if (error.code === 'P2002') {
          const target = error.meta?.target as string[] | undefined;
          if (target?.includes('clientMessageId')) {
            this.logger.warn(
              `Duplicate clientMessageId detected: ${dto.clientMessageId}`,
            );
          }
          // Return existing message
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
    // 7. Fetch full message with includes (after transaction)
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
    // Cache minimal data for idempotency
    await this.redis.getClient().setex(
      idempotencyKey,
      this.config.ttl.messageIdempotency,
      safeStringify({
        id: fullMessage.id,
        createdAt: fullMessage.createdAt,
        conversationId: fullMessage.conversationId,
      }),
    );
    this.logger.log(`Message ${message.id} sent (Type: ${dto.type})`);
    return safeJSON(fullMessage);
  }

  /**
   * ✅ NEW: Validate media attachments (Issue #9 - moved out of transaction)
   * Checks ownership, status, and type consistency
   */
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

    // Rule 1: Count must match (prevent garbage IDs)
    if (mediaList.length !== mediaIds.length) {
      throw new BadRequestException('One or more media files not found');
    }

    for (const media of mediaList) {
      // Rule 2: Security (IDOR) - Only send your own files
      if (media.uploadedBy !== senderId) {
        throw new ForbiddenException(`You do not own media ${media.id}`);
      }

      // Rule 3: Consistency - File not already attached
      if (media.messageId !== null) {
        throw new BadRequestException(
          `Media ${media.id} is already attached to another message`,
        );
      }

      // Rule 4: Not deleted
      if (media.deletedAt) {
        throw new BadRequestException(`Media ${media.id} has been deleted`);
      }

      // Rule 5: ✅ Accept PROCESSING status (Issue #6 - user wants loading UX)
      const allowedStatuses: MediaProcessingStatus[] = [
        MediaProcessingStatus.READY,
        MediaProcessingStatus.PROCESSING, // User sees loading indicator
      ];

      if (!allowedStatuses.includes(media.processingStatus)) {
        throw new BadRequestException(
          `Media ${media.id} is not ready (status: ${media.processingStatus})`,
        );
      }
    }

    // Rule 6: ✅ NEW: Validate media type consistency (Issue #4)
    MessageValidator.validateMediaTypeConsistency(messageType, mediaList);
  }

  /**
   * ✅ EXISTING: Validate reply-to message (Issue #5 - already implemented)
   */
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

  /**
   * Get messages with cursor-based pagination  with optimized query
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
            processingStatus: MediaProcessingStatus.READY, // Only READY media
            deletedAt: null,
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
