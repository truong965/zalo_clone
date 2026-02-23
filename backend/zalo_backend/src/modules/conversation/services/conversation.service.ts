// src/modules/conversation/services/conversation.service.ts

import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { RedisPresenceService } from 'src/modules/redis/services/redis-presence.service';
import { PrivacyService } from 'src/modules/privacy/services/privacy.service';
import { DisplayNameResolver } from '@shared/services';
import {
  ConversationType,
  MemberRole,
  MemberStatus,
  Prisma,
} from '@prisma/client';
import { CursorPaginationHelper } from '@common/utils/cursor-pagination.helper';
import type { CursorPaginatedResult } from '@common/interfaces/paginated-result.interface';
import type { GroupListItemDto } from '../dto/group-list-item.dto';

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
    private readonly displayNameResolver: DisplayNameResolver,
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
            {
              members: { some: { userId: user1, status: MemberStatus.ACTIVE } },
            },
            {
              members: { some: { userId: user2, status: MemberStatus.ACTIVE } },
            },
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
          .map(
            (c) => c.members.find((m) => m.userId !== userId)?.user?.id ?? null,
          )
          .filter((id): id is string => !!id),
      ),
    );

    const [privacyMap, nameMap] = await Promise.all([
      this.privacyService.getManySettings(directOtherUserIds),
      this.displayNameResolver.batchResolve(userId, directOtherUserIds),
    ]);
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
          nameMap,
        ),
    });
  }

  private mapConversationResponse(
    conversation: ConversationWithRelations,
    currentUserId: string,
    blockMap: Map<string, boolean>,
    onlineMap: Map<string, boolean>,
    nameMap?: Map<string, string>,
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
        // Display name priority: aliasName > phoneBookName > displayName
        name = nameMap?.get(otherMember.user.id) ?? otherMember.user.displayName;
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
      // E.3: Enriched fields for group info sidebar
      myRole: (currentUserMember?.role as string) ?? 'MEMBER',
      requireApproval: conversation.requireApproval ?? false,
      isMuted: currentUserMember?.isMuted ?? false,
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
    let nameMap: Map<string, string> | undefined;

    if (conversation.type === ConversationType.DIRECT) {
      const otherMember = conversation.members.find((m) => m.userId !== userId);
      if (otherMember?.user) {
        const otherId = otherMember.user.id;
        const [privacyMap, resolvedNames] = await Promise.all([
          this.privacyService.getManySettings([otherId]),
          this.displayNameResolver.batchResolve(userId, [otherId]),
        ]);
        nameMap = resolvedNames;
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
      nameMap,
    );
  }

  /**
   * E.2: Toggle mute/unmute a conversation for the current user.
   * Updates isMuted on ConversationMember.
   */
  async toggleMute(
    userId: string,
    conversationId: string,
    muted: boolean,
  ): Promise<{ isMuted: boolean }> {
    const member = await this.prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: { conversationId, userId },
      },
    });

    if (!member || member.status !== MemberStatus.ACTIVE) {
      throw new BadRequestException('Not a member of this conversation');
    }

    await this.prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { isMuted: muted },
    });

    return { isMuted: muted };
  }

  /**
   * Get list of members for a conversation (for sender filter in search).
   * Only returns members if the requesting user is an active member.
   */
  async getConversationMembers(
    userId: string,
    conversationId: string,
  ): Promise<
    {
      id: string;
      displayName: string;
      avatarUrl: string | null;
      role: string;
    }[]
  > {
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
          orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
        },
      },
    });

    if (!conversation) {
      throw new BadRequestException('Conversation not found');
    }

    // Batch resolve display names per viewer
    const memberIds = conversation.members.map((m) => m.user.id);
    const nameMap = await this.displayNameResolver.batchResolve(userId, memberIds);

    return conversation.members.map((m) => ({
      id: m.user.id,
      displayName: nameMap.get(m.user.id) ?? m.user.displayName,
      avatarUrl: m.user.avatarUrl,
      role: m.role,
    }));
  }

  /**
   * Get user's GROUP conversations list (cursor-paginated)
   * Returns groups where user is an ACTIVE member, ordered by lastMessageAt desc
   */
  async getUserGroups(
    userId: string,
    cursor?: string,
    limit: number = 20,
    search?: string,
  ): Promise<CursorPaginatedResult<GroupListItemDto>> {
    const groups = await this.prisma.conversation.findMany({
      where: {
        type: ConversationType.GROUP,
        members: { some: { userId, status: MemberStatus.ACTIVE } },
        deletedAt: null,
        ...(search
          ? { name: { contains: search, mode: 'insensitive' as const } }
          : {}),
      },
      ...CursorPaginationHelper.buildPrismaParams(limit, cursor),
      orderBy: { lastMessageAt: 'desc' },
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
          where: { status: MemberStatus.ACTIVE },
          select: {
            userId: true,
            role: true,
            isMuted: true,
            unreadCount: true,
            user: {
              select: {
                id: true,
                displayName: true,
              },
            },
          },
        },
      },
    });

    // Batch resolve all member display names across all groups
    const allOtherMemberIds = new Set<string>();
    for (const g of groups) {
      for (const m of g.members) {
        if (m.userId !== userId) {
          allOtherMemberIds.add(m.user.id);
        }
      }
    }
    const nameMap = await this.displayNameResolver.batchResolve(
      userId,
      [...allOtherMemberIds],
    );

    return CursorPaginationHelper.buildResult({
      items: groups,
      limit,
      getCursor: (g) => g.id,
      mapToDto: (g): GroupListItemDto => {
        const currentMember = g.members.find(
          (m: { userId: string }) => m.userId === userId,
        );
        const otherMembers = g.members
          .filter((m: { userId: string }) => m.userId !== userId)
          .slice(0, 3);
        const lastMsg = g.messages[0];

        return {
          id: g.id,
          name: g.name,
          avatarUrl: g.avatarUrl,
          memberCount: g.members.length,
          membersPreview: otherMembers.map(
            (m: { user: { id: string; displayName: string } }) =>
              nameMap.get(m.user.id) ?? m.user.displayName,
          ),
          lastMessageAt: g.lastMessageAt?.toISOString() ?? null,
          lastMessage: lastMsg
            ? {
              id: lastMsg.id.toString(),
              content: lastMsg.deletedById
                ? 'Tin nhắn đã bị thu hồi'
                : lastMsg.content,
              type: lastMsg.type,
              senderId: lastMsg.senderId,
              createdAt: lastMsg.createdAt.toISOString(),
            }
            : null,
          unreadCount: currentMember?.unreadCount ?? 0,
          myRole: (currentMember?.role as string) ?? 'MEMBER',
          isMuted: currentMember?.isMuted ?? false,
          requireApproval: g.requireApproval ?? false,
          createdAt: g.createdAt.toISOString(),
          updatedAt: g.updatedAt.toISOString(),
        };
      },
    });
  }
}
