// src/modules/social/services/privacy.service.ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  PrivacySettings,
  PrivacyLevel,
  FriendshipStatus,
} from '@prisma/client';
import { RedisKeyBuilder } from '../../../common/constants/redis-keys.constant';
import { BlockService } from '../../block/block.service'; // [IMPORTANT] Inject Service tầng dưới
import socialConfig from 'src/config/social.config';
import type { ConfigType } from '@nestjs/config';
import {
  PrivacySettingsResponseDto,
  UpdatePrivacySettingsDto,
  PermissionCheckDto,
} from '../dto/privacy.dto';

@Injectable()
export class PrivacyService {
  private readonly logger = new Logger(PrivacyService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly eventEmitter: EventEmitter2,
    private readonly blockService: BlockService,
    @Inject(socialConfig.KEY)
    private readonly config: ConfigType<typeof socialConfig>,
  ) {}

  /**
   * [NEW] Batch get privacy settings for multiple users
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
        result.set(id, JSON.parse(val));
      } else {
        missingUserIds.push(id);
      }
    });

    // 2. DB Fallback (Batch Query)
    if (missingUserIds.length > 0) {
      const settingsList = await this.prisma.privacySettings.findMany({
        where: { userId: { in: missingUserIds } },
      });

      // Map DB results
      const settingsMap = new Map<string, PrivacySettings>();
      settingsList.forEach((s) => settingsMap.set(s.userId, s));

      // Process missing IDs
      const pipeline = this.redis.getClient().pipeline();

      for (const userId of missingUserIds) {
        let settings = settingsMap.get(userId);

        // If not exists in DB, create default (in memory for response, optionally save to DB later or lazily)
        // Note: For batch ops, strictly creating defaults for all might be heavy.
        // Here we just map to default DTO without creating record to be fast.
        if (!settings) {
          // Create a transient default object
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
    this.eventEmitter.emit('privacy.updated', { userId, settings: dto });
    return this.mapToResponseDto(updatedSettings);
  }

  /**
   * Check if requester can message target
   * (Logic trung tâm được Facade gọi hoặc các module khác gọi)
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

    // 1. Check Block (Dùng Service chuẩn, không tự query)
    const isBlocked = await this.blockService.isBlocked(requesterId, targetId);
    if (isBlocked) return false;

    // 2. Check Setting
    const settings = await this.getSettings(targetId);
    let allowed = true;

    if (settings.whoCanMessageMe === PrivacyLevel.CONTACTS) {
      // 3. Check Friend (Query trực tiếp DB để tránh vòng lặp với FriendshipService)
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

    const isBlocked = await this.blockService.isBlocked(requesterId, targetId);
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
   * [NEW] Check if requester can see target's profile
   * Logic:
   * 1. Check Block
   * 2. Check showProfile setting (EVERYONE | CONTACTS)
   */
  async canUserSeeProfile(
    requesterId: string,
    targetId: string,
  ): Promise<boolean> {
    // 0. Nếu tự xem profile mình -> luôn true
    if (requesterId === targetId) return true;

    const cacheKey = RedisKeyBuilder.socialPermission(
      'profile', // Action type
      requesterId,
      targetId,
    );

    // Try cache first
    const cached = await this.redis.get(cacheKey);
    if (cached !== null) return cached === '1';

    // 1. Check Block
    const isBlocked = await this.blockService.isBlocked(requesterId, targetId);
    if (isBlocked) {
      // Nếu bị chặn, không cho xem profile (hoặc chỉ xem limited info tùy business)
      // Ở đây ta return false (chặn hoàn toàn)
      return false;
    }

    // 2. Check Setting
    const settings = await this.getSettings(targetId);
    let allowed = true;

    // Logic kiểm tra Privacy Level
    if (settings.showProfile === PrivacyLevel.CONTACTS) {
      // 3. Check Friend
      allowed = await this.checkIfFriendsRaw(requesterId, targetId);
    }
    // Nếu là EVERYONE thì allowed mặc định là true

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
    action: 'message' | 'call' | 'profile',
  ): Promise<PermissionCheckDto> {
    if (requesterId === targetId) return { allowed: true };

    const isBlocked = await this.blockService.isBlocked(requesterId, targetId);
    if (isBlocked) return { allowed: false, reason: 'User is blocked' };

    const settings = await this.getSettings(targetId);
    let privacyLevel: PrivacyLevel = PrivacyLevel.EVERYONE;

    switch (action) {
      case 'message':
        privacyLevel = settings.whoCanMessageMe;
        break;
      case 'call':
        privacyLevel = settings.whoCanCallMe;
        break;
      case 'profile':
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
   * [CLEANUP] Đã xóa hàm checkIfBlocked nội bộ.
   */

  /**
   * Check if users are friends (Query RAW để tránh Circular Dependency)
   * Thay vì gọi FriendshipService.areFriends(), ta tự query nhẹ.
   */
  private async checkIfFriendsRaw(
    userId1: string,
    userId2: string,
  ): Promise<boolean> {
    const [u1, u2] =
      userId1 < userId2 ? [userId1, userId2] : [userId2, userId1];

    // Query trực tiếp vào bảng Friendship
    // Vì PrivacyService chỉ cần biết YES/NO, không cần logic phức tạp của FriendshipService
    const friend = await this.prisma.friendship.findFirst({
      where: {
        user1Id: u1,
        user2Id: u2,
        status: FriendshipStatus.ACCEPTED, // ← Add this for index usage
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
    // 1. Delete privacy settings cache
    await this.redis.del(RedisKeyBuilder.socialPrivacy(userId));

    const keys = [
      RedisKeyBuilder.socialPrivacy(userId),
      RedisKeyBuilder.socialPermission('message', '*', userId), // Pattern delete logic cần xử lý bên RedisService
      RedisKeyBuilder.socialPermission('call', '*', userId),
      RedisKeyBuilder.socialPermission('profile', '*', userId),
    ];

    // ... logic delete keys (giả sử RedisService có hàm delete pattern hoặc loop)
    // await this.redis.del(...keys);
    // Với pattern, bạn cần scan keys như trong code cũ của bạn
    for (const pattern of keys) {
      await this.redis.deletePattern(pattern);
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
}
