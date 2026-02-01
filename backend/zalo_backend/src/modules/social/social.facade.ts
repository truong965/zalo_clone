import { Injectable } from '@nestjs/common';
import { FriendshipService } from './service/friendship.service';
import { BlockService } from './service/block.service';
import { PrivacyService } from './service/privacy.service';
import { PermissionCheckDto } from './dto/block-privacy.dto';
import { ContactService } from './service/contact.service';
import { CallHistoryService } from './service/call-history.service';
@Injectable()
export class SocialFacade {
  constructor(
    // Sử dụng forwardRef ở đây nếu sau này Facade bị inject ngược lại vào Service (đề phòng)
    // Nhưng chủ yếu Facade là lớp trên cùng.
    private readonly friendshipService: FriendshipService,
    private readonly blockService: BlockService,
    private readonly privacyService: PrivacyService,
    private readonly contactService: ContactService, // ← ADD
    private readonly callHistoryService: CallHistoryService,
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
}
