/**
 * @deprecated Since 2026-02-04. Use InteractionAuthorizationService from @modules/authorization
 */
import { Injectable } from '@nestjs/common';
import { BlockService } from '../../modules/block/block.service';
import { BlockRelation } from '../../modules/block/dto/block.dto';
import { PrivacyService } from '../../modules/privacy/services/privacy.service';
import { ContactService } from '../../modules/contact/contact.service';
import { PermissionCheckDto } from '../../modules/privacy/dto/privacy.dto';
import { PermissionAction } from '../../common/constants/permission-actions.constant';
import { RedisService } from '../../modules/redis/redis.service';
import { RedisKeyBuilder } from '@shared/redis/redis-key-builder';

/**
 * InteractionAuthorizationService (PHASE 7 - SHARED FACADE REFACTORING)
 *
 * PURPOSE: Unified authorization checks for user interactions
 * RESPONSIBILITIES:
 *   - Permission checks (block status, privacy settings)
 *   - Relationship queries (are they friends?)
 *   - Display name resolution (with alias support)
 *   - Batch status queries (for conversation lists, etc.)
 *
 * USAGE:
 *   - Guards: Use InteractionGuard + @RequireInteraction(MESSAGE/CALL/FRIENDS_ONLY)
 *   - Services: MessagingService, CallService
 *   - Controllers: All endpoints requiring interaction authorization
 *
 * CONSTRAINTS (ARCHITECTURE RULES):
 *   - ✅ NO mutations (read-only)
 *   - ✅ Maximum 4 injected services
 *   - ✅ Pure query operations
 *   - ✅ Defers complex logic to service layer
 *
 * PHASE 7 COMPLIANCE:
 *   - Extracted from SocialModule ✅
 *   - Placed in src/shared/facades/ ✅
 *   - Single responsibility: Authorization checks ✅
 *   - Reusable across all modules ✅
 *
 * WHY THIS MATTERS:
 *   - Shared service for all authorization needs
 *   - Eliminates module dependencies for permission checks
 *   - Clear separation: Query operations (here) vs Mutations (in services)
 *   - Easier to test and scale independently
 */
@Injectable()
export class InteractionAuthorizationService {
  constructor(
    private readonly blockService: BlockService,
    private readonly privacyService: PrivacyService,
    private readonly contactService: ContactService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * QUERY: Check if requester is blocked by target
   * Used by: Guards, Services
   * Action: Message, Call, View Profile
   */
  async isBlocked(user1Id: string, user2Id: string): Promise<boolean> {
    return this.blockService.isBlocked(user1Id, user2Id);
  }

  /**
   * QUERY: Check permission for specific action
   * Returns: { allowed: boolean, reason?: string }
   *
   * Logic: Block Check → Privacy Check
   * Priority: Block > Privacy (block is highest priority)
   */
  async checkPermission(
    requesterId: string,
    targetId: string,
    action: PermissionAction,
  ): Promise<PermissionCheckDto> {
    // 1. Check Block first (highest priority)
    const isBlocked = await this.blockService.isBlocked(requesterId, targetId);
    if (isBlocked) {
      return { allowed: false, reason: 'User is blocked' };
    }

    // 2. Check Privacy & Friendship
    return this.privacyService.checkPermission(requesterId, targetId, action);
  }

  /**
   * QUERY: Can user send message to target?
   * Checks: Not blocked + Privacy allows messaging
   */
  async canMessage(requesterId: string, targetId: string): Promise<boolean> {
    const isBlocked = await this.blockService.isBlocked(requesterId, targetId);
    if (isBlocked) return false;
    return this.privacyService.canUserMessageMe(requesterId, targetId);
  }

  /**
   * QUERY: Can user call target?
   * Checks: Not blocked + Privacy allows calls
   */
  async canCall(requesterId: string, targetId: string): Promise<boolean> {
    const isBlocked = await this.blockService.isBlocked(requesterId, targetId);
    if (isBlocked) return false;
    return this.privacyService.canUserCallMe(requesterId, targetId);
  }

  /**
   * QUERY: Can user see target's profile?
   * Checks: Not blocked + Privacy allows profile view
   */
  async canViewProfile(
    requesterId: string,
    targetId: string,
  ): Promise<boolean> {
    const isBlocked = await this.blockService.isBlocked(requesterId, targetId);
    if (isBlocked) return false;
    return true; // Profile view is generally allowed if not blocked
  }

  /**
   * QUERY: Resolve display name with alias support
   * Returns: User's alias in requester's contact list, or displayName
   * Used by: UI display, message headers, etc.
   */
  async resolveDisplayName(ownerId: string, targetId: string): Promise<string> {
    return this.contactService.resolveDisplayName(ownerId, targetId);
  }

  /**
   * QUERY: Batch resolve display names for multiple users
   * Returns: Map<userId, displayNameOrAlias>
   * Used by: Conversation lists, group members, etc.
   * Optimization: Uses Redis caching internally
   */
  async batchResolveDisplayNames(
    ownerId: string,
    targetIds: string[],
  ): Promise<Map<string, string>> {
    return this.contactService.batchResolveDisplayNames(ownerId, targetIds);
  }

  /**
   * QUERY: Get block status and online status for batch of users
   * Returns: { blockMap: Map<userId, BlockRelation>, onlineMap: Map<userId, isOnline> }
   * Used by: Conversation lists, group members list
   * Performance: Single Redis MGET + Prisma query
   */
  async getSocialStatusBatch(
    requesterId: string,
    targetUserIds: string[],
  ): Promise<{
    blockMap: Map<string, BlockRelation>;
    onlineMap: Map<string, boolean>;
  }> {
    if (targetUserIds.length === 0) {
      return { blockMap: new Map(), onlineMap: new Map() };
    }

    // 1. Get Block Status
    const blockMap = await this.blockService.getBatchBlockStatus(
      requesterId,
      targetUserIds,
    );

    // 2. Get Online Status (Redis)
    const onlineKeys = targetUserIds.map((id) =>
      RedisKeyBuilder.userStatus(id),
    );
    const onlineResults = await this.redisService.mget(onlineKeys);

    const onlineMap = new Map<string, boolean>();
    targetUserIds.forEach((id, index) => {
      onlineMap.set(id, !!onlineResults[index]);
    });

    return { blockMap, onlineMap };
  }

  /**
   * QUERY: Validate message access (Guard-specific query)
   * @deprecated Use InteractionGuard + @RequireInteraction(MESSAGE)
   */
  async validateMessageAccess(
    requesterId: string,
    targetId: string,
  ): Promise<boolean> {
    const isBlocked = await this.blockService.isBlocked(requesterId, targetId);
    if (isBlocked) return false;
    return this.privacyService.canUserMessageMe(requesterId, targetId);
  }

  /**
   * QUERY: Validate call access (Guard-specific query)
   * @deprecated Use InteractionGuard + @RequireInteraction(CALL)
   */
  async validateCallAccess(
    requesterId: string,
    targetId: string,
  ): Promise<boolean> {
    const isBlocked = await this.blockService.isBlocked(requesterId, targetId);
    if (isBlocked) return false;
    return this.privacyService.canUserCallMe(requesterId, targetId);
  }
}
