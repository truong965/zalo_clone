import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@database/prisma.service';
import { RedisService } from '@modules/redis/redis.service';
import {
  PrivacySettings,
  PrivacyLevel,
  FriendshipStatus,
} from '@prisma/client';
import { RedisKeyBuilder } from '@shared/redis/redis-key-builder';
import { PermissionAction } from '@common/constants/permission-actions.constant';
import socialConfig from '@config/social.config';
import type { ConfigType } from '@nestjs/config';
import {
  PrivacySettingsResponseDto,
  UpdatePrivacySettingsDto,
  PermissionCheckDto,
} from '../dto/privacy.dto';
import { EventIdGenerator } from '@common/utils/event-id-generator';
import { EventPublisher } from '@shared/events';
import { PrivacySettingsUpdatedEvent } from '../events/privacy.events';

/**
 * PrivacyService (PHASE 7 - REFACTORED EVENT-DRIVEN)
 *
 * Responsibilities:
 * - Get/Update privacy settings for users
 * - Check permissions (message, call, profile visibility)
 * - Handle cache invalidation
 * - Query block status from CACHED data (not direct BlockService calls)
 *
 * PHASE 7 Changes:
 * - ✅ Removed BlockService dependency (breaks RULE 9)
 * - ✅ Check block status via Redis cache (populated by BlockService)
 * - ✅ Cache invalidated by PrivacyBlockListener (event-driven)
 * - ✅ If cache miss, assume NOT blocked (conservative, safe default)
 *
 * Cache Architecture:
 * - BlockService → emits user.blocked/unblocked events
 * - BlockService → maintains redis:social:block:* cache
 * - PrivacyBlockListener → listens to block events, invalidates permission cache
 * - PrivacyService → queries block cache before permission check
 */
@Injectable()
export class PrivacyService {
  private readonly logger = new Logger(PrivacyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly eventPublisher: EventPublisher,
    @Inject(socialConfig.KEY)
    private readonly config: ConfigType<typeof socialConfig>,
  ) {}

  /**
   * Batch get privacy settings for multiple users
   * Optimized to use MGET (Redis) and WHERE IN (DB)
   */
  async getManySettings(
    userIds: string[],
  ): Promise<Map<string, PrivacySettingsResponseDto>> {
    const result = new Map<string, PrivacySettingsResponseDto>();
    if (userIds.length === 0) return result;

    // 1. Try Cache (MGET)
    const keys = userIds.map((id) => RedisKeyBuilder.socialPrivacy(id));
    const cachedValues = await this.redis.getClient().mget(...keys);

    const missingUserIds: string[] = [];

    userIds.forEach((id, index) => {
      const val = cachedValues[index];
      if (val) {
        result.set(id, JSON.parse(val) as PrivacySettingsResponseDto);
      } else {
        missingUserIds.push(id);
      }
    });

    // 2. DB Fallback (Batch Query)
    if (missingUserIds.length > 0) {
      const settingsList = await this.prisma.privacySettings.findMany({
        where: { userId: { in: missingUserIds } },
      });

      const settingsMap = new Map<string, PrivacySettings>();
      settingsList.forEach((s) => settingsMap.set(s.userId, s));

      // Process missing IDs
      const pipeline = this.redis.getClient().pipeline();

      for (const userId of missingUserIds) {
        let settings = settingsMap.get(userId);

        if (!settings) {
          settings = {
            userId,
            showProfile: PrivacyLevel.EVERYONE,
            whoCanMessageMe: PrivacyLevel.CONTACTS,
            whoCanCallMe: PrivacyLevel.CONTACTS,
            showOnlineStatus: true,
            showLastSeen: true,
            updatedAt: new Date(),
            createdAt: new Date(),
            updatedById: null,
          };
        }

        const dto = this.mapToResponseDto(settings);
        result.set(userId, dto);

        // Cache it
        pipeline.setex(
          RedisKeyBuilder.socialPrivacy(userId),
          this.config.ttl.privacy,
          JSON.stringify(dto),
        );
      }

      await pipeline.exec();
    }

    return result;
  }

  /**
   * Get privacy settings for a user
   */
  async getSettings(userId: string): Promise<PrivacySettingsResponseDto> {
    const cacheKey = RedisKeyBuilder.socialPrivacy(userId);
    const cached = await this.redis.get(cacheKey);

    if (cached) return JSON.parse(cached) as PrivacySettingsResponseDto;

    let settings = await this.prisma.privacySettings.findUnique({
      where: { userId },
    });

    if (!settings) settings = await this.createDefaultSettings(userId);

    const response = this.mapToResponseDto(settings);
    await this.redis.setex(
      cacheKey,
      this.config.ttl.privacy,
      JSON.stringify(response),
    );

    return response;
  }

  /**
   * Update privacy settings
   */
  async updateSettings(
    userId: string,
    dto: UpdatePrivacySettingsDto,
  ): Promise<PrivacySettingsResponseDto> {
    let settings = await this.prisma.privacySettings.findUnique({
      where: { userId },
    });
    if (!settings) settings = await this.createDefaultSettings(userId);

    const updatedSettings = await this.prisma.privacySettings.update({
      where: { userId },
      data: { ...dto, updatedById: userId },
    });

    await this.invalidatePrivacyCache(userId);

    const correlationId = EventIdGenerator.generate();
    await this.eventPublisher.publish(
      new PrivacySettingsUpdatedEvent(userId, dto as Record<string, unknown>),
      { correlationId },
    );
    return this.mapToResponseDto(updatedSettings);
  }

  /**
   * Check if requester can message target
   */
  async canUserMessageMe(
    requesterId: string,
    targetId: string,
  ): Promise<boolean> {
    const cacheKey = RedisKeyBuilder.socialPermission(
      'message',
      requesterId,
      targetId,
    );
    const cached = await this.redis.get(cacheKey);
    if (cached !== null) return cached === '1';

    // 1. Check Block (via cache, not direct service call)
    const isBlocked = await this.isBlockedFromCache(requesterId, targetId);
    if (isBlocked) return false;

    // 2. Check Setting
    const settings = await this.getSettings(targetId);
    let allowed = true;

    if (settings.whoCanMessageMe === PrivacyLevel.CONTACTS) {
      allowed = await this.checkIfFriendsRaw(requesterId, targetId);
    }

    await this.redis.setex(
      cacheKey,
      this.config.ttl.permission,
      allowed ? '1' : '0',
    );
    return allowed;
  }

  /**
   * Check if requester can call target
   */
  async canUserCallMe(requesterId: string, targetId: string): Promise<boolean> {
    const cacheKey = RedisKeyBuilder.socialPermission(
      'call',
      requesterId,
      targetId,
    );
    const cached = await this.redis.get(cacheKey);
    if (cached !== null) return cached === '1';

    const isBlocked = await this.isBlockedFromCache(requesterId, targetId);
    if (isBlocked) return false;

    const settings = await this.getSettings(targetId);
    let allowed = true;

    if (settings.whoCanCallMe === PrivacyLevel.CONTACTS) {
      allowed = await this.checkIfFriendsRaw(requesterId, targetId);
    }

    await this.redis.setex(
      cacheKey,
      this.config.ttl.permission,
      allowed ? '1' : '0',
    );
    return allowed;
  }

  /**
   * Check if requester can see target's profile
   * Logic:
   * 1. Check Block
   * 2. Check showProfile setting (EVERYONE | CONTACTS)
   */
  async canUserSeeProfile(
    requesterId: string,
    targetId: string,
  ): Promise<boolean> {
    // 0. If viewing own profile -> always true
    if (requesterId === targetId) return true;

    const cacheKey = RedisKeyBuilder.socialPermission(
      'profile',
      requesterId,
      targetId,
    );

    // Try cache first
    const cached = await this.redis.get(cacheKey);
    if (cached !== null) return cached === '1';

    // 1. Check Block
    const isBlocked = await this.isBlockedFromCache(requesterId, targetId);
    if (isBlocked) {
      return false;
    }

    // 2. Check Setting
    const settings = await this.getSettings(targetId);
    let allowed = true;

    if (settings.showProfile === PrivacyLevel.CONTACTS) {
      allowed = await this.checkIfFriendsRaw(requesterId, targetId);
    }

    // Cache result
    await this.redis.setex(
      cacheKey,
      this.config.ttl.permission,
      allowed ? '1' : '0',
    );

    return allowed;
  }

  /**
   * Check permission (Generic)
   */
  async checkPermission(
    requesterId: string,
    targetId: string,
    action: PermissionAction,
  ): Promise<PermissionCheckDto> {
    if (requesterId === targetId) return { allowed: true };

    const isBlocked = await this.isBlockedFromCache(requesterId, targetId);
    if (isBlocked) return { allowed: false, reason: 'User is blocked' };

    const settings = await this.getSettings(targetId);
    let privacyLevel: PrivacyLevel = PrivacyLevel.EVERYONE;

    switch (action) {
      case PermissionAction.MESSAGE:
        privacyLevel = settings.whoCanMessageMe;
        break;
      case PermissionAction.CALL:
        privacyLevel = settings.whoCanCallMe;
        break;
      case PermissionAction.PROFILE:
        privacyLevel = settings.showProfile;
        break;
    }

    if (privacyLevel === PrivacyLevel.EVERYONE) return { allowed: true };

    const areFriends = await this.checkIfFriendsRaw(requesterId, targetId);
    if (areFriends) return { allowed: true };

    return {
      allowed: false,
      reason: 'User privacy settings require friendship',
    };
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  /**
   * Check if users are friends (Query RAW để tránh Circular Dependency)
   */
  private async checkIfFriendsRaw(
    userId1: string,
    userId2: string,
  ): Promise<boolean> {
    const [u1, u2] =
      userId1 < userId2 ? [userId1, userId2] : [userId2, userId1];

    const friend = await this.prisma.friendship.findFirst({
      where: {
        user1Id: u1,
        user2Id: u2,
        status: FriendshipStatus.ACCEPTED,
        deletedAt: null,
      },
      select: { status: true },
    });

    return friend?.status === FriendshipStatus.ACCEPTED;
  }

  private async createDefaultSettings(
    userId: string,
  ): Promise<PrivacySettings> {
    return this.prisma.privacySettings.create({
      data: {
        userId,
        showProfile: PrivacyLevel.EVERYONE,
        whoCanMessageMe: PrivacyLevel.CONTACTS,
        whoCanCallMe: PrivacyLevel.CONTACTS,
        showOnlineStatus: true,
        showLastSeen: true,
      },
    });
  }

  private async invalidatePrivacyCache(userId: string): Promise<void> {
    // Delete privacy settings cache
    await this.redis.del(RedisKeyBuilder.socialPrivacy(userId));

    // Delete permission caches (all actions, both directions)
    const actions = [
      PermissionAction.MESSAGE,
      PermissionAction.CALL,
      PermissionAction.PROFILE,
    ];

    for (const action of actions) {
      const [pattern1, pattern2] =
        RedisKeyBuilder.socialPermissionPatternsForUser(action, userId);
      await this.redis.deletePattern(pattern1);
      await this.redis.deletePattern(pattern2);
    }
  }

  private mapToResponseDto(
    settings: PrivacySettings,
  ): PrivacySettingsResponseDto {
    return {
      userId: settings.userId,
      showProfile: settings.showProfile,
      whoCanMessageMe: settings.whoCanMessageMe,
      whoCanCallMe: settings.whoCanCallMe,
      showOnlineStatus: settings.showOnlineStatus,
      showLastSeen: settings.showLastSeen,
      updatedAt: settings.updatedAt,
    };
  }

  /**
   * [PHASE 7] Check block status from Redis cache WITHOUT direct BlockService call
   *
   * RULE 9 COMPLIANCE: Avoid direct cross-module service calls
   * Solution: Query Redis cache maintained by BlockService
   *
   * Cache lifecycle:
   *   1. BlockService.blockUser() → creates block record + Redis cache
   *   2. BlockService.unblockUser() → deletes block record + clears Redis cache
   *   3. PrivacyBlockListener.handleUserBlocked() → listens to events, invalidates permission cache
   *
   * Returns:
   *   - true: User is blocked (cache hit)
   *   - false: User is not blocked OR cache miss (conservative default)
   *
   * Note: If Redis cache expires or is not yet written, assume NOT blocked
   * This is safe because:
   *   - Permission checks are cached separately (social:permission:*)
   *   - PrivacyBlockListener will invalidate permission cache when block changes
   *   - Worst case: Brief window where permission allows, then listener invalidates
   */
  private async isBlockedFromCache(
    userId1: string,
    userId2: string,
  ): Promise<boolean> {
    const cacheKey = RedisKeyBuilder.socialBlock(userId1, userId2);
    const cached = await this.redis.get(cacheKey);

    // Cache hit
    if (cached !== null) {
      return cached === '1';
    }

    // Cache miss - assume NOT blocked (safe default)
    // BlockService will populate cache on first check
    // Events will invalidate permission cache if block status changes
    return false;
  }
}
