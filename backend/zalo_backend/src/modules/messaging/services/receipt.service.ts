// src/modules/messaging/services/receipt.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { ReceiptStatus } from '@prisma/client';

@Injectable()
export class ReceiptService {
  private readonly logger = new Logger(ReceiptService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Mark message as DELIVERED to a specific user
   * Called when message reaches user's device via WebSocket
   */
  async markAsDelivered(messageId: bigint, userId: string): Promise<void> {
    try {
      await this.prisma.messageReceipt.upsert({
        where: {
          messageId_userId: {
            messageId,
            userId,
          },
        },
        create: {
          messageId,
          userId,
          status: ReceiptStatus.DELIVERED,
        },
        update: {
          // Only upgrade if not already SEEN
          status: ReceiptStatus.DELIVERED,
          timestamp: new Date(),
        },
      });

      this.logger.debug(
        `Message ${messageId} marked DELIVERED for user ${userId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to mark message ${messageId} as delivered for ${userId}`,
        error,
      );
      // Don't throw - delivery tracking is non-critical
    }
  }

  /**
   * Batch mark multiple messages as DELIVERED
   * Used when syncing offline messages
   */
  async bulkMarkAsDelivered(
    messageIds: bigint[],
    userId: string,
  ): Promise<void> {
    if (messageIds.length === 0) return;

    try {
      // Use raw query for better performance on bulk operations
      await this.prisma.$executeRaw`
        INSERT INTO message_receipts (message_id, user_id, status, timestamp)
        SELECT unnest(${messageIds}::bigint[]), ${userId}, 'DELIVERED', NOW()
        ON CONFLICT (message_id, user_id) 
        DO UPDATE SET 
          status = EXCLUDED.status,
          timestamp = EXCLUDED.timestamp
        WHERE message_receipts.status != 'SEEN'
      `;

      this.logger.debug(
        `Bulk marked ${messageIds.length} messages as DELIVERED for ${userId}`,
      );
    } catch (error) {
      this.logger.error('Failed to bulk mark messages as delivered', error);
    }
  }

  /**
   * Mark messages as SEEN (read)
   * Called when user opens chat and views messages
   */
  async markAsSeen(messageIds: bigint[], userId: string): Promise<void> {
    if (messageIds.length === 0) return;

    try {
      await this.prisma.$executeRaw`
        INSERT INTO message_receipts (message_id, user_id, status, timestamp)
        SELECT unnest(${messageIds}::bigint[]), ${userId}, 'SEEN', NOW()
        ON CONFLICT (message_id, user_id) 
        DO UPDATE SET 
          status = 'SEEN',
          timestamp = NOW()
      `;

      this.logger.debug(
        `Marked ${messageIds.length} messages as SEEN for ${userId}`,
      );
    } catch (error) {
      this.logger.error('Failed to mark messages as seen', error);
      throw error; // This is more critical - throw to notify caller
    }
  }

  /**
   * Get receipt status for a message
   * Returns array of {userId, status, timestamp}
   */
  async getMessageReceipts(messageId: bigint) {
    return this.prisma.messageReceipt.findMany({
      where: { messageId },
      select: {
        userId: true,
        status: true,
        timestamp: true,
      },
      orderBy: { timestamp: 'asc' },
    });
  }

  /**
   * Check if message has been seen by all recipients
   * Useful for "double blue tick" UI
   */
  async isSeenByAll(
    messageId: bigint,
    recipientIds: string[],
  ): Promise<boolean> {
    const seenCount = await this.prisma.messageReceipt.count({
      where: {
        messageId,
        userId: { in: recipientIds },
        status: ReceiptStatus.SEEN,
      },
    });

    return seenCount === recipientIds.length;
  }
}
