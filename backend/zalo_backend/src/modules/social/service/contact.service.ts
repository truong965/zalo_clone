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
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, UserContact, UserStatus } from '@prisma/client';
import {
  SyncContactsDto,
  ContactItemDto,
  ContactResponseDto,
} from '../dto/contact.dto';
import {
  SelfActionException,
  RateLimitException,
} from '../errors/social.errors';
import { FriendshipService } from './friendship.service';
import { PrivacyService } from './privacy.service';
import * as crypto from 'crypto';
import { RedisKeyBuilder } from 'src/common/constants/redis-keys.constant';
import socialConfig from 'src/config/social.config';
import type { ConfigType } from '@nestjs/config';
import { CursorPaginationDto } from 'src/common/dto/cursor-pagination.dto';
import { CursorPaginatedResult } from 'src/common/interfaces/paginated-result.interface';
type PrismaTx = Prisma.TransactionClient;
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
    private readonly eventEmitter: EventEmitter2,
    private readonly friendshipService: FriendshipService,
    private readonly privacyService: PrivacyService,
    @Inject(socialConfig.KEY)
    private readonly config: ConfigType<typeof socialConfig>,
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
    const { phoneHashes, aliasMap } = this.processInputContacts(dto.contacts); // Extract phone numbers and hash them

    // Find matching users (active only)
    const matchedUsers = await this.findUsersByPhoneHash(phoneHashes, ownerId);

    // Filter by privacy settings (who can find me)
    const visibleUsers = await this.filterByPrivacy(ownerId, matchedUsers);

    // [ACTION 5.1] Thay thế Transaction lớn bằng Bulk Insert + Batch Update
    await this.bulkSaveContacts(ownerId, visibleUsers, aliasMap);
    // Build response with friendship status
    const response = await this.buildContactResponse(
      ownerId,
      visibleUsers,
      aliasMap,
    );

    //Publish event
    this.eventEmitter.emit('contacts.synced', {
      ownerId,
      totalContacts: dto.contacts.length,
      matchedUsers: response.length,
      duration: Date.now() - startTime,
    });

    this.logger.log(
      `Contacts synced for ${ownerId}: ${response.length}/${dto.contacts.length} matched`,
    );

    return response;
  }

  /**
   * [ACTION 5.1 Implementation]
   * Bulk Save Strategy: Diff -> CreateMany -> Batch Update
   */
  private async bulkSaveContacts(
    ownerId: string,
    visibleUsers: MatchedUser[],
    aliasMap: Map<string, string>,
  ): Promise<void> {
    if (visibleUsers.length === 0) return;

    const visibleUserIds = visibleUsers.map((u) => u.id);

    // STEP 1: Fetch Existing Contacts (Để phân loại Insert vs Update)
    const existingContacts = await this.prisma.userContact.findMany({
      where: {
        ownerId,
        contactUserId: { in: visibleUserIds },
      },
      select: {
        contactUserId: true,
        aliasName: true,
      },
    });

    // Tạo Map để tra cứu nhanh: ContactUserID -> Alias hiện tại
    const existingMap = new Map<string, string | null>();
    existingContacts.forEach((c) =>
      existingMap.set(c.contactUserId, c.aliasName),
    );

    // STEP 2: Phân loại Data
    const toCreate: Prisma.UserContactCreateManyInput[] = [];
    const toUpdate: { contactUserId: string; newAlias: string }[] = [];

    for (const user of visibleUsers) {
      // Lấy alias mới từ danh bạ (client gửi lên)
      const hash = user.phoneNumberHash || '';
      const newAlias = aliasMap.get(hash);

      // Nếu user này chưa có trong UserContact -> Thêm vào list Create
      if (!existingMap.has(user.id)) {
        toCreate.push({
          ownerId,
          contactUserId: user.id,
          aliasName: newAlias,
        });
      } else {
        // Nếu đã có -> Check xem alias có thay đổi không
        // Logic: Chỉ update nếu newAlias khác currentAlias
        // (Lưu ý: Nếu client gửi alias rỗng, có thể ta muốn giữ alias cũ hoặc xóa tùy nghiệp vụ.
        // Ở đây giả định danh bạ điện thoại là "Single Source of Truth", đè alias mới lên).
        const currentAlias = existingMap.get(user.id);
        if (newAlias !== undefined && newAlias !== currentAlias) {
          toUpdate.push({
            contactUserId: user.id,
            newAlias: newAlias,
          });
        }
      }
    }

    // STEP 3: Execute CREATE MANY (1 Query - High Performance)
    if (toCreate.length > 0) {
      await this.prisma.userContact.createMany({
        data: toCreate,
        skipDuplicates: true, // Safety net
      });
      this.logger.debug(`[Sync] Created ${toCreate.length} new contacts`);
    }

    // STEP 4: Execute UPDATE (Batching)
    // Prisma chưa hỗ trợ bulk update khác giá trị (CASE WHEN), nên ta update theo lô
    if (toUpdate.length > 0) {
      const BATCH_SIZE = 50; // Giới hạn số update đồng thời để tránh lock

      // Chia mảng toUpdate thành các chunk
      for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
        const batch = toUpdate.slice(i, i + BATCH_SIZE);

        // Chạy song song trong batch nhưng bọc Transaction nhỏ để đảm bảo consistency
        await this.prisma.$transaction(
          batch.map((item) =>
            this.prisma.userContact.update({
              where: {
                ownerId_contactUserId: {
                  ownerId,
                  contactUserId: item.contactUserId,
                },
              },
              data: {
                aliasName: item.newAlias,
              },
            }),
          ),
        );
      }
      this.logger.debug(`[Sync] Updated ${toUpdate.length} aliases`);

      // Invalidate cache cho những user bị đổi tên
      // Ta làm việc này Async (không await) để response nhanh hơn nếu muốn
      const invalidatePromises = toUpdate.map((u) =>
        this.invalidateNameCache(ownerId, u.contactUserId),
      );
      await Promise.all(invalidatePromises);
    }
  }

  private processInputContacts(contacts: ContactItemDto[]) {
    const aliasMap = new Map<string, string>();
    const phoneHashes = contacts.map((c) => {
      const normalized = this.normalizePhoneNumber(c.phoneNumber);
      const hash = this.hashPhoneNumber(normalized);
      if (c.aliasName) aliasMap.set(hash, c.aliasName);
      return hash;
    });
    return { phoneHashes, aliasMap };
  }
  /**
   * Add or update contact alias
   */
  async updateContactAlias(
    ownerId: string,
    contactUserId: string,
    aliasName?: string,
  ): Promise<UserContact> {
    // Validation: Cannot add self as contact
    if (ownerId === contactUserId) {
      throw new SelfActionException('Cannot add yourself as contact');
    }

    // Upsert contact
    const contact = await this.prisma.userContact.upsert({
      where: {
        ownerId_contactUserId: {
          ownerId,
          contactUserId,
        },
      },
      create: {
        ownerId,
        contactUserId,
        aliasName,
      },
      update: {
        aliasName,
      },
    });

    // Invalidate name resolution cache
    await this.invalidateNameCache(ownerId, contactUserId);

    this.logger.debug(
      `Contact alias updated: ${ownerId} → ${contactUserId} = "${aliasName}"`,
    );

    return contact;
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

    // Invalidate cache
    await this.invalidateNameCache(ownerId, contactUserId);

    this.logger.debug(`Contact removed: ${ownerId} removed ${contactUserId}`);
  }

  /**
   * Get all contacts for a user (Cursor Pagination)
   * Sử dụng CursorPaginatedResult chuẩn cho Infinity Scroll
   */
  async getContacts(
    ownerId: string,
    query: CursorPaginationDto,
  ): Promise<CursorPaginatedResult<ContactResponseDto>> {
    const { cursor, limit = 50 } = query;

    // 1. Thực hiện Query Prisma
    const contacts = await this.prisma.userContact.findMany({
      where: { ownerId },
      // Lấy thừa 1 record để check xem có trang sau hay không
      take: limit + 1,
      // Logic Cursor chuẩn của Prisma
      cursor: cursor ? { id: cursor } : undefined,
      // skip: cursor ? 1 : 0, // Bỏ qua chính cursor đó
      orderBy: { createdAt: 'desc' }, // Danh bạ mới sync sẽ hiện lên đầu
      include: {
        contactUser: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
            lastSeenAt: true,
            // status: true, // Nếu cần check active
          },
        },
      },
    });

    // 2. Xử lý Logic Phân trang
    const hasNextPage = contacts.length > limit;
    // Cắt bỏ item thừa (dùng để check next page)
    const nodes = hasNextPage ? contacts.slice(0, -1) : contacts;
    // Lấy ID của item cuối cùng làm cursor cho lần sau
    const nextCursor = hasNextPage ? nodes[nodes.length - 1].id : undefined;

    // 3. Map Data & Resolve Status
    // Lưu ý: Dùng Promise.all để resolve status (Friend/Non-Friend) song song
    const data: ContactResponseDto[] = await Promise.all(
      nodes.map(async (contact) => {
        const isFriend = await this.friendshipService.areFriends(
          ownerId,
          contact.contactUser.id,
        );

        return {
          id: contact.id, // UserContact ID (dùng làm cursor)
          contactUserId: contact.contactUser.id,
          // Logic hiển thị tên: Ưu tiên Alias -> Tên thật
          displayName: contact.aliasName || contact.contactUser.displayName,
          aliasName: contact.aliasName ?? undefined,
          avatarUrl: contact.contactUser.avatarUrl ?? undefined,
          lastSeenAt: contact.contactUser.lastSeenAt ?? undefined,
          isFriend,
        };
      }),
    );

    // 4. Trả về kết quả chuẩn Interface
    return {
      data,
      meta: {
        limit,
        hasNextPage,
        nextCursor,
        // total: undefined, // Không count(*) để tối ưu hiệu năng
      },
    };
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
        contactUser: {
          select: {
            displayName: true,
          },
        },
      },
    });

    const displayName =
      contact?.aliasName || contact?.contactUser.displayName || 'Unknown User';

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
        const name =
          contact.aliasName || contact.contactUser.displayName || 'Unknown';
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

      // Add to result and cache
      for (const userId of missingUserIds) {
        const name = contactMap.get(userId) || 'Unknown User';
        result.set(userId, name);

        // Cache individual result
        await this.redis.setex(
          this.getNameCacheKey(ownerId, userId),
          this.config.ttl.nameResolution,
          name,
        );
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
   * [OPTIMIZED] Use Batch Queries instead of N+1 Loop
   */
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
      // Check lại block/nobody lần cuối
      if (blockedUserIds.has(user.id)) return false;

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
   * Save contacts to database
   */
  private async saveContacts(
    tx: PrismaTx,
    ownerId: string,
    matchedUsers: MatchedUser[],
    aliasMap: Map<string, string>,
  ): Promise<void> {
    const upsertPromises = matchedUsers.map((user) => {
      // Vì user.phoneNumberHash có thể null trong Type definition (dù logic find đã lọc)
      // ta cần check an toàn
      const hash = user.phoneNumberHash || '';
      const aliasName = aliasMap.get(hash);

      return tx.userContact.upsert({
        where: {
          ownerId_contactUserId: {
            ownerId,
            contactUserId: user.id,
          },
        },
        create: {
          ownerId,
          contactUserId: user.id,
          aliasName,
        },
        update: {
          aliasName, // Cập nhật tên gợi nhớ nếu user đổi tên trong danh bạ
        },
      });
    });

    await Promise.all(upsertPromises);
  }

  /**
   * Build contact response with friendship status
   */
  private async buildContactResponse(
    ownerId: string,
    users: MatchedUser[],
    aliasMap: Map<string, string>,
  ): Promise<ContactResponseDto[]> {
    return Promise.all(
      users.map(async (user) => {
        const hash = user.phoneNumberHash || '';
        return {
          id: user.id, // Lưu ý: ID này là UserID, không phải UserContactID (vì ta chưa query lại UserContact)
          contactUserId: user.id,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl ?? undefined,
          aliasName: aliasMap.get(hash),
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
    aliasName: string,
  ): Promise<UserContact> {
    if (ownerId === contactUserId) throw new SelfActionException();

    const contact = await this.prisma.userContact.upsert({
      where: { ownerId_contactUserId: { ownerId, contactUserId } },
      create: { ownerId, contactUserId, aliasName },
      update: { aliasName },
    });

    await this.invalidateNameCache(ownerId, contactUserId);
    return contact;
  }
}
