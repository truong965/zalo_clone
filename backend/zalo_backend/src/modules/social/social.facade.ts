import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { FriendshipService } from './service/friendship.service';
import { BlockService } from '../block/block.service';
import { PrivacyService } from './service/privacy.service';
import { PermissionCheckDto } from './dto/privacy.dto';
import { ContactService } from './service/contact.service';
import { CallHistoryService } from '../call/call-history.service';
import { RedisService } from '../redis/redis.service';
import { RedisKeyBuilder } from 'src/common/constants/redis-keys.constant';
import { PrismaService } from 'src/database/prisma.service';
@Injectable()
export class SocialFacade {
  constructor(
    private readonly friendshipService: FriendshipService,
    private readonly privacyService: PrivacyService,
    private readonly contactService: ContactService,

    // BlockService nằm trong BlockModule (đã import thẳng), không cần forwardRef
    private readonly blockService: BlockService,

    // CallHistoryService nằm trong CallModule (circular), CẦN forwardRef
    @Inject(forwardRef(() => CallHistoryService))
    private readonly callHistoryService: CallHistoryService,

    private readonly redisService: RedisService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * API public: Kiểm tra user A có được phép thực hiện hành động với user B không?
   * Logic tổng hợp: Block Check -> Privacy Check -> Friendship Check (nếu cần)
   */
  async checkPermission(
    requesterId: string,
    targetId: string,
    action: 'message' | 'call' | 'profile',
  ): Promise<PermissionCheckDto> {
    // 1. Check Block trước (Ưu tiên cao nhất)
    // Nếu bị chặn, dừng ngay lập tức, không check Privacy để tiết kiệm resource
    const isBlocked = await this.blockService.isBlocked(requesterId, targetId);
    if (isBlocked) {
      return { allowed: false, reason: 'User is blocked' };
    }

    // 2. Check Privacy & Friendship
    // Service Privacy sẽ tự gọi FriendshipService nếu cài đặt là CONTACTS
    return this.privacyService.checkPermission(requesterId, targetId, action);
  }

  /**
   * API public: Lấy danh sách ID bạn bè (Dùng cho module Chat để sync contact list)
   */
  async getFriendIds(userId: string): Promise<string[]> {
    const result = await this.friendshipService.getFriendsList(userId, {
      limit: 1000,
    });
    return result.data.map((f) => f.userId);
  }

  /**
   * API public: Kiểm tra nhanh 2 người có phải bạn không (Dùng cho UI hiển thị nút)
   */
  async areFriends(user1Id: string, user2Id: string): Promise<boolean> {
    return this.friendshipService.areFriends(user1Id, user2Id);
  }

  /**
   * API public: Kiểm tra nhanh có bị chặn không
   */
  async isBlocked(user1Id: string, user2Id: string): Promise<boolean> {
    return this.blockService.isBlocked(user1Id, user2Id);
  }
  // ADD: Contact methods
  async resolveDisplayName(ownerId: string, targetId: string): Promise<string> {
    return this.contactService.resolveDisplayName(ownerId, targetId);
  }

  async batchResolveDisplayNames(
    ownerId: string,
    targetIds: string[],
  ): Promise<Map<string, string>> {
    return this.contactService.batchResolveDisplayNames(ownerId, targetIds);
  }

  // ADD: Call methods
  async getActiveCall(userId: string) {
    return this.callHistoryService.getActiveCall(userId);
  }

  async terminateCallOnBlock(userId1: string, userId2: string): Promise<void> {
    await this.callHistoryService.terminateActiveCall(userId1, userId2);
  }

  // ADD: Privacy shortcuts
  async canMessage(requesterId: string, targetId: string): Promise<boolean> {
    const isBlocked = await this.blockService.isBlocked(requesterId, targetId);
    if (isBlocked) return false;
    return this.privacyService.canUserMessageMe(requesterId, targetId);
  }

  async canCall(requesterId: string, targetId: string): Promise<boolean> {
    const isBlocked = await this.blockService.isBlocked(requesterId, targetId);
    if (isBlocked) return false;
    return this.privacyService.canUserCallMe(requesterId, targetId);
  }
  /**
   * Validate if requester can send message to target
   * Used by: CanMessageGuard
   */
  async validateMessageAccess(
    requesterId: string,
    targetId: string,
  ): Promise<boolean> {
    // 1. Check Block (High Priority)
    const isBlocked = await this.blockService.isBlocked(requesterId, targetId);
    if (isBlocked) return false;

    // 2. Check Privacy
    return this.privacyService.canUserMessageMe(requesterId, targetId);
  }

  /**
   * Validate if requester can call target
   * Used by: CanCallGuard
   */
  async validateCallAccess(
    requesterId: string,
    targetId: string,
  ): Promise<boolean> {
    // 1. Check Block
    const isBlocked = await this.blockService.isBlocked(requesterId, targetId);
    if (isBlocked) return false;

    // 2. Check Privacy
    return this.privacyService.canUserCallMe(requesterId, targetId);
  }

  /**
   * Validate if requester can see target's profile
   * Used by: CanSeeProfileGuard (Future) or ContactSync
   */
  async validateProfileAccess(
    requesterId: string,
    targetId: string,
  ): Promise<boolean> {
    const isBlocked = await this.blockService.isBlocked(requesterId, targetId);
    if (isBlocked) return false;

    // Logic mở rộng: Check privacy 'showProfile' nếu cần strict hơn
    return true;
  }

  /**
   * [NEW] Lấy trạng thái Block và Online hàng loạt cho danh sách user
   * Dùng để map vào danh sách hội thoại
   */
  async getSocialStatusBatch(requesterId: string, targetUserIds: string[]) {
    if (targetUserIds.length === 0) {
      return { blockMap: new Map(), onlineMap: new Map() };
    }

    // 1. Get Block Status (Delegated to Service)
    // Facade không còn gọi trực tiếp Prisma nữa -> Clean hơn
    const blockMap = await this.blockService.getBatchBlockStatus(
      requesterId,
      targetUserIds,
    );
    // 2. Get Online Status (Redis MGET)
    const onlineKeys = targetUserIds.map((id) =>
      RedisKeyBuilder.userStatus(id),
    );
    // Lưu ý: RedisService wrapper nên có hàm mget, nếu chưa thì dùng getClient() như cũ
    const onlineResults = await this.redisService.mget(onlineKeys);

    const onlineMap = new Map<string, boolean>();
    targetUserIds.forEach((id, index) => {
      onlineMap.set(id, !!onlineResults[index]);
    });

    return { blockMap, onlineMap };
  }
}
