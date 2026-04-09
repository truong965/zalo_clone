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
import { RedisService } from 'src/shared/redis/redis.service';
import { MessageValidator } from '../helpers/message-validation.helper';
import redisConfig from 'src/config/redis.config';
import s3Config from 'src/config/s3.config';
import type { ConfigType } from '@nestjs/config';
import { safeJSON, safeStringify } from 'src/common/utils/json.util';
import { EventPublisher } from '@shared/events';
import { MessageSentEvent, MessageDeletedEvent } from '../events';
import { InteractionAuthorizationService } from '@modules/authorization/services/interaction-authorization.service';
import { PermissionAction } from '@common/constants/permission-actions.constant';
import { CursorPaginationHelper } from '@common/utils/cursor-pagination.helper';
import type { CursorPaginatedResult } from '@common/interfaces/paginated-result.interface';
import { DisplayNameResolver } from '@shared/services';

/**
 * Reusable Prisma select shape for reply-to message preview.
 * Used across getMessages, getMessagesContext, and sendMessage fullMessage.
 */
const PARENT_MESSAGE_PREVIEW_SELECT = {
  id: true,
  content: true,
  senderId: true,
  type: true,
  metadata: true,
  deletedAt: true,
} as const;

type SenderProfile = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
};

/** Reusable media attachment select fields */
const MEDIA_ATTACHMENT_SELECT = {
  id: true,
  mediaType: true,
  mimeType: true,
  cdnUrl: true,
  thumbnailUrl: true,
  optimizedUrl: true,
  originalName: true,
  size: true,
  width: true,
  height: true,
  duration: true,
  processingStatus: true,
  messageId: true,
} as const;

type RecentMediaMessageRow = {
  id: bigint;
  type: MessageType;
  createdAt: Date;
};

type MessageRecallMetadata = {
  recalled?: boolean;
  recalledAt?: string;
  recalledBy?: string;
  [key: string]: unknown;
};

@Injectable()
export class MessageService {
  private readonly logger = new Logger(MessageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly eventPublisher: EventPublisher,
    private readonly interactionAuth: InteractionAuthorizationService,
    private readonly displayNameResolver: DisplayNameResolver,
    @Inject(redisConfig.KEY)
    private readonly config: ConfigType<typeof redisConfig>,
    @Inject(s3Config.KEY)
    private readonly s3Cfg: ConfigType<typeof s3Config>,
  ) {}

  /**
   * Rewrites a media URL so that its host matches the current S3_ENDPOINT.
   * This fixes legacy records that have http://localhost:9000 baked into DB.
   * Only rewrites if the current S3_ENDPOINT differs from what's already in the URL.
   */
  private rewriteMediaUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    const endpoint = this.s3Cfg.endpoint;
    if (!endpoint) return url; // CloudFront / real AWS — no rewrite needed
    try {
      const parsed = new URL(url);
      const target = new URL(endpoint);
      // Only rewrite if the origin differs
      if (parsed.origin !== target.origin) {
        parsed.protocol = target.protocol;
        parsed.hostname = target.hostname;
        parsed.port = target.port;
        return parsed.toString();
      }
      return url;
    } catch {
      return url;
    }
  }

  private rewriteAttachment(ma: any): any {
    return {
      ...ma,
      cdnUrl: this.rewriteMediaUrl(ma.cdnUrl),
      thumbnailUrl: this.rewriteMediaUrl(ma.thumbnailUrl),
      optimizedUrl: this.rewriteMediaUrl(ma.optimizedUrl),
    };
  }

  private async enrichMessagesWithMedia<
    T extends { id: bigint; parentMessage?: { id: bigint } | null },
  >(
    messages: T[],
  ): Promise<(T & { mediaAttachments: any[]; parentMessage?: any })[]> {
    if (!messages.length) return messages as any;

    const messageIds = new Set<bigint>();
    messages.forEach((m) => {
      messageIds.add(m.id);
      if (m.parentMessage?.id) messageIds.add(m.parentMessage.id);
    });

    const mediaList = await this.prisma.mediaAttachment.findMany({
      where: {
        messageId: { in: Array.from(messageIds) },
        deletedAt: null,
      },
      select: MEDIA_ATTACHMENT_SELECT,
    });

    const mediaMap = new Map<string, typeof mediaList>();
    for (const media of mediaList) {
      if (!media.messageId) continue;
      const msgIdStr = media.messageId.toString();
      if (!mediaMap.has(msgIdStr)) mediaMap.set(msgIdStr, []);
      mediaMap.get(msgIdStr)!.push(media);
    }

    return messages.map((m) => {
      const enriched: any = { ...m };
      enriched.mediaAttachments = (mediaMap.get(m.id.toString()) || []).map(
        (ma) => this.rewriteAttachment(ma),
      );
      if (enriched.parentMessage) {
        enriched.parentMessage = {
          ...enriched.parentMessage,
          mediaAttachments: (
            mediaMap.get(enriched.parentMessage.id.toString())?.slice(0, 1) ||
            []
          ).map((ma: any) => this.rewriteAttachment(ma)),
        };
      }
      return enriched;
    });
  }

  private async enrichSingleMessageWithMedia<
    T extends { id: bigint; parentMessage?: { id: bigint } | null },
  >(message: T): Promise<T & { mediaAttachments: any[]; parentMessage?: any }> {
    const [enriched] = await this.enrichMessagesWithMedia([message]);
    return enriched;
  }

  private async findRecentMediaMessages(
    conversationId: string,
    types: MessageType[],
    limit: number,
    cursorCreatedAt?: Date,
    cursorId?: bigint,
    keyword?: string,
  ): Promise<RecentMediaMessageRow[]> {
    const normalizedKeyword = keyword?.trim();

    const cursorFilter =
      cursorCreatedAt && cursorId !== undefined
        ? Prisma.sql`
            AND (
              m.created_at < ${cursorCreatedAt}
              OR (m.created_at = ${cursorCreatedAt} AND m.id < ${cursorId})
            )
          `
        : Prisma.empty;

    const mediaExistsFilter = normalizedKeyword
      ? Prisma.sql`
          AND EXISTS (
            SELECT 1
            FROM media_attachments ma
            WHERE ma.message_id = m.id
              AND ma.deleted_at IS NULL
              AND ma.processing_status NOT IN ('FAILED', 'EXPIRED')
              AND ma.original_name ILIKE ${`%${normalizedKeyword}%`}
          )
        `
      : Prisma.sql`
          AND EXISTS (
            SELECT 1
            FROM media_attachments ma
            WHERE ma.message_id = m.id
              AND ma.deleted_at IS NULL
              AND ma.processing_status NOT IN ('FAILED', 'EXPIRED')
          )
        `;

    return this.prisma.$queryRaw<RecentMediaMessageRow[]>(Prisma.sql`
      SELECT m.id, m.type, m.created_at AS "createdAt"
      FROM messages m
      WHERE m.conversation_id = ${conversationId}::uuid
        AND m.deleted_at IS NULL
        AND m.type IN (${Prisma.join(types)})
        ${cursorFilter}
        ${mediaExistsFilter}
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT ${limit + 1}
    `);
  }

  private async getSenderProfilesMap(
    userIds: string[],
  ): Promise<Map<string, SenderProfile>> {
    if (userIds.length === 0) {
      return new Map();
    }

    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        displayName: true,
        avatarUrl: true,
      },
    });

    return new Map(users.map((u) => [u.id, u]));
  }

  private async hydrateMessagesWithSenders(
    messages: any[],
    viewerId: string,
  ): Promise<any[]> {
    if (messages.length === 0) {
      return messages;
    }

    const senderIds = [
      ...new Set(
        messages
          .flatMap((m) => [m.senderId, m.parentMessage?.senderId])
          .filter((id): id is string => !!id),
      ),
    ];

    const [profileMap, nameMap] = await Promise.all([
      this.getSenderProfilesMap(senderIds),
      senderIds.length > 0
        ? this.displayNameResolver.batchResolve(viewerId, senderIds)
        : Promise.resolve(new Map<string, string>()),
    ]);

    const composeSender = (senderId?: string | null) => {
      if (!senderId) {
        return null;
      }

      const profile = profileMap.get(senderId);
      const resolvedDisplayName =
        nameMap.get(senderId) ?? profile?.displayName ?? 'Unknown User';

      return {
        id: senderId,
        displayName: resolvedDisplayName,
        avatarUrl: profile?.avatarUrl ?? null,
        resolvedDisplayName,
      };
    };

    return messages.map((message) => ({
      ...message,
      sender: composeSender(message.senderId),
      parentMessage: message.parentMessage
        ? {
            ...message.parentMessage,
            sender: composeSender(message.parentMessage.senderId),
          }
        : message.parentMessage,
    }));
  }

  private async hydrateSingleMessageWithSender(
    message: any,
    viewerId: string,
  ): Promise<any> {
    const [hydrated] = await this.hydrateMessagesWithSenders(
      [message],
      viewerId,
    );
    return hydrated;
  }

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

    // Idempotency: return cached result if duplicate
    const existing = await this.checkIdempotency(idempotencyKey, senderId);
    if (existing) return existing;

    // Validate permissions
    const isMember = await this.isMember(dto.conversationId, senderId);
    if (!isMember) {
      throw new ForbiddenException('Not a member of conversation');
    }

    const targetUserId = await this.getDirectTargetUserId(
      dto.conversationId,
      senderId,
    );

    await this.validateSendPermissions(senderId, targetUserId);

    if (dto.mediaIds && dto.mediaIds.length > 0) {
      await this.validateMediaAttachments(dto.mediaIds, senderId, dto.type);
    }

    const replyToId = await this.resolveReplyToId(dto);

    // Compute receipt fields
    const { totalRecipients, directReceipts } = await this.computeReceiptFields(
      targetUserId,
      dto.conversationId,
      senderId,
    );

    // Persist message
    const message = await this.persistMessage(
      dto,
      senderId,
      replyToId,
      totalRecipients,
      directReceipts,
    );

    const _fullMessage = await this.prisma.message.findUniqueOrThrow({
      where: { id: message.id },
      include: {
        parentMessage: { select: PARENT_MESSAGE_PREVIEW_SELECT },
      },
    });
    const fullMessageWithMedia =
      await this.enrichSingleMessageWithMedia(_fullMessage);
    const fullMessage = await this.hydrateSingleMessageWithSender(
      fullMessageWithMedia,
      senderId,
    );

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

  /**
   * Check idempotency cache and return existing message if found.
   */
  private async checkIdempotency(
    idempotencyKey: string,
    viewerId: string,
  ): Promise<Message | null> {
    const cachedMessage = await this.redis.getClient().get(idempotencyKey);
    if (!cachedMessage) return null;

    this.logger.debug(`Duplicate send detected`);
    const cached = JSON.parse(cachedMessage) as Message;
    const _existingMessage = await this.prisma.message.findUniqueOrThrow({
      where: { id: cached.id },
      include: {
        parentMessage: { select: PARENT_MESSAGE_PREVIEW_SELECT },
      },
    });
    const existingMessageWithMedia =
      await this.enrichSingleMessageWithMedia(_existingMessage);
    const existingMessage = await this.hydrateSingleMessageWithSender(
      existingMessageWithMedia,
      viewerId,
    );
    return safeJSON(existingMessage);
  }

  /**
   * Validate that sender can message the target user (privacy/block check).
   */
  private async validateSendPermissions(
    senderId: string,
    targetUserId: string | null,
  ): Promise<void> {
    if (!targetUserId) return;

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

  /**
   * Resolve replyToId from DTO.
   */
  private async resolveReplyToId(dto: SendMessageDto): Promise<bigint | null> {
    if (!dto.replyTo?.messageId) return null;

    let replyToId: bigint;
    try {
      replyToId = BigInt(dto.replyTo.messageId);
    } catch {
      throw new BadRequestException('Invalid replyTo message ID format');
    }

    await this.validateReplyToMessage(replyToId, dto.conversationId);
    return replyToId;
  }

  /**
   * Compute receipt fields based on conversation type.
   */
  private async computeReceiptFields(
    targetUserId: string | null,
    conversationId: string,
    senderId: string,
  ): Promise<{
    totalRecipients: number;
    directReceipts: Record<string, { delivered: null; seen: null }> | null;
  }> {
    if (targetUserId !== null) {
      return {
        totalRecipients: 1,
        directReceipts: { [targetUserId]: { delivered: null, seen: null } },
      };
    }

    const memberCount = await this.prisma.conversationMember.count({
      where: {
        conversationId,
        status: MemberStatus.ACTIVE,
        userId: { not: senderId },
      },
    });
    return { totalRecipients: memberCount, directReceipts: null };
  }

  /**
   * Persist message in a transaction, handling Prisma-specific errors.
   */
  private async persistMessage(
    dto: SendMessageDto,
    senderId: string,
    replyToId: bigint | null,
    totalRecipients: number,
    directReceipts: Record<string, { delivered: null; seen: null }> | null,
  ): Promise<Message> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const msg = await tx.message.create({
          data: {
            conversationId: dto.conversationId,
            senderId,
            type: dto.type,
            content: dto.content?.trim() || null,
            metadata: dto.metadata || {},
            clientMessageId: dto.clientMessageId,
            replyToId: replyToId,
            totalRecipients,
            directReceipts: directReceipts ?? undefined,
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
      return this.handlePersistError(error, dto, senderId);
    }
  }

  /**
   * Handle Prisma-specific errors from message persistence.
   */
  private async handlePersistError(
    error: unknown,
    dto: SendMessageDto,
    viewerId: string,
  ): Promise<Message> {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        const target = error.meta?.target as string[] | undefined;
        if (target?.includes('clientMessageId')) {
          this.logger.warn(
            `Duplicate clientMessageId detected: ${dto.clientMessageId}`,
          );
        }
        const _existing = await this.prisma.message.findUniqueOrThrow({
          where: { clientMessageId: dto.clientMessageId },
          include: {
            parentMessage: { select: PARENT_MESSAGE_PREVIEW_SELECT },
          },
        });
        const existingWithMedia =
          await this.enrichSingleMessageWithMedia(_existing);
        const existing = await this.hydrateSingleMessageWithSender(
          existingWithMedia,
          viewerId,
        );
        return safeJSON(existing);
      }

      if (error.code === 'P2003') {
        this.logger.error(
          'Foreign key constraint failed - media may have been deleted',
          { clientMessageId: dto.clientMessageId, error: error.message },
        );
        throw new BadRequestException(
          'One or more media files are no longer available. Please retry upload.',
        );
      }
    }
    throw error;
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

    const _messages = await this.prisma.message.findMany({
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
        parentMessage: { select: PARENT_MESSAGE_PREVIEW_SELECT },
      },
    });
    const messagesWithMedia = await this.enrichMessagesWithMedia(_messages);
    const messages = await this.hydrateMessagesWithSenders(
      messagesWithMedia,
      userId,
    );

    const result = CursorPaginationHelper.buildResult({
      items: messages,
      limit,
      getCursor: (m) => m.id.toString(),
      mapToDto: (m) => {
        return safeJSON(m);
      },
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
      parentMessage: { select: PARENT_MESSAGE_PREVIEW_SELECT },
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
    const allMessagesRaw = [
      ...afterMsgs.reverse(), // newest first
      ...(targetMsg ? [targetMsg] : []),
      ...beforeMsgs, // already DESC order from query
    ];
    const allMessagesWithMedia =
      await this.enrichMessagesWithMedia(allMessagesRaw);
    const allMessages = await this.hydrateMessagesWithSenders(
      allMessagesWithMedia,
      userId,
    );

    const hasOlderMessages = beforeMsgs.length >= before;
    const hasNewerMessages = afterMsgs.length >= after;

    return {
      data: allMessages.map((m) => {
        return safeJSON(m);
      }),
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
    if (deleteForEveryone) {
      await this.recallMessage(messageId, userId);
    } else {
      this.logger.warn('Delete for me not implemented yet');
      throw new BadRequestException('Delete for me not yet supported');
    }
  }

  private extractMetadata(
    metadata: Prisma.JsonValue | null,
  ): MessageRecallMetadata {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return {};
    }
    return metadata as MessageRecallMetadata;
  }

  async recallMessage(messageId: bigint, userId: string): Promise<Message> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        senderId: true,
        createdAt: true,
        conversationId: true,
        metadata: true,
      },
    });

    if (!message) {
      throw new BadRequestException('Message not found');
    }

    if (message.senderId !== userId) {
      throw new ForbiddenException('Only sender can recall this message');
    }

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    if (message.createdAt < twentyFourHoursAgo) {
      throw new ForbiddenException('Can only recall message within 24 hours');
    }

    const metadata = this.extractMetadata(message.metadata as Prisma.JsonValue);
    if (metadata.recalled === true) {
      const existing = await this.prisma.message.findUniqueOrThrow({
        where: { id: messageId },
      });
      return safeJSON(existing);
    }

    const recalledAt = new Date().toISOString();
    const recalledMessage = await this.prisma.message.update({
      where: { id: messageId },
      data: {
        content: 'Tin nhắn đã được thu hồi',
        deletedAt: null,
        deletedById: null,
        metadata: {
          ...metadata,
          recalled: true,
          recalledAt,
          recalledBy: userId,
        },
        updatedById: userId,
      },
    });

    await this.eventPublisher
      .publish(
        new MessageDeletedEvent(
          messageId.toString(),
          message.conversationId,
          userId,
        ),
        { fireAndForget: true },
      )
      .catch((err) => {
        this.logger.warn(`Failed to emit MessageDeletedEvent: ${err.message}`);
      });

    this.logger.log(`Message ${messageId} recalled by ${userId}`);
    return safeJSON(recalledMessage);
  }

  // ============================================================================
  // RECENT MEDIA — Used by info sidebar to show latest N media in conversation
  // ============================================================================

  /** Allowed message types for the recent-media endpoint */
  private static readonly ALLOWED_MEDIA_TYPES: ReadonlySet<string> = new Set([
    MessageType.IMAGE,
    MessageType.VIDEO,
    MessageType.FILE,
    MessageType.AUDIO,
  ]);

  /**
   * Get the most recent media messages (with their first attachment) for a conversation.
   *
   * Access control: caller must be an active member of the conversation.
   * Only returns messages that have at least one non-deleted media attachment.
   *
   * @param userId  Authenticated user requesting the data
   * @param conversationId Target conversation
   * @param typesRaw Comma-separated MessageType values (e.g. "IMAGE,VIDEO"). If empty → all media types.
   * @param limit   Number of items to return (1–10, default 3)
   */
  async getRecentMedia(
    userId: string,
    conversationId: string,
    typesRaw: string | undefined,
    limit: number,
    cursor?: string,
    keyword?: string,
  ) {
    // 1. Access control — reuse existing isMember check
    const member = await this.isMember(conversationId, userId);
    if (!member) {
      throw new ForbiddenException('Not a member of this conversation');
    }

    // 2. Parse & validate types
    const types = this.parseMediaTypes(typesRaw);

    // 3. Decode cursor for pagination
    let cursorCreatedAt: Date | undefined;
    let cursorId: bigint | undefined;
    if (cursor) {
      try {
        const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString());
        cursorCreatedAt = new Date(decoded.lastCreatedAt);
        cursorId = BigInt(decoded.lastId);
      } catch {
        // Invalid cursor — ignore and start from beginning
      }
    }

    // 4. Query recent message shells using relation-free SQL EXISTS filter
    const _messages = await this.findRecentMediaMessages(
      conversationId,
      types,
      limit,
      cursorCreatedAt,
      cursorId,
      keyword,
    );

    // 5. Attach media payloads in application layer
    const messages = await this.enrichMessagesWithMedia(_messages);

    // 6. Detect pagination
    const hasNextPage = messages.length > limit;
    const trimmed = hasNextPage ? messages.slice(0, limit) : messages;

    // 7. Map to flat DTO shape
    const data = trimmed
      .filter((msg) => msg.mediaAttachments.length > 0)
      .flatMap((msg) => {
        return msg.mediaAttachments.map((ma) => ({
          messageId: msg.id.toString(),
          mediaId: ma.id,
          originalName: ma.originalName,
          mimeType: ma.mimeType,
          mediaType: ma.mediaType,
          size: Number(ma.size),
          thumbnailUrl: ma.thumbnailUrl ?? null,
          cdnUrl: ma.cdnUrl ?? null,
          messageType: msg.type,
          createdAt: msg.createdAt,
          processingStatus: ma.processingStatus,
        }));
      });

    // 8. Build next cursor
    let nextCursor: string | undefined;
    if (hasNextPage && trimmed.length > 0) {
      const last = trimmed[trimmed.length - 1];
      nextCursor = Buffer.from(
        JSON.stringify({
          lastCreatedAt: last.createdAt.toISOString(),
          lastId: last.id.toString(),
        }),
      ).toString('base64');
    }

    return {
      items: data,
      meta: {
        limit,
        hasNextPage,
        nextCursor,
      },
    };
  }

  /**
   * Parse comma-separated type string into validated MessageType array.
   * Falls back to all allowed media types when input is empty or invalid.
   */
  private parseMediaTypes(typesRaw: string | undefined): MessageType[] {
    if (!typesRaw?.trim()) {
      return [...MessageService.ALLOWED_MEDIA_TYPES] as MessageType[];
    }

    const parsed = typesRaw
      .split(',')
      .map((t) => t.trim().toUpperCase())
      .filter((t) => MessageService.ALLOWED_MEDIA_TYPES.has(t));

    if (parsed.length === 0) {
      return [...MessageService.ALLOWED_MEDIA_TYPES] as MessageType[];
    }

    return parsed as MessageType[];
  }
}
