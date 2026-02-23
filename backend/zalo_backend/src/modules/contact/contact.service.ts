/**
 * ContactService - Shadow Graph Management
 *
 * Responsibilities:
 * - Sync phone contacts (hash-based matching)
 * - Manage alias names (user-defined contact names)
 * - Name resolution (priority: alias > displayName)
 * - Contact discovery (suggest friends from contacts)
 *
 * Security:
 * - Client-side phone hashing (SHA-256)
 * - Server never stores raw phone numbers of non-users
 * - Privacy-aware contact matching
 * - Rate limiting on sync requests
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { RedisService } from 'src/modules/redis/redis.service';
import { EventPublisher } from '@shared/events';
import { ContactSource, Prisma, UserContact, UserStatus } from '@prisma/client';
import {
  ContactAliasUpdatedEvent,
  ContactRemovedEvent,
  ContactsSyncedEvent,
} from './events/contact.events';
import { SyncContactsDto, ContactItemDto, GetContactsQueryDto } from './dto/contact.dto';
import { SelfActionException, RateLimitException } from 'src/shared/errors';
import { FriendshipService } from '../friendship/service/friendship.service';
import { PrivacyService } from 'src/modules/privacy/services/privacy.service';
import * as crypto from 'crypto';
import { RedisKeyBuilder } from '@shared/redis/redis-key-builder';
import socialConfig from 'src/config/social.config';
import type { ConfigType } from '@nestjs/config';
import { CursorPaginatedResult } from 'src/common/interfaces/paginated-result.interface';
import { ContactResponseDto } from './dto/contact.dto';
import { CursorPaginationHelper } from '@common/utils/cursor-pagination.helper';
type MatchedUser = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  phoneNumberHash: string | null;
  lastSeenAt: Date | null;
};
@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly eventPublisher: EventPublisher,
    private readonly friendshipService: FriendshipService,
    private readonly privacyService: PrivacyService,
    @Inject(socialConfig.KEY)
    private readonly config: ConfigType<typeof socialConfig>,
  ) { }

  /**
   * Sync contacts from phone
   *
   * Flow:
   * 1. Validate rate limits
   * 2. Hash phone numbers (should be done client-side, but verify)
   * 3. Match against existing users
   * 4. Filter by privacy settings
   * 5. Save/update UserContact records
   * 6. Return matched users
   */
  async syncContacts(
    ownerId: string,
    dto: SyncContactsDto,
  ): Promise<ContactResponseDto[]> {
    const startTime = Date.now();
    // Validation 1: Rate limiting
    // Thực hiện tăng counter trước, nếu vượt quá thì chặn ngay lập tức.
    // Điều này ngăn chặn race condition khi nhiều request đến cùng lúc
    await this.checkAndIncrementRateLimit(ownerId);

    // Validation 2: Max contacts per request
    const maxSize = this.config.limits.contactSync.maxPerRequest;
    if (dto.contacts.length > maxSize) {
      throw new RateLimitException(
        `Cannot sync more than ${maxSize} contacts at once`,
      );
    }

    // 3. Hash & Normalize (Prepare Data)
    const { phoneHashes, phoneBookNameMap } = this.processInputContacts(dto.contacts); // Extract phone numbers and hash them

    // Find matching users (active only)
    const matchedUsers = await this.findUsersByPhoneHash(phoneHashes, ownerId);

    // Filter by privacy settings (who can find me)
    const visibleUsers = await this.filterByPrivacy(ownerId, matchedUsers);

    // [ACTION 5.1] Thay thế Transaction lớn bằng Bulk Insert + Batch Update
    const contactInfoMap = await this.bulkSaveContacts(ownerId, visibleUsers, phoneBookNameMap);
    // Build response with friendship status
    const response = await this.buildContactResponse(
      ownerId,
      visibleUsers,
      phoneBookNameMap,
      contactInfoMap,
    );

    //Publish event — typed, follows project convention
    await this.eventPublisher.publish(
      new ContactsSyncedEvent(
        ownerId,
        dto.contacts.length,
        response.length,
        Date.now() - startTime,
      ),
      { fireAndForget: true },
    );

    this.logger.log(
      `Contacts synced for ${ownerId}: ${response.length}/${dto.contacts.length} matched`,
    );

    return response;
  }

  /**
   * [ACTION 5.1 Implementation]
   * Bulk Save Strategy: Diff -> CreateMany -> Batch Update
   *
   * L3 fix: Phone sync NEVER overwrites aliasName (manually set by user).
   * - New contacts: source=PHONE_SYNC, phoneBookName set, aliasName empty
   * - Existing contacts: only phoneBookName updated, aliasName untouched
   */
  private async bulkSaveContacts(
    ownerId: string,
    visibleUsers: MatchedUser[],
    phoneBookNameMap: Map<string, string>,
  ): Promise<Map<string, { id: string; source: ContactSource }>> {
    if (visibleUsers.length === 0) return new Map();

    const visibleUserIds = visibleUsers.map((u) => u.id);

    // Build hash → userId lookup for resolving phoneBookName by userId
    const hashByUserId = new Map<string, string>();
    visibleUsers.forEach((u) => {
      if (u.phoneNumberHash) hashByUserId.set(u.id, u.phoneNumberHash);
    });

    // STEP 1: Fetch Existing Contacts (phân loại Insert vs Update)
    const existingContacts = await this.prisma.userContact.findMany({
      where: { ownerId, contactUserId: { in: visibleUserIds } },
      select: { contactUserId: true, phoneBookName: true },
    });

    // contactUserId → current phoneBookName
    const existingMap = new Map<string, string | null>();
    existingContacts.forEach((c) => existingMap.set(c.contactUserId, c.phoneBookName));

    // STEP 2: Phân loại Data
    const toCreate: Prisma.UserContactCreateManyInput[] = [];
    const toUpdate: { contactUserId: string; newPhoneBookName: string }[] = [];

    for (const user of visibleUsers) {
      const hash = hashByUserId.get(user.id) ?? '';
      const newPhoneBookName = phoneBookNameMap.get(hash);

      if (!existingMap.has(user.id)) {
        // NEW contact from phone sync — set phoneBookName + source; aliasName stays empty
        toCreate.push({
          ownerId,
          contactUserId: user.id,
          phoneBookName: newPhoneBookName ?? null,
          source: ContactSource.PHONE_SYNC,
        });
      } else {
        // EXISTING contact — only update phoneBookName if changed; NEVER touch aliasName
        const currentPhoneBookName = existingMap.get(user.id);
        if (
          newPhoneBookName !== undefined &&
          newPhoneBookName !== currentPhoneBookName
        ) {
          toUpdate.push({ contactUserId: user.id, newPhoneBookName });
        }
      }
    }

    // STEP 3: Execute CREATE MANY (1 Query)
    if (toCreate.length > 0) {
      await this.prisma.userContact.createMany({
        data: toCreate,
        skipDuplicates: true,
      });
      this.logger.debug(`[Sync] Created ${toCreate.length} new contacts`);
    }

    // STEP 4: Execute UPDATE phoneBookName in batches
    if (toUpdate.length > 0) {
      const BATCH_SIZE = 50;
      for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
        const batch = toUpdate.slice(i, i + BATCH_SIZE);
        await this.prisma.$transaction(
          batch.map((item) =>
            this.prisma.userContact.update({
              where: { ownerId_contactUserId: { ownerId, contactUserId: item.contactUserId } },
              data: { phoneBookName: item.newPhoneBookName },
            }),
          ),
        );
      }
      this.logger.debug(`[Sync] Updated phoneBookName for ${toUpdate.length} contacts`);

      // Invalidate display-name cache for updated contacts
      await Promise.all(
        toUpdate.map((u) => this.invalidateNameCache(ownerId, u.contactUserId)),
      );
    }

    // Return contactUserId → { id, source } map (needed for cursor-based responses + correct source)
    const savedContacts = await this.prisma.userContact.findMany({
      where: { ownerId, contactUserId: { in: visibleUserIds } },
      select: { id: true, contactUserId: true, source: true },
    });
    return new Map(savedContacts.map((c) => [c.contactUserId, { id: c.id, source: c.source }]));
  }

  private processInputContacts(contacts: ContactItemDto[]) {
    const phoneBookNameMap = new Map<string, string>();
    const phoneHashes = contacts.map((c) => {
      const normalized = this.normalizePhoneNumber(c.phoneNumber);
      const hash = this.hashPhoneNumber(normalized);
      if (c.phoneBookName) phoneBookNameMap.set(hash, c.phoneBookName);
      return hash;
    });
    return { phoneHashes, phoneBookNameMap };
  }
  /**
   * Remove contact
   */
  async removeContact(ownerId: string, contactUserId: string): Promise<void> {
    await this.prisma.userContact.deleteMany({
      where: {
        ownerId,
        contactUserId,
      },
    });

    // Invalidate cache immediately (sync, before response)
    await this.invalidateNameCache(ownerId, contactUserId);

    // Publish event — cache listener provides idempotent safety net
    await this.eventPublisher.publish(
      new ContactRemovedEvent(ownerId, contactUserId),
      { fireAndForget: true },
    );

    this.logger.debug(`Contact removed: ${ownerId} removed ${contactUserId}`);
  }

  /**
   * Get all contacts for a user (Cursor Pagination)
   * Supports search by name and excludeFriends filter.
   */
  async getContacts(
    ownerId: string,
    query: GetContactsQueryDto,
  ): Promise<CursorPaginatedResult<ContactResponseDto>> {
    const { cursor, limit = 50, search, excludeFriends } = query;

    // --- Build dynamic WHERE ---
    const where: Prisma.UserContactWhereInput = { ownerId };

    if (search) {
      where.OR = [
        { aliasName: { contains: search, mode: 'insensitive' } },
        { phoneBookName: { contains: search, mode: 'insensitive' } },
        { contactUser: { displayName: { contains: search, mode: 'insensitive' } } },
      ];
    }

    if (excludeFriends) {
      const friendIds =
        await this.friendshipService.getFriendIdsForPresence(ownerId);
      if (friendIds.length > 0) {
        where.contactUserId = { notIn: friendIds };
      }
    }

    // 1. Query with cursor pagination
    const contacts = await this.prisma.userContact.findMany({
      where,
      ...CursorPaginationHelper.buildPrismaParams(limit, cursor),
      orderBy: { createdAt: 'desc' },
      include: {
        contactUser: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
            lastSeenAt: true,
          },
        },
      },
    });

    // 2. Batch friendship check — 1 query instead of N (no N+1)
    const displayNodes = contacts.slice(0, limit);
    const contactUserIds = displayNodes.map((c) => c.contactUser.id);
    const friendSet = await this.friendshipService.getFriendIdsFromList(
      ownerId,
      contactUserIds,
    );

    // 3. buildResult handles slice & nextCursor extraction
    return CursorPaginationHelper.buildResult({
      items: contacts,
      limit,
      getCursor: (c) => c.id,
      mapToDto: (contact): ContactResponseDto => ({
        id: contact.id,
        contactUserId: contact.contactUser.id,
        // 3-level fallback: aliasName > phoneBookName > displayName
        displayName:
          contact.aliasName ??
          contact.phoneBookName ??
          contact.contactUser.displayName,
        aliasName: contact.aliasName ?? undefined,
        phoneBookName: contact.phoneBookName ?? undefined,
        source: contact.source,
        avatarUrl: contact.contactUser.avatarUrl ?? undefined,
        lastSeenAt: contact.contactUser.lastSeenAt ?? undefined,
        isFriend: friendSet.has(contact.contactUser.id),
      }),
    });
  }

  /**
   * Resolve display name for a user
   *
   * Priority:
   * 1. UserContact.aliasName (if exists)
   * 2. User.displayName (fallback)
   */
  async resolveDisplayName(
    ownerId: string,
    targetUserId: string,
  ): Promise<string> {
    // Try cache first
    const cacheKey = this.getNameCacheKey(ownerId, targetUserId);
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      return cached;
    }

    // Query database
    const contact = await this.prisma.userContact.findUnique({
      where: {
        ownerId_contactUserId: {
          ownerId,
          contactUserId: targetUserId,
        },
      },
      select: {
        aliasName: true,
        phoneBookName: true,
        contactUser: {
          select: {
            displayName: true,
          },
        },
      },
    });

    // L6 fix: 3-level fallback — aliasName > phoneBookName > displayName
    const displayName =
      contact?.aliasName ??
      contact?.phoneBookName ??
      contact?.contactUser.displayName ??
      'Unknown User';

    // Cache result
    await this.redis.setex(
      cacheKey,
      this.config.ttl.nameResolution,
      displayName,
    );

    return displayName;
  }

  /**
   * Batch resolve display names (for message list optimization)
   */
  async batchResolveDisplayNames(
    ownerId: string,
    targetUserIds: string[],
  ): Promise<Map<string, string>> {
    const result = new Map<string, string>();

    // Try to get all from cache first
    const cacheKeys = targetUserIds.map((id) =>
      this.getNameCacheKey(ownerId, id),
    );
    const cachedValues = await Promise.all(
      cacheKeys.map((key) => this.redis.get(key)),
    );

    const missingUserIds: string[] = [];
    targetUserIds.forEach((userId, index) => {
      if (cachedValues[index]) {
        result.set(userId, cachedValues[index]);
      } else {
        missingUserIds.push(userId);
      }
    });

    // Query missing names from database
    if (missingUserIds.length > 0) {
      const contacts = await this.prisma.userContact.findMany({
        where: {
          ownerId,
          contactUserId: { in: missingUserIds },
        },
        select: {
          contactUserId: true,
          aliasName: true,
          phoneBookName: true,
          contactUser: {
            select: {
              displayName: true,
            },
          },
        },
      });

      // Build map from query results
      const contactMap = new Map<string, string>();
      contacts.forEach((contact) => {
        // L6 fix: 3-level fallback — aliasName > phoneBookName > displayName
        const name =
          contact.aliasName ??
          contact.phoneBookName ??
          contact.contactUser.displayName ??
          'Unknown';
        contactMap.set(contact.contactUserId, name);
      });

      // For users not in contacts, use their displayName
      const usersNotInContacts = missingUserIds.filter(
        (id) => !contactMap.has(id),
      );
      if (usersNotInContacts.length > 0) {
        const users = await this.prisma.user.findMany({
          where: { id: { in: usersNotInContacts } },
          select: { id: true, displayName: true },
        });

        users.forEach((user) => {
          contactMap.set(user.id, user.displayName);
        });
      }

      // Add to result; collect entries for pipeline cache write
      const toCache: Array<[string, string]> = [];
      for (const userId of missingUserIds) {
        const name = contactMap.get(userId) || 'Unknown User';
        result.set(userId, name);
        toCache.push([userId, name]);
      }

      // P4.2: batch cache write via Redis pipeline (1 round-trip instead of N)
      if (toCache.length > 0) {
        const ttl = this.config.ttl.nameResolution;
        const pipeline = this.redis.getClient().pipeline();
        for (const [userId, name] of toCache) {
          pipeline.setex(this.getNameCacheKey(ownerId, userId), ttl, name);
        }
        await pipeline.exec();
      }
    }

    return result;
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  /**
   * Atomic Rate Limit Logic
   * Thay thế cho validateSyncRateLimit và incrementSyncCounter cũ
   */
  private async checkAndIncrementRateLimit(userId: string): Promise<void> {
    const key = RedisKeyBuilder.rateLimitContactSync(userId);
    const client = this.redis.getClient(); // Lấy ioredis instance

    // Sử dụng INCR: tăng giá trị và trả về giá trị mới (Atomic)
    const currentCount = await client.incr(key);

    // Nếu đây là lần đầu tiên (count = 1), đặt TTL
    if (currentCount === 1) {
      await client.expire(key, this.config.limits.contactSync.windowSeconds);
    }

    // Kiểm tra giới hạn
    const maxPerDay = this.config.limits.contactSync.maxPerDay;
    if (currentCount > maxPerDay) {
      // Nếu vượt quá, trả về lỗi và giữ nguyên counter (hoặc có thể giảm đi nếu muốn strict logic)
      // Ở đây ta giữ nguyên để phạt user spam
      throw new RateLimitException(
        `Limit reached: ${maxPerDay} syncs/day. Retry tomorrow.`,
      );
    }
  }
  /**
   * Normalize phone number to E.164 format
   */
  private normalizePhoneNumber(phoneNumber: string): string {
    // Remove all non-digit characters
    let normalized = phoneNumber.replace(/\D/g, '');

    // Add + prefix if not present
    if (!normalized.startsWith('+')) {
      normalized = '+' + normalized;
    }

    return normalized;
  }

  /**
   * Hash phone number using SHA-256
   *
   * Note: In production, client should do this to prevent sending raw numbers
   */
  private hashPhoneNumber(phoneNumber: string): string {
    return crypto.createHash('sha256').update(phoneNumber).digest('hex');
  }

  /**
   * Find users by phone hash
   */
  private async findUsersByPhoneHash(
    phoneHashes: string[],
    ownerId: string,
  ): Promise<any[]> {
    return this.prisma.user.findMany({
      where: {
        phoneNumberHash: { in: phoneHashes },
        status: UserStatus.ACTIVE,
        id: { not: ownerId },
      },
      select: {
        id: true,
        displayName: true,
        avatarUrl: true,
        phoneNumberHash: true,
        lastSeenAt: true,
      },
    });
  }

  /**
   * Helper: Filter users based on Privacy Settings
   * Logic:
   * 1. Check Block (2 chiều)
   * 2. Check Privacy Setting (Ai tìm được tôi?)
   * 3. Check Friendship (Nếu setting là CONTACTS)
   */
  private async filterByPrivacy(
    requesterId: string,
    users: MatchedUser[],
  ): Promise<MatchedUser[]> {
    if (users.length === 0) return [];

    const userIds = users.map((u) => u.id);

    // 1. Batch Check Block (Direct Prisma for performance)
    // Check xem requester có chặn họ HOẶC họ có chặn requester không
    const blocks = await this.prisma.block.findMany({
      where: {
        OR: [
          { blockerId: requesterId, blockedId: { in: userIds } },
          { blockerId: { in: userIds }, blockedId: requesterId },
        ],
      },
      select: { blockerId: true, blockedId: true },
    });

    // Tạo Set chứa ID những người bị chặn hoặc chặn mình
    const blockedUserIds = new Set<string>();
    blocks.forEach((b) => {
      blockedUserIds.add(
        b.blockerId === requesterId ? b.blockedId : b.blockerId,
      );
    });

    // 2. Batch Get Privacy Settings
    // Gọi PrivacyService để lấy settings của danh sách user này
    const privacyMap = await this.privacyService.getManySettings(userIds);

    // 3. Phân loại: Ai yêu cầu phải là bạn bè mới tìm thấy?
    // Mặc định Zalo: Tìm bằng SĐT thì ai cũng tìm được (EVERYONE),
    // trừ khi user chỉnh "Nguồn tìm kiếm" (Feature này scope lớn, ở đây ta giả định dùng field showProfile hoặc showPhoneNumber)
    const usersRequiringFriendship: string[] = [];

    // Lọc sơ bộ
    const candidates = users.filter((user) => {
      // Loại bỏ user bị block
      if (blockedUserIds.has(user.id)) return false;
      return true;
    });

    for (const user of candidates) {
      const settings = privacyMap.get(user.id);

      // Logic Zalo: "Ai có thể tìm thấy tôi qua số điện thoại?"
      // Nếu ta map nó vào field `showPhoneNumber` hoặc `showProfile`
      // Giả sử dùng showProfile cho đơn giản:
      const privacyLevel = settings?.showProfile || 'EVERYONE';

      if (privacyLevel === 'CONTACTS') {
        usersRequiringFriendship.push(user.id);
      }
    }

    // 4. Batch Check Friendships (Chỉ check cho những người yêu cầu)
    const friendIds = new Set<string>();
    if (usersRequiringFriendship.length > 0) {
      // Query bảng Friendship: Chỉ lấy những mối quan hệ ACCEPTED
      const friendships = await this.prisma.friendship.findMany({
        where: {
          status: 'ACCEPTED',
          OR: [
            {
              user1Id: requesterId,
              user2Id: { in: usersRequiringFriendship },
            },
            {
              user1Id: { in: usersRequiringFriendship },
              user2Id: requesterId,
            },
          ],
        },
        select: { user1Id: true, user2Id: true },
      });

      friendships.forEach((f) => {
        friendIds.add(f.user1Id === requesterId ? f.user2Id : f.user1Id);
      });
    }

    // 5. Final Filter
    return candidates.filter((user) => {
      const settings = privacyMap.get(user.id);
      const privacyLevel = settings?.showProfile || 'EVERYONE';

      // Nếu yêu cầu bạn bè -> Check trong set friendIds
      if (privacyLevel === 'CONTACTS') {
        return friendIds.has(user.id);
      }

      return true; // Default allow (EVERYONE)
    });
  }

  /**
   * Build contact response with friendship status.
   * B2 fix: Uses contactInfoMap to return UserContact.id (cursor) + correct source.
   */
  private async buildContactResponse(
    ownerId: string,
    users: MatchedUser[],
    phoneBookNameMap: Map<string, string>,
    contactInfoMap: Map<string, { id: string; source: ContactSource }>,
  ): Promise<ContactResponseDto[]> {
    return Promise.all(
      users.map(async (user) => {
        const hash = user.phoneNumberHash || '';
        const phoneBookName = phoneBookNameMap.get(hash);
        const info = contactInfoMap.get(user.id);
        return {
          id: info?.id ?? user.id,
          contactUserId: user.id,
          // L6 fix: 3-level fallback (no aliasName on fresh sync response)
          displayName: phoneBookName ?? user.displayName,
          avatarUrl: user.avatarUrl ?? undefined,
          phoneBookName,
          source: info?.source ?? ContactSource.PHONE_SYNC,
          isFriend: await this.friendshipService.areFriends(ownerId, user.id),
        };
      }),
    );
  }

  /**
   * Invalidate name resolution cache
   */
  private async invalidateNameCache(
    ownerId: string,
    targetUserId: string,
  ): Promise<void> {
    const key = this.getNameCacheKey(ownerId, targetUserId);
    await this.redis.del(key);
  }

  /**
   * Get cache key for name resolution
   */
  private getNameCacheKey(ownerId: string, targetUserId: string): string {
    return RedisKeyBuilder.contactName(ownerId, targetUserId);
  }

  async updateAlias(
    ownerId: string,
    contactUserId: string,
    aliasName: string | null | undefined, // null/undefined = reset alias (L4 fix)
  ): Promise<UserContact> {
    if (ownerId === contactUserId) throw new SelfActionException();

    const resolvedAlias = aliasName ?? null; // null → clear alias, string → set alias

    const contact = await this.prisma.userContact.upsert({
      where: { ownerId_contactUserId: { ownerId, contactUserId } },
      create: { ownerId, contactUserId, aliasName: resolvedAlias, source: ContactSource.MANUAL },
      update: { aliasName: resolvedAlias },
    });

    await this.invalidateNameCache(ownerId, contactUserId);

    // P3.2: Emit typed event — drives Socket.IO notification + idempotent cache invalidation
    const resolvedDisplayName = await this.resolveDisplayName(ownerId, contactUserId);
    await this.eventPublisher.publish(
      new ContactAliasUpdatedEvent(ownerId, contactUserId, resolvedAlias, resolvedDisplayName),
    );

    this.logger.debug(
      `Contact alias ${resolvedAlias ? 'set' : 'reset'}: ${ownerId} → ${contactUserId}${resolvedAlias ? ` = "${resolvedAlias}"` : ''}`,
    );
    return contact;
  }

  /**
   * Check if a user is saved as a contact.
   * Used by frontend to render correct button in chat header (Add vs Edit alias).
   */
  async checkIsContact(
    ownerId: string,
    targetUserId: string,
  ): Promise<{ isContact: boolean; aliasName?: string; phoneBookName?: string; source?: ContactSource }> {
    const contact = await this.prisma.userContact.findUnique({
      where: { ownerId_contactUserId: { ownerId, contactUserId: targetUserId } },
      select: { id: true, aliasName: true, phoneBookName: true, source: true },
    });
    if (!contact) return { isContact: false };
    return {
      isContact: true,
      aliasName: contact.aliasName ?? undefined,
      phoneBookName: contact.phoneBookName ?? undefined,
      source: contact.source,
    };
  }
}
