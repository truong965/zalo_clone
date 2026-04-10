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
import { RedisService } from 'src/shared/redis/redis.service';
import { EventPublisher } from '@shared/events';
import {
  ContactSource,
  FriendshipStatus,
  Prisma,
  UserContact,
  UserStatus,
} from '@prisma/client';
import {
  ContactAliasUpdatedEvent,
  ContactRemovedEvent,
  ContactsSyncedEvent,
} from './events/contact.events';
import {
  SyncContactsDto,
  ContactItemDto,
  GetContactsQueryDto,
} from './dto/contact.dto';
import { SelfActionException, RateLimitException } from 'src/common/errors';
import { FriendshipService } from '../friendship/service/friendship.service';
import { PRIVACY_READ_PORT } from '@common/contracts/internal-api';
import type { IPrivacyReadPort } from '@common/contracts/internal-api';
import * as crypto from 'crypto';
import { RedisKeyBuilder } from '@shared/redis/redis-key-builder';
import socialConfig from 'src/config/social.config';
import type { ConfigType } from '@nestjs/config';
import { CursorPaginatedResult } from 'src/common/interfaces/paginated-result.interface';
import { ContactResponseDto } from './dto/contact.dto';
import { CursorPaginationHelper } from '@common/utils/cursor-pagination.helper';
import { PhoneNumberUtil } from '@common/utils/phone-number.util';
type MatchedUser = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  phoneNumberHash: string | null;
  lastSeenAt: Date | null;
};
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { CONTACT_SYNC_QUEUE, CONTACT_SYNC_JOB } from './contact.constants';

@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly eventPublisher: EventPublisher,
    private readonly friendshipService: FriendshipService,
    @Inject(PRIVACY_READ_PORT)
    private readonly privacyRead: IPrivacyReadPort,
    @Inject(socialConfig.KEY)
    private readonly config: ConfigType<typeof socialConfig>,
    @InjectQueue(CONTACT_SYNC_QUEUE)
    private readonly contactSyncQueue: Queue,
  ) {}

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
  /**
   * Sync contacts from phone (Main API entry - Asynchronous)
   */
  async syncContacts(
    ownerId: string,
    dto: SyncContactsDto,
  ): Promise<{ jobId: string }> {
    // 1. Rate Limiting (24-hour window) - Fail fast if limited
    await this.checkAndIncrementRateLimit(ownerId);

    // 2. Cap Check (Total limit from config)
    const MAX_CONTACTS = this.config.limits.contactSync.maxPerRequest;
    if (dto.contacts.length > MAX_CONTACTS) {
      throw new RateLimitException(
        `Cannot sync more than ${MAX_CONTACTS} contacts. Please clean up your address book.`,
      );
    }

    // 3. Queue the background job with deduplication ID
    const job = await this.contactSyncQueue.add(
      CONTACT_SYNC_JOB,
      {
        ownerId,
        contacts: dto.contacts,
      },
      {
        jobId: `sync-${ownerId}`, // Deduplication: ignore if a sync is already waiting/active
        removeOnComplete: true,
        removeOnFail: { age: this.config.limits.contactSync.windowSeconds },
      },
    );

    this.logger.log(`Sync job queued for user ${ownerId}: JobID=${job.id}`);

    return { jobId: job.id as string };
  }

  /**
   * Core logic executed by the Background Worker
   */
  async processSyncInBackground(
    ownerId: string,
    contacts: ContactItemDto[],
  ): Promise<void> {
    const startTime = Date.now();
    this.logger.debug(`Background processing ${contacts.length} contacts for ${ownerId}`);

    // 1. Process Input (Supports both Raw Phone and Hash)
    const { phoneHashes, phoneBookNameMap } = this.processInputContacts(contacts);

    // 2. Match against existing active users
    const matchedUsers = await this.findUsersByPhoneHash(phoneHashes, ownerId);

    // 3. Privacy Filter (Who can find me by phone?)
    const visibleUsers = await this.filterByPrivacy(ownerId, matchedUsers);

    // 4. Mirror Sync (Add/Update/Delete)
    const contactInfoMap = await this.bulkMirrorSyncContacts(
      ownerId,
      visibleUsers,
      phoneBookNameMap,
    );

    // 5. Build response (needed for event payload)
    const response = await this.buildContactResponse(
      ownerId,
      visibleUsers,
      phoneBookNameMap,
      contactInfoMap,
    );

    // 6. Publish event (This will be caught by notification listener and sent via Socket)
    await this.eventPublisher.publish(
      new ContactsSyncedEvent(
        ownerId,
        contacts.length,
        response.length,
        Date.now() - startTime,
      ),
      { fireAndForget: true },
    );

    this.logger.log(
      `Background sync completed for ${ownerId}: ${response.length} matches found.`,
    );
  }

  /**
   * [ACTION 5.1 Implementation]
   * Bulk Save Strategy: Diff -> CreateMany -> Batch Update
   *
   * L3 fix: Phone sync NEVER overwrites aliasName (manually set by user).
   * - New contacts: source=PHONE_SYNC, phoneBookName set, aliasName empty
   * - Existing contacts: only phoneBookName updated, aliasName untouched
   */
  /**
   * Bulk Mirror Sync Strategy:
   * 1. Add/Update visible users
   * 2. Delete contacts that are no longer in the matched list (Mirror Mode)
   */
  private async bulkMirrorSyncContacts(
    ownerId: string,
    visibleUsers: MatchedUser[],
    phoneBookNameMap: Map<string, string>,
  ): Promise<Map<string, { id: string; source: ContactSource }>> {
    const visibleUserIds = visibleUsers.map((u) => u.id);

    // Build hash → userId lookup for resolving phoneBookName by userId
    const hashByUserId = new Map<string, string>();
    visibleUsers.forEach((u) => {
      if (u.phoneNumberHash) hashByUserId.set(u.id, u.phoneNumberHash);
    });

    // STEP 1: Find all current contacts for this owner to identify Deletions
    const currentContacts = await this.prisma.userContact.findMany({
      where: { ownerId },
      select: { contactUserId: true, phoneBookName: true },
    });

    const currentMap = new Map(currentContacts.map((c) => [c.contactUserId, c]));

    // STEP 2: Sort into Create, Update, and Delete buckets
    const toCreate: Prisma.UserContactCreateManyInput[] = [];
    const toUpdate: { contactUserId: string; newPhoneBookName: string }[] = [];
    const matchedSet = new Set(visibleUserIds);

    // Identification for Deletions: In DB but NOT in current matched list
    const toDeleteIds = currentContacts
      .filter((c) => !matchedSet.has(c.contactUserId))
      .map((c) => c.contactUserId);

    for (const user of visibleUsers) {
      const hash = hashByUserId.get(user.id) ?? '';
      const newPhoneBookName = phoneBookNameMap.get(hash);

      if (!currentMap.has(user.id)) {
        // NEW matched contact
        toCreate.push({
          ownerId,
          contactUserId: user.id,
          phoneBookName: newPhoneBookName ?? null,
          source: ContactSource.PHONE_SYNC,
        });
      } else {
        // EXISTING contact — update phoneBookName if it changed in phonebook
        const currentRef = currentMap.get(user.id);
        if (
          newPhoneBookName !== undefined &&
          newPhoneBookName !== currentRef?.phoneBookName
        ) {
          toUpdate.push({ contactUserId: user.id, newPhoneBookName });
        }
      }
    }

    // STEP 3: Execute DB operations via Transaction for atomicity where possible
    await this.prisma.$transaction(async (tx) => {
      // 1. Delete removed contacts
      if (toDeleteIds.length > 0) {
        await tx.userContact.deleteMany({
          where: { ownerId, contactUserId: { in: toDeleteIds } },
        });
      }

      // 2. Insert new contacts
      if (toCreate.length > 0) {
        await tx.userContact.createMany({
          data: toCreate,
          skipDuplicates: true,
        });
      }

      // 3. Batch Update changed names
      for (const item of toUpdate) {
        await tx.userContact.update({
          where: {
            ownerId_contactUserId: {
              ownerId,
              contactUserId: item.contactUserId,
            },
          },
          data: { phoneBookName: item.newPhoneBookName },
        });
      }
    });

    // STEP 4: Invalidate caches (Batch DEL)
    const affectedUserIds = [
      ...toUpdate.map((u) => u.contactUserId),
      ...toDeleteIds,
    ];
    if (affectedUserIds.length > 0) {
      await this.invalidateNameCacheBatch(ownerId, affectedUserIds);
    }

    // Return mapping for building response
    const savedContacts = await this.prisma.userContact.findMany({
      where: { ownerId, contactUserId: { in: visibleUserIds } },
      select: { id: true, contactUserId: true, source: true },
    });
    return new Map(
      savedContacts.map((c) => [
        c.contactUserId,
        { id: c.id, source: c.source },
      ]),
    );
  }

  private processInputContacts(contacts: ContactItemDto[]) {
    const phoneBookNameMap = new Map<string, string>();
    const phoneHashes = contacts
      .map((c) => {
        const hash = c.phoneHash?.toLowerCase();
        if (c.phoneBookName && hash) phoneBookNameMap.set(hash, c.phoneBookName);
        return hash;
      })
      .filter((h): h is string => !!h);

    if (phoneHashes.length > 0) {
      this.logger.debug(
        `Received ${phoneHashes.length} phone hashes. First 3: ${phoneHashes.slice(0, 3).join(', ')}`,
      );
    }

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
    const { cursor, limit = 50, search, excludeFriends = true } = query;

    // --- Build dynamic WHERE ---
    const where: Prisma.UserContactWhereInput = { ownerId };

    if (search) {
      const users = await this.prisma.user.findMany({
        where: { displayName: { contains: search, mode: 'insensitive' } },
        select: { id: true },
      });
      const userIds = users.map((u) => u.id);

      where.OR = [
        { aliasName: { contains: search, mode: 'insensitive' } },
        { phoneBookName: { contains: search, mode: 'insensitive' } },
        { contactUserId: { in: userIds } },
      ];
    }

    if (excludeFriends) {
      const friendIds =
        await this.friendshipService.getFriendIdsForPresence(ownerId);
      if (friendIds.length > 0) {
        where.contactUserId = { notIn: friendIds };
        this.logger.debug(`Excluding ${friendIds.length} friend/pending IDs from contact list for user ${ownerId}`);
      }
    }

    // 1. Query with cursor pagination
    const [total, contacts] = await Promise.all([
      this.prisma.userContact.count({ where }),
      this.prisma.userContact.findMany({
        where,
        ...CursorPaginationHelper.buildPrismaParams(limit, cursor),
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // Fetch user profiles manually
    const displayNodes = contacts.slice(0, limit);
    const contactUserIds = displayNodes.map((c) => c.contactUserId);

    const users = await this.prisma.user.findMany({
      where: { id: { in: contactUserIds } },
      select: {
        id: true,
        displayName: true,
        avatarUrl: true,
        lastSeenAt: true,
      },
    });
    const userMap = new Map<string, any>(users.map((u) => [u.id, u]));

    // 2. Batch friendship check — 1 query instead of N (no N+1)
    const friendSet = await this.friendshipService.getFriendIdsFromList(
      ownerId,
      contactUserIds,
    );

    // 3. Batch Mutual Check
    const mutualContacts = await this.prisma.userContact.findMany({
      where: {
        ownerId: { in: contactUserIds },
        contactUserId: ownerId,
      },
      select: { ownerId: true },
    });
    const mutualSet = new Set(mutualContacts.map((c) => c.ownerId));

    // 4. buildResult handles slice & nextCursor extraction
    return CursorPaginationHelper.buildResult({
      items: contacts,
      limit,
      total,
      getCursor: (c) => c.id,
      mapToDto: (contact): ContactResponseDto => {
        const u = userMap.get(contact.contactUserId);
        return {
          id: contact.id,
          contactUserId: contact.contactUserId,
          // 3-level fallback: aliasName > phoneBookName > displayName
          displayName:
            contact.aliasName ??
            contact.phoneBookName ??
            u?.displayName ??
            'Unknown',
          aliasName: contact.aliasName ?? undefined,
          phoneBookName: contact.phoneBookName ?? undefined,
          source: contact.source,
          avatarUrl: u?.avatarUrl ?? undefined,
          lastSeenAt: u?.lastSeenAt ?? undefined,
          isFriend: friendSet.has(contact.contactUserId),
          isMutual: mutualSet.has(contact.contactUserId),
        };
      },
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
      },
    });

    let defaultName = 'Unknown User';
    if (!contact?.aliasName && !contact?.phoneBookName) {
      const u = await this.prisma.user.findUnique({
        where: { id: targetUserId },
        select: { displayName: true },
      });
      if (u) defaultName = u.displayName;
    }

    // L6 fix: 3-level fallback — aliasName > phoneBookName > displayName
    const displayName =
      contact?.aliasName ?? contact?.phoneBookName ?? defaultName;

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
        },
      });

      // Also fetch users for those without explicit alias/phoneBookName
      const users = await this.prisma.user.findMany({
        where: { id: { in: missingUserIds } },
        select: { id: true, displayName: true },
      });
      const userMap = new Map(users.map((u) => [u.id, u.displayName]));

      // Build map from query results
      const contactMap = new Map<string, string>();
      contacts.forEach((contact) => {
        // L6 fix: 3-level fallback — aliasName > phoneBookName > displayName
        const name =
          contact.aliasName ??
          contact.phoneBookName ??
          userMap.get(contact.contactUserId) ??
          'Unknown';
        contactMap.set(contact.contactUserId, name);
      });

      // For users not in contacts, use their displayName
      const usersNotInContacts = missingUserIds.filter(
        (id) => !contactMap.has(id),
      );
      if (usersNotInContacts.length > 0) {
        usersNotInContacts.forEach((id) => {
          contactMap.set(id, userMap.get(id) || 'Unknown User');
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
   * Fast fail check before hashing contacts
   */
  async preCheckSyncRateLimit(userId: string): Promise<void> {
    const key = RedisKeyBuilder.rateLimitContactSync(userId);
    const client = this.redis.getClient();
    const count = await client.get(key);

    if (count && parseInt(count) >= this.config.limits.contactSync.maxPerDay) {
      throw new RateLimitException(
        `Limit reached: ${this.config.limits.contactSync.maxPerDay} syncs/day. Retry tomorrow.`,
      );
    }
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
   * Helper: Filter users based on Block status (Privacy settings are ignored for phone discovery)
   * Logic:
   * 1. Check Block (Bi-directional)
   */
  /**
   * Helper: Filter users based on Block status and Relationship (Privacy settings are ignored for discovery)
   * Rules:
   * 1. Check Block (Bi-directional) -> Hide if blocked
   * 2. Check Friendship -> Hide if status is DECLINED
   * 3. Discovery -> Allow if status is PENDING, ACCEPTED, or NO RELATIONSHIP exists
   */
  private async filterByPrivacy(
    requesterId: string,
    users: MatchedUser[],
  ): Promise<MatchedUser[]> {
    if (users.length === 0) return [];

    const userIds = users.map((u) => u.id);

    // 1. Batch Check Block (Bi-directional)
    const blocks = await this.prisma.block.findMany({
      where: {
        OR: [
          { blockerId: requesterId, blockedId: { in: userIds } },
          { blockerId: { in: userIds }, blockedId: requesterId },
        ],
      },
      select: { blockerId: true, blockedId: true },
    });

    const blockedUserIds = new Set<string>();
    blocks.forEach((b) => {
      blockedUserIds.add(
        b.blockerId === requesterId ? b.blockedId : b.blockerId,
      );
    });

    // 2. Batch Check Friendships (To exclude DECLINED status)
    const friendships = await this.prisma.friendship.findMany({
      where: {
        OR: [
          { user1Id: requesterId, user2Id: { in: userIds } },
          { user1Id: { in: userIds }, user2Id: requesterId },
        ],
        deletedAt: null,
      },
      select: { user1Id: true, user2Id: true, status: true },
    });

    // Map: targetUserId -> status
    const friendshipMap = new Map<string, FriendshipStatus>();
    friendships.forEach((f) => {
      const targetId = f.user1Id === requesterId ? f.user2Id : f.user1Id;
      friendshipMap.set(targetId, f.status);
    });

    // 3. Final Filter
    const filteredUsers = users.filter((user) => {
      // Rule 1: Not Blocked
      if (blockedUserIds.has(user.id)) return false;

      // Rule 2: Not Declined
      const status = friendshipMap.get(user.id);
      if (status === FriendshipStatus.DECLINED) return false;

      // Rule 3: Allow discovery (ACCEPTED, PENDING, or NULL)
      return true;
    });

    if (filteredUsers.length < users.length) {
      this.logger.debug(
        `[Sync] Filtered out ${users.length - filteredUsers.length} users (blocked or declined).`,
      );
    }

    return filteredUsers;
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
    if (users.length === 0) return [];

    const userIds = users.map((u) => u.id);

    // 1. Batch friendship check
    const friendSet = await this.friendshipService.getFriendIdsFromList(
      ownerId,
      userIds,
    );

    // 2. Batch Mutual Contact check (B also has A in their UserContact)
    // We check existence of back-references in one query
    const mutualContacts = await this.prisma.userContact.findMany({
      where: {
        ownerId: { in: userIds },
        contactUserId: ownerId,
      },
      select: { ownerId: true },
    });
    const mutualSet = new Set(mutualContacts.map((c) => c.ownerId));

    return users.map((user) => {
      const hash = user.phoneNumberHash || '';
      const phoneBookName = phoneBookNameMap.get(hash);
      const info = contactInfoMap.get(user.id);
      return {
        id: info?.id ?? user.id,
        contactUserId: user.id,
        // Name resolution Hierarchy: PhoneBookName > DisplayName
        // (aliasName is not returned here as it's a fresh sync, but would be handled in getContacts)
        displayName: phoneBookName ?? user.displayName,
        avatarUrl: user.avatarUrl ?? undefined,
        phoneBookName,
        source: info?.source ?? ContactSource.PHONE_SYNC,
        isFriend: friendSet.has(user.id),
        isMutual: mutualSet.has(user.id),
      };
    });
  }

  /**
   * Batch Invalidate name resolution cache
   */
  private async invalidateNameCacheBatch(
    ownerId: string,
    targetUserIds: string[],
  ): Promise<void> {
    if (targetUserIds.length === 0) return;
    const keys = targetUserIds.map((id) => this.getNameCacheKey(ownerId, id));
    await this.redis.del(...keys);
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
      create: {
        ownerId,
        contactUserId,
        aliasName: resolvedAlias,
        source: ContactSource.MANUAL,
      },
      update: { aliasName: resolvedAlias },
    });

    await this.invalidateNameCache(ownerId, contactUserId);

    // P3.2: Emit typed event — drives Socket.IO notification + idempotent cache invalidation
    const resolvedDisplayName = await this.resolveDisplayName(
      ownerId,
      contactUserId,
    );
    await this.eventPublisher.publish(
      new ContactAliasUpdatedEvent(
        ownerId,
        contactUserId,
        resolvedAlias,
        resolvedDisplayName,
      ),
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
  ): Promise<{
    isContact: boolean;
    aliasName?: string;
    phoneBookName?: string;
    source?: ContactSource;
  }> {
    const contact = await this.prisma.userContact.findUnique({
      where: {
        ownerId_contactUserId: { ownerId, contactUserId: targetUserId },
      },
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
