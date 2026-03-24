// src/modules/conversation/services/conversation.service.ts

import {
  Inject,
  Injectable,
  BadRequestException,
  Logger,
  ForbiddenException,
} from '@nestjs/common';
import { InteractionAuthorizationService } from 'src/modules/authorization/services/interaction-authorization.service';
import { PermissionAction } from 'src/common/constants/permission-actions.constant';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from 'src/database/prisma.service';
import { RedisPresenceService } from 'src/shared/redis/services/redis-presence.service';
import { PRIVACY_READ_PORT } from '@common/contracts/internal-api';
import type { IPrivacyReadPort } from '@common/contracts/internal-api';
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
import { MAX_PINNED_CONVERSATIONS } from '../constants/conversation.constants';
import type { GroupSettings } from './group.service';
import {
  ConversationArchivedEvent,
  ConversationMutedEvent,
  ConversationPinnedEvent,
  ConversationUnpinnedEvent
} from '../events';
import { safeJSON } from 'src/common/utils/json.util';

type UserProfile = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  lastSeenAt: Date | null;
};

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
        select: {
          userId: true,
          role: true,
          status: true,
          unreadCount: true,
          lastReadMessageId: true,
          isMuted: true,
          isPinned: true,
          pinnedAt: true,
          isArchived: true,
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
    @Inject(PRIVACY_READ_PORT)
    private readonly privacyRead: IPrivacyReadPort,
    private readonly displayNameResolver: DisplayNameResolver,
    private readonly eventEmitter: EventEmitter2,
    private readonly interactionAuth: InteractionAuthorizationService,
  ) { }

  private async getUserProfilesMap(
    userIds: string[],
  ): Promise<Map<string, UserProfile>> {
    if (userIds.length === 0) {
      return new Map();
    }

    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        displayName: true,
        avatarUrl: true,
        lastSeenAt: true,
      },
    });

    return new Map(users.map((u) => [u.id, u]));
  }

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
    const members = await this.prisma.conversationMember.findMany({
      where: {
        conversationId,
        status: MemberStatus.ACTIVE,
      },
      select: {
        userId: true,
        role: true,
      },
    });

    const profileMap = await this.getUserProfilesMap(
      members.map((m) => m.userId),
    );

    return members.map((m) => ({
      ...m,
      user: {
        id: m.userId,
        displayName: profileMap.get(m.userId)?.displayName ?? 'Unknown User',
        avatarUrl: profileMap.get(m.userId)?.avatarUrl ?? null,
      },
    }));
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

    const authz = await this.interactionAuth.canInteract(
      userId1,
      userId2,
      PermissionAction.MESSAGE,
    );
    if (!authz.allowed) {
      throw new ForbiddenException(
        authz.reason ?? 'Cannot create conversation',
      );
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
    isArchived: boolean = false,
  ): Promise<CursorPaginatedResult<unknown>> {
    // Two-phase query: pinned conversations first, then rest by lastMessageAt
    // This ensures pinned conversations always appear at the top of the list.
    const conversations = await this.prisma.conversation.findMany({
      where: {
        members: { some: { userId, status: MemberStatus.ACTIVE, isArchived } },
        deletedAt: null,
        lastMessageAt: { not: null },
      },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { lastMessageAt: 'desc' },
      include: conversationWithRelations.include,
    });

    // Fetch pinned + mute/archive state for these conversations in one query
    const memberRows = await this.prisma.conversationMember.findMany({
      where: {
        userId,
        conversationId: { in: conversations.map((c) => c.id) },
      },
      select: {
        conversationId: true,
        isPinned: true,
        pinnedAt: true,
        isMuted: true,
        isArchived: true,
      },
    });
    const memberMap = new Map(memberRows.map((m) => [m.conversationId, m]));

    const blockMap = new Map<string, boolean>();
    const onlineMap = new Map<string, boolean>();

    const directOtherUserIds = Array.from(
      new Set(
        conversations
          .filter((c) => c.type === ConversationType.DIRECT)
          .map(
            (c) => c.members.find((m) => m.userId !== userId)?.userId ?? null,
          )
          .filter((id): id is string => !!id),
      ),
    );

    const userProfileMap = await this.getUserProfilesMap(directOtherUserIds);

    const [privacyMap, nameMap] = await Promise.all([
      this.privacyRead.getManySettings(directOtherUserIds),
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

    const result = CursorPaginationHelper.buildResult({
      items: conversations,
      limit,
      getCursor: (c) => c.id,
      mapToDto: (c) => {
        const memberState = memberMap.get(c.id);
        return {
          ...this.mapConversationResponse(
            c as ConversationWithRelations,
            userId,
            blockMap,
            onlineMap,
            nameMap,
            userProfileMap,
          ),
          isPinned: memberState?.isPinned ?? false,
          pinnedAt: memberState?.pinnedAt?.toISOString() ?? null,
          isMuted: memberState?.isMuted ?? false,
          isArchived: memberState?.isArchived ?? false,
        };
      },
    });

    // Sort pinned conversations to the top (stable sort: pinned by pinnedAt desc, then rest by lastMessageAt)
    result.data.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      if (a.isPinned && b.isPinned) {
        // Both pinned: newer pin first
        const aTime = a.pinnedAt ? new Date(a.pinnedAt).getTime() : 0;
        const bTime = b.pinnedAt ? new Date(b.pinnedAt).getTime() : 0;
        return bTime - aTime;
      }
      return 0; // Both unpinned: preserve original lastMessageAt order
    });

    return result;
  }

  private mapConversationResponse(
    conversation: ConversationWithRelations,
    currentUserId: string,
    blockMap: Map<string, boolean>,
    onlineMap: Map<string, boolean>,
    nameMap?: Map<string, string>,
    userProfileMap?: Map<string, UserProfile>,
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

      if (otherMember) {
        const otherProfile = userProfileMap?.get(otherMember.userId);
        // Display name priority: aliasName > phoneBookName > displayName
        name =
          nameMap?.get(otherMember.userId) ?? otherProfile?.displayName ?? name;
        avatar = otherProfile?.avatarUrl ?? avatar;
        otherUserId = otherMember.userId;

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

      memberCount: conversation.members.length,
      lastSeenAt: otherUserId
        ? (userProfileMap?.get(otherUserId)?.lastSeenAt ?? null)
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
      isPinned: currentUserMember?.isPinned ?? false,
      pinnedAt: currentUserMember?.pinnedAt?.toISOString() ?? null,
      isArchived: currentUserMember?.isArchived ?? false,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PIN / UNPIN CONVERSATION
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Pin a conversation for the current user.
   * Limited to MAX_PINNED_CONVERSATIONS per user.
   */
  async pinConversation(
    userId: string,
    conversationId: string,
  ): Promise<{ isPinned: boolean; pinnedAt: string }> {
    const member = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });

    if (!member || member.status !== MemberStatus.ACTIVE) {
      throw new BadRequestException('Not a member of this conversation');
    }

    if (member.isPinned) {
      return { isPinned: true, pinnedAt: member.pinnedAt!.toISOString() };
    }

    // Check pin limit
    const pinnedCount = await this.prisma.conversationMember.count({
      where: { userId, isPinned: true, status: MemberStatus.ACTIVE },
    });

    if (pinnedCount >= MAX_PINNED_CONVERSATIONS) {
      throw new BadRequestException(
        `Bạn chỉ có thể ghim tối đa ${MAX_PINNED_CONVERSATIONS} hội thoại`,
      );
    }

    const now = new Date();
    await this.prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { isPinned: true, pinnedAt: now },
    });

    this.eventEmitter.emit(
      'conversation.pinned',
      new ConversationPinnedEvent(conversationId, userId, now),
    );

    return { isPinned: true, pinnedAt: now.toISOString() };
  }

  /**
   * Unpin a conversation for the current user.
   */
  async unpinConversation(
    userId: string,
    conversationId: string,
  ): Promise<{ isPinned: boolean }> {
    const member = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });

    if (!member || member.status !== MemberStatus.ACTIVE) {
      throw new BadRequestException('Not a member of this conversation');
    }

    if (!member.isPinned) {
      return { isPinned: false };
    }

    await this.prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { isPinned: false, pinnedAt: null },
    });

    this.eventEmitter.emit(
      'conversation.unpinned',
      new ConversationUnpinnedEvent(conversationId, userId),
    );

    return { isPinned: false };
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
      if (otherMember) {
        const otherId = otherMember.userId;
        const [privacyMap, resolvedNames] = await Promise.all([
          this.privacyRead.getManySettings([otherId]),
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

    const profileMap = await this.getUserProfilesMap(
      conversation.type === ConversationType.DIRECT
        ? conversation.members
          .filter((m) => m.userId !== userId)
          .map((m) => m.userId)
        : [],
    );

    return this.mapConversationResponse(
      conversation as ConversationWithRelations,
      userId,
      blockMap,
      onlineMap,
      nameMap,
      profileMap,
    );
  }

  /**
   * E.2: Toggle mute/unmute a conversation for the current user.
   * Updates isMuted on ConversationMember.
   * Emits ConversationMutedEvent for cross-device socket sync.
   */
  async toggleMute(
    userId: string,
    conversationId: string,
    muted: boolean,
  ): Promise<{ conversationId: string; isMuted: boolean }> {
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

    this.eventEmitter.emit(
      'conversation.muted',
      new ConversationMutedEvent(conversationId, userId, muted),
    );

    return { conversationId, isMuted: muted };
  }

  /**
   * Toggle archive/unarchive a conversation for the current user.
   * Updates isArchived on ConversationMember.
   * If archiving a pinned conversation, auto-unpins it.
   * Emits ConversationArchivedEvent for cross-device socket sync.
   */
  async toggleArchive(
    userId: string,
    conversationId: string,
    archived: boolean,
  ): Promise<{ conversationId: string; isArchived: boolean }> {
    const member = await this.prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: { conversationId, userId },
      },
    });

    if (!member || member.status !== MemberStatus.ACTIVE) {
      throw new BadRequestException('Not a member of this conversation');
    }

    // Edge case: archive a pinned conversation → auto-unpin
    const updateData: {
      isArchived: boolean;
      isPinned?: boolean;
      pinnedAt?: null;
    } = {
      isArchived: archived,
    };
    if (archived && member.isPinned) {
      updateData.isPinned = false;
      updateData.pinnedAt = null;
    }

    await this.prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: updateData,
    });

    this.eventEmitter.emit(
      'conversation.archived',
      new ConversationArchivedEvent(conversationId, userId, archived),
    );

    return { conversationId, isArchived: archived };
  }

  /**
   * Get list of members for a conversation (for sender filter in search).
   * Only returns members if the requesting user is an active member.
   */
  async getConversationMembers(
    userId: string,
    conversationId: string,
    limit?: number,
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
          take: limit,
          select: {
            userId: true,
            role: true,
          },
          orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
        },
      },
    });

    if (!conversation) {
      throw new BadRequestException('Conversation not found');
    }

    // Batch resolve display names per viewer
    const memberIds = conversation.members.map((m) => m.userId);
    const profileMap = await this.getUserProfilesMap(memberIds);
    const nameMap = await this.displayNameResolver.batchResolve(
      userId,
      memberIds,
    );

    return conversation.members.map((m) => ({
      id: m.userId,
      displayName:
        nameMap.get(m.userId) ??
        profileMap.get(m.userId)?.displayName ??
        'Unknown User',
      avatarUrl: profileMap.get(m.userId)?.avatarUrl ?? null,
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
      orderBy: { lastMessageAt: { sort: 'desc', nulls: 'last' } },
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
          },
        },
      },
    });

    // Batch resolve all member display names across all groups
    const allOtherMemberIds = new Set<string>();
    for (const g of groups) {
      for (const m of g.members) {
        if (m.userId !== userId) {
          allOtherMemberIds.add(m.userId);
        }
      }
    }
    const profileMap = await this.getUserProfilesMap([...allOtherMemberIds]);
    const nameMap = await this.displayNameResolver.batchResolve(userId, [
      ...allOtherMemberIds,
    ]);

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
            (m: { userId: string }) =>
              nameMap.get(m.userId) ??
              profileMap.get(m.userId)?.displayName ??
              'Unknown User',
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

  // ═══════════════════════════════════════════════════════════════════════
  // PINNED MESSAGES (Phase 3)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Get full message data for all pinned messages in a conversation.
   * Any active member can view.
   */
  async getPinnedMessages(userId: string, conversationId: string) {
    // Verify active member
    const isMemberActive = await this.isMember(conversationId, userId);
    if (!isMemberActive) {
      throw new BadRequestException('Not a member of this conversation');
    }

    // Get pinned message IDs from conversation settings JSONB
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { settings: true },
    });

    const settings = (conversation?.settings as unknown as GroupSettings) || {};
    const pinnedMessageIds = settings.pinnedMessages || [];

    if (pinnedMessageIds.length === 0) {
      return [];
    }

    // Convert string IDs to BigInt for query
    const bigIntIds = pinnedMessageIds.map((id) => BigInt(id));

    // Fetch full message data
    const messages = await this.prisma.message.findMany({
      where: {
        id: { in: bigIntIds },
        conversationId,
      },
      select: {
        id: true,
        content: true,
        type: true,
        senderId: true,
        createdAt: true,
        deletedAt: true,
        deletedById: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Resolve display names for the viewer
    const senderIds = [
      ...new Set(messages.map((m) => m.senderId).filter(Boolean) as string[]),
    ];

    // [Phase 2.1 DECOUPLED]: Fetch media attachments manually
    const mediaAttachments = await this.prisma.mediaAttachment.findMany({
      where: {
        messageId: { in: messages.map((m) => m.id) },
        deletedAt: null,
      },
      select: {
        id: true,
        messageId: true,
        mediaType: true,
        originalName: true,
        thumbnailUrl: true,
      },
    });
    const mediaMap = new Map<string, any[]>();
    for (const media of mediaAttachments) {
      if (!media.messageId) continue;
      const msgIdStr = media.messageId.toString();
      if (!mediaMap.has(msgIdStr)) mediaMap.set(msgIdStr, []);
      mediaMap.get(msgIdStr)!.push(safeJSON(media));
    }

    const nameMap =
      senderIds.length > 0
        ? await this.displayNameResolver.batchResolve(userId, senderIds)
        : new Map<string, string>();
    const senderProfileMap = await this.getUserProfilesMap(senderIds);

    return messages.map((m) => ({
      id: m.id.toString(),
      content: m.deletedById ? null : m.content,
      type: m.type,
      senderId: m.senderId,
      createdAt: m.createdAt.toISOString(),
      deletedAt: m.deletedAt?.toISOString() ?? null,
      sender: m.senderId
        ? {
          id: m.senderId,
          displayName:
            nameMap.get(m.senderId) ??
            senderProfileMap.get(m.senderId)?.displayName ??
            'Unknown User',
          avatarUrl: senderProfileMap.get(m.senderId)?.avatarUrl ?? null,
        }
        : null,
      mediaAttachments: mediaMap.get(m.id.toString())?.slice(0, 1) || [],
    }));
  }
}
