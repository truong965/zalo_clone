// src/modules/conversation/services/conversation.service.ts

import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { RedisPresenceService } from 'src/modules/redis/services/redis-presence.service';
import { PrivacyService } from 'src/modules/privacy/services/privacy.service';
import {
  ConversationType,
  MemberRole,
  MemberStatus,
  Prisma,
} from '@prisma/client';
import { CursorPaginationHelper } from '@common/utils/cursor-pagination.helper';
import type { CursorPaginatedResult } from '@common/interfaces/paginated-result.interface';

const conversationWithRelations =
  Prisma.validator<Prisma.ConversationDefaultArgs>()({
    include: {
      messages: {
        take: 1,
        orderBy: { createdAt: 'desc' },
        where: { deletedAt: null },
        select: {
          id: true,
          content: true,
          type: true,
          senderId: true,
          createdAt: true,
          deletedById: true,
        },
      },
      members: {
        include: {
          user: {
            select: {
              id: true,
              displayName: true,
              avatarUrl: true,
              lastSeenAt: true,
            },
          },
        },
      },
    },
  });

type ConversationWithRelations = Prisma.ConversationGetPayload<
  typeof conversationWithRelations
>;

@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisPresence: RedisPresenceService,
    private readonly privacyService: PrivacyService,
  ) { }

  /**
   * Check if user is member of conversation
   * CRITICAL: Used for permission checks
   */
  async isMember(conversationId: string, userId: string): Promise<boolean> {
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
   * Get all active members of a conversation
   * Used for message fanout
   */
  async getActiveMembers(conversationId: string) {
    return this.prisma.conversationMember.findMany({
      where: {
        conversationId,
        status: MemberStatus.ACTIVE,
      },
      select: {
        userId: true,
        role: true,
        user: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });
  }

  /**
   * Get or create 1-on-1 conversation
   * Idempotent operation / Check Block status before creating
   */
  async getOrCreateDirectConversation(
    userId1: string,
    userId2: string,
  ): Promise<{ id: string; isNew: boolean }> {
    if (userId1 === userId2) {
      throw new BadRequestException('Cannot create conversation with yourself');
    }

    const [user1, user2] = [userId1, userId2].sort();

    // Use Prisma AND + some to guarantee BOTH users are ACTIVE members
    const existing = await this.prisma.conversation.findFirst({
      where: {
        type: ConversationType.DIRECT,
        AND: [
          { members: { some: { userId: user1, status: MemberStatus.ACTIVE } } },
          { members: { some: { userId: user2, status: MemberStatus.ACTIVE } } },
        ],
      },
      select: { id: true },
    });

    if (existing) {
      return { id: existing.id, isNew: false };
    }

    const conversation = await this.prisma.$transaction(async (tx) => {
      // Re-check inside transaction to prevent race conditions (double creation)
      const recheck = await tx.conversation.findFirst({
        where: {
          type: ConversationType.DIRECT,
          AND: [
            { members: { some: { userId: user1, status: MemberStatus.ACTIVE } } },
            { members: { some: { userId: user2, status: MemberStatus.ACTIVE } } },
          ],
        },
        select: { id: true },
      });

      if (recheck) {
        return { id: recheck.id, _existing: true };
      }

      const conv = await tx.conversation.create({
        data: {
          type: ConversationType.DIRECT,
          createdById: userId1,
        },
      });

      await tx.conversationMember.createMany({
        data: [
          {
            conversationId: conv.id,
            userId: user1,
            role: MemberRole.MEMBER,
          },
          {
            conversationId: conv.id,
            userId: user2,
            role: MemberRole.MEMBER,
          },
        ],
      });

      return conv;
    });

    // If the transaction found existing conversation during re-check
    if ('_existing' in conversation && conversation._existing) {
      return { id: conversation.id, isNew: false };
    }

    this.logger.log(
      `Created DIRECT conversation ${conversation.id} between ${user1} and ${user2}`,
    );

    return { id: conversation.id, isNew: true };
  }

  /**
   * Update conversation's last message timestamp
   * Called after every new message
   */
  async updateLastMessageTimestamp(
    conversationId: string,
    timestamp: Date = new Date(),
  ): Promise<void> {
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: timestamp },
    });
  }

  /**
   * Increment unread count for a user in a conversation
   * Called when user receives a new message
   */
  async incrementUnreadCount(
    conversationId: string,
    userId: string,
  ): Promise<void> {
    await this.prisma.conversationMember.update({
      where: {
        conversationId_userId: {
          conversationId,
          userId,
        },
      },
      data: {
        unreadCount: {
          increment: 1,
        },
      },
    });
  }

  /**
   * Reset unread count when user reads messages
   */
  async resetUnreadCount(
    conversationId: string,
    userId: string,
  ): Promise<void> {
    await this.prisma.conversationMember.update({
      where: {
        conversationId_userId: {
          conversationId,
          userId,
        },
      },
      data: {
        unreadCount: 0,
        lastReadAt: new Date(),
      },
    });
  }

  /**
   * Archive a direct conversation by soft-deleting it
   * Used when blocking user - prevents seeing conversation history
   */
  async archiveDirectConversation(conversationId: string): Promise<void> {
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        deletedAt: new Date(),
      },
    });

    this.logger.log(`[Block] Archived conversation ${conversationId}`);
  }

  /**
   * Restore a direct conversation after unblocking
   * Clears the deletedAt flag to make conversation visible again
   */
  async restoreDirectConversation(conversationId: string): Promise<void> {
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        deletedAt: null,
      },
    });

    this.logger.log(`[Block] Restored conversation ${conversationId}`);
  }

  /**
   * Find direct conversation between two users
   * Returns all states (active, archived, etc.)
   * Used for archiving/restoration during blocking
   */
  async findDirectConversation(
    userId1: string,
    userId2: string,
  ): Promise<{ id: string } | null> {
    const [user1, user2] = [userId1, userId2].sort();

    // Use Prisma AND + some to guarantee BOTH users are ACTIVE members
    const result = await this.prisma.conversation.findFirst({
      where: {
        type: ConversationType.DIRECT,
        AND: [
          { members: { some: { userId: user1, status: MemberStatus.ACTIVE } } },
          { members: { some: { userId: user2, status: MemberStatus.ACTIVE } } },
        ],
      },
      select: { id: true },
    });

    return result ? { id: result.id } : null;
  }

  /**
   * Get user's conversations list (Full implementation)
   */
  async getUserConversations(
    userId: string,
    cursor?: string,
    limit: number = 20,
  ): Promise<CursorPaginatedResult<unknown>> {
    const conversations = await this.prisma.conversation.findMany({
      where: {
        members: { some: { userId, status: MemberStatus.ACTIVE } },
        deletedAt: null,
      },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { lastMessageAt: 'desc' },
      include: conversationWithRelations.include,
    });

    const blockMap = new Map<string, boolean>();
    const onlineMap = new Map<string, boolean>();

    const directOtherUserIds = Array.from(
      new Set(
        conversations
          .filter((c) => c.type === ConversationType.DIRECT)
          .map((c) =>
            c.members.find((m) => m.userId !== userId)?.user?.id ?? null,
          )
          .filter((id): id is string => !!id),
      ),
    );

    const privacyMap = await this.privacyService.getManySettings(directOtherUserIds);
    await Promise.all(
      directOtherUserIds.map(async (otherId) => {
        const settings = privacyMap.get(otherId);
        if (settings && !settings.showOnlineStatus) {
          onlineMap.set(otherId, false);
          return;
        }
        const online = await this.redisPresence.isUserOnline(otherId);
        onlineMap.set(otherId, online);
      }),
    );

    return CursorPaginationHelper.buildResult({
      items: conversations,
      limit,
      getCursor: (c) => c.id,
      mapToDto: (c) =>
        this.mapConversationResponse(
          c as ConversationWithRelations,
          userId,
          blockMap,
          onlineMap,
        ),
    });
  }

  private mapConversationResponse(
    conversation: ConversationWithRelations,
    currentUserId: string,
    blockMap: Map<string, boolean>,
    onlineMap: Map<string, boolean>,
  ) {
    const currentUserMember = conversation.members.find(
      (m) => m.userId === currentUserId,
    );
    let name = conversation.name;
    let avatar = conversation.avatarUrl;
    let isOnline = false;
    let isBlocked = false;
    let otherUserId: string | null = null;

    if (conversation.type === ConversationType.DIRECT) {
      const otherMember = conversation.members.find(
        (m) => m.userId !== currentUserId,
      );

      if (otherMember?.user) {
        name = otherMember.user.displayName;
        avatar = otherMember.user.avatarUrl;
        otherUserId = otherMember.user.id;

        isOnline = onlineMap.get(otherUserId) || false;
        isBlocked = blockMap.get(otherUserId) || false;
      }
    }

    const lastMsg = conversation.messages[0];
    return {
      id: conversation.id,
      type: conversation.type,
      name,
      avatar,
      isOnline,
      isBlocked,
      otherUserId,
      updatedAt: conversation.updatedAt,
      lastMessageAt: conversation.lastMessageAt,

      lastSeenAt: otherUserId
        ? conversation.members.find((m) => m.userId === otherUserId)?.user
          .lastSeenAt
        : null,
      lastMessage: lastMsg
        ? {
          id: lastMsg.id.toString(),
          content: lastMsg.deletedById
            ? 'Tin nhắn đã bị thu hồi'
            : lastMsg.content,
          type: lastMsg.type,
          senderId: lastMsg.senderId,
          createdAt: lastMsg.createdAt,
        }
        : null,
      unreadCount: currentUserMember?.unreadCount ?? 0,
      lastReadMessageId: currentUserMember?.lastReadMessageId
        ? currentUserMember.lastReadMessageId.toString() // Convert BigInt to String
        : null,
    };
  }
  async getConversationById(
    userId: string,
    conversationId: string,
  ): Promise<unknown> {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        members: { some: { userId, status: MemberStatus.ACTIVE } },
        deletedAt: null,
      },
      include: conversationWithRelations.include,
    });

    if (!conversation) {
      throw new BadRequestException('Conversation not found');
    }

    // Enrich with online/block status (same as getUserConversations)
    const blockMap = new Map<string, boolean>();
    const onlineMap = new Map<string, boolean>();

    if (conversation.type === ConversationType.DIRECT) {
      const otherMember = conversation.members.find(
        (m) => m.userId !== userId,
      );
      if (otherMember?.user) {
        const otherId = otherMember.user.id;
        const privacyMap = await this.privacyService.getManySettings([otherId]);
        const settings = privacyMap.get(otherId);
        if (settings && !settings.showOnlineStatus) {
          onlineMap.set(otherId, false);
        } else {
          const online = await this.redisPresence.isUserOnline(otherId);
          onlineMap.set(otherId, online);
        }
      }
    }

    return this.mapConversationResponse(
      conversation as ConversationWithRelations,
      userId,
      blockMap,
      onlineMap,
    );
  }

  /**
   * Get list of members for a conversation (for sender filter in search).
   * Only returns members if the requesting user is an active member.
   */
  async getConversationMembers(
    userId: string,
    conversationId: string,
  ): Promise<{ id: string; displayName: string; avatarUrl: string | null }[]> {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        members: { some: { userId, status: MemberStatus.ACTIVE } },
      },
      include: {
        members: {
          where: { status: MemberStatus.ACTIVE },
          include: {
            user: {
              select: {
                id: true,
                displayName: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });

    if (!conversation) {
      throw new BadRequestException('Conversation not found');
    }

    return conversation.members.map((m) => ({
      id: m.user.id,
      displayName: m.user.displayName,
      avatarUrl: m.user.avatarUrl,
    }));
  }
}
