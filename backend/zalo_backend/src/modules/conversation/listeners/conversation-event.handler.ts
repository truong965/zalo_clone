import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventType, Gender } from '@prisma/client';
import { PrismaService } from '@database/prisma.service';
import { IdempotencyService } from '@common/idempotency/idempotency.service';
import type { MessageSentEvent } from '@modules/message/events';
import type {
  ConversationCreatedEvent,
  ConversationMemberAddedEvent,
  ConversationMemberDemotedEvent,
  ConversationMemberLeftEvent,
  ConversationMemberPromotedEvent,
} from '../events';

export interface UserProfileUpdatedEvent {
  eventId?: string;
  userId: string;
  updates: {
    displayName?: string;
    avatarUrl?: string;
    bio?: string;
    gender?: Gender;
    dateOfBirth?: Date;
  };
}

@Injectable()
export class ConversationEventHandler {
  private readonly logger = new Logger(ConversationEventHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly idempotency: IdempotencyService,
  ) { }

  @OnEvent('message.sent')
  async handleMessageSent(payload: MessageSentEvent): Promise<void> {
    const eventId = payload.eventId;
    const handlerId = this.constructor.name;

    try {
      const alreadyProcessed = await this.idempotency.isProcessed(
        eventId,
        handlerId,
      );
      if (alreadyProcessed) {
        this.logger.debug(`[MESSAGE_SENT] Skipping duplicate event: ${eventId}`);
        return;
      }
    } catch (idempotencyError) {
      this.logger.warn(
        `[MESSAGE_SENT] Idempotency check failed, proceeding with caution`,
        idempotencyError,
      );
    }

    try {
      const msg = await this.prisma.message.findUnique({
        where: { id: BigInt(payload.messageId) },
        select: { conversationId: true, createdAt: true },
      });

      if (!msg) {
        this.logger.warn(`[MESSAGE_SENT] Message not found: ${payload.messageId}`);
        return;
      }

      await this.prisma.conversation.update({
        where: { id: msg.conversationId },
        data: { lastMessageAt: msg.createdAt },
      });

      try {
        await this.idempotency.recordProcessed(
          eventId,
          handlerId,
          EventType.MESSAGE_SENT,
        );
      } catch (recordError) {
        this.logger.warn(
          `[MESSAGE_SENT] Failed to record idempotency tracking`,
          recordError,
        );
      }
    } catch (error) {
      this.logger.error(
        `[MESSAGE_SENT] Failed to handle message.sent event:`,
        error,
      );
      try {
        await this.idempotency.recordError(
          eventId,
          handlerId,
          error as Error,
          EventType.MESSAGE_SENT,
        );
      } catch (recordError) {
        this.logger.warn(
          `[MESSAGE_SENT] Failed to record error in idempotency tracking`,
          recordError,
        );
      }
      throw error;
    }
  }

  @OnEvent('conversation.created')
  async handleConversationCreated(
    payload: ConversationCreatedEvent,
  ): Promise<void> {
    const { conversationId, createdBy, type, participantIds, name } = payload;
    const eventId = payload.eventId;
    const handlerId = this.constructor.name;

    try {
      const alreadyProcessed = await this.idempotency.isProcessed(
        eventId,
        handlerId,
      );
      if (alreadyProcessed) {
        this.logger.debug(
          `[CONVERSATION_CREATED] Skipping duplicate event: ${eventId}`,
        );
        return;
      }
    } catch (idempotencyError) {
      this.logger.warn(
        `[CONVERSATION_CREATED] Idempotency check failed, proceeding with caution`,
        idempotencyError,
      );
    }

    try {
      if (type === 'GROUP') {
        const sysMsg = await this.prisma.message.create({
          data: {
            conversationId,
            type: 'SYSTEM',
            content: `${createdBy} created the group "${name || ''}"`,
            metadata: {
              action: 'GROUP_CREATED',
              actorId: createdBy,
              memberCount: participantIds.length,
            },
          },
        });

        await this.prisma.conversation.update({
          where: { id: conversationId },
          data: { lastMessageAt: sysMsg.createdAt },
        });
      }

      await this.idempotency.recordProcessed(
        eventId,
        handlerId,
        EventType.CONVERSATION_CREATED,
      );
    } catch (error) {
      this.logger.error(
        `[CONVERSATION_CREATED] Failed to handle conversation.created event:`,
        error,
      );
      try {
        await this.idempotency.recordError(
          eventId,
          handlerId,
          error as Error,
          EventType.CONVERSATION_CREATED,
        );
      } catch (recordError) {
        this.logger.warn(
          `[CONVERSATION_CREATED] Failed to record error in idempotency tracking`,
          recordError,
        );
      }
      throw error;
    }
  }

  @OnEvent('conversation.member.added')
  async handleMemberAdded(
    payload: ConversationMemberAddedEvent,
  ): Promise<void> {
    const { conversationId, memberIds, addedBy } = payload;
    const eventId = payload.eventId;
    const handlerId = this.constructor.name;

    try {
      const alreadyProcessed = await this.idempotency.isProcessed(
        eventId,
        handlerId,
      );

      if (alreadyProcessed) {
        this.logger.debug(
          `[MEMBER_ADDED] Skipping duplicate event: ${eventId}`,
        );
        return;
      }
    } catch (idempotencyError) {
      this.logger.warn(
        `[MEMBER_ADDED] Idempotency check failed, proceeding with caution`,
        idempotencyError,
      );
    }

    this.logger.log(
      `[MEMBER_ADDED] ${memberIds.length} members added to ${conversationId}`,
    );

    try {
      const isSelfJoin = memberIds.length === 1 && memberIds[0] === addedBy;
      const sysMsg = await this.prisma.message.create({
        data: {
          conversationId,
          type: 'SYSTEM',
          content: isSelfJoin
            ? `${addedBy} joined the group`
            : `${addedBy} added ${memberIds.length} member(s)`,
          metadata: isSelfJoin
            ? {
              action: 'MEMBER_JOINED',
              userId: addedBy,
            }
            : {
              action: 'MEMBERS_ADDED',
              actorId: addedBy,
              addedUserIds: memberIds,
            },
        },
      });

      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: sysMsg.createdAt },
      });

      this.logger.log(
        `[MEMBER_ADDED] Complete: Members added to conversation`,
      );

      try {
        await this.idempotency.recordProcessed(
          eventId,
          handlerId,
          EventType.CONVERSATION_MEMBER_ADDED,
        );
      } catch (recordError) {
        this.logger.warn(
          `[MEMBER_ADDED] Failed to record idempotency tracking`,
          recordError,
        );
      }
    } catch (error) {
      this.logger.error(
        `[MEMBER_ADDED] Failed to handle conversation.member.added event:`,
        error,
      );

      try {
        await this.idempotency.recordError(
          eventId,
          handlerId,
          error as Error,
          EventType.CONVERSATION_MEMBER_ADDED,
        );
      } catch (recordError) {
        this.logger.warn(
          `[MEMBER_ADDED] Failed to record error in idempotency tracking`,
          recordError,
        );
      }

      throw error;
    }
  }

  @OnEvent('conversation.member.left')
  async handleMemberLeft(payload: ConversationMemberLeftEvent): Promise<void> {
    const { conversationId, memberId, kickedBy } = payload;
    const eventId = payload.eventId;
    const handlerId = this.constructor.name;

    try {
      const alreadyProcessed = await this.idempotency.isProcessed(
        eventId,
        handlerId,
      );

      if (alreadyProcessed) {
        this.logger.debug(`[MEMBER_LEFT] Skipping duplicate event: ${eventId}`);
        return;
      }
    } catch (idempotencyError) {
      this.logger.warn(
        `[MEMBER_LEFT] Idempotency check failed, proceeding with caution`,
        idempotencyError,
      );
    }

    this.logger.log(
      `[MEMBER_LEFT] ${memberId} left/removed from ${conversationId}`,
    );

    try {
      const isRemoved = kickedBy !== memberId;
      const sysMsg = await this.prisma.message.create({
        data: {
          conversationId,
          type: 'SYSTEM',
          content: isRemoved
            ? `${memberId} was removed by ${kickedBy}`
            : `${memberId} left the group`,
          metadata: isRemoved
            ? {
              action: 'MEMBER_KICKED',
              actorId: kickedBy,
              targetUserId: memberId,
            }
            : {
              action: 'MEMBER_LEFT',
              actorId: memberId,
            },
        },
      });

      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: sysMsg.createdAt },
      });

      this.logger.log(
        `[MEMBER_LEFT] Complete: ${memberId} left conversation`,
      );

      try {
        await this.idempotency.recordProcessed(
          eventId,
          handlerId,
          EventType.CONVERSATION_MEMBER_LEFT,
        );
      } catch (recordError) {
        this.logger.warn(
          `[MEMBER_LEFT] Failed to record idempotency tracking`,
          recordError,
        );
      }
    } catch (error) {
      this.logger.error(
        `[MEMBER_LEFT] Failed to handle conversation.member.left event:`,
        error,
      );

      try {
        await this.idempotency.recordError(
          eventId,
          handlerId,
          error as Error,
          EventType.CONVERSATION_MEMBER_LEFT,
        );
      } catch (recordError) {
        this.logger.warn(
          `[MEMBER_LEFT] Failed to record error in idempotency tracking`,
          recordError,
        );
      }

      throw error;
    }
  }

  @OnEvent('user.profile.updated')
  async handleUserProfileUpdated(
    payload: UserProfileUpdatedEvent,
  ): Promise<void> {
    const { userId, updates } = payload;
    const eventId = payload.eventId || `user.profile.updated-${userId}`;
    const handlerId = this.constructor.name;

    try {
      const alreadyProcessed = await this.idempotency.isProcessed(
        eventId,
        handlerId,
      );

      if (alreadyProcessed) {
        this.logger.debug(
          `[PROFILE_UPDATED] Skipping duplicate event: ${eventId}`,
        );
        return;
      }
    } catch (idempotencyError) {
      this.logger.warn(
        `[PROFILE_UPDATED] Idempotency check failed, proceeding with caution`,
        idempotencyError,
      );
    }

    this.logger.log(`[PROFILE_UPDATED] Profile updated for user ${userId}`);
    this.logger.debug(`[PROFILE_UPDATED] Updates:`, updates);

    try {
      this.logger.log(`[PROFILE_UPDATED] Complete: Profile updated`);

      try {
        await this.idempotency.recordProcessed(
          eventId,
          handlerId,
          EventType.USER_PROFILE_UPDATED,
        );
      } catch (recordError) {
        this.logger.warn(
          `[PROFILE_UPDATED] Failed to record idempotency tracking`,
          recordError,
        );
      }
    } catch (error) {
      this.logger.error(
        `[PROFILE_UPDATED] Failed to handle user.profile.updated event:`,
        error,
      );

      try {
        await this.idempotency.recordError(
          eventId,
          handlerId,
          error as Error,
          EventType.USER_PROFILE_UPDATED,
        );
      } catch (recordError) {
        this.logger.warn(
          `[PROFILE_UPDATED] Failed to record error in idempotency tracking`,
          recordError,
        );
      }
    }
  }

  @OnEvent('conversation.member.promoted')
  async handleMemberPromoted(
    payload: ConversationMemberPromotedEvent,
  ): Promise<void> {
    const { conversationId, promotedBy, memberId } = payload;
    const eventId = payload.eventId;
    const handlerId = this.constructor.name;

    try {
      const alreadyProcessed = await this.idempotency.isProcessed(
        eventId,
        handlerId,
      );
      if (alreadyProcessed) {
        this.logger.debug(
          `[MEMBER_PROMOTED] Skipping duplicate event: ${eventId}`,
        );
        return;
      }
    } catch (idempotencyError) {
      this.logger.warn(
        `[MEMBER_PROMOTED] Idempotency check failed, proceeding with caution`,
        idempotencyError,
      );
    }

    try {
      const sysMsg = await this.prisma.message.create({
        data: {
          conversationId,
          type: 'SYSTEM',
          content: `${promotedBy} transferred admin rights to ${memberId}`,
          metadata: {
            action: 'ADMIN_TRANSFERRED',
            fromUserId: promotedBy,
            toUserId: memberId,
          },
        },
      });

      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: sysMsg.createdAt },
      });

      await this.idempotency.recordProcessed(
        eventId,
        handlerId,
        EventType.CONVERSATION_MEMBER_PROMOTED,
      );
    } catch (error) {
      this.logger.error(
        `[MEMBER_PROMOTED] Failed to handle conversation.member.promoted event:`,
        error,
      );
      try {
        await this.idempotency.recordError(
          eventId,
          handlerId,
          error as Error,
          EventType.CONVERSATION_MEMBER_PROMOTED,
        );
      } catch (recordError) {
        this.logger.warn(
          `[MEMBER_PROMOTED] Failed to record error in idempotency tracking`,
          recordError,
        );
      }
      throw error;
    }
  }

  @OnEvent('conversation.member.demoted')
  async handleMemberDemoted(
    payload: ConversationMemberDemotedEvent,
  ): Promise<void> {
    const eventId = payload.eventId;
    const handlerId = this.constructor.name;

    try {
      const alreadyProcessed = await this.idempotency.isProcessed(
        eventId,
        handlerId,
      );
      if (alreadyProcessed) {
        this.logger.debug(
          `[MEMBER_DEMOTED] Skipping duplicate event: ${eventId}`,
        );
        return;
      }
    } catch (idempotencyError) {
      this.logger.warn(
        `[MEMBER_DEMOTED] Idempotency check failed, proceeding with caution`,
        idempotencyError,
      );
    }

    try {
      await this.idempotency.recordProcessed(
        eventId,
        handlerId,
        EventType.CONVERSATION_MEMBER_DEMOTED,
      );
    } catch (error) {
      this.logger.error(
        `[MEMBER_DEMOTED] Failed to handle conversation.member.demoted event:`,
        error,
      );
      try {
        await this.idempotency.recordError(
          eventId,
          handlerId,
          error as Error,
          EventType.CONVERSATION_MEMBER_DEMOTED,
        );
      } catch (recordError) {
        this.logger.warn(
          `[MEMBER_DEMOTED] Failed to record error in idempotency tracking`,
          recordError,
        );
      }
      throw error;
    }
  }
}
