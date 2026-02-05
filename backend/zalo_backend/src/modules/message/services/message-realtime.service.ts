import { Injectable, Logger } from '@nestjs/common';
import { MemberStatus, Message, ReceiptStatus } from '@prisma/client';
import type { AuthenticatedSocket } from 'src/common/interfaces/socket-client.interface';
import { SocketEvents } from 'src/common/constants/socket-events.constant';
import { safeJSON } from 'src/common/utils/json.util';
import { PrismaService } from 'src/database/prisma.service';

import { MessageService } from './message.service';
import { ReceiptService } from './receipt.service';
import { MessageQueueService } from './message-queue.service';
import { MessageBroadcasterService } from './message-broadcaster.service';
import { SendMessageDto } from '../dto/send-message.dto';
import { MarkAsReadDto } from '../dto/mark-as-read.dto';
import { TypingIndicatorDto } from '../dto/typing-indicator.dto';

type EmitToUserFn = (
  userId: string,
  event: string,
  data: unknown,
) => Promise<void>;

@Injectable()
export class MessageRealtimeService {
  private readonly logger = new Logger(MessageRealtimeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly messageService: MessageService,
    private readonly receiptService: ReceiptService,
    private readonly messageQueue: MessageQueueService,
    private readonly broadcaster: MessageBroadcasterService,
  ) {}

  async syncOfflineMessages(client: AuthenticatedSocket): Promise<void> {
    const userId = client.userId;
    if (!userId) return;

    try {
      const offlineMessages =
        await this.messageQueue.getOfflineMessages(userId);

      if (offlineMessages.length === 0) {
        this.logger.debug(`No offline messages for user ${userId}`);
        return;
      }

      this.logger.log(
        `Syncing ${offlineMessages.length} offline messages to user ${userId}`,
      );

      const sanitizedMessages = offlineMessages.map((qm) => {
        const rawMsg = qm.data as Message;
        return safeJSON(rawMsg);
      });

      client.emit(SocketEvents.MESSAGES_SYNC, {
        messages: sanitizedMessages,
        count: offlineMessages.length,
      });

      const messageIds = offlineMessages.map((qm) => qm.messageId);
      await this.receiptService.bulkMarkAsDelivered(messageIds, userId);

      for (const qm of offlineMessages) {
        const message = qm.data as Message;
        if (message.senderId && message.senderId !== userId) {
          await this.broadcaster.broadcastReceiptUpdate(message.senderId, {
            messageId: message.id,
            userId,
            status: ReceiptStatus.DELIVERED,
            timestamp: new Date(),
          });
        }
      }

      await this.messageQueue.clearQueue(userId);
      this.logger.log(`Offline sync completed for user ${userId}`);
    } catch (error) {
      this.logger.error(
        `Failed to sync offline messages for user ${userId}`,
        (error as Error).stack,
      );
    }
  }

  async subscribeToReceipts(
    userId: string,
    onPayload: (payload: unknown) => Promise<void>,
  ): Promise<() => void | Promise<void>> {
    return this.broadcaster.subscribeToReceipts(userId, onPayload);
  }

  async sendMessageAndBroadcast(
    dto: SendMessageDto,
    senderId: string,
    emitToUser: EmitToUserFn,
    isUserOnline: (userId: string) => Promise<boolean>,
  ): Promise<Message> {
    const message = await this.messageService.sendMessage(dto, senderId);

    const members = await this.getActiveMembers(dto.conversationId);
    const recipients = members.filter((m) => m.userId !== senderId);
    const recipientIds = recipients.map((r) => r.userId);

    const safeMsg = safeJSON(message);
    await this.broadcaster.broadcastNewMessage(dto.conversationId, {
      message: safeMsg,
      recipientIds,
      senderId,
    });

    await this.deliverMessageToRecipients(
      safeMsg,
      recipientIds,
      senderId,
      emitToUser,
      isUserOnline,
    );

    return message;
  }

  async markAsSeen(dto: MarkAsReadDto, userId: string): Promise<void> {
    const isMember = await this.isMember(dto.conversationId, userId);
    if (!isMember) {
      throw new Error('Not a member of this conversation');
    }

    await this.receiptService.markAsSeen(dto.messageIds, userId);
    await this.resetUnreadCount(dto.conversationId, userId);

    for (const messageId of dto.messageIds) {
      const message = await this.messageService.findByClientMessageId(
        messageId.toString(),
      );

      if (message && message.senderId && message.senderId !== userId) {
        await this.broadcaster.broadcastReceiptUpdate(message.senderId, {
          messageId,
          userId,
          status: ReceiptStatus.SEEN,
          timestamp: new Date(),
        });
      }
    }
  }

  async typingStart(dto: TypingIndicatorDto, userId: string): Promise<void> {
    const isMember = await this.isMember(dto.conversationId, userId);
    if (!isMember) return;

    await this.broadcaster.broadcastTypingStatus(dto.conversationId, {
      conversationId: dto.conversationId,
      userId,
      isTyping: true,
    });
  }

  async typingStop(dto: TypingIndicatorDto, userId: string): Promise<void> {
    await this.broadcaster.broadcastTypingStatus(dto.conversationId, {
      conversationId: dto.conversationId,
      userId,
      isTyping: false,
    });
  }

  async subscribeToConversation(
    conversationId: string,
    userId: string,
    onMessage: (payload: any) => void,
    onTyping: (payload: any) => void,
  ): Promise<{
    unsubMessages: () => void | Promise<void>;
    unsubTyping: () => void | Promise<void>;
  }> {
    const isMember = await this.isMember(conversationId, userId);
    if (!isMember) {
      throw new Error('Not a member of this conversation');
    }

    const unsubMessages = await this.broadcaster.subscribeToConversation(
      conversationId,
      onMessage,
    );

    const unsubTyping = await this.broadcaster.subscribeToTyping(
      conversationId,
      onTyping,
    );

    return { unsubMessages, unsubTyping };
  }

  private async deliverMessageToRecipients(
    message: Message,
    recipientIds: string[],
    senderId: string,
    emitToUser: EmitToUserFn,
    isUserOnline: (userId: string) => Promise<boolean>,
  ): Promise<void> {
    for (const recipientId of recipientIds) {
      const online = await isUserOnline(recipientId);

      if (online) {
        await emitToUser(recipientId, SocketEvents.MESSAGE_NEW, {
          message,
          conversationId: message.conversationId,
        });

        await this.receiptService.markAsDelivered(message.id, recipientId);

        await this.broadcaster.broadcastReceiptUpdate(senderId, {
          messageId: message.id,
          userId: recipientId,
          status: ReceiptStatus.DELIVERED,
          timestamp: new Date(),
        });

        await this.incrementUnreadCount(message.conversationId, recipientId);
      } else {
        await this.messageQueue.enqueueMessage(recipientId, message);
      }
    }
  }

  private async isMember(
    conversationId: string,
    userId: string,
  ): Promise<boolean> {
    const member = await this.prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: { conversationId, userId },
      },
      select: { status: true },
    });
    return member?.status === MemberStatus.ACTIVE;
  }

  private async getActiveMembers(conversationId: string) {
    return this.prisma.conversationMember.findMany({
      where: {
        conversationId,
        status: MemberStatus.ACTIVE,
      },
      select: { userId: true },
    });
  }

  private async incrementUnreadCount(conversationId: string, userId: string) {
    await this.prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { unreadCount: { increment: 1 } },
    });
  }

  private async resetUnreadCount(conversationId: string, userId: string) {
    await this.prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { unreadCount: 0 },
    });
  }
}
