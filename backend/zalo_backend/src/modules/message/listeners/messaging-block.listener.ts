import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from 'src/database/prisma.service';
import { ConversationType, MemberStatus } from '@prisma/client';

@Injectable()
export class MessagingBlockListener {
  private readonly logger = new Logger(MessagingBlockListener.name);

  constructor(private readonly prisma: PrismaService) {}

  @OnEvent('user.blocked')
  async handleUserBlocked(event: {
    blockerId?: string;
    blockedId?: string;
  }): Promise<void> {
    try {
      const blockerId = event?.blockerId;
      const blockedId = event?.blockedId;

      if (!blockerId || !blockedId) {
        this.logger.warn(
          `[Messaging] Invalid block event data: ${JSON.stringify(event)}`,
        );
        return;
      }

      this.logger.debug(`[Messaging] User ${blockerId} blocked ${blockedId}`);

      const conversation = await this.findDirectConversation(blockerId, blockedId);

      if (conversation) {
        await this.prisma.conversation.update({
          where: { id: conversation.id },
          data: { deletedAt: new Date() },
        });
        this.logger.log(
          `[Messaging] Archived conversation ${conversation.id} (block event)`,
        );
      } else {
        this.logger.debug(
          `[Messaging] No direct conversation found between ${blockerId} and ${blockedId}`,
        );
      }
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `[Messaging] Error handling block: ${err?.message || String(error)}`,
        err?.stack,
      );
    }
  }

  @OnEvent('user.unblocked')
  async handleUserUnblocked(event: {
    blockerId?: string;
    blockedId?: string;
  }): Promise<void> {
    try {
      const blockerId = event?.blockerId;
      const blockedId = event?.blockedId;

      if (!blockerId || !blockedId) {
        this.logger.warn(
          `[Messaging] Invalid unblock event data: ${JSON.stringify(event)}`,
        );
        return;
      }

      this.logger.debug(`[Messaging] User ${blockerId} unblocked ${blockedId}`);

      const conversation = await this.findDirectConversation(blockerId, blockedId);

      if (conversation) {
        await this.prisma.conversation.update({
          where: { id: conversation.id },
          data: { deletedAt: null },
        });
        this.logger.log(
          `[Messaging] Restored conversation ${conversation.id} (unblock event)`,
        );
      } else {
        this.logger.debug(
          `[Messaging] No direct conversation found between ${blockerId} and ${blockedId}`,
        );
      }
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `[Messaging] Error handling unblock: ${err?.message || String(error)}`,
        err?.stack,
      );
    }
  }

  private async findDirectConversation(
    userId1: string,
    userId2: string,
  ): Promise<{ id: string } | null> {
    const [user1, user2] = [userId1, userId2].sort();

    const conversation = await this.prisma.conversation.findFirst({
      where: {
        type: ConversationType.DIRECT,
        members: {
          every: {
            userId: { in: [user1, user2] },
            status: MemberStatus.ACTIVE,
          },
        },
      },
      select: { id: true },
    });

    return conversation || null;
  }
}
