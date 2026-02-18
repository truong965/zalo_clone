import { Injectable, Logger } from '@nestjs/common';
import { ConversationType, MemberStatus, Message } from '@prisma/client';
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
  ) {
    return;
  }

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

      const grouped = new Map<string, { last: Message; count: number }>();
      for (const qm of offlineMessages) {
        const rawMsg = qm.data as Message;
        const current = grouped.get(rawMsg.conversationId);
        if (!current) {
          grouped.set(rawMsg.conversationId, { last: rawMsg, count: 1 });
          continue;
        }
        current.count += 1;
        if (
          new Date(rawMsg.createdAt).getTime() >
          new Date(current.last.createdAt).getTime()
        ) {
          current.last = rawMsg;
        }
      }

      for (const [conversationId, entry] of grouped.entries()) {
        const m = entry.last;
        client.emit(SocketEvents.CONVERSATION_LIST_ITEM_UPDATED, {
          conversationId,
          lastMessage: {
            id: m.id.toString(),
            content: m.content ?? null,
            type: m.type,
            senderId: m.senderId ?? null,
            createdAt: new Date(m.createdAt).toISOString(),
          },
          lastMessageAt: new Date(m.createdAt).toISOString(),
          unreadCountDelta: entry.count,
        });
      }

      const messageIds = offlineMessages.map((qm) => qm.messageId);
      await this.receiptService.bulkMarkDirectDelivered(messageIds, userId);

      for (const qm of offlineMessages) {
        const message = qm.data as Message;
        if (message.senderId && message.senderId !== userId) {
          await this.broadcaster.broadcastReceiptUpdate(message.senderId, {
            messageId: message.id,
            conversationId: message.conversationId,
            userId,
            type: 'delivered',
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
    const isoCreatedAt = new Date(message.createdAt).toISOString();
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

    const listItemPayloadBase = {
      conversationId: dto.conversationId,
      lastMessage: {
        id: message.id.toString(),
        content: message.content ?? null,
        type: message.type,
        senderId: message.senderId ?? null,
        createdAt: isoCreatedAt,
      },
      lastMessageAt: isoCreatedAt,
    };

    await Promise.all([
      emitToUser(senderId, SocketEvents.CONVERSATION_LIST_ITEM_UPDATED, {
        ...listItemPayloadBase,
        unreadCountDelta: 0,
      }),
      ...recipientIds.map((userId) =>
        emitToUser(userId, SocketEvents.CONVERSATION_LIST_ITEM_UPDATED, {
          ...listItemPayloadBase,
          unreadCountDelta: 1,
        }),
      ),
    ]);

    return message;
  }

  async markAsSeen(dto: MarkAsReadDto, userId: string): Promise<void> {
    const isMember = await this.isMember(dto.conversationId, userId);
    if (!isMember) {
      throw new Error('Not a member of this conversation');
    }

    const conversationType =
      await this.receiptService.getConversationType(dto.conversationId);

    const messageIds = dto.messageIds
      .map((id) => {
        try {
          return BigInt(id);
        } catch {
          return null;
        }
      })
      .filter((id): id is bigint => id !== null);

    if (conversationType === ConversationType.DIRECT) {
      // ─── DIRECT: Update directReceipts JSONB + emit per-message receipt
      // markDirectSeen returns ONLY the IDs that were actually updated (idempotent)
      const { updatedIds, senderMap } = await this.receiptService.markDirectSeen(messageIds, userId);
      await this.resetUnreadCount(dto.conversationId, userId);

      // Only broadcast for messages that actually transitioned to SEEN (not already seen)
      // Group by senderId to reduce broadcasts
      if (updatedIds.length > 0) {
        const bySender = new Map<string, bigint[]>();
        for (const msgId of updatedIds) {
          const senderId = senderMap.get(msgId);
          if (senderId && senderId !== userId) {
            const list = bySender.get(senderId) ?? [];
            list.push(msgId);
            bySender.set(senderId, list);
          }
        }

        // Broadcast per sender (typically 1 sender in a DIRECT conversation)
        for (const [senderId, msgIds] of bySender) {
          for (const messageId of msgIds) {
            await this.broadcaster.broadcastReceiptUpdate(senderId, {
              messageId,
              conversationId: dto.conversationId,
              userId,
              type: 'seen',
              timestamp: new Date(),
            });
          }
        }

        this.logger.debug(
          `Broadcasted seen receipts for ${updatedIds.length} actually-updated messages in ${dto.conversationId}`,
        );
      }
    } else {
      // ─── GROUP: Update ConversationMember.lastReadMessageId + batch increment seenCount
      const latestMessageId =
        messageIds.length > 0
          ? messageIds.reduce((a, b) => (a > b ? a : b))
          : null;

      if (latestMessageId) {
        await this.receiptService.markGroupConversationRead(
          userId,
          dto.conversationId,
          latestMessageId,
        );
      }
      await this.resetUnreadCount(dto.conversationId, userId);

      // Emit conversation:read event for group (lightweight — no per-message detail)
      await this.broadcaster.broadcastConversationRead(dto.conversationId, {
        userId,
        conversationId: dto.conversationId,
        messageId: latestMessageId?.toString() ?? null,
        timestamp: new Date(),
      });
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

  async broadcastTypingToMembers(
    dto: TypingIndicatorDto,
    userId: string,
    emitToUser: (
      userId: string,
      event: string,
      data: unknown,
    ) => void | Promise<void>,
  ): Promise<void> {
    const isMember = await this.isMember(dto.conversationId, userId);
    if (!isMember) return;

    const members = await this.getActiveMembers(dto.conversationId);
    await Promise.all(
      members
        .filter((m) => m.userId !== userId)
        .map((m) =>
          Promise.resolve(
            emitToUser(m.userId, SocketEvents.TYPING_STATUS, {
              conversationId: dto.conversationId,
              userId,
              isTyping: dto.isTyping,
            }),
          ).catch(() => undefined),
        ),
    );
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
    // Determine conversation type to use correct receipt method
    const convoType =
      await this.receiptService.getConversationType(message.conversationId);
    const isDirect = convoType === ConversationType.DIRECT;

    for (const recipientId of recipientIds) {
      const online = await isUserOnline(recipientId);

      if (online) {
        await emitToUser(recipientId, SocketEvents.MESSAGE_NEW, {
          message,
          conversationId: message.conversationId,
        });

        if (isDirect) {
          await this.receiptService.markDirectDelivered(
            message.id,
            recipientId,
          );
        }
        // For group: no per-message delivered tracking needed

        await this.broadcaster.broadcastReceiptUpdate(senderId, {
          messageId: message.id,
          conversationId: message.conversationId,
          userId: recipientId,
          type: 'delivered',
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
