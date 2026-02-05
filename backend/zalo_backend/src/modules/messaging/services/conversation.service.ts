// src/modules/messaging/services/conversation.service.ts

import {
  Injectable,
  BadRequestException,
  Logger,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import {
  ConversationType,
  MemberRole,
  MemberStatus,
  Prisma,
} from '@prisma/client';

const conversationWithRelations =
  Prisma.validator<Prisma.ConversationDefaultArgs>()({
    include: {
      messages: {
        take: 1,
        orderBy: { createdAt: 'desc' },
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
        take: 4,
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

// Type an toàn để thay thế cho 'any'
type ConversationWithRelations = Prisma.ConversationGetPayload<
  typeof conversationWithRelations
>;
@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);

  constructor(private readonly prisma: PrismaService) {}

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

    // TODO PHASE 3: Block validation
    // Block status is checked by MessagingBlockListener
    // When USER_BLOCKED event emitted → listener archives related conversations
    // For now, proceed with conversation creation (event listeners handle cascade)

    // Sort user IDs to ensure consistent lookup
    const [user1, user2] = [userId1, userId2].sort();

    // Try to find existing DIRECT conversation between these 2 users
    const existing = await this.prisma.conversation.findFirst({
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

    if (existing) {
      return { id: existing.id, isNew: false };
    }

    // Create new conversation (Transaction)
    const conversation = await this.prisma.$transaction(async (tx) => {
      // 1. Create conversation
      const conv = await tx.conversation.create({
        data: {
          type: ConversationType.DIRECT,
          createdById: userId1, // Initiator
        },
      });

      // 2. Add both members
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
   *
   * Implementation: Set deletedAt timestamp on conversation
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

  /**
   * Get user's conversations list (Full implementation)
   */
  async getUserConversations(
    userId: string,
    cursor?: string,
    limit: number = 20,
  ) {
    const conversations = await this.prisma.conversation.findMany({
      where: {
        members: { some: { userId, status: MemberStatus.ACTIVE } },
        lastMessageAt: { not: null },
      },
      take: limit + 1,
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: { lastMessageAt: 'desc' },
      // [QUAN TRỌNG] Sử dụng đúng cấu trúc đã định nghĩa ở trên
      include: conversationWithRelations.include,
    });

    const hasMore = conversations.length > limit;
    const items = hasMore ? conversations.slice(0, -1) : conversations;
    const nextCursor = hasMore ? items[items.length - 1].id : undefined;

    // TODO PHASE 3: Fetch block/online status
    // Block status comes from MessagingBlockListener (handles cascade)
    // Online status comes from SocketModule events
    // For now, create placeholder maps
    const blockMap = new Map<string, boolean>(); // Empty for now
    const onlineMap = new Map<string, boolean>(); // Empty for now

    // Map Response
    const data = items.map((c) =>
      this.mapConversationResponse(c, userId, blockMap, onlineMap),
    );

    return { items: data, nextCursor };
  }

  // 2. [FIX] Thay 'any' bằng Type chuẩn
  private mapConversationResponse(
    conversation: ConversationWithRelations, // Strict Type
    currentUserId: string,
    blockMap: Map<string, boolean>,
    onlineMap: Map<string, boolean>,
  ) {
    let name = conversation.name;
    let avatar = conversation.avatarUrl;
    let isOnline = false;
    let isBlocked = false;
    let otherUserId: string | null = null; // Định nghĩa rõ kiểu

    if (conversation.type === ConversationType.DIRECT) {
      const otherMember = conversation.members.find(
        (m) => m.userId !== currentUserId,
      );

      if (otherMember?.user) {
        name = otherMember.user.displayName;
        avatar = otherMember.user.avatarUrl;
        otherUserId = otherMember.user.id;

        // Lookup status
        isOnline = onlineMap.get(otherUserId) || false;
        isBlocked = blockMap.get(otherUserId) || false;
      }
    }

    // Xử lý message safely
    const lastMsg = conversation.messages[0];

    return {
      id: conversation.id,
      type: conversation.type,
      name,
      avatar,
      isOnline,
      isBlocked,
      lastSeenAt: otherUserId
        ? conversation.members.find((m) => m.userId === otherUserId)?.user
            .lastSeenAt
        : null,
      lastMessage: lastMsg
        ? {
            id: lastMsg.id.toString(), // Convert BigInt
            content: lastMsg.deletedById
              ? 'Tin nhắn đã bị thu hồi'
              : lastMsg.content,
            type: lastMsg.type,
            senderId: lastMsg.senderId,
            createdAt: lastMsg.createdAt,
          }
        : null,
      updatedAt: conversation.lastMessageAt || conversation.createdAt,
    };
  }
}
