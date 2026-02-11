import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  Inject,
  Logger,
} from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { RelationshipType } from '../utils/ranking.util';

// Phase A: Import cached services — eliminates duplicate block/privacy/friendship logic
import { InteractionAuthorizationService } from '@modules/authorization/services/interaction-authorization.service';
import type { IBlockChecker } from '@modules/block/services/block-checker.interface';
import { BLOCK_CHECKER } from '@modules/block/services/block-checker.interface';
import { PrivacyService } from '@modules/privacy/services/privacy.service';
/**
 * SearchValidationService (Phase A: Refactored)
 *
 * SLIM version — delegates block/privacy/friendship checks to cached services.
 * Only retains search-specific validation logic.
 *
 * BEFORE: 414 lines, direct Prisma queries for everything, no cache
 * AFTER: ~260 lines, delegates to cached services with batch support
 *
 * Delegations:
 * - Block check → IBlockChecker (Redis read-through cache)
 * - Privacy check → PrivacyService (Redis cached, batch MGET)
 * - Combined auth → InteractionAuthorizationService (orchestrates cached services)
 */
@Injectable()
export class SearchValidationService {
  private readonly logger = new Logger(SearchValidationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly interactionAuth: InteractionAuthorizationService,
    @Inject(BLOCK_CHECKER) private readonly blockChecker: IBlockChecker,
    private readonly privacyService: PrivacyService,
  ) { }

  /**
   * Validate user has ACTIVE membership in conversation
   * Required for all message searches
   */
  async validateConversationAccess(
    userId: string,
    conversationId: string,
  ): Promise<boolean> {
    const membership = await this.prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId,
        },
      },
      select: {
        status: true,
      },
    });

    if (!membership) {
      throw new ForbiddenException(
        `User ${userId} is not a member of conversation ${conversationId}`,
      );
    }

    if (membership.status !== 'ACTIVE') {
      throw new ForbiddenException(
        `User ${userId} is not an active member of conversation ${conversationId}`,
      );
    }

    return true;
  }

  // ============================================================================
  // DELEGATED: Block / Privacy / Friendship (to cached services)
  // ============================================================================

  /**
   * Check if user A has blocked or is blocked by user B (bidirectional).
   * Delegates to IBlockChecker with Redis read-through cache.
   * Returns true if NOT blocked, false if blocked.
   */
  async validateNotBlocked(userId1: string, userId2: string): Promise<boolean> {
    const isBlocked = await this.blockChecker.isBlocked(userId1, userId2);
    return !isBlocked;
  }

  /**
   * Validate user can see target user's profile based on PrivacySettings.
   * Delegates to InteractionAuthorizationService (cached block + privacy + friendship).
   * Returns true if allowed to see, false if blocked by privacy.
   */
  async validatePrivacySettings(
    searcherId: string,
    targetUserId: string,
  ): Promise<boolean> {
    return this.interactionAuth.canViewProfile(searcherId, targetUserId);
  }

  /**
   * Get friendship status between two users
   */
  async getFriendshipStatus(
    userId1: string,
    userId2: string,
  ): Promise<RelationshipType> {
    // Ensure consistent order (smaller ID first)
    const [u1, u2] =
      userId1 < userId2 ? [userId1, userId2] : [userId2, userId1];

    const friendship = await this.prisma.friendship.findUnique({
      where: {
        user1Id_user2Id: {
          user1Id: u1,
          user2Id: u2,
        },
      },
      select: { status: true },
    });

    if (!friendship) return RelationshipType.NONE;

    switch (friendship.status) {
      case 'ACCEPTED':
        return RelationshipType.FRIEND;
      case 'PENDING':
        return RelationshipType.REQUEST_PENDING;
      case 'DECLINED':
        return RelationshipType.NONE;
      default:
        return RelationshipType.NONE;
    }
  }

  /**
   * Check if user is blocked (bidirectional check).
   * Delegates to IBlockChecker (Redis cached).
   */
  async isUserBlocked(userId1: string, userId2: string): Promise<boolean> {
    return this.blockChecker.isBlocked(userId1, userId2);
  }

  /**
   * Validate user exists and is ACTIVE
   */
  async validateUserExists(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        status: 'ACTIVE',
      },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException(`User ${userId} not found or inactive`);
    }

    return true;
  }

  /**
   * Validate conversation exists and belongs to correct type
   */
  async validateConversationExists(
    conversationId: string,
    type?: 'DIRECT' | 'GROUP',
  ): Promise<boolean> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, type: true },
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation ${conversationId} not found`);
    }

    if (type && conversation.type !== type) {
      throw new ForbiddenException(`Conversation is not of type ${type}`);
    }

    return true;
  }

  /**
   * Get user's active conversations (for global search scope)
   * Returns array of conversation IDs where user is ACTIVE
   */
  async getActiveConversationIds(userId: string): Promise<string[]> {
    const memberships = await this.prisma.conversationMember.findMany({
      where: {
        userId,
        status: 'ACTIVE',
        isArchived: false, // Optional: exclude archived
      },
      select: { conversationId: true },
      take: 10000, // Safety limit
    });

    return memberships.map((m) => m.conversationId);
  }

  /**
   * Validate search keyword (not excessively long, not empty)
   */
  validateKeyword(keyword: string, minLength = 3, maxLength = 255): boolean {
    const trimmed = keyword?.trim() ?? '';
    if (!trimmed || trimmed.length === 0) {
      throw new Error('Search keyword cannot be empty');
    }

    if (trimmed.length < minLength) {
      throw new Error(
        `Search keyword must be at least ${minLength} characters`,
      );
    }

    if (trimmed.length > maxLength) {
      throw new Error(`Search keyword exceeds ${maxLength} characters`);
    }

    return true;
  }

  /**
   * Sanitize search keyword (prevent SQL injection via raw SQL)
   * Note: Should use parameterized queries, but this is extra safety
   */
  sanitizeKeyword(keyword: string): string {
    return keyword
      .toLowerCase()
      .trim()
      .replace(/[;'"\\]/g, '') // Remove dangerous characters
      .substring(0, 255); // Limit length
  }

  /**
   * Check if user can message target user.
   * Delegates to InteractionAuthorizationService (cached).
   */
  async canUserMessage(
    senderId: string,
    recipientId: string,
  ): Promise<boolean> {
    return this.interactionAuth.canMessage(senderId, recipientId);
  }

  /**
   * Check if searcher can see target user's online status.
   * Delegates to PrivacyService (cached) + BlockChecker (cached).
   * Note: showOnlineStatus is boolean in schema (true = everyone, false = contacts only).
   */
  async canSeeOnlineStatus(
    searcherId: string,
    targetUserId: string,
  ): Promise<boolean> {
    // Block check (Redis cached)
    const isBlocked = await this.blockChecker.isBlocked(
      searcherId,
      targetUserId,
    );
    if (isBlocked) return false;

    // Get target's privacy settings (Redis cached)
    const settings = await this.privacyService.getSettings(targetUserId);

    // showOnlineStatus: true = everyone can see, false = contacts only
    if (settings.showOnlineStatus) return true;

    // Contacts only — check friendship
    const [u1, u2] =
      searcherId < targetUserId
        ? [searcherId, targetUserId]
        : [targetUserId, searcherId];

    const friendship = await this.prisma.friendship.findUnique({
      where: { user1Id_user2Id: { user1Id: u1, user2Id: u2 } },
      select: { status: true },
    });

    return friendship?.status === 'ACCEPTED';
  }

  /**
   * Get full privacy context for a user pair.
   * Phase A: Delegates to cached services instead of 4 parallel Prisma queries.
   */
  async getPrivacyContext(
    searcherId: string,
    targetUserId: string,
  ): Promise<{
    canViewProfile: boolean;
    canMessage: boolean;
    canSeeOnlineStatus: boolean;
    isBlocked: boolean;
    friendshipStatus: RelationshipType;
  }> {
    // 1. Block check (Redis cached — single O(1) lookup)
    const isBlocked = await this.blockChecker.isBlocked(
      searcherId,
      targetUserId,
    );

    if (isBlocked) {
      return {
        canViewProfile: false,
        canMessage: false,
        canSeeOnlineStatus: false,
        isBlocked: true,
        friendshipStatus: RelationshipType.NONE,
      };
    }

    // 2. Parallel cached checks via InteractionAuthorizationService
    const [canViewProfile, canMessage, canSeeOnline, friendshipStatus] =
      await Promise.all([
        this.interactionAuth.canViewProfile(searcherId, targetUserId),
        this.interactionAuth.canMessage(searcherId, targetUserId),
        this.canSeeOnlineStatus(searcherId, targetUserId),
        this.getFriendshipStatus(searcherId, targetUserId),
      ]);

    return {
      canViewProfile,
      canMessage,
      canSeeOnlineStatus: canSeeOnline,
      isBlocked: false,
      friendshipStatus,
    };
  }

  /**
   * Batch get privacy contexts for multiple target users.
   * Phase A: Uses PrivacyService.getManySettings() for batch Redis MGET.
   * Eliminates N+1×4 problem in contact search.
   */
  async getBatchPrivacyContexts(
    searcherId: string,
    targetUserIds: string[],
  ): Promise<
    Map<
      string,
      {
        canViewProfile: boolean;
        canMessage: boolean;
        canSeeOnlineStatus: boolean;
        isBlocked: boolean;
        friendshipStatus: RelationshipType;
      }
    >
  > {
    const result = new Map<
      string,
      {
        canViewProfile: boolean;
        canMessage: boolean;
        canSeeOnlineStatus: boolean;
        isBlocked: boolean;
        friendshipStatus: RelationshipType;
      }
    >();

    if (targetUserIds.length === 0) return result;

    // 1. Batch block check (each is O(1) Redis lookup via IBlockChecker)
    const blockedMap = new Map<string, boolean>();
    await Promise.all(
      targetUserIds.map(async (targetId) => {
        const isBlocked = await this.blockChecker.isBlocked(
          searcherId,
          targetId,
        );
        blockedMap.set(targetId, isBlocked);
      }),
    );

    // Set blocked users immediately
    for (const targetId of targetUserIds) {
      if (blockedMap.get(targetId)) {
        result.set(targetId, {
          canViewProfile: false,
          canMessage: false,
          canSeeOnlineStatus: false,
          isBlocked: true,
          friendshipStatus: RelationshipType.NONE,
        });
      }
    }

    const nonBlockedIds = targetUserIds.filter((id) => !blockedMap.get(id));
    if (nonBlockedIds.length === 0) return result;

    // 2. Batch privacy settings via PrivacyService.getManySettings() (Redis MGET)
    const privacyMap = await this.privacyService.getManySettings(nonBlockedIds);

    // 3. Batch friendship lookups (single Prisma query)
    const friendshipMap = await this.batchGetFriendships(
      searcherId,
      nonBlockedIds,
    );

    // 4. Compute context for each non-blocked user
    for (const targetId of nonBlockedIds) {
      const settings = privacyMap.get(targetId);
      const friendship = friendshipMap.get(targetId) ?? RelationshipType.NONE;
      const isFriend = friendship === RelationshipType.FRIEND;

      // Profile: showProfile is PrivacyLevel string ('EVERYONE' | 'CONTACTS')
      const showProfile = settings?.showProfile ?? 'CONTACTS';
      const canViewProfile =
        showProfile === 'EVERYONE' || (showProfile === 'CONTACTS' && isFriend);

      // Message: whoCanMessageMe is PrivacyLevel string
      const whoCanMessage = settings?.whoCanMessageMe ?? 'EVERYONE';
      const canMessage =
        whoCanMessage === 'EVERYONE' ||
        (whoCanMessage === 'CONTACTS' && isFriend);

      result.set(targetId, {
        canViewProfile,
        canMessage,
        canSeeOnlineStatus: (settings?.showOnlineStatus ?? true) || isFriend,
        isBlocked: false,
        friendshipStatus: friendship,
      });
    }

    return result;
  }

  // ============================================================================
  // PRIVATE: Batch helpers
  // ============================================================================

  /**
   * Batch fetch friendship statuses for multiple users.
   * Single Prisma query → Map for O(1) lookup.
   */
  private async batchGetFriendships(
    userId: string,
    targetUserIds: string[],
  ): Promise<Map<string, RelationshipType>> {
    if (targetUserIds.length === 0) return new Map();

    const friendships = await this.prisma.friendship.findMany({
      where: {
        OR: [
          { user1Id: userId, user2Id: { in: targetUserIds } },
          { user1Id: { in: targetUserIds }, user2Id: userId },
        ],
      },
      select: { user1Id: true, user2Id: true, status: true },
    });

    const map = new Map<string, RelationshipType>();

    for (const f of friendships) {
      const targetId = f.user1Id === userId ? f.user2Id : f.user1Id;
      switch (f.status) {
        case 'ACCEPTED':
          map.set(targetId, RelationshipType.FRIEND);
          break;
        case 'PENDING':
          map.set(targetId, RelationshipType.REQUEST_PENDING);
          break;
        default:
          map.set(targetId, RelationshipType.NONE);
      }
    }

    // Fill NONE for users without friendship record
    for (const id of targetUserIds) {
      if (!map.has(id)) {
        map.set(id, RelationshipType.NONE);
      }
    }

    return map;
  }
}
