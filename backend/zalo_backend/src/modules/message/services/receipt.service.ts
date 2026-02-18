// src/modules/message/services/receipt.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { ConversationType, MemberStatus } from '@prisma/client';

/**
 * JSONB shape stored in `messages.direct_receipts` for DIRECT conversations:
 * { [userId]: { delivered: ISO string | null, seen: ISO string | null } }
 */
export interface DirectReceiptEntry {
  delivered: string | null;
  seen: string | null;
}
export type DirectReceipts = Record<string, DirectReceiptEntry>;

@Injectable()
export class ReceiptService {
  private readonly logger = new Logger(ReceiptService.name);

  constructor(private readonly prisma: PrismaService) { }

  // ─── DIRECT (1v1) ──────────────────────────────────────────────────

  /**
   * Mark a single message as DELIVERED for a 1v1 conversation.
   * Uses jsonb_set to atomically update directReceipts.
   */
  async markDirectDelivered(
    messageId: bigint,
    userId: string,
  ): Promise<void> {
    try {
      const now = new Date().toISOString();
      // Only update if delivered is currently null (idempotent)
      await this.prisma.$executeRaw`
        UPDATE messages
        SET direct_receipts = jsonb_set(
          COALESCE(direct_receipts, '{}'::jsonb),
          ${[userId, 'delivered']}::text[],
          to_jsonb(${now}::text)
        ),
        delivered_count = CASE
          WHEN (COALESCE(direct_receipts, '{}'::jsonb) -> ${userId} ->> 'delivered') IS NULL THEN delivered_count + 1
          ELSE delivered_count
        END
        WHERE id = ${messageId}
          AND (COALESCE(direct_receipts, '{}'::jsonb) -> ${userId} ->> 'delivered') IS NULL
      `;

      this.logger.debug(
        `Message ${messageId} marked DELIVERED (direct) for user ${userId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to mark message ${messageId} as delivered for ${userId}`,
        error,
      );
    }
  }

  /**
   * Bulk mark messages as DELIVERED for a 1v1 conversation (offline sync).
   */
  async bulkMarkDirectDelivered(
    messageIds: bigint[],
    userId: string,
  ): Promise<void> {
    if (messageIds.length === 0) return;

    try {
      const now = new Date().toISOString();
      await this.prisma.$executeRaw`
        UPDATE messages
        SET direct_receipts = jsonb_set(
          COALESCE(direct_receipts, '{}'::jsonb),
          ${[userId, 'delivered']}::text[],
          to_jsonb(${now}::text)
        ),
        delivered_count = CASE
          WHEN (COALESCE(direct_receipts, '{}'::jsonb) -> ${userId} ->> 'delivered') IS NULL THEN delivered_count + 1
          ELSE delivered_count
        END
        WHERE id = ANY(${messageIds}::bigint[])
          AND (COALESCE(direct_receipts, '{}'::jsonb) -> ${userId} ->> 'delivered') IS NULL
      `;

      this.logger.debug(
        `Bulk marked ${messageIds.length} messages as DELIVERED (direct) for ${userId}`,
      );
    } catch (error) {
      this.logger.error('Failed to bulk mark messages as delivered', error);
    }
  }

  /**
   * Mark messages as SEEN for a 1v1 conversation.
   * Updates directReceipts JSONB + increments seenCount.
   * Returns the IDs of messages that were **actually updated** (previously unseen).
   */
  async markDirectSeen(
    messageIds: bigint[],
    userId: string,
  ): Promise<{ updatedIds: bigint[]; senderMap: Map<bigint, string> }> {
    if (messageIds.length === 0) return { updatedIds: [], senderMap: new Map() };

    try {
      const now = new Date().toISOString();

      // 1. Batch-fetch sender info for all requested messages BEFORE update (single query, not N+1)
      const messagesInfo = await this.prisma.message.findMany({
        where: {
          id: { in: messageIds },
          senderId: { not: userId },
          deletedAt: null,
        },
        select: { id: true, senderId: true },
      });

      const senderMap = new Map<bigint, string>();
      for (const m of messagesInfo) {
        if (m.senderId) senderMap.set(m.id, m.senderId);
      }

      // 2. Update only messages not yet seen — use RETURNING to get actually-updated IDs
      const updatedRows = await this.prisma.$queryRaw<{ id: bigint }[]>`
        UPDATE messages
        SET direct_receipts = jsonb_set(
          jsonb_set(
            COALESCE(direct_receipts, '{}'::jsonb),
            ${[userId, 'delivered']}::text[],
            COALESCE(
              (COALESCE(direct_receipts, '{}'::jsonb) -> ${userId} -> 'delivered'),
              to_jsonb(${now}::text)
            )
          ),
          ${[userId, 'seen']}::text[],
          to_jsonb(${now}::text)
        ),
        seen_count = CASE
          WHEN (COALESCE(direct_receipts, '{}'::jsonb) -> ${userId} ->> 'seen') IS NULL THEN seen_count + 1
          ELSE seen_count
        END,
        delivered_count = CASE
          WHEN (COALESCE(direct_receipts, '{}'::jsonb) -> ${userId} ->> 'delivered') IS NULL THEN delivered_count + 1
          ELSE delivered_count
        END
        WHERE id = ANY(${messageIds}::bigint[])
          AND (COALESCE(direct_receipts, '{}'::jsonb) -> ${userId} ->> 'seen') IS NULL
        RETURNING id
      `;

      const updatedIds = updatedRows.map((r) => r.id);

      this.logger.debug(
        `Marked ${updatedIds.length}/${messageIds.length} messages as SEEN (direct) for ${userId}`,
      );

      return { updatedIds, senderMap };
    } catch (error) {
      this.logger.error('Failed to mark messages as seen (direct)', error);
      throw error;
    }
  }

  // ─── GROUP ─────────────────────────────────────────────────────────

  /**
   * Mark a conversation as read for a group member.
   * - Updates ConversationMember.lastReadMessageId
   * - Batch increments seenCount on affected messages (avoiding double-count)
   */
  async markGroupConversationRead(
    userId: string,
    conversationId: string,
    latestMessageId: bigint,
  ): Promise<void> {
    try {
      // 1. Get current lastReadMessageId to avoid double-count (R3)
      const member = await this.prisma.conversationMember.findUnique({
        where: {
          conversationId_userId: { conversationId, userId },
        },
        select: { lastReadMessageId: true },
      });

      const previousLastReadId = member?.lastReadMessageId ?? BigInt(0);

      // Only proceed if there are new messages to mark as read
      if (previousLastReadId >= latestMessageId) {
        this.logger.debug(
          `No new messages to mark as read for user ${userId} in ${conversationId}`,
        );
        return;
      }

      // 2. Update ConversationMember.lastReadMessageId + lastReadAt
      await this.prisma.conversationMember.update({
        where: {
          conversationId_userId: { conversationId, userId },
        },
        data: {
          lastReadMessageId: latestMessageId,
          lastReadAt: new Date(),
        },
      });

      // 3. Batch increment seenCount for messages between previousLastReadId and latestMessageId
      //    Atomic increment, single UPDATE — no race condition (R2)
      await this.prisma.$executeRaw`
        UPDATE messages
        SET seen_count = seen_count + 1
        WHERE conversation_id = ${conversationId}::uuid
          AND id > ${previousLastReadId}
          AND id <= ${latestMessageId}
          AND deleted_at IS NULL
          AND sender_id != ${userId}::uuid
      `;

      this.logger.debug(
        `Group read: user ${userId} in ${conversationId}, msgs (${previousLastReadId}, ${latestMessageId}]`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to mark group conversation read: ${conversationId} by ${userId}`,
        error,
      );
      throw error;
    }
  }

  // ─── HELPERS ───────────────────────────────────────────────────────

  /**
   * Determine conversation type for a given conversationId.
   */
  async getConversationType(
    conversationId: string,
  ): Promise<ConversationType> {
    const convo = await this.prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId },
      select: { type: true },
    });
    return convo.type;
  }

  /**
   * Get the count of active members in a conversation (excluding sender).
   */
  async getRecipientCount(
    conversationId: string,
    senderId: string,
  ): Promise<number> {
    return this.prisma.conversationMember.count({
      where: {
        conversationId,
        status: MemberStatus.ACTIVE,
        userId: { not: senderId },
      },
    });
  }
}
